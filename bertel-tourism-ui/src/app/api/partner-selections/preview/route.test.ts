/** @jest-environment node */
jest.mock('@/lib/supabase-caller.server', () => ({ createCallerClient: jest.fn() }));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@/lib/public-api', () => ({ callPublicRpc: jest.fn() }));
jest.mock('server-only', () => ({}));
import { NextRequest } from 'next/server';
import { createCallerClient } from '@/lib/supabase-caller.server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { callPublicRpc } from '@/lib/public-api';
import { POST } from './route';
const gate = jest.fn(); const getUser = jest.fn(); const publicRpc = callPublicRpc as jest.Mock;
const body = { name: 'Terroir', buckets: [{ types: ['PRD'] }], orgObjectId: 'ORG-A' };
const req = (value: unknown = body, authorization = 'Bearer fixture-user-jwt') => new NextRequest('http://localhost/api/partner-selections/preview', {
  method: 'POST', headers: { authorization }, body: JSON.stringify(value),
});
beforeEach(() => {
  gate.mockReset(); publicRpc.mockReset(); getUser.mockReset();
  (getServerSupabaseClient as jest.Mock).mockReturnValue({ auth: { getUser } });
  (createCallerClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc: gate }) });
  getUser.mockResolvedValue({ data: { user: { id: 'user-fixture' } }, error: null });
  gate.mockResolvedValue({ data: { ...body, commune_insee: null }, error: null });
  publicRpc.mockResolvedValue({ ok: true, status: 200, body: {
    meta: { total: 31, next_cursor: 'next', page_size: 25, private_field: 'hidden' }, data: [{ id: 'PRD-public' }],
  } });
});
it('authorizes with the caller JWT before using the service-role public reader', async () => {
  const response = await POST(req()); const result = await response.json();
  expect(response.status).toBe(200);
  expect(createCallerClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'fixture-user-jwt');
  expect(gate).toHaveBeenCalledWith('prepare_partner_selection_preview', expect.objectContaining({ p_org_object_id: 'ORG-A', p_buckets: body.buckets }));
  expect(gate.mock.invocationCallOrder[0]).toBeLessThan(publicRpc.mock.invocationCallOrder[0]);
  expect(publicRpc).toHaveBeenCalledWith('list_partner_selection_objects_with_vocabulary', expect.objectContaining({ p_view: 'card', p_page_size: 25, p_partner_key_id: 'admin-preview:user-fixture' }));
  expect(result).toEqual({ meta: { total: 31, next_cursor: 'next', page_size: 25, preview: true }, data: [{ id: 'PRD-public' }] });
});
it('never resolves public data when the organization gate refuses', async () => {
  gate.mockResolvedValue({ data: null, error: { code: '42501' } });
  expect((await POST(req())).status).toBe(403); expect(publicRpc).not.toHaveBeenCalled();
});
it('never evaluates invalid public criteria rejected by the caller-scoped gate', async () => {
  gate.mockResolvedValue({ data: null, error: { code: 'PT400' } });
  expect((await POST(req())).status).toBe(400); expect(publicRpc).not.toHaveBeenCalled();
});
it('uses a one-card page for count requests without reducing the full result volume', async () => {
  publicRpc.mockResolvedValue({ ok: true, status: 200, body: { meta: { total: 91, next_cursor: 'next', page_size: 1 }, data: [{ id: 'one' }] } });
  const response = await POST(req({ ...body, pageSize: 1 }));
  expect(publicRpc).toHaveBeenCalledWith('list_partner_selection_objects_with_vocabulary', expect.objectContaining({ p_page_size: 1 }));
  expect((await response.json()).meta).toEqual({ total: 91, next_cursor: 'next', page_size: 1, preview: true });
});
it.each([0,26,1.5,'1',null,true])('rejects malformed or excessive pageSize %s', async (pageSize) => {
  expect((await POST(req({ ...body, pageSize }))).status).toBe(400);
  expect(gate).not.toHaveBeenCalled(); expect(publicRpc).not.toHaveBeenCalled();
});
it('rejects unknown body keys and unauthenticated callers before preparing criteria', async () => {
  expect((await POST(req({ ...body, status: ['draft'] }))).status).toBe(400);
  expect((await POST(req(body, ''))).status).toBe(401);
  expect(gate).not.toHaveBeenCalled(); expect(publicRpc).not.toHaveBeenCalled();
});
it('does not turn an upstream error or malformed page into an empty success', async () => {
  publicRpc.mockResolvedValue({ ok: false, status: 400, body: { error: 'bad_request' } });
  expect((await POST(req({ ...body, cursor: 'incompatible' }))).status).toBe(400);
  publicRpc.mockResolvedValue({ ok: true, status: 200, body: { data: [] } });
  expect((await POST(req())).status).toBe(502);
});
