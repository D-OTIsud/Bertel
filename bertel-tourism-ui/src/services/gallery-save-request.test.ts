import { GALLERY_REQUEST_REPLAY_MAX_AGE_MS, withPendingGalleryRequest } from './gallery-save-request';

const first = { write_contract: 'gallery-patch-v1', rows: [{ id: 'photo-one', expected: null, changes: { name: 'Carte' } }] };
const key = 'workspace-gallery-request:u1:RES1';
const options = { baselineReadId: 'read-one' };
beforeEach(() => window.localStorage.clear());
const stored = () => JSON.parse(window.localStorage.getItem(key)!);

it('persists a dated UUID and reuses the exact request after a lost response', async () => {
  const send = jest.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ success: true });
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options)).rejects.toThrow('response lost');
  const pending = stored();
  expect(pending).toMatchObject({ version: 2, baselineReadId: 'read-one', request: first });
  expect(pending.request.request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(Number.isFinite(Date.parse(pending.createdAt))).toBe(true);
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options)).resolves.toEqual({ success: true });
  expect(send).toHaveBeenNthCalledWith(2, pending.request);
  expect(window.localStorage.getItem(key)).toBeNull();
});

it('uses different intention UUIDs for a later identical payload', async () => {
  const send = jest.fn().mockResolvedValue({ success: true });
  await withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options);
  await withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options);
  expect(send.mock.calls[0][0].request_id).not.toBe(send.mock.calls[1][0].request_id);
});

it.each(['22003', '23505', '22001', 'P0001', 'PT409', 'XX000'])('releases a definitive %s refusal so corrected input can be submitted', async (code) => {
  const send = jest.fn().mockRejectedValueOnce(Object.assign(new Error('refused'), { code })).mockResolvedValueOnce({ success: true });
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options)).rejects.toThrow('refused');
  expect(window.localStorage.getItem(key)).toBeNull();
  const corrected = { ...first, rows: [{ id: 'photo-one', expected: null, changes: { name: 'Carte corrigée' } }] };
  await withPendingGalleryRequest('u1', 'RES1', corrected, send, () => {}, options);
  expect(send.mock.calls[1][0]).toMatchObject(corrected);
  expect(send.mock.calls[1][0].request_id).not.toBe(send.mock.calls[0][0].request_id);
});

it('retains a known transient refusal and an unconfirmed success', async () => {
  const send = jest.fn().mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: '40P01' })).mockResolvedValueOnce({});
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options)).rejects.toThrow('deadlock');
  const pending = stored();
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => { throw new Error('bad snapshot'); }, options)).rejects.toThrow('bad snapshot');
  expect(stored()).toEqual(pending);
});

it('confirms an earlier request before asking to reload, preserving newer unsent intent', async () => {
  const send = jest.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ success: true });
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options)).rejects.toThrow();
  const original = stored().request;
  const current = { ...first, rows: [{ id: 'photo-two', expected: null, changes: { name: 'Desserts' } }] };
  const before = JSON.stringify(current);
  await expect(withPendingGalleryRequest('u1', 'RES1', current, send, () => {}, options)).rejects.toThrow(/confirmé.*Rechargez.*saisie est conservée/);
  expect(send).toHaveBeenNthCalledWith(2, original);
  expect(JSON.stringify(current)).toBe(before);
});

it('never replays another account request', async () => {
  const send = jest.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ success: true });
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options)).rejects.toThrow();
  const original = stored();
  await withPendingGalleryRequest('u2', 'RES1', { ...first, rows: [] }, send, () => {}, options);
  expect(stored()).toEqual(original);
});

it.each(['success', 'refusal'] as const)('never removes another tab’s newer request after %s', async (outcome) => {
  let finish!: (value: unknown) => void;
  let fail!: (error: Error & { code?: string }) => void;
  const wait = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const saving = withPendingGalleryRequest('u1', 'RES1', first, () => wait, () => {}, options);
  const newer = { ...stored(), request: { ...first, rows: [{ id: 'newer-photo' }], request_id: crypto.randomUUID() } };
  window.localStorage.setItem(key, JSON.stringify(newer));
  if (outcome === 'success') finish({ success: true });
  else fail(Object.assign(new Error('conflict'), { code: 'PT409' }));
  if (outcome === 'success') await saving;
  else await expect(saving).rejects.toThrow('conflict');
  expect(stored()).toEqual(newer);
});

it.each([true, false])('resolves a week-old request by GET semantics only (known=%s), then requires a fresh loader read', async (known) => {
  const old = { version: 2, request: { ...first, request_id: crypto.randomUUID() }, createdAt: new Date(Date.now() - 7 * GALLERY_REQUEST_REPLAY_MAX_AGE_MS).toISOString(), baselineReadId: 'old-read' };
  window.localStorage.setItem(key, JSON.stringify(old));
  const send = jest.fn().mockResolvedValue({ success: true });
  const resolve = jest.fn().mockResolvedValue(known ? { success: true, known: true } : null);
  const confirm = jest.fn();
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, confirm, { ...options, resolve })).rejects.toThrow(/Rechargez.*saisie est conservée/);
  expect(send).not.toHaveBeenCalled();
  expect(resolve).toHaveBeenCalledWith(old.request.request_id);
  expect(confirm).toHaveBeenCalledTimes(known ? 1 : 0);
  expect(window.localStorage.getItem(`${key}:unresolved:${old.request.request_id}`)).toContain('createdAt');
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, confirm, options)).rejects.toThrow(/Rechargez/);
  expect(send).not.toHaveBeenCalled();
  await withPendingGalleryRequest('u1', 'RES1', first, send, confirm, { baselineReadId: 'fresh-read' });
  expect(send).toHaveBeenCalledTimes(1);
});

it('archives an undated legacy request and never implicitly writes it', async () => {
  const raw = JSON.stringify(first);
  window.localStorage.setItem(key, raw);
  const send = jest.fn();
  await expect(withPendingGalleryRequest('u1', 'RES1', first, send, () => {}, options)).rejects.toThrow(/ancienne demande n’a pas été rejouée/);
  expect(send).not.toHaveBeenCalled();
  const archiveKey = Object.keys(window.localStorage).find(value => value.startsWith(`${key}:unresolved:`))!;
  expect(JSON.parse(window.localStorage.getItem(archiveKey)!).raw).toBe(raw);
});
