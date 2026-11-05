/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }));
jest.mock('./partner-auth', () => ({ logPartnerCall: jest.fn() }));
import { after } from 'next/server';
import { partnerRequestMetrics } from './partner-request-metrics';

beforeEach(() => { jest.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

it('serializes exactly once, counts UTF-8 bytes and emits only allowlisted measurements', async () => {
  let serializations = 0;
  const metrics = partnerRequestMetrics('list');
  await metrics.measure('list_rpc', async () => undefined);
  const response = metrics.json({ toJSON() { serializations++; return { name: 'Hôtel 🌴' }; } }, { status: 200, headers: {} });
  const text = await response.text();
  expect(serializations).toBe(1);
  expect(text).toBe('{"name":"Hôtel 🌴"}');
  expect(response.headers.get('content-type')).toBe('application/json');
  const event = (console.info as jest.Mock).mock.calls[0][0];
  expect(Object.keys(event).sort()).toEqual(['event', 'route', 'status', 'bytes', 'stages_ms', 'total_ms'].sort());
  expect(event.bytes).toBe(Buffer.byteLength(text));
  expect(response.headers.get('Server-Timing')).toMatch(/^list_rpc;dur=\d+\.\d{2}, serialization;dur=\d+\.\d{2}, total;dur=\d+\.\d{2}$/);
});

it('records failed stages and excludes deferred work from completed response timing', async () => {
  const metrics = partnerRequestMetrics('detail');
  await expect(metrics.measure('detail_rpc', async () => { throw new Error('private error'); })).rejects.toThrow();
  metrics.audit('private key id', 'GET /api/public/objects/{id}', 502);
  const response = metrics.json({ error: 'upstream_error' }, { status: 502, headers: {} });
  const timing = response.headers.get('Server-Timing');
  expect(timing).toContain('detail_rpc;dur=');
  const responseEvent = (console.info as jest.Mock).mock.calls[0][0];
  await (after as jest.Mock).mock.calls[0][0]();
  expect(response.headers.get('Server-Timing')).toBe(timing);
  expect((console.info as jest.Mock).mock.calls[1][0]).toEqual(expect.objectContaining({ event: 'partner_api_audit', status: 502 }));
  expect(JSON.stringify(responseEvent)).not.toContain('private');
});
