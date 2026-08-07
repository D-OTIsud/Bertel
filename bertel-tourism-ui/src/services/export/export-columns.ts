import { readNamedValue } from '../../features/object-drawer/utils';
import type { OpeningItem, TaxonomyItem } from '../../features/object-drawer/utils';
import type { ParsedObjectDetail } from '../object-detail-parser';
import { resolveTypeLabel } from '../../utils/labels';

/**
 * §208 — REGISTRE UNIQUE des colonnes d'export Excel de l'Exploreur.
 * Étend le contrat de table-columns.tsx (TableColumnDef) à la fiche COMPLÈTE
 * (ParsedObjectDetail), avec groupe + niveau d'autorisation. Toute nouvelle
 * colonne s'ajoute ICI — jamais un 5e écrivain ad hoc (invariant « un concept,
 * une surface », §196). `clearance` FILTRE l'offre (jamais un simple masquage,
 * §205) mais N'EST PAS la garde : la garde reste serveur (RLS + gates DEFINER
 * + 16t pour les coordonnées d'acteur).
 * INTERDIT : aucune colonne ne lit text.privateNote(s) / internal.privateNotes
 * (décision PO §208 — les notes d'équipe ne sortent jamais en Excel).
 */

/**
 * R1 — capacités MÉTIER, pas des rangs : `actor_identity` reprend exactement le
 * droit normal de consulter les acteurs d'une fiche (le gate de ligne serveur
 * v_can_read_extended OR visibility='public') ; `actor_contacts` exige le droit
 * d'export renforcé (16t). On ne réinvente PAS une interprétation des rôles pour
 * l'export : la modale approxime (ergonomie), le serveur réévalue PAR FICHE.
 */
export type ExportClearance = 'public' | 'org' | 'actor_identity' | 'actor_contacts' | 'editor' | 'superuser';

export type ExportCellValue = string | number | null;

export type ExportGroupId =
  | 'identite' | 'localisation' | 'contacts' | 'descriptions' | 'labels'
  | 'equipements' | 'capacite' | 'tarifs' | 'horaires' | 'medias'
  | 'acteur' | 'organisation' | 'legal' | 'liens';

export const EXPORT_GROUP_LABELS: Record<ExportGroupId, string> = {
  identite: 'Identité', localisation: 'Localisation', contacts: 'Contacts',
  descriptions: 'Descriptions', labels: 'Labels & classements', equipements: 'Équipements',
  capacite: 'Capacité & politiques', tarifs: 'Tarifs', horaires: 'Horaires', medias: 'Médias',
  acteur: 'Propriétaire / acteur', organisation: 'Organisation éditrice', legal: 'Légal',
  liens: 'Liens & références',
};

/** Ligne rendue par api.export_actor_contacts (Tâche 12) — camelCase côté front. */
export interface ActorContactChannel { kindCode: string; kindName: string; value: string; isPrimary: boolean }
export interface ActorContactsRow {
  objectId: string; displayName: string; roleName: string; isPrimary: boolean; note: string;
  contacts: ActorContactChannel[];
}

export interface ExportContext {
  /** Rempli UNIQUEMENT par l'appel journalisé api.export_actor_contacts ; null sinon. Les colonnes requiresPurpose ne lisent QUE ceci — jamais detail.relations.actors[].contacts (le journal serait contournable). */
  actorContacts: Map<string, ActorContactsRow[]> | null;
}

export interface ExportColumnDef {
  id: string;
  /** Libellé FR — part tel quel en en-tête de colonne Excel. */
  label: string;
  group: ExportGroupId;
  clearance: ExportClearance;
  /** R1 — type de cellule XLSX. Absent = 'text'. 'number' : latitude/longitude uniquement. */
  cellType?: 'text' | 'number';
  /** R1 — blocs get_object_resource requis (projection p_options.fields). Absent = fiche complète requise : la projection est alors désactivée pour l'export entier. */
  fields?: string[];
  /** TRUE ⇒ exige la saisie d'une finalité + l'appel journalisé (§208). Exactement les colonnes gardées serveur par 16t — même ensemble, aucune zone grise. */
  requiresPurpose?: true;
  value: (d: ParsedObjectDetail, ctx: ExportContext) => ExportCellValue;
}

/**
 * R1 — union des blocs requis par les colonnes cochées, pour p_options.fields.
 * `undefined` = au moins une colonne exige la fiche complète ⇒ pas de projection.
 * Mécanisme non étanche (certains legs sortent hors garde v_fields) : c'est une
 * optimisation de payload, jamais une garde.
 */
export function requiredFieldsFor(columnIds: string[]): string[] | undefined {
  const union = new Set<string>();
  for (const id of columnIds) {
    const col = getExportColumn(id);
    if (!col) continue;
    if (!col.fields) return undefined;
    col.fields.forEach((f) => union.add(f));
  }
  return [...union];
}

// ---------- Helpers d'aplatissement ----------

/** Séparateur INTRA-cellule. Jamais ';' (séparateur de cellules CSV en locale FR). */
export const SEP = ' | ';

export function joinParts(parts: Array<string | null | undefined>, sep = SEP): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
}

export function itemLabels(items: TaxonomyItem[]): string {
  return joinParts(items.map((i) => i.label));
}

/** Groupe de taxonomie par clé — parseTaxonomyGroups omet les groupes vides, donc find + défaut []. Clés réelles : taxonomy/labels/badges/tags/classifications/sustainability/environment/payments/languages/practices (utils.ts:1338-1356). */
export function groupItems(d: ParsedObjectDetail, key: string): TaxonomyItem[] {
  return d.taxonomy.groups.find((g) => g.key === key)?.items ?? [];
}

export function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Lecture défensive dans raw (18 colonnes que le parser n'expose pas — spec §8.3 : lecture directe assumée, gardée par le test de présence de clés de la Tâche 7). */
export function rawStr(d: ParsedObjectDetail, ...path: string[]): string {
  let cursor: unknown = d.raw;
  for (const key of path) {
    cursor = rawRecord(cursor)[key];
  }
  if (cursor == null) return '';
  return typeof cursor === 'string' ? cursor.trim() : typeof cursor === 'number' || typeof cursor === 'boolean' ? String(cursor) : '';
}

export function rawList(d: ParsedObjectDetail, key: string): Array<Record<string, unknown>> {
  const value = d.raw[key];
  return Array.isArray(value) ? value.map(rawRecord) : [];
}

/** Liste de {code,name}-like → libellés FR joints. Un SNAKE_CASE qui sort = bug serveur (les name sont résolus i18n côté RPC), le code n'est que le filet. */
export function namedList(list: unknown): string {
  if (!Array.isArray(list)) return '';
  return joinParts(list.map((entry) => readNamedValue(entry, '')));
}

const FR_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : FR_DATE.format(time);
}

/** Une période d'ouverture en clair. weekdaySlots OBLIGATOIRE (jamais slots[] seuls — créneaux détachés des jours, cas réels §151). */
export function openingToText(o: OpeningItem): string {
  const days = (o.weekdaySlots ?? []).map((ws) => `${ws.weekday} ${ws.slots.join(', ')}`).join(' · ');
  const period = o.allYears ? "Toute l'année" : joinParts([dateFr(o.startDate), dateFr(o.endDate)], ' → ');
  return joinParts([o.label !== period ? o.label : '', period, days, (o.details ?? []).join(', ')], ' — ');
}

/** Vocabulaire statut — même contenu que table-columns.tsx:19 (non exporté là-bas ; la vue Table reste intouchée). */
const STATUS_LABELS: Record<string, string> = {
  published: 'Publiée', draft: 'Brouillon', hidden: 'Hors ligne', archived: 'Archivée',
};

const PHONE_KINDS = new Set(['phone', 'tel', 'telephone', 'telephone_fixe']);
const MOBILE_KINDS = new Set(['mobile', 'telephone_mobile']);

function firstPublicContact(d: ParsedObjectDetail, match: (kindCode: string) => boolean): string {
  return d.contacts.public.find((c) => match(c.kindCode))?.value ?? '';
}
function contactLine(c: { kind: string; value: string }): string {
  return c.kind ? `${c.kind} : ${c.value}` : c.value;
}

// ---------- Colonnes (Tâches 5-7) ----------

export const EXPORT_COLUMNS: ExportColumnDef[] = [
  // ---------- Identité ----------
  { id: 'id', label: 'Identifiant', group: 'identite', clearance: 'public', value: (d) => d.identity.id },
  { id: 'name', label: 'Nom', group: 'identite', clearance: 'public', value: (d) => d.identity.name },
  { id: 'type_code', label: 'Code type', group: 'identite', clearance: 'public', value: (d) => d.identity.type },
  { id: 'type', label: 'Type', group: 'identite', clearance: 'public', value: (d) => resolveTypeLabel(d.identity.type) },
  { id: 'status', label: 'Statut', group: 'identite', clearance: 'public', value: (d) => STATUS_LABELS[d.identity.status] ?? d.identity.status },
  { id: 'commercial_visibility', label: 'Visibilité commerciale', group: 'identite', clearance: 'org', value: (d) => d.identity.commercialVisibility },
  { id: 'region_code', label: 'Territoire', group: 'identite', clearance: 'public', value: (d) => d.identity.regionCode },
  { id: 'created_at', label: 'Créée le', group: 'identite', clearance: 'public', value: (d) => dateFr(d.identity.createdAt) },
  { id: 'updated_at', label: 'Mise à jour le', group: 'identite', clearance: 'public', value: (d) => dateFr(d.identity.updatedAt) },
  { id: 'published_at', label: 'Publiée le', group: 'identite', clearance: 'public', value: (d) => dateFr(d.identity.publishedAt) },
  { id: 'taxonomy', label: 'Sous-catégorie', group: 'identite', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'taxonomy')) },
  { id: 'tags', label: 'Étiquettes', group: 'identite', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'tags')) },
  { id: 'environment_tags', label: 'Cadre & environnement', group: 'identite', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'environment')) },

  // ---------- Localisation ----------
  { id: 'address', label: 'Adresse', group: 'localisation', clearance: 'public', value: (d) => d.location?.address ?? '' },
  { id: 'city', label: 'Commune', group: 'localisation', clearance: 'public', value: (d) => d.location?.city ?? '' },
  { id: 'postcode', label: 'Code postal', group: 'localisation', clearance: 'public', value: (d) => d.location?.postcode ?? '' },
  { id: 'lieu_dit', label: 'Lieu-dit', group: 'localisation', clearance: 'public', value: (d) => d.location?.lieuDit ?? '' },
  { id: 'direction', label: 'Accès / itinéraire', group: 'localisation', clearance: 'public', value: (d) => d.location?.direction ?? '' },
  { id: 'location_label', label: 'Localisation (ligne)', group: 'localisation', clearance: 'public', value: (d) => d.location?.label ?? '' },
  // R1 — les DEUX seules colonnes numériques du registre (cellType 'number', valeur number|null).
  { id: 'latitude', label: 'Latitude', group: 'localisation', clearance: 'public', cellType: 'number', value: (d) => d.location?.latitude ?? null },
  { id: 'longitude', label: 'Longitude', group: 'localisation', clearance: 'public', cellType: 'number', value: (d) => d.location?.longitude ?? null },
  { id: 'google_maps_url', label: 'Lien Google Maps', group: 'localisation', clearance: 'public', value: (d) => d.location?.googleMapsUrl ?? '' },
  { id: 'directions_url', label: 'Lien itinéraire', group: 'localisation', clearance: 'public', value: (d) => d.location?.directionsUrl ?? '' },
  { id: 'code_insee', label: 'Code INSEE', group: 'localisation', clearance: 'public', value: (d) => rawStr(d, 'address', 'code_insee') },
  { id: 'altitude_m', label: 'Altitude (m)', group: 'localisation', clearance: 'public', value: (d) => rawStr(d, 'location', 'altitude_m') },
  { id: 'zones', label: 'Communes desservies', group: 'localisation', clearance: 'public', value: (d) => namedList(d.raw.object_zone) },
  { id: 'places_count', label: 'Nombre de sous-lieux', group: 'localisation', clearance: 'public', value: (d) => (d.text.places.length ? String(d.text.places.length) : '') },
  { id: 'places', label: 'Sous-lieux', group: 'localisation', clearance: 'public', value: (d) => joinParts(d.text.places.map((p) => p.name)) },

  // ---------- Contacts ----------
  { id: 'phone', label: 'Téléphone', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => PHONE_KINDS.has(k)) },
  { id: 'mobile', label: 'Mobile', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => MOBILE_KINDS.has(k)) },
  { id: 'email', label: 'E-mail', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => k === 'email') },
  { id: 'website', label: 'Site web', group: 'contacts', clearance: 'public', value: (d) => firstPublicContact(d, (k) => k === 'website') },
  { id: 'contacts_public', label: 'Contacts publics', group: 'contacts', clearance: 'public', value: (d) => joinParts(d.contacts.public.map(contactLine)) },
  { id: 'contacts_object', label: 'Contacts de la fiche (tous)', group: 'contacts', clearance: 'org', value: (d) => joinParts(d.contacts.object.map(contactLine)) },
  { id: 'contacts_orgs', label: 'Contacts organisations', group: 'contacts', clearance: 'org', value: (d) => joinParts(d.contacts.organizations.map(contactLine)) },
  { id: 'web_channels', label: 'Réseaux & distribution', group: 'contacts', clearance: 'public', value: (d) => joinParts(rawList(d, 'web_channels').map((w) => joinParts([readNamedValue(w.platform, ''), typeof w.url === 'string' ? w.url : ''], ' : '))) },
  { id: 'spoken_languages', label: 'Langues parlées', group: 'contacts', clearance: 'public', value: (d) => itemLabels(groupItems(d, 'languages')) },

  // ---------- Descriptions ----------
  { id: 'chapo', label: 'Accroche', group: 'descriptions', clearance: 'public', value: (d) => d.text.chapo },
  { id: 'description', label: 'Description', group: 'descriptions', clearance: 'public', value: (d) => d.text.description },
  { id: 'description_adapted', label: 'Description adaptée', group: 'descriptions', clearance: 'public', value: (d) => d.text.adaptedDescription },
  { id: 'description_mobile', label: 'Description mobile', group: 'descriptions', clearance: 'public', value: (d) => d.text.mobileDescription },
  { id: 'description_edition', label: 'Description édition', group: 'descriptions', clearance: 'public', value: (d) => d.text.editorialDescription },
  { id: 'description_hors_zone', label: 'Offre hors zone', group: 'descriptions', clearance: 'public', value: (d) => rawStr(d, 'description_offre_hors_zone') },
  { id: 'sanitary_measures', label: 'Mesures sanitaires', group: 'descriptions', clearance: 'public', value: (d) => rawStr(d, 'sanitary_measures') },
  { id: 'descriptions_langs', label: 'Langues de description', group: 'descriptions', clearance: 'public', value: (d) => joinParts([...new Set(d.text.descriptions.map((x) => x.language))]) },
  // PLAN-TACHE-6-ICI
];

export const EXPORT_COLUMN_IDS: string[] = EXPORT_COLUMNS.map((c) => c.id);

export function getExportColumn(id: string): ExportColumnDef | undefined {
  return EXPORT_COLUMNS.find((c) => c.id === id);
}
