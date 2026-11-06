export type ThesaurusLifecycle = 'active' | 'deprecated' | 'retired';
export type ThesaurusRevisionStatus = 'draft' | 'validated' | 'published';

export interface ThesaurusLabel {
  lang: string;
  kind: 'alt' | 'hidden';
  value: string;
}

export interface ThesaurusNote {
  lang: string;
  type: string;
  value: string;
  source?: string;
}

export interface ThesaurusRelation {
  type: string;
  target_id: string;
}

export interface ThesaurusMapping {
  type: string;
  target_uri: string;
  vocabulary: string;
  version?: string;
  source?: string;
}

export interface ThesaurusDocument {
  code: string;
  name: string;
  description: string;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  parent_concept_id: string | null;
  lifecycle: ThesaurusLifecycle;
  labels: ThesaurusLabel[];
  notes: ThesaurusNote[];
  relations: ThesaurusRelation[];
  mappings: ThesaurusMapping[];
  replaced_by: string[];
  source_fields?: Record<string, unknown>;
}

export interface ThesaurusIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ThesaurusRevision {
  revision_id: string;
  concept_id: string;
  domain: string;
  version: number;
  status: ThesaurusRevisionStatus;
  document: ThesaurusDocument;
  errors: ThesaurusIssue[];
  warnings: ThesaurusIssue[];
  created_at?: string;
  updated_at?: string;
  base_document?: ThesaurusDocument;
}

export interface ThesaurusConcept extends ThesaurusDocument {
  concept_id: string;
  domain: string;
  assignable: boolean;
  source_key: Record<string, unknown>;
  source_fingerprint: string;
  usage_count?: number;
  revision?: ThesaurusRevision | null;
  uri?: string;
}

export interface ThesaurusDomain {
  domain: string;
  name: string;
  is_governed: boolean;
  is_public: boolean;
  require_definition: boolean;
  concept_count: number;
  source_kind?: string;
}

export interface ThesaurusRelease {
  release_id: number;
  previous_release_id: number | null;
  created_at: string;
  changed_count: number;
  affected_objects: number;
  published_by?: string;
}

export interface ThesaurusRequalification {
  object_id: string;
  object_name: string;
  concept_id: string;
  concept_name: string;
  domain: string;
  lifecycle: ThesaurusLifecycle;
  reason?: string;
}

export interface ThesaurusOutboxItem {
  id: string;
  release_id: number;
  status: string;
  attempts: number;
  error?: string | null;
  created_at?: string;
}

export interface ThesaurusInstance {
  base_uri: string;
  license: string;
  attribution: string;
}

export interface ThesaurusWorkspace {
  domains: ThesaurusDomain[];
  concepts: ThesaurusConcept[];
  revisions: ThesaurusRevision[];
  releases: ThesaurusRelease[];
  latest_release_id: number | null;
  stats: Record<string, number>;
  outbox: ThesaurusOutboxItem[];
  requalification: ThesaurusRequalification[];
  instance: ThesaurusInstance;
}

export interface ThesaurusPreview {
  errors: ThesaurusIssue[];
  warnings: ThesaurusIssue[];
  changed_count: number;
  affected_objects: number;
  changes: Array<Record<string, unknown>>;
  preview_fingerprint?: string;
}
