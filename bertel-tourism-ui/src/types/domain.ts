export type UserRole = 'super_admin' | 'tourism_agent' | 'owner';
export type NetworkStatus = 'connected' | 'degraded' | 'offline';
export type MapLayerMode = 'classic' | 'satellite' | 'topo';
export type ObjectTypeCode = 'HOT' | 'RES' | 'ACT' | 'ITI' | 'EVT' | 'VIS' | 'SRV';
export type ExplorerBucketKey = ObjectTypeCode;
export type BackendObjectTypeCode =
  | 'HOT'
  | 'HPA'
  | 'HLO'
  | 'CAMP'
  | 'RVA'
  | 'RES'
  | 'ITI'
  | 'FMA'
  | 'ACT'
  | 'LOI'
  | 'PCU'
  | 'PNA'
  | 'VIL'
  | 'COM'
  | 'PSV'
  | 'ASC'
  | 'SPU'
  | 'PRD';

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface LocationSummary {
  lat?: number | null;
  lon?: number | null;
  city?: string | null;
  postcode?: string | null;
  address?: string | null;
  lieu_dit?: string | null;
}

export interface ObjectCardTag {
  slug?: string | null;
  code?: string | null;
  name?: string | null;
  label?: string | null;
  color?: string | null;
  icon?: string | null;
  icon_url?: string | null;
}

export interface ObjectCardBadge {
  kind?: string | null;
  code?: string | null;
  label?: string | null;
  name?: string | null;
}

/**
 * §09 colored tag chip — the curated display-tag layer (ref_tag) with its GLOBAL hex color,
 * already deduped against the neutral `labels` blend and ordered by tag_link.position.
 * Derived by normalizeExplorerCard; rendered first (colored) on the card + map.
 */
export interface ObjectCardTagChip {
  label: string;
  color: string; // hex #rrggbb
  slug: string;
}

export interface ObjectCardTaxonomy {
  domain?: string | null;
  code?: string | null;
  name?: string | null;
  path?: Array<{ code?: string | null; name?: string | null }>;
}

export interface CapacityFilter {
  code: string;
  min?: number;
  max?: number;
}

export type AccessibilityDisabilityTypeCode = 'motor' | 'hearing' | 'visual' | 'cognitive';

export interface AccessibilityAmenityRef {
  code: string;
  name: string;
  description?: string | null;
  disabilityTypes: AccessibilityDisabilityTypeCode[];
}

export interface SustainabilityActionRef {
  code: string;
  name: string;
  description?: string | null;
  categoryCode: string;
}

export interface SustainabilityCategoryRef {
  code: string;
  name: string;
  description?: string | null;
  actions: SustainabilityActionRef[];
}

export interface ClassificationRef {
  schemeCode: string;
  valueCode: string;
}

export interface TaxonomyRef {
  domain: string;
  code: string;
}

export interface MeetingRoomFilter {
  minCount?: number;
  minAreaM2?: number;
  minCapTheatre?: number;
  minCapClassroom?: number;
}

/**
 * Visible publication statuses in the Explorer.
 * - 'published'  : object is live (default for every user, including anonymous).
 * - 'draft'      : object is being prepared by the publishing ORG.
 *                  Only relevant for users with `canEditObjects = true`. RLS
 *                  still gates which non-published rows are actually returned —
 *                  cross-ORG drafts remain hidden regardless of this flag.
 * archived/hidden are intentionally not surfaced here today.
 */
export type ExplorerStatusFilter = 'published' | 'draft';

/**
 * An active §09 tag filter. `slug` is the value sent to the RPC (`tags_any`); `name`/`color`
 * are carried so the sidebar Tags rail can show the tag's display name in its own colour.
 */
export interface ExplorerTagFilter {
  slug: string;
  name: string;
  color?: string;
}

/** §204 — paliers de remplissage : 0 manquant, 1–2, 3 et plus. */
export type MissingEssentialBucket = 'complete' | 'few' | 'many';

/**
 * §204 — codes d'essentiels visiteur, IDENTIQUES à ceux du champ `missing_fields`
 * de `api.get_dashboard_completeness` et de `internal.v_object_essentials`.
 * Ne pas en inventer, ne pas les renommer : ils voyagent tels quels dans le RPC.
 */
export type MissingEssentialCode =
  | 'name'
  | 'subcategory'
  | 'location'
  | 'contact'
  | 'description'
  | 'photos'
  | 'type_block'
  | 'tags';

export interface ExplorerCommonFilters {
  search: string;
  /**
   * §109 — search breadth. 'global' (the Explorer default) matches the aggregated
   * `object.search_document` (équipements, tags, plats de menu, régimes, labels,
   * description…) in addition to name/city, and ranks by relevance. 'name' keeps the
   * legacy name/city-only matching — used by the editor object pickers (duplicate-name
   * hint, RelationPicker) so linking objects stays name-focused. Undefined ⇒ global.
   */
  searchScope?: 'name' | 'global';
  cities: string[];
  lieuDit: string;
  pmr: boolean;
  accessibilityDisabilityTypesAny: AccessibilityDisabilityTypeCode[];
  accessibilityAmenityCodesAny: string[];
  sustainable: boolean;
  sustainabilityCategoryCodesAny: string[];
  sustainabilityActionCodesAny: string[];
  petsAccepted: boolean;
  openNow: boolean;
  /**
   * §157 — « ouvert à … » : instant futur/passé au format datetime-local
   * (`YYYY-MM-DDTHH:mm`, heure de La Réunion). Exclusif avec openNow. Envoyé au
   * RPC comme `open_at` timestamptz (+04:00 — pas de DST à La Réunion).
   */
  openAt: string | null;
  /**
   * §154 (P0-b audit filtres) — cadre & environnement (bord de mer, montagne,
   * volcan…). TRANSVERSE : la donnée (`object_environment_tag`) couvre tous les
   * types (531 rural, 439 vue panoramique…), pas seulement les activités — le
   * RPC matche `cached_environment_tags` sans considération de bucket.
   */
  environmentTagsAny: string[];
  /**
   * §201 — types d'unité d'hébergement (bulle, tipi, lodge, cabane). Axe
   * MULTI-VALUÉ porté par `object_accommodation_unit_type`, distinct de la
   * NATURE de l'établissement : « dans quoi le visiteur dort-il ? » n'est pas
   * « quel type d'établissement est-ce ? ». Envoyé au RPC comme
   * `accommodation_unit_types_any`.
   */
  accommodationUnitTypesAny: string[];
  /**
   * Positionnements commerciaux d'hôtel (boutique, affaires, familial…).
   * Axe multi-valué, combiné en ET avec la nature d'hébergement et envoyé au
   * RPC comme `accommodation_positionings_any`.
   */
  accommodationPositioningsAny: string[];
  /**
   * §159 — services & équipements (familles d'aménités : piscine→outdoor,
   * bien-être, parking…). Transverse (`object_amenity` est trans-types) ;
   * envoyé au RPC comme `amenity_families_any`.
   */
  amenityFamiliesAny: string[];
  /**
   * §155 — sous-catégories (paires domaine:code, tous buckets). Le domaine
   * encode le type (`taxonomy_res`…) : `buildBucketRpcFilters` PARTITIONNE par
   * bucket au moment du payload (une sélection RES ne contraint jamais le
   * bucket HOT — mêmes sémantiques que les sous-types).
   */
  taxonomyAny: TaxonomyRef[];
  /** Active §09 tag filters (click-to-filter on a card/map tag). Sent to the RPC as `tags_any`. */
  tagsAny: ExplorerTagFilter[];
  rankedLabelSchemeCode: string | null;
  /**
   * §173 — quand un scheme classé est actif (`rankedLabelSchemeCode`), inclure les objets
   * couverts par une démarche équivalente en plus des labellisés directs. Défaut TRUE
   * (comportement historique). FALSE ⇒ `label_scheme_ranked_exact_only` au RPC.
   */
  rankedLabelIncludeEquivalents: boolean;
  /** §174 — niveaux de classement sélectionnés (value_codes du scheme classé actif). Réinitialisé au changement de scheme. */
  rankedLabelValueCodes: string[];
  /**
   * Active publication-status filter sent to api.list_object_resources_filtered_page
   * as p_status. An empty array means "use the server default" (= published only),
   * which is the safe baseline for read-only personas. Editors broaden the default
   * to ['published','draft'] at session bootstrap.
   */
  statuses: ExplorerStatusFilter[];
  /**
   * §204 — paliers de remplissage. Réservé aux éditeurs, et gardé DEUX FOIS :
   * le panneau masque le groupe pour un lecteur seul, `useExplorerQueryFilters`
   * neutralise l'état (il survivrait à une URL partagée ou à un changement de
   * rôle en session), et le RPC ignore les clés d'un non-éditeur. Les trois sont
   * indépendantes — aucune ne suffit seule.
   */
  missingEssentialsBuckets: MissingEssentialBucket[];
  /** §204 — quels essentiels manquent (OU interne, ET avec le palier). */
  missingEssentialsAny: MissingEssentialCode[];
  bbox?: [number, number, number, number] | null;
  polygon?: GeoPolygon | null;
}

export interface HotBucketFilters {
  subtypes: BackendObjectTypeCode[];
  capacityFilters: CapacityFilter[];
  meetingRoom: MeetingRoomFilter;
}

export interface ResBucketFilters {
  capacityFilters: CapacityFilter[];
}

export interface ItiBucketFilters {
  isLoop: boolean | null;
  difficultyMin?: number;
  difficultyMax?: number;
  distanceMinKm?: number;
  distanceMaxKm?: number;
  durationMinH?: number;
  durationMaxH?: number;
  practicesAny: string[];
}

/** §157 — dates du bucket Événements (payload `event:{from,to}`, EVT uniquement). */
export interface EvtBucketFilters {
  eventFrom: string | null;
  eventTo: string | null;
}

/** Sous-types des buckets fourre-tout (impl. 3.2) : filtre client par type DB. */
export interface VisBucketFilters {
  subtypes: BackendObjectTypeCode[];
}
export interface SrvBucketFilters {
  subtypes: BackendObjectTypeCode[];
}

export interface ObjectCard {
  id: string;
  type: BackendObjectTypeCode | string;
  name: string;
  status?: string;
  commercial_visibility?: string | null;
  pet_accepted?: boolean | null;
  image?: string | null;
  rating?: number | null;
  review_count?: number | null;
  min_price?: number | null;
  open_now?: boolean | null;
  description?: string | null;
  labels?: string[];
  /** §09 colored tag chips (curated display layer), set by normalizeExplorerCard. */
  tagChips?: ObjectCardTagChip[];
  label_match?: ObjectCardLabelMatch | null;
  tags?: ObjectCardTag[];
  badges?: ObjectCardBadge[];
  taxonomy?: ObjectCardTaxonomy[];
  environment_tags?: ObjectCardTag[];
  amenity_codes?: string[];
  /**
   * §204 — essentiels visiteur manquants. Émis par le RPC UNIQUEMENT pour un
   * appelant éditeur (`api.object_missing_essentials`). **L'absence du champ ne
   * signifie PAS « fiche complète »** — elle signifie « appelant non éditeur ».
   * Une fiche complète porte un tableau VIDE. Ne jamais afficher un signal
   * positif sur une absence.
   */
  missing_essentials?: string[];
  updated_at?: string | null;
  location?: LocationSummary;
  render?: {
    price?: string;
    rating?: string;
    updated_at?: string;
    /** Optional capacity line from card view (e.g. "120 pers.") */
    capacity?: string;
  };
}

export type MapObject = ObjectCard;

export interface ObjectCardLabelMatch {
  scheme_code: string;
  rank: 0 | 1;
  source: 'certified_label' | 'accessibility_amenity' | 'sustainability_action' | string;
  evidence_count: number;
}

export interface ExplorerFilters {
  selectedBuckets: ExplorerBucketKey[];
  common: ExplorerCommonFilters;
  hot: HotBucketFilters;
  res: ResBucketFilters;
  iti: ItiBucketFilters;
  evt: EvtBucketFilters;
  vis: VisBucketFilters;
  srv: SrvBucketFilters;
}

export interface ExplorerReferenceOption {
  code: string;
  name: string;
  /** Optional family label for grouped filter dropdowns (e.g. « Classements », « Durabilité »). */
  group?: string;
  /**
   * Types d'objet auxquels l'option s'applique (`ref_classification_scheme_applicability`).
   * **`undefined` ou vide = applicable à TOUS les types** — l'absence de restriction est le
   * défaut fail-open du registre : une distinction non seedée reste proposée partout plutôt
   * que de disparaître silencieusement. Voir `migration_classification_scheme_applicability.sql`.
   */
  objectTypes?: BackendObjectTypeCode[];
}

export interface ExplorerTaxonomyNode {
  code: string;
  name: string;
  description?: string | null;
  parentCode: string | null;
  depth: number;
  isAssignable: boolean;
  position?: number | null;
  /** §192 — rôle sémantique déclaré ; la profondeur technique n'est pas un axe métier. */
  axis?: 'famille' | 'nature' | 'sous_type' | 'type_unite' | 'positionnement' | null;
  /** §192 — famille ontologique dérivée, indépendante du type d'objet technique. */
  family?: string | null;
  /** Anciens libellés (reprise) et synonymes conservés pour la recherche de transition. */
  aliases?: string[];
  /** Référence normative courte affichable avec la définition. */
  sourceRef?: string | null;
}

export interface ExplorerAccommodationFamily {
  code: string;
  name: string;
  description?: string | null;
  position?: number | null;
  /**
   * §201 — ancien vocabulaire conservé pour la recherche. « Hôtellerie de plein
   * air » recouvrait à la fois les terrains et les aires de halte : les DEUX
   * familles qui la remplacent le portent, pour que la recherche propose les
   * deux au lieu de trancher à la place de l'agent.
   */
  aliases?: string[];
}

export interface ExplorerTaxonomyDomain {
  domain: string;
  name: string;
  objectType: BackendObjectTypeCode | string;
  nodes: ExplorerTaxonomyNode[];
}

/** Bornes observées d'une métrique de capacité pour UN type d'objet (16o). */
export interface CapacityBounds {
  min: number;
  max: number;
  /** Nombre de fiches lisibles portant la valeur — sert à dire « observé sur N fiches ». */
  sampleSize: number;
}

/** `metric_code → object_type → bornes`. Absence d'entrée = bornes inconnues. */
export type CapacityBoundsByMetric = Record<string, Record<string, CapacityBounds>>;

export interface ExplorerReferences {
  accessibilityDisabilityTypes: ExplorerReferenceOption[];
  accessibilityAmenities: AccessibilityAmenityRef[];
  sustainabilityCategories: SustainabilityCategoryRef[];
  rankedLabelSchemes: ExplorerReferenceOption[];
  /**
   * §174 — pour chaque scheme classé (is_distinction), ses paliers de note
   * (ref_classification_value : code, name), triés par grade croissant. Clé = code du scheme.
   * value_code '1'..'5' (étoiles/épis/clés) ou 'cat_1..3' (ot_category).
   */
  rankedLabelSchemeValues: Record<string, ExplorerReferenceOption[]>;
  /** §155 — TOUS les domaines de sous-catégories (un par type, hors ORG), chacun portant son objectType. */
  taxonomies: ExplorerTaxonomyDomain[];
  /** §192 — regroupements ontologiques non assignables des natures d'hébergement. */
  accommodationFamilies?: ExplorerAccommodationFamily[];
  hotCapacityMetrics: ExplorerReferenceOption[];
  resCapacityMetrics: ExplorerReferenceOption[];
  /**
   * Bornes OBSERVÉES des métriques de capacité (`public.v_capacity_metric_bounds`,
   * manifest 16o), indexées `metric_code → object_type`. Elles bornent les curseurs
   * min/max du filtre « Capacités détaillées ».
   *
   * Une métrique ABSENTE = aucune borne connue (aucune fiche lisible ne porte la
   * valeur), **pas** une métrique à masquer : la surface de filtre suit le modèle,
   * jamais les données (§150). Le consommateur retombe sur une saisie numérique libre.
   */
  capacityBounds: CapacityBoundsByMetric;
  itiPractices: ExplorerReferenceOption[];
  /** Cadre & environnement (ref_code domaine environment_tag) — filtre transverse §154. */
  environmentTags: ExplorerReferenceOption[];
  /** §201 — catalogue `accommodation_unit_type` (bulle, tipi, lodge, cabane…). */
  accommodationUnitTypes: ExplorerReferenceOption[];
  /** Positionnements d'hôtel issus des nœuds `taxonomy_hot` d'axe `positionnement`. */
  accommodationPositionings?: ExplorerReferenceOption[];
  /** Familles de services & équipements (ref_code domaine amenity_family) — filtre transverse §159. */
  amenityFamilies: ExplorerReferenceOption[];
  /** Catalogue des tags §09 (ref_tag) — le picker du panneau complète le click-to-filter (§160). */
  tags: ExplorerTagFilter[];
  /** Corpus-wide city list — from api.get_dashboard_filter_options */
  cities: string[];
  /** Corpus-wide lieu-dit list — from api.get_dashboard_filter_options */
  lieuDits: string[];
}

export interface RpcPageMeta {
  kind: string;
  language: string;
  language_fallbacks: string[];
  page_size: number;
  offset: number;
  total: number;
  cursor?: string | null;
  next_cursor?: string | null;
  /** §NN — comptes corpus par rang quand le filtre label est actif (sinon null). */
  label_rank_counts?: { labelled: number; equivalent: number } | null;
}

export interface RpcPageResponse<T> {
  meta: RpcPageMeta;
  data: T[];
}

export interface ObjectDetail {
  id: string;
  name: string;
  type?: string;
  raw: Record<string, unknown>;
}

export interface PresenceMember {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  /** Epoch ms when this member joined the presence room (when the editor was opened). */
  onlineSince?: number;
}

export interface FieldLock {
  field: string;
  userId: string;
  name: string;
}

// CRM (§61) — types alignés sur les enums DB (crm_task_status / crm_task_priority)
// et sur les clés des RPCs api.list_crm_tasks / api.list_crm_timeline.
export type CrmTaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled' | 'blocked';
export type CrmTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CrmTask {
  id: string;
  objectId: string;
  objectName: string;
  /** Rattachement acteur OPTIONNEL (rectif PO §61) : tâche créée depuis la fiche acteur. */
  actorId: string | null;
  actorName: string | null;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  dueAt: string | null;
  /** Uuid de l'assigné (crm_task.owner) — filtre « mes tâches » du hub personnel. */
  ownerId: string | null;
  ownerName: string | null;
  // §66 — lien optionnel vers l'interaction de suivi (related_interaction_id). Le `subject`
  // alimente le badge de la carte, le `status` décide du prompt de clôture (move→done).
  relatedInteractionId: string | null;
  relatedInteractionSubject: string | null;
  relatedInteractionStatus: string | null;
}

/**
 * Réponse à une interaction racine (§65/§66 — fil de discussion). Le backend renvoie les
 * réponses NICHÉES sous leur racine (`replies[]`) ; une réponse hérite du contexte
 * acteur/objet de la racine (pas de re-modélisation). Forme allégée : pas de subject/topic
 * (la racine porte le sujet du fil), pas de status/actor (hérités).
 */
export interface CrmInteractionReply {
  id: string;
  interactionType: string;
  body: string | null;
  occurredAt: string | null;
  createdAt: string | null;
  sentimentCode: string | null;
  sentimentName: string | null;
  ownerName: string | null;
  /** Interlocuteur connu (interlocutor_email) — alimente interactionAuthorOf (fix « par Système »). */
  interlocutorEmail: string | null;
  source: string | null;
}

export interface CrmInteraction {
  id: string;
  /**
   * Acteur de l'interaction (rectif PO v5 point 5) — `api.list_crm_timeline` renvoie déjà
   * `actor_id`. Permet le clic « carte timeline → fiche acteur ». Null si le RPC ne le porte
   * pas (compat ascendante : la fiche acteur n'en a pas besoin, elle est déjà sur l'acteur).
   */
  actorId: string | null;
  /** Contexte objet OPTIONNEL (§61, modèle acteur-centré) : null = interaction « générale ». */
  objectId: string | null;
  objectName: string | null;
  interactionType: string;
  direction: string;
  status: string;
  subject: string;
  body: string | null;
  occurredAt: string | null;
  actorName: string | null;
  topicCode: string | null;
  topicName: string | null;
  sentimentCode: string | null;
  sentimentName: string | null;
  ownerName: string | null;
  source: string | null;
  /** Interlocuteur connu (interlocutor_email) — alimente interactionAuthorOf (fix « par Système »). */
  interlocutorEmail: string | null;
  /** Demande traitée (§65/§66) : timestamp de résolution, null = en attente (statut 'planned'). */
  resolvedAt: string | null;
  /** Fil de discussion (§65/§66) — réponses NICHÉES sous la racine ; [] si aucune. */
  replies: CrmInteractionReply[];
}

export interface CrmTimelinePage {
  items: CrmInteraction[];
  hasMore: boolean;
}

export interface PendingChangeItem {
  id: string;
  objectName: string;
  /** When set, matches workspace object id in demo mode. */
  objectId?: string;
  author: string;
  field: string;
  before: string;
  after: string;
  submittedAt: string;
  // --- P2.1 modération (§120) : enrichi par api.list_pending_changes. Optionnels pour rester
  // compatible avec les fixtures démo (mockPendingChanges) qui n'expriment que la forme historique.
  status?: string;
  targetTable?: string;
  targetPk?: string | null;
  action?: string;
  reviewerLabel?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  appliedAt?: string | null;
}

export interface AuditQuestion {
  id: string;
  label: string;
  note?: string;
  score?: number;
}

export interface PublicationCard {
  id: string;
  title: string;
  lane: 'brief' | 'layout' | 'ready';
  page: number;
}
