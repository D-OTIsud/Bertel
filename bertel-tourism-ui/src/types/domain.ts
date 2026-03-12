export type UserRole = 'super_admin' | 'tourism_agent' | 'owner';
export type NetworkStatus = 'connected' | 'degraded' | 'offline';
export type MapLayerMode = 'classic' | 'satellite' | 'topo';
export type ObjectTypeCode = 'HOT' | 'RES' | 'ACT' | 'ITI' | 'EVT';

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
}

export interface ObjectCard {
  id: string;
  type: ObjectTypeCode | string;
  name: string;
  status?: string;
  image?: string | null;
  rating?: number | null;
  review_count?: number | null;
  min_price?: number | null;
  open_now?: boolean | null;
  description?: string | null;
  updated_at?: string | null;
  location?: LocationSummary;
  render?: {
    price?: string;
    rating?: string;
    updated_at?: string;
  };
}

export interface MapObject {
  id: string;
  name: string;
  type: string;
  image?: string | null;
  description?: string | null;
  rating?: number | null;
  location?: LocationSummary;
  price?: {
    amount?: number | null;
    currency?: string | null;
    formatted?: string | null;
  } | null;
}

export interface ExplorerFilters {
  selectedTypes: ObjectTypeCode[];
  search: string;
  labels: string[];
  amenities: string[];
  openNow: boolean;
  capacityMetricCode?: string;
  capacityMin?: number;
  capacityMax?: number;
  itineraryDifficultyMin?: number;
  itineraryDifficultyMax?: number;
  elevationGainMin?: number;
  bbox?: [number, number, number, number] | null;
  polygon?: GeoPolygon | null;
  view: 'card' | 'full';
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

export interface CrmTask {
  id: string;
  title: string;
  actor: string;
  assignee: string;
  status: 'todo' | 'doing' | 'done';
  dueLabel: string;
}

export interface PendingChangeItem {
  id: string;
  objectName: string;
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