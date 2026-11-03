import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

export type ProposalCollectionDomain = 'characteristics' | 'openings';
export interface ProposalCollectionBaseline {
  contract: 'actor-collection-baseline-v1';
  object_id: string;
  domain: ProposalCollectionDomain;
  digest: string;
}

export function validProposalCollectionBaseline(value: unknown, objectId: string, domain: ProposalCollectionDomain): value is ProposalCollectionBaseline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.contract === 'actor-collection-baseline-v1' && row.object_id === objectId && row.domain === domain
    && typeof row.digest === 'string' && /^[0-9a-f]{64}$/.test(row.digest);
}

/** The token brackets the actual loader. Never attach a newly read token to older form data. */
export async function loadProposalCollection<T extends { unavailableReason: string | null }>(
  objectId: string,
  domain: ProposalCollectionDomain,
  load: () => Promise<T>,
): Promise<T & { proposalCollectionBaseline?: ProposalCollectionBaseline }> {
  if (useSessionStore.getState().demoMode) {
    return { ...await load(), proposalCollectionBaseline: { contract: 'actor-collection-baseline-v1', object_id: objectId, domain, digest: '0'.repeat(64) } };
  }
  const client = getApiClient();
  const read = async () => {
    if (!client) throw new Error();
    const { data, error } = await client.schema('api').rpc('get_object_proposal_baseline', { p_object_id: objectId, p_domain: domain });
    if (error || !validProposalCollectionBaseline(data, objectId, domain)) throw new Error();
    return data;
  };
  let before: ProposalCollectionBaseline | undefined;
  try { before = await read(); } catch { /* Preserve loaded values, but refuse proposal preparation. */ }
  const loaded = await load();
  if (loaded.unavailableReason) return loaded;
  try {
    const after = await read();
    if (!before || before.digest !== after.digest) throw new Error();
    return { ...loaded, proposalCollectionBaseline: after };
  } catch {
    return { ...loaded, proposalCollectionBaseline: undefined, unavailableReason: 'Cette rubrique a changé pendant sa lecture ou sa vérification est indisponible. Rechargez-la avant de préparer une modification ; votre saisie est conservée.' };
  }
}
