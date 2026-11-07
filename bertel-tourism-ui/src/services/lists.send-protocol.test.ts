/** @jest-environment node */
import { createHash, webcrypto } from 'node:crypto';
import { getApiClient } from '../lib/supabase';
import { getServiceAvailability } from './service-availability';
import * as lists from './lists';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('./service-availability', () => ({ getServiceAvailability: jest.fn() }));

const LIST = '51000000-0000-4000-8000-000000000001';
const USER = '52000000-0000-4000-8000-000000000001';
const OP = '53000000-0000-4000-8000-000000000001';
const PREVIOUS_A = '53000000-0000-4000-8000-000000000002';
const PREVIOUS_B = '53000000-0000-4000-8000-000000000003';
const PERMIT = '54000000-0000-4000-8000-000000000001';
const PROOF = 'ab'.repeat(32);
const EMAIL = '  Guest@Example.invalid  ';
const DESTINATION = createHash('sha256').update(EMAIL.trim()).digest('hex');
const availability = { translation: false, imageAnalysis: false, email: true };
type GenerationContext = { generations: Record<string, string> };
type ContextOptions = { expectedUserId?: string; signal?: AbortSignal; isCurrent?: () => boolean };
type RequestRecord = { url: string; init: RequestInit; body: Record<string, unknown> };

function intent() {
  return { operationId: OP, context: { generations: { [DESTINATION]: '7' } } };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function prepared(patch = {}) {
  return json({ ok: true, phase: 'prepared', operationId: OP, dispatchToken: PERMIT, ...patch });
}
function accepted(patch = {}) {
  return json({ ok: true, phase: 'accepted', operationId: OP, resultToken: PROOF, trackingUpdated: true, ...patch });
}
function acknowledged(patch = {}) {
  return json({ ok: true, phase: 'acknowledged', operationId: OP, acknowledged: true, ...patch });
}
function network(handler: (request: RequestRecord) => Response | Promise<Response>) {
  const requests: RequestRecord[] = [];
  const fetcher = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const request = { url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? '{}')) };
    requests.push(request);
    expect(request.url).toBe('/api/lists/send');
    expect(request.init.method).toBe('POST');
    return handler(request);
  });
  global.fetch = fetcher as typeof fetch;
  return { requests, fetcher, phases: () => requests.map(request => request.body.phase) };
}
function happy(request: RequestRecord): Response {
  if (request.body.phase === 'prepare') return prepared();
  if (request.body.phase === 'dispatch') return accepted();
  if (request.body.phase === 'ack') return acknowledged();
  throw new Error('Unexpected synthetic protocol phase');
}
function contextReader(listId: string, options?: ContextOptions): Promise<GenerationContext> {
  // The contract is intentional even while the old implementation lacks this export.
  const reader: unknown = Reflect.get(lists, 'getListEmailContext');
  expect(typeof reader).toBe('function');
  return (reader as (id: string, scope?: ContextOptions) => Promise<GenerationContext>)(listId, options);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('list email client — captured generation, prepare/dispatch/result/ack contract', () => {
  const originalFetch = global.fetch;
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const session = jest.fn();

  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getServiceAvailability).mockResolvedValue(availability);
    session.mockResolvedValue({ data: { session: { access_token: 'synthetic-token', user: { id: USER } } }, error: null });
    (getApiClient as jest.Mock).mockReturnValue({ auth: {
      getSession: session,
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER } }, error: null }),
    } });
  });
  afterEach(() => { global.fetch = originalFetch; });
  afterAll(() => {
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
  });

  it('reads context without an intent, recipient address, SMTP availability check or dispatch', async () => {
    const net = network(() => json({ ok: true, phase: 'context', listId: LIST, userId: USER,
      generations: { [DESTINATION]: '7' } }));
    await expect(contextReader(LIST, { expectedUserId: USER })).resolves.toEqual({ generations: { [DESTINATION]: '7' } });
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0].body).toEqual({ phase: 'context', listId: LIST });
    expect(new Headers(net.requests[0].init.headers).get('Idempotency-Key')).toBeNull();
    expect(new Headers(net.requests[0].init.headers).get('authorization')).toBe('Bearer synthetic-token');
    expect(getServiceAvailability).not.toHaveBeenCalled();
  });

  it.each([
    { listId: PREVIOUS_A }, { userId: PREVIOUS_A }, { phase: 'prepared' },
    { generations: { [DESTINATION]: '-1' } }, { generations: { [DESTINATION]: 0 } },
    { generations: { ['A'.repeat(64)]: '0' } },
  ])('rejects malformed or foreign context before returning it: %j', async patch => {
    const net = network(() => json({ ok: true, phase: 'context', listId: LIST, userId: USER,
      generations: { [DESTINATION]: '7' }, ...patch }));
    await expect(contextReader(LIST, { expectedUserId: USER })).rejects.toThrow();
    expect(net.phases()).toEqual(['context']);
  });

  it('sends prepare, dispatch and ack with one exact operation and separate token formats', async () => {
    const net = network(happy);
    const gesture = { ...intent(), confirmResend: true, confirmedPreviousOperationIds: [PREVIOUS_A, PREVIOUS_B] };
    await expect(lists.sendListByEmail(LIST, EMAIL, gesture)).resolves.toEqual({ trackingUpdated: true });
    expect(net.phases()).toEqual(['prepare', 'dispatch', 'ack']);
    expect(net.requests[0].body).toMatchObject({ listId: LIST, toEmail: EMAIL.trim(), phase: 'prepare',
      expectedGeneration: '7', confirmResend: true, confirmedPreviousOperationIds: [PREVIOUS_A, PREVIOUS_B] });
    expect(net.requests[1].body).toMatchObject({ listId: LIST, toEmail: EMAIL.trim(), phase: 'dispatch', dispatchToken: PERMIT });
    expect(net.requests[2].body).toEqual({ phase: 'ack', listId: LIST, resultToken: PROOF });
    for (const request of net.requests) {
      expect(new Headers(request.init.headers).get('Idempotency-Key')).toBe(OP);
      expect(new Headers(request.init.headers).get('authorization')).toBe('Bearer synthetic-token');
    }
    expect(net.requests[1].body).not.toHaveProperty('resultToken');
    expect(net.requests[2].body).not.toHaveProperty('dispatchToken');
    expect(getServiceAvailability).toHaveBeenCalledWith({ force: true });
  });

  it('copies the generation snapshot before the first availability await and never refreshes it', async () => {
    const gate = deferred<typeof availability>();
    jest.mocked(getServiceAvailability).mockReturnValueOnce(gate.promise);
    const net = network(happy);
    const gesture = intent();
    const pending = lists.sendListByEmail(LIST, EMAIL, gesture);
    const outcome = expect(pending).resolves.toEqual({ trackingUpdated: true });
    gesture.context.generations[DESTINATION] = '999';
    gate.resolve(availability);
    await outcome;
    expect(net.requests[0].body.expectedGeneration).toBe('7');
    expect(net.phases()).toEqual(['prepare', 'dispatch', 'ack']);
  });

  it('uses generation zero for a new exact trimmed destination absent from a valid context', async () => {
    const net = network(happy);
    const gesture = { operationId: OP, context: { generations: {} } };
    await lists.sendListByEmail(LIST, EMAIL, gesture);
    expect(net.requests[0].body.expectedGeneration).toBe('0');
    expect(net.requests[0].body.toEmail).toBe('Guest@Example.invalid');
    expect(net.phases()).toEqual(['prepare', 'dispatch', 'ack']);
  });

  it('refuses an omitted context instead of silently acquiring a fresh generation', async () => {
    const net = network(happy);
    await expect(Reflect.apply(lists.sendListByEmail, undefined, [LIST, EMAIL, { operationId: OP }])).rejects.toThrow();
    expect(net.requests).toEqual([]);
  });

  it('does not redispatch when prepare replays the same accepted intent; it acknowledges the proof', async () => {
    const net = network(request => request.body.phase === 'prepare' ? accepted() : acknowledged());
    await expect(lists.sendListByEmail(LIST, EMAIL, intent())).resolves.toEqual({ trackingUpdated: true });
    expect(net.phases()).toEqual(['prepare', 'ack']);
    expect(net.requests[1].body.resultToken).toBe(PROOF);
  });

  it.each([
    { operationId: PREVIOUS_A }, { dispatchToken: PROOF }, { dispatchToken: '' }, { phase: 'wrong-stage' },
  ])('never dispatches a malformed permit/identity: %j', async patch => {
    const net = network(() => prepared(patch));
    await expect(lists.sendListByEmail(LIST, EMAIL, intent())).rejects.toThrow(lists.LIST_EMAIL_PROTECTION_UNAVAILABLE_MESSAGE);
    expect(net.phases()).toEqual(['prepare']);
  });

  it.each([
    () => new Response('<html>proxy</html>', { status: 200 }),
    () => new Response(null, { status: 204 }),
    () => json({ ok: false, error: 'synthetic_proxy_failure' }),
  ])('opaque prepare is protection-unavailable, never dispatch', async reply => {
    const net = network(() => reply());
    await expect(lists.sendListByEmail(LIST, EMAIL, intent())).rejects.toThrow(lists.LIST_EMAIL_PROTECTION_UNAVAILABLE_MESSAGE);
    expect(net.phases()).toEqual(['prepare']);
  });

  it.each([
    () => new Response('<html>proxy</html>', { status: 200 }),
    () => new Response(null, { status: 204 }),
    () => json({ ok: false, error: 'synthetic_proxy_failure' }),
    () => json({ ok: true }),
    () => { throw new TypeError('synthetic lost dispatch response'); },
  ])('opaque/lost dispatch is unknown for this operation, with no retry or ack', async reply => {
    const net = network(request => request.body.phase === 'prepare' ? prepared() : reply());
    await expect(lists.sendListByEmail(LIST, EMAIL, intent())).rejects.toMatchObject({
      name: 'ListEmailUnknownError', operationId: OP, operationIds: [OP],
    });
    expect(net.phases()).toEqual(['prepare', 'dispatch']);
  });

  it.each([
    { operationId: PREVIOUS_A }, { resultToken: PERMIT }, { resultToken: 'z'.repeat(64) },
    { resultToken: undefined }, { phase: 'prepared' },
  ])('requires accepted stage, current operation and independent HEX proof before ack: %j', async patch => {
    const net = network(request => request.body.phase === 'prepare' ? prepared() : accepted(patch));
    await expect(lists.sendListByEmail(LIST, EMAIL, intent())).rejects.toMatchObject({ name: 'ListEmailUnknownError', operationIds: [OP] });
    expect(net.phases()).toEqual(['prepare', 'dispatch']);
  });

  it.each([
    () => { throw new TypeError('synthetic lost ack'); },
    () => new Response('<html>proxy</html>', { status: 502 }),
    () => acknowledged({ acknowledged: false }),
    () => acknowledged({ operationId: PREVIOUS_A }),
  ])('a missing or unusable ack keeps known acceptance, even if tracking did not persist', async reply => {
    const net = network(request => request.body.phase === 'prepare' ? prepared()
      : request.body.phase === 'dispatch' ? accepted({ trackingUpdated: false }) : reply());
    await expect(lists.sendListByEmail(LIST, EMAIL, intent())).resolves.toEqual({ trackingUpdated: false });
    expect(net.phases()).toEqual(['prepare', 'dispatch', 'ack']);
    expect(net.requests[2].body.resultToken).toBe(PROOF);
  });

  it('keeps explicit predecessor identities intact after a certain refusal of the replacement', async () => {
    const predecessors = [PREVIOUS_A, PREVIOUS_B];
    const gesture = { ...intent(), confirmResend: true, confirmedPreviousOperationIds: predecessors };
    const net = network(() => json({ error: 'forbidden' }, 403));
    const failure = await lists.sendListByEmail(LIST, EMAIL, gesture).catch(error => error as unknown);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(lists.ListEmailUnknownError);
    expect(predecessors).toEqual([PREVIOUS_A, PREVIOUS_B]);
    expect(net.phases()).toEqual(['prepare']);
  });

  it('does not dispatch a prepared permit after the gesture scope becomes obsolete', async () => {
    const gate = deferred<Response>();
    const net = network(() => gate.promise);
    let current = true;
    const pending = lists.sendListByEmail(LIST, EMAIL, { ...intent(), isCurrent: () => current });
    const outcome = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    for (let count = 0; count < 200 && net.requests.length === 0; count += 1) {
      await new Promise(done => setTimeout(done, 5));
    }
    expect(net.requests).toHaveLength(1);
    current = false;
    gate.resolve(prepared());
    await outcome;
    expect(net.phases()).toEqual(['prepare']);
  });
});
