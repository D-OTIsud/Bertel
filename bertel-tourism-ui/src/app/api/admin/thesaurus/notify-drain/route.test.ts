/** @jest-environment node */
jest.mock('../../_authorize', () => ({ authorizeAdminRoute: jest.fn() }));
import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminRoute } from '../../_authorize';
import { POST } from './route';

const authorize = authorizeAdminRoute as jest.Mock;
const rpc = jest.fn();
const token = '11111111-1111-4111-8111-111111111111';
const req = () => new NextRequest('http://localhost/api/admin/thesaurus/notify-drain', { method: 'POST' });
const receipt = { id: 1, claim_token: token, release_id: 2, type: 'invalidate_reference_generation' };
beforeEach(() => {
  rpc.mockReset(); authorize.mockReset();
  authorize.mockResolvedValue({ ok: true, isSuper: true, asCaller: { schema: () => ({ rpc }) } });
  rpc.mockImplementation(async (_name, { p_action: action }) => ({ error: null,
    data: action === 'claim_outbox' ? [receipt] : { ...receipt, status: action === 'ack_outbox' ? 'failed' : 'completed' } }));
});

it('refuses unauthenticated and org-admin-only callers before claiming', async () => {
  authorize.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) });
  expect((await POST(req())).status).toBe(401);
  authorize.mockResolvedValueOnce({ ok: true, isSuper: false });
  expect((await POST(req())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

it('claims a bounded batch and delegates real delivery plus acknowledgement atomically', async () => {
  const response = await POST(req());
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ completed: ['1'], failed: [], recover_after_lease: false });
  expect(rpc.mock.calls).toEqual([
    ['thesaurus_admin', { p_action: 'claim_outbox', p_payload: { limit: 20 } }],
    ['thesaurus_admin', { p_action: 'deliver_outbox', p_payload: { id: 1, claim_token: token } }],
  ]);
});

it('returns an empty success on replay with no pending events', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await (await POST(req())).json()).toEqual({ completed: [], failed: [], recover_after_lease: false });
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('records a failure with its claim token and never leaks SQL details', async () => {
  rpc.mockResolvedValueOnce({ data: [receipt], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'private table secret' } });
  const response = await POST(req());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('secret');
  expect(rpc).toHaveBeenLastCalledWith('thesaurus_admin', { p_action: 'ack_outbox',
    p_payload: { id: 1, claim_token: token, error: 'delivery_failed' } });
});

it('leaves a failed acknowledgement recoverable by lease instead of reporting success', async () => {
  rpc.mockResolvedValueOnce({ data: [receipt], error: null })
    .mockRejectedValueOnce(new Error('network'))
    .mockRejectedValueOnce(new Error('ack network'));
  const response = await POST(req());
  expect(response.status).toBe(502);
  expect((await response.json()).recover_after_lease).toBe(true);
});

it('stops at a claim error and treats malformed receipts as recoverable errors', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'private' } });
  expect((await POST(req())).status).toBe(502);
  rpc.mockResolvedValueOnce({ data: [{ id: 1 }], error: null });
  const response = await POST(req());
  expect(response.status).toBe(502);
  expect((await response.json()).recover_after_lease).toBe(true);
});
