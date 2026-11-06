import { getSupabaseClient } from '../lib/supabase';
import type {
  ThesaurusConcept, ThesaurusDocument, ThesaurusDomain, ThesaurusInstance,
  ThesaurusIssue, ThesaurusPreview, ThesaurusRelease, ThesaurusRevision,
  ThesaurusWorkspace,
} from '../types/thesaurus-admin';

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

export function thesaurusErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/Published concept URI prefix is immutable/i.test(message)) return 'L’adresse pérenne est déjà utilisée dans une publication et doit rester stable.';
  if (/overlap|chevauch/i.test(message)) return 'La publication courante et le brouillon modifient les mêmes champs. Votre saisie est conservée ; aucune fusion automatique n’a été appliquée. Comparez les versions avant de reprendre ces changements.';
  if (/Invalid draft:/i.test(message)) {
    const detail = message.slice(message.indexOf('Invalid draft:') + 'Invalid draft:'.length).trim();
    try {
      const issues = JSON.parse(detail) as unknown;
      if (Array.isArray(issues) && issues.every((item) => typeof item === 'string')) return issues.join(' ');
    } catch { /* The server may return an unstructured validation message. */ }
    return 'Le brouillon contient des valeurs à corriger avant enregistrement.';
  }
  if (/CONFLICT|STALE|VERSION_MISMATCH|PT409|409/i.test(message)) {
    return 'Ce contenu a changé depuis son ouverture. Votre saisie est conservée. Rechargez la version courante avant de reprendre vos modifications.';
  }
  if (/FORBIDDEN|PERMISSION|42501|PT403/i.test(message)) return 'Cette action est réservée aux administrateurs du thésaurus.';
  if (/NOT_CONFIGURED|BASE_URI|INSTANCE_REQUIRED/i.test(message)) return 'Renseignez l’adresse pérenne, la licence et l’attribution dans Configuration avant de publier.';
  if (/NOT_VALIDATED|VALIDATION_REQUIRED/i.test(message)) return 'Validez tous les brouillons sélectionnés avant de publier.';
  if (/GOVERNED|WORKFLOW_REQUIRED/i.test(message)) return 'Ce vocabulaire se modifie dans le circuit de publication du thésaurus.';
  if (/PGRST202|schema cache|does not exist/i.test(message)) return 'Le thésaurus n’est pas encore installé sur cette base. Appliquez sa migration avant de réessayer.';
  if (/network|fetch|réseau/i.test(message)) return 'La connexion a échoué. Votre saisie est conservée ; vous pouvez réessayer.';
  return message || 'L’action n’a pas abouti. Réessayez.';
}

async function invoke(action: string, payload: JsonObject = {}): Promise<unknown> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Connexion backend indisponible.');
  const { data, error } = await client.schema('api').rpc('thesaurus_admin', {
    p_action: action, p_payload: payload,
  });
  if (error) throw new Error([error.code, error.message].filter(Boolean).join(': '));
  if (data == null) throw new Error('Réponse vide du thésaurus. Réessayez.');
  return data;
}

/** A successful publication remains successful if its recoverable notification drain fails. */
export async function pingThesaurusNotifyDrain(): Promise<void> {
  try {
    const client = getSupabaseClient();
    if (!client) return;
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/admin/thesaurus/notify-drain', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* Durable pending/failed events remain available for retry or lease recovery. */ }
}

export function normalizeThesaurusIssues(value: unknown): ThesaurusIssue[] {
  return array(value).map((item) => {
    if (typeof item === 'string') return { code: item, message: item };
    const issue = record(item);
    return {
      code: String(issue.code ?? 'validation'),
      message: String(issue.message ?? issue.detail ?? issue.code ?? 'Vérifiez ce contenu.'),
      ...(issue.path == null ? {} : { path: String(issue.path) }),
    };
  });
}

export function normalizeThesaurusDocument(value: unknown): ThesaurusDocument {
  const data = record(value);
  const translatedNames = Object.fromEntries(Object.entries(record(data.name_i18n)).filter(([lang]) => lang !== 'fr')) as Record<string, string>;
  const translatedDefinitions = Object.fromEntries(Object.entries(record(data.description_i18n)).filter(([lang]) => lang !== 'fr')) as Record<string, string>;
  return {
    code: String(data.code ?? ''), name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    name_i18n: translatedNames,
    description_i18n: translatedDefinitions,
    parent_concept_id: data.parent_concept_id == null ? null : String(data.parent_concept_id),
    lifecycle: data.lifecycle === 'deprecated' || data.lifecycle === 'retired' ? data.lifecycle : 'active',
    labels: array(data.labels).map((item) => {
      const label = record(item);
      if (typeof label.lang !== 'string' || !label.lang || (label.kind !== 'alt' && label.kind !== 'hidden')) throw new Error('Réponse de terme malformée : sa langue et sa nature doivent être explicites.');
      return { lang: label.lang, kind: label.kind, value: String(label.value ?? '') };
    }),
    notes: array(data.notes).map((item) => {
      const note = record(item);
      if (typeof note.lang !== 'string' || !note.lang) throw new Error('Réponse de note malformée : sa langue doit être explicite.');
      return { lang: note.lang, type: String(note.type ?? 'scope'), value: String(note.value ?? ''), source: String(note.source ?? '') };
    }),
    relations: array(data.relations).filter((item) => record(item).type !== 'replaced_by').map((item) => {
      const relation = record(item);
      return { type: String(relation.type ?? 'related'), target_id: String(relation.target_id ?? '') };
    }),
    mappings: array(data.mappings).map((item) => {
      const mapping = record(item);
      return { type: String(mapping.type ?? 'closeMatch'), target_uri: String(mapping.target_uri ?? ''), vocabulary: String(mapping.vocabulary ?? ''), version: String(mapping.version ?? ''), source: String(mapping.source ?? '') };
    }),
    replaced_by: array(data.replaced_by).map(String),
    source_fields: record(data.source_fields),
  };
}

export function normalizeThesaurusRevision(value: unknown): ThesaurusRevision {
  const data = record(value);
  if (!data.revision_id || !data.concept_id) throw new Error('Réponse de révision malformée. Rechargez le thésaurus.');
  return {
    revision_id: String(data.revision_id), concept_id: String(data.concept_id), domain: String(data.domain ?? ''),
    version: Number(data.version ?? 0),
    status: data.status === 'validated' || data.status === 'published' ? data.status : 'draft',
    document: normalizeThesaurusDocument(data.document),
    errors: normalizeThesaurusIssues(data.errors), warnings: normalizeThesaurusIssues(data.warnings),
    ...(data.created_at == null ? {} : { created_at: String(data.created_at) }),
    ...(data.updated_at == null ? {} : { updated_at: String(data.updated_at) }),
    ...(data.base_document == null ? {} : { base_document: normalizeThesaurusDocument(data.base_document) }),
  };
}

export async function fetchThesaurusWorkspace(input: { domain?: string; query?: string; concept_ids?: string[]; page_size?: number; offset?: number } = {}): Promise<ThesaurusWorkspace> {
  const data = record(await invoke('workspace', input));
  if (!Array.isArray(data.domains) || !Array.isArray(data.concepts)) throw new Error('Réponse du thésaurus malformée. Réessayez.');
  return {
    domains: data.domains.map((item) => {
      const domain = record(item);
      return {
        domain: String(domain.domain), name: String(domain.name ?? domain.label ?? domain.domain),
        is_governed: Boolean(domain.is_governed), is_public: Boolean(domain.is_public),
        require_definition: Boolean(domain.require_definition), concept_count: Number(domain.concept_count ?? domain.count ?? 0),
        ...(domain.source_kind == null ? {} : { source_kind: String(domain.source_kind) }),
      } satisfies ThesaurusDomain;
    }),
    concepts: data.concepts.map((item) => {
      const concept = record(item);
      if (!concept.concept_id || !concept.domain) throw new Error('Concept sans identité dans la réponse du thésaurus.');
      return {
        ...normalizeThesaurusDocument(concept), concept_id: String(concept.concept_id), domain: String(concept.domain),
        assignable: Boolean(concept.assignable), source_key: record(concept.source_key),
        source_fingerprint: String(concept.source_fingerprint ?? ''), usage_count: Number(concept.usage_count ?? 0),
        revision: concept.revision ? normalizeThesaurusRevision(concept.revision) : null,
        ...(concept.uri == null ? {} : { uri: String(concept.uri) }),
      } satisfies ThesaurusConcept;
    }),
    revisions: array(data.revisions).map(normalizeThesaurusRevision),
    releases: array(data.releases).map((item) => {
      const release = record(item);
      return {
        release_id: Number(release.release_id), previous_release_id: release.previous_release_id == null ? null : Number(release.previous_release_id),
        created_at: String(release.created_at ?? release.published_at ?? release.as_of ?? ''), changed_count: Number(release.changed_count ?? 0), affected_objects: Number(release.affected_objects ?? 0),
      } satisfies ThesaurusRelease;
    }),
    latest_release_id: data.latest_release_id == null ? null : Number(data.latest_release_id),
    stats: record(data.stats) as Record<string, number>,
    outbox: array(data.outbox).map((item) => {
      const entry = record(item);
      return { id: String(entry.id), release_id: Number(entry.release_id), status: String(entry.status), attempts: Number(entry.attempts ?? 0), error: (entry.error ?? entry.last_error) == null ? null : String(entry.error ?? entry.last_error) };
    }),
    requalification: array(record(data.requalification).items ?? data.requalification).map((item) => {
      const entry = record(item);
      return { object_id: String(entry.object_id), object_name: String(entry.object_name ?? entry.object_id), concept_id: String(entry.concept_id), concept_name: String(entry.concept_name ?? entry.name ?? entry.code ?? ''), domain: String(entry.domain ?? ''), lifecycle: entry.lifecycle === 'retired' ? 'retired' : 'deprecated', reason: String(entry.reason ?? '') };
    }),
    instance: {
      base_uri: String(record(data.instance).base_uri ?? ''), license: String(record(data.instance).license ?? ''), attribution: String(record(data.instance).attribution ?? ''),
    },
  };
}

export async function saveThesaurusDraft(input: { concept_id: string | null; domain: string; expected_version: number; document: ThesaurusDocument }): Promise<ThesaurusRevision> {
  return normalizeThesaurusRevision(await invoke('save_draft', input));
}

export async function validateThesaurusDraft(revisionId: string, expectedVersion: number): Promise<ThesaurusRevision> {
  return normalizeThesaurusRevision(await invoke('validate_draft', { revision_id: revisionId, expected_version: expectedVersion }));
}

export async function rebaseThesaurusDraft(revisionId: string, expectedVersion: number): Promise<ThesaurusRevision> {
  return normalizeThesaurusRevision(await invoke('rebase_draft', { revision_id: revisionId, expected_version: expectedVersion }));
}

export async function discardThesaurusDraft(revisionId: string, expectedVersion: number): Promise<void> {
  await invoke('discard_draft', { revision_id: revisionId, expected_version: expectedVersion });
}

export async function previewThesaurusPublication(revisionIds: string[], expectedVersions: Record<string, number> = {}): Promise<ThesaurusPreview> {
  const data = record(await invoke('preview', { revision_ids: revisionIds, expected_revision_versions: expectedVersions }));
  return { errors: normalizeThesaurusIssues(data.errors), warnings: normalizeThesaurusIssues(data.warnings), changed_count: Number(data.changed_count ?? 0), affected_objects: Number(data.affected_objects ?? 0), changes: array(data.changes).map(record), ...(data.preview_fingerprint == null ? {} : { preview_fingerprint: String(data.preview_fingerprint) }) };
}

export async function publishThesaurus(input: { revision_ids: string[]; idempotency_key: string; expected_release_id: number | null; expected_revision_versions: Record<string, number>; preview_fingerprint?: string }): Promise<ThesaurusRelease> {
  const data = record(await invoke('publish', input));
  if (data.release_id == null) throw new Error('Publication sans numéro de version : vérifiez son état avant de réessayer.');
  await pingThesaurusNotifyDrain();
  return { release_id: Number(data.release_id), previous_release_id: data.previous_release_id == null ? null : Number(data.previous_release_id), changed_count: Number(data.changed_count ?? 0), affected_objects: Number(data.affected_objects ?? 0), created_at: String(data.created_at ?? '') };
}

export async function configureThesaurusInstance(input: ThesaurusInstance): Promise<void> { await invoke('configure_instance', input as unknown as JsonObject); }
export async function configureThesaurusDomain(input: { domain: string; is_governed: boolean; is_public: boolean; require_definition: boolean }): Promise<void> { await invoke('configure_domain', input); }
export async function bootstrapThesaurus(domains: string[]): Promise<void> { await invoke('bootstrap', { domains }); await pingThesaurusNotifyDrain(); }
export async function retryThesaurusOutbox(id: string): Promise<void> { await invoke('retry_outbox', { id }); await pingThesaurusNotifyDrain(); }
