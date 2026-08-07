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

/** Types de handicap (`domain.ts:81`) — aucune table de libellés côté serveur pour ces 4 codes. */
const DISABILITY_LABELS: Record<string, string> = {
  motor: 'Moteur', hearing: 'Auditif', visual: 'Visuel', cognitive: 'Mental / cognitif',
};

const PHONE_KINDS = new Set(['phone', 'tel', 'telephone', 'telephone_fixe']);
const MOBILE_KINDS = new Set(['mobile', 'telephone_mobile']);

function firstPublicContact(d: ParsedObjectDetail, match: (kindCode: string) => boolean): string {
  return d.contacts.public.find((c) => match(c.kindCode))?.value ?? '';
}
function contactLine(c: { kind: string; value: string }): string {
  return c.kind ? `${c.kind} : ${c.value}` : c.value;
}

function priceAmounts(d: ParsedObjectDetail): number[] {
  // object_price.amount vaut la CHAÎNE 'n/a' quand absent — filtrer avant tout Math.min (piège maison).
  return d.operations.prices.map((p) => Number(p.amount)).filter((n) => Number.isFinite(n));
}
function priceLine(p: { label: string; amount: string; currency: string; periodLabel: string }): string {
  const amount = Number.isFinite(Number(p.amount)) ? `${p.amount} ${p.currency || 'EUR'}` : '';
  return joinParts([p.label, amount, p.periodLabel], ' — ');
}
function triState(value: boolean | null | undefined, yes: string, no: string): string {
  return value == null ? '' : value ? yes : no;
}

function actorRows(d: ParsedObjectDetail, ctx: ExportContext): ActorContactsRow[] {
  return ctx.actorContacts?.get(d.identity.id) ?? [];
}
function actorChannelValues(d: ParsedObjectDetail, ctx: ExportContext, kindCode: string): string {
  return joinParts(actorRows(d, ctx).flatMap((r) => r.contacts.filter((c) => c.kindCode === kindCode).map((c) => c.value)));
}
/** Valeur d'une ligne legal_records par code de type — lue dans raw (le parser ne remonte pas `value` ; spec §8.3, lecture directe assumée). */
function legalValue(d: ParsedObjectDetail, typeCode: string): string {
  const entry = rawList(d, 'legal_records').find((l) => rawRecord(l.type).code === typeCode);
  if (!entry) return '';
  const value = entry.value;
  return typeof value === 'string' ? value.replace(/^"|"$/g, '') : value == null ? '' : String(value);
}
function legalLine(l: { label: string; status: string }): string {
  return joinParts([l.label, l.status && `(${l.status})`], ' ');
}

// ---------- Colonnes (Tâches 5-7) ----------

export const EXPORT_COLUMNS: ExportColumnDef[] = [
  // ---------- Identité ----------
  // R1 — fields:[] volontaire sur tout ce bloc (identité de base + adresse/location) : bien que
  // 'id'/'name'/'address'/'location' portent chacun leur propre garde v_fields côté SQL, ce sont les
  // champs qu'à peu près TOUT export sélectionne — les traiter comme projetables agressivement risque
  // de faire disparaître 'id' d'une projection étroite (ex. seules des colonnes acteur_contacts,
  // qui ne lisent que d.identity.id pour indexer ctx.actorContacts) et de casser silencieusement le
  // lookup. Vérifié non vacant par le test R1 (requiredFieldsFor(['name','postcode']) === []).
  { id: 'id', label: 'Identifiant', group: 'identite', clearance: 'public', fields: [], value: (d) => d.identity.id },
  { id: 'name', label: 'Nom', group: 'identite', clearance: 'public', fields: [], value: (d) => d.identity.name },
  { id: 'type_code', label: 'Code type', group: 'identite', clearance: 'public', fields: [], value: (d) => d.identity.type },
  { id: 'type', label: 'Type', group: 'identite', clearance: 'public', fields: [], value: (d) => resolveTypeLabel(d.identity.type) },
  { id: 'status', label: 'Statut', group: 'identite', clearance: 'public', fields: [], value: (d) => STATUS_LABELS[d.identity.status] ?? d.identity.status },
  { id: 'commercial_visibility', label: 'Visibilité commerciale', group: 'identite', clearance: 'org', fields: [], value: (d) => d.identity.commercialVisibility },
  { id: 'region_code', label: 'Territoire', group: 'identite', clearance: 'public', fields: [], value: (d) => d.identity.regionCode },
  { id: 'created_at', label: 'Créée le', group: 'identite', clearance: 'public', fields: [], value: (d) => dateFr(d.identity.createdAt) },
  { id: 'updated_at', label: 'Mise à jour le', group: 'identite', clearance: 'public', fields: [], value: (d) => dateFr(d.identity.updatedAt) },
  { id: 'published_at', label: 'Publiée le', group: 'identite', clearance: 'public', fields: [], value: (d) => dateFr(d.identity.publishedAt) },
  { id: 'taxonomy', label: 'Sous-catégorie', group: 'identite', clearance: 'public', fields: ['taxonomy'], value: (d) => itemLabels(groupItems(d, 'taxonomy')) },
  { id: 'tags', label: 'Étiquettes', group: 'identite', clearance: 'public', fields: ['tags'], value: (d) => itemLabels(groupItems(d, 'tags')) },
  { id: 'environment_tags', label: 'Cadre & environnement', group: 'identite', clearance: 'public', fields: ['environment_tags'], value: (d) => itemLabels(groupItems(d, 'environment')) },

  // ---------- Localisation ----------
  { id: 'address', label: 'Adresse', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.address ?? '' },
  { id: 'city', label: 'Commune', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.city ?? '' },
  { id: 'postcode', label: 'Code postal', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.postcode ?? '' },
  { id: 'lieu_dit', label: 'Lieu-dit', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.lieuDit ?? '' },
  { id: 'direction', label: 'Accès / itinéraire', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.direction ?? '' },
  { id: 'location_label', label: 'Localisation (ligne)', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.label ?? '' },
  // R1 — les DEUX seules colonnes numériques du registre (cellType 'number', valeur number|null).
  { id: 'latitude', label: 'Latitude', group: 'localisation', clearance: 'public', cellType: 'number', fields: [], value: (d) => d.location?.latitude ?? null },
  { id: 'longitude', label: 'Longitude', group: 'localisation', clearance: 'public', cellType: 'number', fields: [], value: (d) => d.location?.longitude ?? null },
  { id: 'google_maps_url', label: 'Lien Google Maps', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.googleMapsUrl ?? '' },
  { id: 'directions_url', label: 'Lien itinéraire', group: 'localisation', clearance: 'public', fields: [], value: (d) => d.location?.directionsUrl ?? '' },
  { id: 'code_insee', label: 'Code INSEE', group: 'localisation', clearance: 'public', fields: [], value: (d) => rawStr(d, 'address', 'code_insee') },
  { id: 'altitude_m', label: 'Altitude (m)', group: 'localisation', clearance: 'public', fields: [], value: (d) => rawStr(d, 'location', 'altitude_m') },
  { id: 'zones', label: 'Communes desservies', group: 'localisation', clearance: 'public', fields: ['object_zone'], value: (d) => namedList(d.raw.object_zone) },
  { id: 'places_count', label: 'Nombre de sous-lieux', group: 'localisation', clearance: 'public', fields: ['places'], value: (d) => (d.text.places.length ? String(d.text.places.length) : '') },
  { id: 'places', label: 'Sous-lieux', group: 'localisation', clearance: 'public', fields: ['places'], value: (d) => joinParts(d.text.places.map((p) => p.name)) },

  // ---------- Contacts ----------
  // R1 — contacts.public agrège 3 legs gardés (contacts de la fiche, des acteurs, des organisations).
  { id: 'phone', label: 'Téléphone', group: 'contacts', clearance: 'public', fields: ['contacts', 'actors', 'organizations'], value: (d) => firstPublicContact(d, (k) => PHONE_KINDS.has(k)) },
  { id: 'mobile', label: 'Mobile', group: 'contacts', clearance: 'public', fields: ['contacts', 'actors', 'organizations'], value: (d) => firstPublicContact(d, (k) => MOBILE_KINDS.has(k)) },
  { id: 'email', label: 'E-mail', group: 'contacts', clearance: 'public', fields: ['contacts', 'actors', 'organizations'], value: (d) => firstPublicContact(d, (k) => k === 'email') },
  { id: 'website', label: 'Site web', group: 'contacts', clearance: 'public', fields: ['contacts', 'actors', 'organizations'], value: (d) => firstPublicContact(d, (k) => k === 'website') },
  { id: 'contacts_public', label: 'Contacts publics', group: 'contacts', clearance: 'public', fields: ['contacts', 'actors', 'organizations'], value: (d) => joinParts(d.contacts.public.map(contactLine)) },
  { id: 'contacts_object', label: 'Contacts de la fiche (tous)', group: 'contacts', clearance: 'org', fields: ['contacts'], value: (d) => joinParts(d.contacts.object.map(contactLine)) },
  { id: 'contacts_orgs', label: 'Contacts organisations', group: 'contacts', clearance: 'org', fields: ['organizations'], value: (d) => joinParts(d.contacts.organizations.map(contactLine)) },
  { id: 'web_channels', label: 'Réseaux & distribution', group: 'contacts', clearance: 'public', fields: ['web_channels'], value: (d) => joinParts(rawList(d, 'web_channels').map((w) => joinParts([readNamedValue(w.platform, ''), typeof w.url === 'string' ? w.url : ''], ' : '))) },
  { id: 'spoken_languages', label: 'Langues parlées', group: 'contacts', clearance: 'public', fields: ['languages'], value: (d) => itemLabels(groupItems(d, 'languages')) },

  // ---------- Descriptions ----------
  // R1 — le leg unique 'description' porte description/chapo/adapted/mobile/edition/hors_zone/sanitary
  // (get_object_resource les émet ensemble sous une même garde v_fields — vérifié dans le SQL).
  { id: 'chapo', label: 'Accroche', group: 'descriptions', clearance: 'public', fields: ['description'], value: (d) => d.text.chapo },
  { id: 'description', label: 'Description', group: 'descriptions', clearance: 'public', fields: ['description'], value: (d) => d.text.description },
  { id: 'description_adapted', label: 'Description adaptée', group: 'descriptions', clearance: 'public', fields: ['description'], value: (d) => d.text.adaptedDescription },
  { id: 'description_mobile', label: 'Description mobile', group: 'descriptions', clearance: 'public', fields: ['description'], value: (d) => d.text.mobileDescription },
  { id: 'description_edition', label: 'Description édition', group: 'descriptions', clearance: 'public', fields: ['description'], value: (d) => d.text.editorialDescription },
  { id: 'description_hors_zone', label: 'Offre hors zone', group: 'descriptions', clearance: 'public', fields: ['description'], value: (d) => rawStr(d, 'description_offre_hors_zone') },
  { id: 'sanitary_measures', label: 'Mesures sanitaires', group: 'descriptions', clearance: 'public', fields: ['description'], value: (d) => rawStr(d, 'sanitary_measures') },
  { id: 'descriptions_langs', label: 'Langues de description', group: 'descriptions', clearance: 'public', fields: ['descriptions'], value: (d) => joinParts([...new Set(d.text.descriptions.map((x) => x.language))]) },

  // ---------- Labels & classements ----------
  { id: 'classifications', label: 'Classements & labels', group: 'labels', clearance: 'public', fields: ['classifications'], value: (d) => joinParts(groupItems(d, 'classifications').map((i) => joinParts([i.label, i.meta], ' '))) },
  { id: 'labels_neutral', label: 'Labels', group: 'labels', clearance: 'public', fields: [], value: (d) => itemLabels(groupItems(d, 'labels')) },
  { id: 'badges', label: 'Badges', group: 'labels', clearance: 'public', fields: [], value: (d) => itemLabels(groupItems(d, 'badges')) },
  { id: 'sustainability_labels', label: 'Labels durabilité', group: 'labels', clearance: 'public', fields: ['sustainability_labels'], value: (d) => itemLabels(d.taxonomy.sustainability.labels) },
  { id: 'sustainability_actions', label: 'Actions durabilité', group: 'labels', clearance: 'public', fields: ['sustainability_actions'], value: (d) => itemLabels(d.taxonomy.sustainability.actions) },
  { id: 'accessibility_labels', label: 'Labels accessibilité', group: 'labels', clearance: 'public', fields: ['accessibility_labels'], value: (d) => namedList(d.raw.accessibility_labels) },
  { id: 'disability_types', label: 'Handicaps couverts', group: 'labels', clearance: 'public', fields: ['accessibility_labels'], value: (d) => joinParts(rawList(d, 'accessibility_labels').flatMap((l) => (Array.isArray(l.disability_types_covered) ? (l.disability_types_covered as unknown[]).map((t) => DISABILITY_LABELS[String(t)] ?? String(t)) : []))) },

  // ---------- Équipements ----------
  { id: 'amenities', label: 'Équipements', group: 'equipements', clearance: 'public', fields: ['amenities'], value: (d) => joinParts(d.taxonomy.amenities) },
  { id: 'amenities_count', label: "Nombre d'équipements", group: 'equipements', clearance: 'public', fields: ['amenities'], value: (d) => (d.taxonomy.amenities.length ? String(d.taxonomy.amenities.length) : '') },
  { id: 'payment_methods', label: 'Moyens de paiement', group: 'equipements', clearance: 'public', fields: ['payment_methods'], value: (d) => itemLabels(groupItems(d, 'payments')) },
  { id: 'practices', label: 'Pratiques', group: 'equipements', clearance: 'public', fields: [], value: (d) => itemLabels(groupItems(d, 'practices')) },
  { id: 'cuisine_types', label: 'Types de cuisine', group: 'equipements', clearance: 'public', fields: [], value: (d) => namedList(d.raw.cuisine_types) },
  { id: 'dietary_tags', label: 'Régimes alimentaires', group: 'equipements', clearance: 'public', fields: [], value: (d) => namedList(d.raw.dietary_tags) },
  { id: 'allergens', label: 'Allergènes', group: 'equipements', clearance: 'public', fields: [], value: (d) => namedList(d.raw.allergens) },

  // ---------- Capacité & politiques ----------
  { id: 'capacity', label: 'Capacités', group: 'capacite', clearance: 'public', fields: ['capacity'], value: (d) => joinParts(d.operations.capacities.map((c) => `${c.label} : ${c.value}`)) },
  // Note capacity_max : CapacityItem ne porte pas metric_code (retiré au dédoublonnage, utils.ts:1320) —
  // le match se fait sur le libellé FR résolu serveur (/capacit/i). AUCUN repli sur une autre métrique
  // (arbitrage PO, matrice §208 arbitrage #3) : une métrique quelconque (chambres, emplacements…)
  // présentée comme « Capacité maximale » serait une donnée FAUSSE — une cellule vide est correcte.
  { id: 'capacity_max', label: 'Capacité maximale', group: 'capacite', clearance: 'public', fields: ['capacity'], value: (d) => d.operations.capacities.find((c) => /capacit/i.test(c.label))?.value ?? '' },
  { id: 'rooms_count', label: 'Types de chambres', group: 'capacite', clearance: 'public', fields: ['room_types'], value: (d) => (d.operations.roomTypes.length ? String(d.operations.roomTypes.length) : '') },
  { id: 'room_types', label: 'Chambres', group: 'capacite', clearance: 'public', fields: ['room_types'], value: (d) => joinParts(d.operations.roomTypes.map((r) => joinParts([r.name, r.quantity && `×${r.quantity}`, r.capacityAdults && `${r.capacityAdults} pers.`], ' '))) },
  { id: 'meeting_rooms_count', label: 'Salles de séminaire', group: 'capacite', clearance: 'public', fields: ['meeting_rooms'], value: (d) => (d.operations.meetingRooms.length ? String(d.operations.meetingRooms.length) : '') },
  { id: 'meeting_rooms', label: 'Salles (détail)', group: 'capacite', clearance: 'public', fields: ['meeting_rooms'], value: (d) => joinParts(d.operations.meetingRooms.map((m) => joinParts([m.name, m.areaM2 && `${m.areaM2} m²`, m.capacityTheatre && `théâtre ${m.capacityTheatre}`], ' — '))) },
  { id: 'group_min', label: 'Groupe — taille min', group: 'capacite', clearance: 'public', fields: ['group_policies'], value: (d) => d.operations.groupPolicy?.minSize ?? '' },
  { id: 'group_max', label: 'Groupe — taille max', group: 'capacite', clearance: 'public', fields: ['group_policies'], value: (d) => d.operations.groupPolicy?.maxSize ?? '' },
  { id: 'group_only', label: 'Groupes uniquement', group: 'capacite', clearance: 'public', fields: ['group_policies'], value: (d) => (d.operations.groupPolicy ? triState(d.operations.groupPolicy.groupOnly, 'Oui', 'Non') : '') },
  { id: 'group_notes', label: 'Groupe — conditions', group: 'capacite', clearance: 'public', fields: ['group_policies'], value: (d) => d.operations.groupPolicy?.notes ?? '' },
  { id: 'pets_accepted', label: 'Animaux acceptés', group: 'capacite', clearance: 'public', fields: ['pet_policy'], value: (d) => triState(d.operations.petPolicy?.accepted, 'Oui', 'Non') },
  { id: 'pets_conditions', label: 'Animaux — conditions', group: 'capacite', clearance: 'public', fields: ['pet_policy'], value: (d) => joinParts(d.operations.petPolicy?.details ?? []) },
  { id: 'checkin', label: "Heure d'arrivée", group: 'capacite', clearance: 'public', fields: ['stay_policy'], value: (d) => joinParts([rawStr(d, 'stay_policy', 'checkin_from'), rawStr(d, 'stay_policy', 'checkin_to')], ' – ') },
  { id: 'checkout', label: 'Heure de départ', group: 'capacite', clearance: 'public', fields: ['stay_policy'], value: (d) => rawStr(d, 'stay_policy', 'checkout_until') },

  // ---------- Tarifs ----------
  { id: 'prices', label: 'Tarifs', group: 'tarifs', clearance: 'public', fields: ['prices'], value: (d) => joinParts(d.operations.prices.map(priceLine)) },
  { id: 'price_min', label: 'Tarif minimum', group: 'tarifs', clearance: 'public', fields: ['prices'], value: (d) => { const a = priceAmounts(d); return a.length ? String(Math.min(...a)) : ''; } },
  { id: 'currency', label: 'Devise', group: 'tarifs', clearance: 'public', fields: ['prices'], value: (d) => d.operations.prices.find((p) => p.currency)?.currency ?? '' },
  { id: 'discounts_count', label: 'Réductions (nombre)', group: 'tarifs', clearance: 'public', fields: ['discounts'], value: (d) => (d.operations.discounts.length ? String(d.operations.discounts.length) : '') },
  { id: 'discounts', label: 'Réductions', group: 'tarifs', clearance: 'public', fields: ['discounts'], value: (d) => joinParts(d.operations.discounts.map((x) => readNamedValue(x, ''))) },
  { id: 'promotions', label: 'Promotions', group: 'tarifs', clearance: 'org', fields: ['promotions'], value: (d) => namedList(d.raw.promotions) },

  // ---------- Horaires ----------
  // R1 — raw.opening_times/opening_periods/openings ne portent AUCUNE garde v_fields (toujours renvoyés).
  { id: 'openings', label: "Horaires d'ouverture", group: 'horaires', clearance: 'public', fields: [], value: (d) => joinParts(d.operations.openings.map(openingToText)) },
  { id: 'openings_count', label: "Périodes d'ouverture", group: 'horaires', clearance: 'public', fields: [], value: (d) => (d.operations.openings.length ? String(d.operations.openings.length) : '') },
  { id: 'open_all_year', label: "Ouvert toute l'année", group: 'horaires', clearance: 'public', fields: [], value: (d) => (d.operations.openings.length === 0 ? '' : d.operations.openings.some((o) => o.allYears) ? 'Oui' : 'Non') },

  // ---------- Médias ----------
  { id: 'photo_main', label: 'Photo principale (URL)', group: 'medias', clearance: 'public', fields: ['media'], value: (d) => d.media.hero?.url ?? '' },
  { id: 'photo_main_credit', label: 'Crédit photo principale', group: 'medias', clearance: 'public', fields: ['media'], value: (d) => d.media.hero?.credit ?? '' },
  { id: 'media_count', label: 'Nombre de médias', group: 'medias', clearance: 'public', fields: ['media'], value: (d) => (d.media.items.length ? String(d.media.items.length) : '') },
  { id: 'media_urls', label: 'URLs des médias', group: 'medias', clearance: 'public', fields: ['media'], value: (d) => joinParts(d.media.items.map((m) => m.url)) },
  { id: 'media_credits', label: 'Crédits médias', group: 'medias', clearance: 'public', fields: ['media'], value: (d) => joinParts([...new Set(d.media.items.map((m) => m.credit).filter(Boolean))]) },
  { id: 'media_tags', label: 'Tags médias', group: 'medias', clearance: 'public', fields: ['media'], value: (d) => joinParts(d.media.tagCloud) },
  { id: 'media_private_count', label: 'Médias non publics', group: 'medias', clearance: 'org', fields: ['media'], value: (d) => { const n = d.media.items.filter((m) => m.visibility && m.visibility !== 'public').length; return n ? String(n) : ''; } },

  // ---------- Propriétaire / acteur ----------
  // R1 — l'export ne donne jamais plus que la consultation : nom/rôle/principal
  // portent actor_identity (= le droit normal de voir les acteurs ; le serveur
  // filtre déjà les LIGNES par v_can_read_extended OR visibility='public').
  // Coordonnées/note/résumé : actor_contacts + requiresPurpose ⇒ lues UNIQUEMENT
  // depuis ctx.actorContacts (l'appel journalisé api.export_actor_contacts) —
  // jamais depuis la fiche, sinon le journal serait contournable. Même ensemble
  // que la garde 16t.
  { id: 'actor_names', label: 'Acteur — nom', group: 'acteur', clearance: 'actor_identity', fields: ['actors'], value: (d) => joinParts(d.relations.actors.map((a) => a.name)) },
  { id: 'actor_roles', label: 'Acteur — rôle', group: 'acteur', clearance: 'actor_identity', fields: ['actors'], value: (d) => joinParts(d.relations.actors.map((a) => a.role)) },
  // R1 — MULTI-valué : la contrainte permet un principal PAR RÔLE, pas un par fiche.
  { id: 'actor_primary', label: 'Acteur(s) principal(aux)', group: 'acteur', clearance: 'actor_identity', fields: ['actors'], value: (d) => joinParts(d.relations.actors.filter((a) => a.isPrimary).map((a) => a.name)) },
  { id: 'actor_phone', label: 'Acteur — téléphone', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, fields: [], value: (d, ctx) => actorChannelValues(d, ctx, 'phone') },
  { id: 'actor_mobile', label: 'Acteur — mobile', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, fields: [], value: (d, ctx) => actorChannelValues(d, ctx, 'mobile') },
  { id: 'actor_email', label: 'Acteur — e-mail', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, fields: [], value: (d, ctx) => actorChannelValues(d, ctx, 'email') },
  // Colonne créée VIDE aujourd'hui (0 canal address en base) — §150 : la surface suit le modèle, pas la donnée.
  { id: 'actor_address', label: 'Acteur — adresse', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, fields: [], value: (d, ctx) => actorChannelValues(d, ctx, 'address') },
  { id: 'actor_summary', label: 'Propriétaire (résumé)', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, fields: [], value: (d, ctx) => joinParts(actorRows(d, ctx).map((r) => joinParts([
      joinParts([r.displayName, r.roleName && `(${r.roleName})`], ' '),
      joinParts(r.contacts.filter((c) => c.kindCode === 'phone' || c.kindCode === 'mobile').map((c) => c.value), ', '),
      joinParts(r.contacts.filter((c) => c.kindCode === 'email').map((c) => c.value), ', '),
      joinParts(r.contacts.filter((c) => c.kindCode === 'address').map((c) => c.value), ', '),
    ], ' — '))) },
  { id: 'actors_notes', label: 'Acteur — note', group: 'acteur', clearance: 'actor_contacts', requiresPurpose: true, fields: [], value: (d, ctx) => joinParts(actorRows(d, ctx).map((r) => r.note)) },

  // ---------- Organisation éditrice ----------
  { id: 'publisher', label: 'Organisation éditrice', group: 'organisation', clearance: 'public', fields: ['org_links'], value: (d) => (d.relations.orgLinks.find((o) => /publisher|édit/i.test(o.linkType)) ?? d.relations.orgLinks[0])?.name ?? '' },
  { id: 'org_links', label: 'Organisations rattachées', group: 'organisation', clearance: 'public', fields: ['org_links'], value: (d) => joinParts(d.relations.orgLinks.map((o) => joinParts([o.name, o.linkType && `(${o.linkType})`], ' '))) },
  { id: 'parent_objects', label: 'Fiches parentes', group: 'organisation', clearance: 'public', fields: [], value: (d) => joinParts(d.relations.parentObjects.map((o) => o.name)) },
  { id: 'org_emails', label: 'E-mails organisations', group: 'organisation', clearance: 'org', fields: ['org_links'], value: (d) => joinParts(d.relations.organizations.flatMap((o) => o.emails)) },
  { id: 'memberships', label: 'Adhésions', group: 'organisation', clearance: 'org', fields: [], value: (d) => joinParts(d.relations.memberships.map((m) => joinParts([m.name, m.status && `(${m.status})`], ' '))) },
  { id: 'membership_expires', label: 'Adhésion — échéance', group: 'organisation', clearance: 'org', fields: [], value: (d) => dateFr(d.relations.memberships[0]?.expiresAt) },

  // ---------- Légal ----------
  // SIRET/SIREN : publics ASSUMÉS (is_public=TRUE en base, arbitrage PO 2026-07-31 —
  // mémoire siret-siren-publics-arbitrage). Le reste du bloc suit ref_legal_type.is_public.
  { id: 'siret', label: 'SIRET', group: 'legal', clearance: 'public', fields: ['legal_records'], value: (d) => legalValue(d, 'siret') },
  { id: 'legal_records', label: 'Mentions légales (publiques)', group: 'legal', clearance: 'public', fields: ['legal_records'], value: (d) => joinParts(d.internal.legalRecords.filter((l) => l.isPublic).map(legalLine)) },
  { id: 'legal_records_all', label: 'Mentions légales (tout)', group: 'legal', clearance: 'org', fields: ['legal_records'], value: (d) => joinParts(d.internal.legalRecords.map(legalLine)) },
  { id: 'legal_validity', label: 'Validité des documents', group: 'legal', clearance: 'org', fields: ['legal_records'], value: (d) => joinParts(d.internal.legalRecords.map((l) => joinParts([l.label, l.validityMode], ' : '))) },
  { id: 'legal_expiring', label: 'Documents à échéance (<90 j)', group: 'legal', clearance: 'org', fields: ['legal_records'], value: (d) => joinParts(d.internal.legalRecords.filter((l) => l.daysUntilExpiry !== '' && Number(l.daysUntilExpiry) < 90).map((l) => l.label)) },

  // ---------- Liens & références ----------
  { id: 'relations_out', label: 'Relations sortantes', group: 'liens', clearance: 'public', fields: [], value: (d) => joinParts(d.relations.outgoing.map((r) => joinParts([r.name, r.relationship && `(${r.relationship})`], ' '))) },
  { id: 'relations_in', label: 'Relations entrantes', group: 'liens', clearance: 'public', fields: [], value: (d) => joinParts(d.relations.incoming.map((r) => joinParts([r.name, r.relationship && `(${r.relationship})`], ' '))) },
  { id: 'external_ids', label: 'Identifiants externes', group: 'liens', clearance: 'org', fields: ['external_ids'], value: (d) => joinParts(d.internal.externalIds.map((e) => joinParts([e.source, e.externalId], ' : '))) },
  { id: 'origins', label: "Sources d'import", group: 'liens', clearance: 'org', fields: ['origins'], value: (d) => joinParts(d.internal.origins.map((o) => readNamedValue(o, ''))) },
  { id: 'iti_distance_km', label: 'Distance (km)', group: 'liens', clearance: 'public', fields: [], value: (d) => d.itinerary.summary?.distanceKm ?? '' },
  { id: 'iti_duration_h', label: 'Durée (h)', group: 'liens', clearance: 'public', fields: [], value: (d) => d.itinerary.summary?.durationHours ?? '' },
  { id: 'iti_difficulty', label: 'Difficulté', group: 'liens', clearance: 'public', fields: [], value: (d) => d.itinerary.summary?.difficulty ?? '' },
  { id: 'iti_elevation', label: 'Dénivelé positif (m)', group: 'liens', clearance: 'public', fields: [], value: (d) => d.itinerary.summary?.elevationGain ?? '' },
  { id: 'iti_is_loop', label: 'Boucle', group: 'liens', clearance: 'public', fields: [], value: (d) => triState(d.itinerary.summary?.isLoop, 'Oui', 'Non') },
  { id: 'iti_stages', label: "Nombre d'étapes", group: 'liens', clearance: 'public', fields: [], value: (d) => { const n = d.itinerary.summary?.stagesCount ?? 0; return n ? String(n) : ''; } },
  { id: 'iti_open_status', label: 'État du sentier', group: 'liens', clearance: 'public', fields: [], value: (d) => rawStr(d, 'itinerary', 'open_status') },
  { id: 'fma_occurrences_count', label: "Dates d'événement (nombre)", group: 'liens', clearance: 'public', fields: ['fma_occurrences'], value: (d) => (d.itinerary.fmaOccurrences.length ? String(d.itinerary.fmaOccurrences.length) : '') },
  // Diagnostic : dépend de TOUT le payload (Object.keys(raw) complet) — fields OMIS
  // à dessein (doute ⇒ pas de projection) sinon la colonne perdrait son objet.
  { id: 'unhandled_keys', label: 'Clés non traitées (diagnostic)', group: 'liens', clearance: 'superuser', value: (d) => joinParts(d.coverage.unhandledKeys) },
];

export const EXPORT_COLUMN_IDS: string[] = EXPORT_COLUMNS.map((c) => c.id);

export function getExportColumn(id: string): ExportColumnDef | undefined {
  return EXPORT_COLUMNS.find((c) => c.id === id);
}

// ---------- Niveaux d'autorisation & préréglages ----------

/** R2.1 — verdict du préflight serveur sur LA SÉLECTION. Fermé par défaut. */
export interface ActorCapabilities {
  actorIdentityAvailable: boolean;
  actorContactsAvailable: boolean;
}
export const CLOSED_ACTOR_CAPS: ActorCapabilities = {
  actorIdentityAvailable: false,
  actorContactsAvailable: false,
};

/**
 * R2.1 — DEUX AUTORITÉS DISJOINTES, et c'est le point clé :
 *  - `clearanceLevels` décide des niveaux DÉRIVÉS DE LA SESSION : public, org,
 *    editor, superuser. Il ne dit RIEN des capacités acteur.
 *  - le PRÉFLIGHT SERVEUR (`api.export_actor_capabilities`) décide SEUL de
 *    `actor_identity` / `actor_contacts`.
 * Pourquoi disjointes et non superposées : le droit sur les acteurs est PAR
 * FICHE (extended OU lien `public` / ORG publisher), pas par session. Un lecteur
 * SANS ORG a légitimement accès à l'identité des acteurs d'une fiche à lien
 * public — si la session filtrait d'abord, le préflight ne pourrait plus que
 * restreindre une liste déjà amputée, et ce lecteur ne verrait jamais la
 * colonne (persona I3 du test SQL, mort-né côté UI). Le serveur doit pouvoir
 * OUVRIR, pas seulement fermer.
 * Aucune des deux n'est la garde : le RPC journalisé 16t refuse fiche par fiche.
 */
export function clearanceLevels(session: { orgId: string | null; canEditObjects: boolean; role: string | null }): Set<ExportClearance> {
  const levels = new Set<ExportClearance>(['public']);
  if (session.orgId) levels.add('org');
  if (session.canEditObjects) levels.add('editor');
  if (session.role === 'super_admin') {
    levels.add('superuser');
    levels.add('org');
  }
  return levels;
}

/**
 * L'offre de la modale. FILTRE (§205) — jamais un masquage d'options qui
 * resteraient dans l'état. Les clearances acteur viennent du préflight, tout le
 * reste de la session. `caps` par défaut FERMÉ : un appelant qui l'oublie
 * n'ouvre rien (fail-closed).
 */
export function availableColumns(
  session: { orgId: string | null; canEditObjects: boolean; role: string | null },
  caps: ActorCapabilities = CLOSED_ACTOR_CAPS,
): ExportColumnDef[] {
  const levels = clearanceLevels(session);
  return EXPORT_COLUMNS.filter((c) => {
    if (c.clearance === 'actor_identity') return caps.actorIdentityAvailable;
    if (c.clearance === 'actor_contacts') return caps.actorContactsAvailable;
    return levels.has(c.clearance);
  });
}

export type ExportPresetId = 'essentiel' | 'complet' | 'diffusion' | 'custom';

export const EXPORT_PRESETS: Array<{ id: Exclude<ExportPresetId, 'custom'>; label: string; locked: boolean }> = [
  { id: 'essentiel', label: 'Essentiel', locked: false },
  { id: 'complet', label: 'Complet', locked: false },
  // Verrouillé : c'est ce qui rend l'arbitrage RGPD visible dans l'outil (spec §4.6).
  { id: 'diffusion', label: 'Diffusion partenaire', locked: true },
];

const ESSENTIEL_IDS = [
  'id', 'name', 'type', 'taxonomy', 'status', 'city', 'postcode', 'address',
  'phone', 'mobile', 'email', 'website', 'chapo', 'classifications', 'publisher', 'updated_at',
];

export function presetColumnIds(
  presetId: ExportPresetId,
  session: { orgId: string | null; canEditObjects: boolean; role: string | null },
  caps: ActorCapabilities = CLOSED_ACTOR_CAPS,
): string[] {
  const allowed = availableColumns(session, caps);
  switch (presetId) {
    case 'essentiel':
      return ESSENTIEL_IDS.filter((id) => allowed.some((c) => c.id === id));
    case 'complet':
      // Hors groupe acteur (spec §4.6) : cocher une colonne à finalité ne doit
      // jamais arriver par un préréglage — c'est un geste explicite.
      return allowed.filter((c) => c.group !== 'acteur').map((c) => c.id);
    case 'diffusion':
      // TOUJOURS recalculé du code — jamais restauré du localStorage (préréglage verrouillé).
      return EXPORT_COLUMNS.filter((c) => c.clearance === 'public' && c.group !== 'acteur').map((c) => c.id);
    default:
      return [];
  }
}

export function purposeRequired(columnIds: string[]): boolean {
  return columnIds.some((id) => getExportColumn(id)?.requiresPurpose === true);
}
