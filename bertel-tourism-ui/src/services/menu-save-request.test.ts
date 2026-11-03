import { withPendingMenuRequest } from './menu-save-request';

const first = { write_contract: 'menus-reconcile-v1', menus: [{ id: 'menu-one', expected: null, changes: { name: 'Carte' } }] };
beforeEach(() => window.localStorage.clear());

it('keeps the exact request across a lost response and removes it only after confirmation', async () => {
  const send = jest.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ success: true });
  await expect(withPendingMenuRequest('u1', 'RES1', first, send, () => {})).rejects.toThrow('response lost');
  expect(JSON.parse(window.localStorage.getItem('workspace-menu-request:u1:RES1')!)).toEqual(first);
  await expect(withPendingMenuRequest('u1', 'RES1', first, send, () => {})).resolves.toEqual({ success: true });
  expect(send).toHaveBeenNthCalledWith(2, first);
  expect(window.localStorage.getItem('workspace-menu-request:u1:RES1')).toBeNull();
});

it('confirms the earlier pending request before asking to reload, preserving newer unsent intent', async () => {
  window.localStorage.setItem('workspace-menu-request:u1:RES1', JSON.stringify(first));
  const current = { ...first, menus: [{ id: 'menu-two', expected: null, changes: { name: 'Desserts' } }] };
  const send = jest.fn().mockResolvedValue({ success: true });
  const before = JSON.stringify(current);
  await expect(withPendingMenuRequest('u1', 'RES1', current, send, () => {})).rejects.toThrow(/dernier enregistrement.*confirmé.*Rechargez.*saisie est conservée/);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(first);
  expect(JSON.stringify(current)).toBe(before);
});

it('retains the request when the returned snapshot cannot be validated', async () => {
  await expect(withPendingMenuRequest('u1', 'RES1', first, async () => ({}), () => { throw new Error('bad snapshot'); })).rejects.toThrow('bad snapshot');
  expect(window.localStorage.getItem('workspace-menu-request:u1:RES1')).not.toBeNull();
});

it('never replays another account request', async () => {
  window.localStorage.setItem('workspace-menu-request:u1:RES1', JSON.stringify(first));
  const send = jest.fn().mockResolvedValue({ success: true });
  await withPendingMenuRequest('u2', 'RES1', { write_contract: 'menus-reconcile-v1', menus: [] }, send, () => {});
  expect(send).not.toHaveBeenCalledWith(first);
  expect(window.localStorage.getItem('workspace-menu-request:u1:RES1')).not.toBeNull();
});

it.each(['success', 'refusal'] as const)('never removes a newer request stored by another tab after %s', async (outcome) => {
  let finish!: (value: unknown) => void;
  let fail!: (error: Error & { code?: string }) => void;
  const wait = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const saving = withPendingMenuRequest('u1', 'RES1', first, () => wait, () => {});
  const newer = { write_contract: 'menus-reconcile-v1', menus: [{ id: 'newer-menu' }] };
  // Tab B confirms A, then starts and persists a different save while A still waits.
  window.localStorage.removeItem('workspace-menu-request:u1:RES1');
  window.localStorage.setItem('workspace-menu-request:u1:RES1', JSON.stringify(newer));
  if (outcome === 'success') finish({ success: true });
  else fail(Object.assign(new Error('conflict'), { code: 'PT409' }));
  if (outcome === 'success') await saving;
  else await expect(saving).rejects.toThrow('conflict');
  expect(JSON.parse(window.localStorage.getItem('workspace-menu-request:u1:RES1')!)).toEqual(newer);
});
