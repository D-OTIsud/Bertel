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

export interface ExplorerCommonFilters {
  search: string;
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
  labelsAny: string[];
  rankedLabelSchemeCode: string | null;
  /**
   * Active publication-status filter sent to api.list_object_resources_filtered_page
   * as p_status. An empty array means "use the server default" (= published only),
   * which is the safe baseline for read-only personas. Editors broaden the default
   * to ['published','draft'] at session bootstrap.
   */
  statuses: ExplorerStatusFilter[];
  bbox?: [number, number, number, number] | null;
  polygon?: GeoPolygon | null;
}

export interface HotBucketFilters {
  subtypes: BackendObjectTypeCode[];
  taxonomy: TaxonomyRef[];
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

export interface ActBucketFilters {
  environmentTagsAny: string[];
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
  label_match?: ObjectCardLabelMatch | null;
  tags?: ObjectCardTag[];
  badges?: ObjectCardBadge[];
  taxonomy?: ObjectCardTaxonomy[];
  environment_tags?: ObjectCardTag[];
  amenity_codes?: string[];
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
  act: ActBucketFilters;
  vis: Record<string, never>;
  srv: Record<string, never>;
}

export interface ExplorerReferenceOption {
  code: string;
  name: string;
}

export interface ExplorerTaxonomyNode {
  code: string;
  name: string;
  parentCode: string | null;
  depth: number;
  isAssignable: boolean;
  position?: number | null;
}

export interface ExplorerTaxonomyDomain {
  domain: string;
  name: string;
  objectType: BackendObjectTypeCode | string;
  nodes: ExplorerTaxonomyNode[];
}

export interface ExplorerReferences {
  accessibilityDisabilityTypes: ExplorerReferenceOption[];
  accessibilityAmenities: AccessibilityAmenityRef[];
  sustainabilityCategories: SustainabilityCategoryRef[];
  rankedLabelSchemes: ExplorerReferenceOption[];
  hotTaxonomy: ExplorerTaxonomyDomain[];
  hotCapacityMetrics: ExplorerReferenceOption[];
  resCapacityMetrics: ExplorerReferenceOption[];
  itiPractices: ExplorerReferenceOption[];
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
  ownerName: string | null;
  relatedInteractionSubject: string | null;
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
