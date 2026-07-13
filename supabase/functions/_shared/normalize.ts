// normalize.ts — normalise une feature ArcGIS brute (couche 5 ONF) vers le contrat
// EXACT attendu par internal.trail_sync_apply (Base de donnée DLL et API/migration_trail_referential.sql,
// Task 9). Documenté ici pour rester la SEULE source de vérité de ce mapping — ne JAMAIS dupliquer
// la logique de statut/date côté SQL (internal.trail_sync_apply ne fait QUE consommer le résultat).
//
// Décisions verrouillées (design §5, decision log §181/§183) :
//   - Statuts REELS observés live : "Sentier ouvert" / "Sentier fermé" / "Sentier hors gestion ONF"
//     (vérifié 2026-07-13, cf. requête ?returnDistinctValues=true).
//   - "Sentier ouvert" + WS_InfCaus non vide => 'warning' (règle déterministe, jamais de NLP).
//   - Toute autre valeur (y compris vide/nouvelle valeur ONF) : on NE mappe PAS silencieusement
//     vers 'unknown' ici — on PASSE À TRAVERS le texte brut (ou '' si vide) tel quel comme
//     status_normalized_code. internal.trail_sync_apply résout ce code contre
//     ref_code_iti_open_status ; s'il ne matche aucun code connu (ce qui est le cas pour tout texte
//     brut non reconnu), la fonction SQL le détecte elle-même (anomalie 'unknown_status') et
//     retombe sur 'unknown' — c'est la SEULE façon de préserver la détection d'anomalie "nouvelle
//     valeur ONF jamais vue" (si on mappait nous-mêmes vers 'unknown' ici, ce serait un code VALIDE
//     et l'anomalie ne se déclencherait jamais).
//   - Suffixe " (hors gestion ONF)" retiré UNIQUEMENT du nom normalisé (name_raw garde tout).
//   - Dates de réouverture : parsing conservateur, jamais d'invention (§5.3).
//   - Hash géométrique : coordonnées arrondies à 7 décimales (~1 cm), sha256 hex — le service ONF
//     renvoie 13 décimales de bruit de reprojection (§10).

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface ArcGisFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
}

export interface NormalizedFeature {
  external_id: string;
  name_raw: string | null;
  name_normalized: string | null;
  raw_attributes: Record<string, unknown>;
  geom_geojson: GeoJsonGeometry | null;
  geom_hash: string | null;
  length_m_source: number | null;
  status_raw: string | null;
  status_normalized_code: string;
  status_reason_raw: string | null;
  reopening_raw: string | null;
  reopening_date: string | null;
  reopening_precision: string | null;
}

const HORS_GESTION_SUFFIX_RE = /\s*\(hors gestion onf\)\s*$/i;

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Retire le suffixe " (hors gestion ONF)" du nom NORMALISÉ uniquement (jamais du brut). */
export function stripHorsGestionSuffix(name: string): string {
  return name.replace(HORS_GESTION_SUFFIX_RE, '').trim();
}

/**
 * Mapping statut §5.2. Retourne TOUJOURS une string (jamais null) — pour un statut vide ou
 * inconnu, retourne le texte brut (ou '' si vide) tel quel : voir note d'en-tête, la détection
 * d'anomalie "code inconnu" est déléguée à internal.trail_sync_apply.
 */
export function mapStatus(statutRaw: unknown, infCausRaw: unknown): string {
  const s = typeof statutRaw === 'string' ? statutRaw.trim() : '';
  const cause = typeof infCausRaw === 'string' ? infCausRaw.trim() : '';
  if (s === 'Sentier ouvert') return cause !== '' ? 'warning' : 'open';
  if (s === 'Sentier fermé') return 'closed';
  if (s === 'Sentier hors gestion ONF') return 'not_managed';
  return s; // passthrough volontaire (cf. note d'en-tête)
}

const MONTHS_FR: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  décembre: 12, decembre: 12,
};

const LEAD_STOPWORDS = new Set(['réouverture', 'reouverture', 'prévue', 'prevue', 'prévu', 'prevu', 'le', 'en']);

function normalizeWordForStrip(w: string): string {
  return w.toLowerCase().replace(/[:.,]+$/, '');
}

/** Retire les mots d'introduction ("Réouverture prévue le ...") du DÉBUT uniquement, jusqu'au
 * premier mot qui n'en est pas un — ne touche jamais le reste de la chaîne. */
function stripLeadingWords(s: string): string {
  const tokens = s.split(/\s+/).filter((t) => t !== '');
  while (tokens.length && LEAD_STOPWORDS.has(normalizeWordForStrip(tokens[0]))) {
    tokens.shift();
  }
  return tokens.join(' ');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export type ReopeningPrecision = 'day' | 'month' | 'year' | 'text_only' | 'none_planned' | null;

export interface ReopeningResult {
  date: string | null;
  precision: ReopeningPrecision;
}

const NONE_PLANNED_RE = /pas de r[ée]ouverture|aucune r[ée]ouverture|non pr[ée]vue/i;
// Recherche non-ancrée : exactement UN motif jour/mois/année séparé par / - ou . dans toute la
// chaîne. Un second groupe numérique séparé par '/' (ex. "2027/2028ux") ne matche PAS ce motif
// (il lui manque le 3e groupe), donc ne sera jamais confondu avec une date jour.
const DAY_DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;

/**
 * Parsing conservateur des dates de réouverture (WS_InfDate, texte libre). JAMAIS d'invention de
 * date : si le format n'est pas clairement reconnu, precision='text_only' et date=null (le brut
 * reste dans reopening_raw, affiché tel quel côté UI). Cas couverts (design §5.3) :
 *   "05/09/2026" | "Réouverture prévue le 05/09/26" -> day
 *   "Septembre 2026"                                 -> month
 *   "Réouverture 2026"                                -> year
 *   "Pas de réouverture prévue (à court terme)"       -> none_planned
 *   "Réouverure 2027/2028ux" (typo + ambigu)          -> text_only
 */
export function parseReopeningDate(raw: unknown): ReopeningResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed === '') return { date: null, precision: null };
  if (NONE_PLANNED_RE.test(trimmed)) return { date: null, precision: 'none_planned' };

  const dayMatches = [...trimmed.matchAll(DAY_DATE_RE)];
  if (dayMatches.length === 1) {
    const [, dStr, mStr, yStr] = dayMatches[0];
    const day = Number(dStr);
    const month = Number(mStr);
    let year = Number(yStr);
    if (yStr.length === 2) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      return { date: `${year}-${pad2(month)}-${pad2(day)}`, precision: 'day' };
    }
  }

  const strippedForMonth = stripLeadingWords(trimmed).replace(/[:.,]+$/, '').trim();
  const monthMatch = /^([a-zà-ÿ]+)\s+(\d{4})$/i.exec(strippedForMonth);
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase();
    const year = Number(monthMatch[2]);
    if (monthName in MONTHS_FR && year >= 2000 && year <= 2100) {
      return { date: `${year}-${pad2(MONTHS_FR[monthName])}-01`, precision: 'month' };
    }
  }

  const strippedForYear = stripLeadingWords(trimmed).replace(/[:.,]+$/, '').trim();
  const yearMatch = /^(20\d{2})$/.exec(strippedForYear);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return { date: `${year}-01-01`, precision: 'year' };
  }

  return { date: null, precision: 'text_only' };
}

function roundCoordToken(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'NaN';
  return n.toFixed(7);
}

/** Représentation canonique et déterministe d'une géométrie (coordonnées arrondies à 7 décimales,
 * jamais re-parsées en float — toFixed produit directement la string canonique, évitant toute
 * réintroduction de bruit flottant). */
export function stableGeomString(geom: GeoJsonGeometry): string {
  function walk(node: unknown): string {
    if (Array.isArray(node)) {
      if (typeof node[0] === 'number') {
        return (node as number[]).map(roundCoordToken).join(',');
      }
      return (node as unknown[]).map(walk).join(';');
    }
    return String(node);
  }
  return `${geom.type}|${walk(geom.coordinates)}`;
}

/** SHA-256 hex du geom_geojson arrondi à 7 décimales — stable entre deux sync même si le service
 * ONF renvoie 13 décimales de bruit de reprojection (§10). Web Crypto (crypto.subtle) — disponible
 * nativement en Deno comme en Node ≥19, aucune dépendance externe. */
export async function computeGeomHash(geom: GeoJsonGeometry): Promise<string> {
  const input = stableGeomString(geom);
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalise une feature ArcGIS brute vers le contrat exact d'internal.trail_sync_apply.
 * raw_attributes = feature.properties VERBATIM (brut jamais retouché, §4.1) ; geom_geojson =
 * feature.geometry VERBATIM (LineString ou MultiLineString — internal.trail_sync_apply fait
 * ST_Multi côté SQL). Aucun nettoyage/normalisation n'est appliqué à raw_attributes/geom_geojson :
 * seuls name_normalized/status_normalized_code/reopening_* dérivent une valeur nettoyée à CÔTÉ du
 * brut, jamais à la place.
 */
export async function normalizeFeature(feature: ArcGisFeature): Promise<NormalizedFeature> {
  const props = feature.properties ?? {};
  const objectId = props['OBJECTID'];
  if (objectId === undefined || objectId === null) {
    throw new Error('normalizeFeature: feature sans OBJECTID');
  }
  const nameRaw = trimOrNull(props['WS_NomIti']) ?? trimOrNull(props['WS_NomItiL']);
  const nameNormalized = nameRaw ? stripHorsGestionSuffix(nameRaw) : null;
  const statusRaw = trimOrNull(props['WS_Statut']);
  const reopening = parseReopeningDate(props['WS_InfDate']);
  const lengthSourceRaw = props['WS_LongM'];

  return {
    external_id: `objectid:${objectId}`,
    name_raw: nameRaw,
    name_normalized: nameNormalized,
    raw_attributes: props,
    geom_geojson: feature.geometry ?? null,
    geom_hash: feature.geometry ? await computeGeomHash(feature.geometry) : null,
    length_m_source: typeof lengthSourceRaw === 'number' ? lengthSourceRaw : null,
    status_raw: statusRaw,
    status_normalized_code: mapStatus(props['WS_Statut'], props['WS_InfCaus']),
    status_reason_raw: trimOrNull(props['WS_InfCaus']),
    reopening_raw: trimOrNull(props['WS_InfDate']),
    reopening_date: reopening.date,
    reopening_precision: reopening.precision,
  };
}
