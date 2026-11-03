import { CARTE_REQUEST_REPLAY_MAX_AGE_MS, withPendingCarteRequest } from './carte-save-request';

const payload = { write_contract: 'restaurant-carte-v1', action: 'remove', document_id: 'doc', expected: { title: 'Carte' } };
const key = 'workspace-carte-request:u:RES1';
const options = { baselineReadId: 'read-1' };
beforeEach(() => window.localStorage.clear());

it('reuses the exact dated request after a lost response, then gives the next intention another UUID', async () => {
  const send = jest.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValue([]);
  await expect(withPendingCarteRequest('u', 'RES1', payload, send, () => {}, options)).rejects.toThrow('lost');
  const stored = JSON.parse(window.localStorage.getItem(key)!);
  await withPendingCarteRequest('u', 'RES1', payload, send, () => {}, options);
  expect(send.mock.calls[1][0]).toEqual(stored.request);
  expect(window.localStorage.getItem(key)).toBeNull();
  await withPendingCarteRequest('u', 'RES1', payload, send, () => {}, options);
  expect(send.mock.calls[2][0].request_id).not.toBe(stored.request.request_id);
});

it.each([400, 403, 409, 422])('releases a definitive HTTP %s refusal so correction is possible', async status => {
  const send = jest.fn().mockRejectedValue(Object.assign(new Error('refused'), { status }));
  await expect(withPendingCarteRequest('u', 'RES1', payload, send, () => {}, options)).rejects.toThrow('refused');
  expect(window.localStorage.getItem(key)).toBeNull();
});

it('does not clear an uncertain 503 or the newer request stored by another tab', async () => {
  const send = jest.fn().mockRejectedValueOnce(Object.assign(new Error('uncertain'), { status: 503 }));
  await expect(withPendingCarteRequest('u', 'RES1', payload, send, () => {}, options)).rejects.toThrow();
  expect(window.localStorage.getItem(key)).not.toBeNull();
  const newer = JSON.stringify({ unrelated: 'tab B' });
  send.mockImplementationOnce(async () => { window.localStorage.setItem(key, newer); return []; });
  await withPendingCarteRequest('u', 'RES1', payload, send, () => {}, options);
  expect(window.localStorage.getItem(key)).toBe(newer);
});

it('resolves a stale request read-only and requires a fresh loader before another intention', async () => {
  const old = { version: 2, request: { ...payload, request_id: crypto.randomUUID() },
    createdAt: new Date(Date.now() - CARTE_REQUEST_REPLAY_MAX_AGE_MS - 1).toISOString(), baselineReadId: 'old' };
  window.localStorage.setItem(key, JSON.stringify(old));
  const resolve = jest.fn().mockResolvedValue([]);
  const send = jest.fn().mockResolvedValue([]);
  await expect(withPendingCarteRequest('u', 'RES1', payload, send, () => {}, { ...options, resolve })).rejects.toThrow(/confirmé.*Rechargez/);
  expect(resolve).toHaveBeenCalledWith(old.request.request_id);
  expect(send).not.toHaveBeenCalled();
  await expect(withPendingCarteRequest('u', 'RES1', payload, send, () => {}, options)).rejects.toThrow(/Rechargez/);
  await withPendingCarteRequest('u', 'RES1', payload, send, () => {}, { baselineReadId: 'new-read' });
  expect(send).toHaveBeenCalledTimes(1);
});
