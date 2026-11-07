import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesaurusAdmin } from './ThesaurusAdmin';
import { normalizeThesaurusDocument } from '../services/thesaurus-admin';
import type { ThesaurusConcept, ThesaurusRevision, ThesaurusWorkspace } from '../types/thesaurus-admin';
import '../fonts.css';

const CONCEPTS = [
  ['00000000-0000-4000-8000-000000000001', 'hebergement_locatif', 'Hébergement locatif', null],
  ['00000000-0000-4000-8000-000000000002', 'location_saisonniere', 'Meublé de tourisme', '00000000-0000-4000-8000-000000000001'],
  ['00000000-0000-4000-8000-000000000003', 'appartement', 'Appartement', '00000000-0000-4000-8000-000000000002'],
  ['00000000-0000-4000-8000-000000000004', 'maison', 'Maison et villa', '00000000-0000-4000-8000-000000000002'],
  ['00000000-0000-4000-8000-000000000005', 'studio', 'Studio', '00000000-0000-4000-8000-000000000002'],
  ['00000000-0000-4000-8000-000000000006', 'chambre_d_hotes', 'Chambre d’hôtes', '00000000-0000-4000-8000-000000000001'],
  ['00000000-0000-4000-8000-000000000007', 'gite_ancien', 'Ancien gîte rural', '00000000-0000-4000-8000-000000000002'],
] as const;

function initialWorkspace(): ThesaurusWorkspace {
  const concepts: ThesaurusConcept[] = CONCEPTS.map(([id, code, name, parent], index) => ({
    ...normalizeThesaurusDocument({ code, name, description: index === 2 ? 'Logement indépendant situé dans un immeuble, proposé à une clientèle de passage.' : 'Catégorie du vocabulaire touristique Bertel.', name_i18n: index === 2 ? { en: 'Apartment' } : {}, parent_concept_id: parent, lifecycle: index === 6 ? 'retired' : 'active', labels: index === 2 ? [{ lang: 'fr', kind: 'alt', value: 'Appart' }] : [], notes: [{ lang: 'fr', type: 'source', value: 'Vocabulaire métier validé pour la démonstration.', source: 'OTI du Sud' }] }),
    concept_id: id, domain: 'taxonomy_hlo', assignable: index !== 6,
    source_key: { id, domain: 'taxonomy_hlo' }, source_fingerprint: `fixture-${index}`, usage_count: index === 2 ? 36 : 4,
  }));
  const proposed = { ...normalizeThesaurusDocument(concepts[2]), name: 'Appartement meublé' };
  return {
    domains: [{ domain: 'taxonomy_hlo', name: 'Hébergements locatifs', source_kind: 'ref_code', is_public: true, is_governed: true, require_definition: true, concept_count: concepts.length }],
    concepts, revisions: [{ revision_id: '00000000-0000-4000-8000-100000000001', concept_id: concepts[2].concept_id, domain: 'taxonomy_hlo', version: 2, status: 'validated', document: proposed, errors: [], warnings: [] }],
    releases: [{ release_id: 3, previous_release_id: 2, changed_count: 4, affected_objects: 48, created_at: '2026-11-06T10:00:00Z' }],
    latest_release_id: 3, stats: { total_concepts: concepts.length, matching_concepts: concepts.length, pending_revisions: 1, retired_usages: 1 },
    outbox: [{ id: '1', release_id: 3, status: 'completed', attempts: 1 }],
    requalification: [{ object_id: 'HLO-DEMO-1', object_name: 'La Kaz des Hauts', concept_id: concepts[6].concept_id, concept_name: concepts[6].name, domain: 'taxonomy_hlo', lifecycle: 'retired', reason: 'Requalification requise : préciser la nature de l’hébergement.' }],
    instance: { base_uri: 'https://bertel.example/api/public/thesaurus/concepts/', license: 'Licence de démonstration', attribution: 'OTI du Sud' },
  };
}

/** Story-only RPC fixture. No request to thesaurus_admin can reach a real backend. */
function ThesaurusFixture() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const state = initialWorkspace();
    const originalFetch = window.fetch.bind(window);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/rpc/thesaurus_admin')) return originalFetch(input, init);
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '{}') as { p_action: string; p_payload: Record<string, unknown> };
      const payload = body.p_payload ?? {};
      if (body.p_action === 'workspace') {
        const concepts = state.concepts.filter((item) => (!payload.domain || item.domain === payload.domain) && (!payload.query || `${item.name} ${item.code}`.toLowerCase().includes(String(payload.query).toLowerCase())) && (!Array.isArray(payload.concept_ids) || payload.concept_ids.includes(item.concept_id)));
        return json({ ...state, concepts, revisions: state.revisions.filter((item) => item.status !== 'published'), stats: { ...state.stats, matching_concepts: concepts.length } });
      }
      if (body.p_action === 'save_draft') {
        const previous = state.revisions.find((item) => item.concept_id === payload.concept_id && item.status !== 'published');
        if (previous && previous.version !== payload.expected_version) return json({ message: 'REVISION_CONFLICT', code: 'PT409' }, 409);
        const revision: ThesaurusRevision = { revision_id: previous?.revision_id ?? crypto.randomUUID(), concept_id: String(payload.concept_id ?? crypto.randomUUID()), domain: String(payload.domain), version: (previous?.version ?? 0) + 1, status: 'draft', document: normalizeThesaurusDocument(payload.document), errors: [], warnings: [] };
        state.revisions = state.revisions.filter((item) => item.revision_id !== revision.revision_id).concat(revision);
        return json(revision);
      }
      if (body.p_action === 'validate_draft') {
        const revision = state.revisions.find((item) => item.revision_id === payload.revision_id);
        if (!revision || revision.version !== payload.expected_version) return json({ message: 'REVISION_CONFLICT', code: 'PT409' }, 409);
        revision.status = 'validated'; revision.version += 1;
        return json(revision);
      }
      if (body.p_action === 'preview') return json({ errors: [], warnings: [], changed_count: (payload.revision_ids as string[]).length, affected_objects: 36, changes: [], preview_fingerprint: 'storybook-preview' });
      if (body.p_action === 'publish') {
        const ids = payload.revision_ids as string[];
        const expected = payload.expected_revision_versions as Record<string, number>;
        if (state.revisions.some((item) => ids.includes(item.revision_id) && item.version !== expected[item.revision_id])) return json({ message: 'REVISION_CONFLICT', code: 'PT409' }, 409);
        for (const revision of state.revisions.filter((item) => ids.includes(item.revision_id))) {
          state.concepts = state.concepts.map((item) => item.concept_id === revision.concept_id ? { ...item, ...revision.document } : item);
          revision.status = 'published';
        }
        const release = { release_id: (state.latest_release_id ?? 0) + 1, previous_release_id: state.latest_release_id, changed_count: ids.length, affected_objects: 36, created_at: new Date().toISOString() };
        state.releases.unshift(release); state.latest_release_id = release.release_id;
        return json(release);
      }
      if (body.p_action === 'configure_instance') { state.instance = payload as unknown as ThesaurusWorkspace['instance']; return json(state.instance); }
      return json({ message: 'Action unavailable in this isolated demonstration', code: 'PT400' }, 400);
    };
    client.setQueryData(['thesaurus-workspace', 'taxonomy_hlo', '', 0], state);
    document.documentElement.classList.add('app-fonts');
    setReady(true);
    return () => { window.fetch = originalFetch; client.clear(); };
  }, [client]);
  return <QueryClientProvider client={client}><main className="thesaurus-story" style={{ maxWidth: 1280, margin: '0 auto', minHeight: '100vh', padding: 24, background: 'var(--surface)' }}><p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 18 }}>Démonstration isolée · les écritures restent dans cette page.</p>{ready && <ThesaurusAdmin />}</main></QueryClientProvider>;
}

const meta = { title: 'Settings/Thesaurus', component: ThesaurusFixture, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof ThesaurusFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const EditorialWorkspace: Story = {};
