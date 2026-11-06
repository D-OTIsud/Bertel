import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute } from '../../_authorize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { id: number | string; claim_token: string; type: string; release_id: number | string };
const headers = { 'Cache-Control': 'no-store' };

/** The existing authenticated-admin infrastructure triggers a bounded, leased drain.
 * No Next Data Cache is used by thesaurus reads. The concrete effect is a database
 * generation notification; SQL delivers and acknowledges it atomically and idempotently.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  if (!auth.isSuper) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });
  const rpc = (action: string, payload: Record<string, unknown>) => auth.asCaller.schema('api').rpc('thesaurus_admin', {
    p_action: action, p_payload: payload,
  });
  let claim;
  try { claim = await rpc('claim_outbox', { limit: 20 }); }
  catch { return NextResponse.json({ error: 'claim_failed' }, { status: 502, headers }); }
  if (claim.error || !Array.isArray(claim.data)) {
    return NextResponse.json({ error: 'claim_failed' }, { status: 502, headers });
  }
  const completed: string[] = [];
  const failed: string[] = [];
  let ackFailed = false;
  for (const value of claim.data as unknown[]) {
    const row = value as Partial<Row> | null;
    if (!row || !/^[1-9]\d*$/.test(String(row.id ?? '')) || typeof row.claim_token !== 'string'
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.claim_token)) {
      ackFailed = true; continue; // The malformed receipt remains recoverable after its lease.
    }
    const receipt = { id: row.id, claim_token: row.claim_token };
    try {
      const delivered = await rpc('deliver_outbox', receipt);
      if (delivered.error || delivered.data?.status !== 'completed') throw new Error('delivery_failed');
      completed.push(String(row.id));
    } catch {
      failed.push(String(row.id));
      try {
        const ack = await rpc('ack_outbox', { ...receipt, error: 'delivery_failed' });
        if (ack.error || ack.data?.status !== 'failed') ackFailed = true;
      } catch { ackFailed = true; }
    }
  }
  return NextResponse.json({ completed, failed, recover_after_lease: ackFailed },
    { status: failed.length || ackFailed ? 502 : 200, headers });
}
