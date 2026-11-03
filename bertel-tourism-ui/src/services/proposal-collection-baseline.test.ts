jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));
import { getApiClient } from '../lib/supabase';
import { loadProposalCollection } from './proposal-collection-baseline';

const baseline = { contract: 'actor-collection-baseline-v1', object_id: 'RES1', domain: 'openings', digest: 'a'.repeat(64) };
beforeEach(() => jest.resetAllMocks());

it('brackets the real read and attaches the token only when both snapshots match', async () => {
  const order: string[] = [];
  const rpc = jest.fn(async () => { order.push('baseline'); return { data: baseline, error: null }; });
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
  const result = await loadProposalCollection('RES1', 'openings', async () => {
    order.push('form'); return { periods: ['original'], unavailableReason: null };
  });
  expect(order).toEqual(['baseline', 'form', 'baseline']);
  expect(result.proposalCollectionBaseline).toEqual(baseline);
});

it('retains visible data but blocks a collection changed during the read', async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: baseline, error: null }).mockResolvedValueOnce({ data: { ...baseline, digest: 'b'.repeat(64) }, error: null });
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
  const result = await loadProposalCollection('RES1', 'openings', async () => ({ periods: ['typed data'], unavailableReason: null }));
  expect(result.periods).toEqual(['typed data']);
  expect(result.proposalCollectionBaseline).toBeUndefined();
  expect(result.unavailableReason).toMatch(/Rechargez.*saisie est conservée/);
});

it('never attaches an after-read token to a form whose before-read check failed', async () => {
  const rpc = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: baseline, error: null });
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
  const result = await loadProposalCollection('RES1', 'openings', async () => ({ unavailableReason: null }));
  expect(result.proposalCollectionBaseline).toBeUndefined();
  expect(result.unavailableReason).toBeTruthy();
});
