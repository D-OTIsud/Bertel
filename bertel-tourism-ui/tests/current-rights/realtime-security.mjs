import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const timeout = 7000;
const deniedMessage = /^(Unauthorized(?: access to Realtime channel)?|PrivateOnly|You do not have permissions to read from this (?:Channel )?Topic|The connection was rejected because this project only allows private channels)$/i;

async function waitFor(check, failure) {
  const deadline = performance.now() + timeout;
  while (!check() && performance.now() < deadline) await sleep(50);
  assert.ok(check(), failure);
}

async function join(channel) {
  return Promise.race([
    new Promise((resolve) => channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') return resolve('joined');
      const reason = error?.message?.replace(/^"|"$/g, '');
      resolve(status === 'CHANNEL_ERROR' && deniedMessage.test(reason ?? '') ? 'denied' : 'unproven');
    }, timeout)),
    sleep(timeout + 1000, 'unproven', { ref: false }),
  ]);
}

export async function testRealtimeSecurity({ local, objectId, writerId, writer, foreign, testRealm, diagnostic }) {
  const origin = new URL(local.origin);
  assert.ok(origin.protocol === 'http:' && origin.hostname === '127.0.0.1' && origin.port
    && origin.origin === local.origin, 'only the owned loopback Supabase gateway is allowed');
  const socketOrigin = `ws://${origin.host}`;
  class LoopbackSocket extends WebSocket {
    constructor(address, protocols) {
      const url = new URL(address);
      assert.ok(url.origin === socketOrigin && url.pathname === '/realtime/v1/websocket', 'unexpected Realtime endpoint');
      super(address, protocols);
    }
  }
  const clients = [];
  const open = async (topic, credentials, key) => {
    const client = createClient(local.origin, local.anonymous.apikey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      realtime: { transport: LoopbackSocket, timeout },
      global: { fetch: (resource, options) => {
        const url = new URL(resource instanceof Request ? resource.url : resource);
        assert.equal(url.origin === local.origin, true, 'SDK HTTP must stay on the owned gateway');
        return fetch(resource, { ...options, redirect: 'error' });
      } },
    });
    clients.push(client);
    assert.ok(credentials.authorization.startsWith('Bearer '));
    await client.realtime.setAuth(credentials.authorization.slice(7));
    // Match the application's default public configuration. ACK is enabled only
    // to distinguish transmission failures from evidence of delivered broadcasts.
    const channel = client.channel(topic, { config: { presence: { key }, broadcast: { self: false, ack: true } } });
    const locks = [];
    channel.on('presence', { event: 'sync' }, () => {});
    channel.on('broadcast', { event: 'field:lock' }, ({ payload }) => locks.push(payload));
    return { client, channel, locks, status: await join(channel) };
  };
  const track = (channel) => channel.track({ userId: writerId, name: 'Synthetic Realtime editor' });
  const sendLock = (channel, payload) => channel.send({ type: 'broadcast', event: 'field:lock', payload });
  const room = `room:${objectId}`;
  try {
    const [first, second] = await Promise.all([open(room, writer, writerId), open(room, writer, writerId)]);
    assert.ok(first.status === 'joined' && second.status === 'joined', 'two authorized SDK connections must join the exact object topic');
    assert.deepEqual(await Promise.all([track(first.channel), track(second.channel)]), ['ok', 'ok']);
    await waitFor(() => second.channel.presenceState()[writerId]?.length === 2, 'both connections of the same user must appear under one presence key');
    const [foreignRoom, realmRoom, anonRoom, globalWriter, anonGlobal] = await Promise.all([
      open(room, foreign, 'synthetic-foreign'), open(room, testRealm, 'synthetic-test'),
      open(room, local.anonymous, 'synthetic-anonymous'), open('presence:global', writer, writerId),
      open('presence:global', local.anonymous, 'synthetic-anonymous'),
    ]);
    assert.equal(globalWriter.status, 'joined', 'an authenticated positive must join the existing global roster');
    assert.equal(await track(globalWriter.channel), 'ok');
    await waitFor(() => globalWriter.channel.presenceState()[writerId]?.length === 1, 'global roster must have a nonempty authenticated control');

    const validLock = { field: 'generalInfo.name', userId: writerId, name: 'Synthetic Realtime editor' };
    assert.equal(await sendLock(first.channel, { ...validLock, probe: 'valid' }), 'ok');
    await waitFor(() => second.locks.some((item) => item?.probe === 'valid'), 'an authorized broadcast must reach the other connection');
    const malformedResult = await sendLock(first.channel, { field: null, userId: null, name: 123, probe: 'malformed' });
    assert.equal(await sendLock(first.channel, { ...validLock, probe: 'barrier' }), 'ok');
    await waitFor(() => second.locks.some((item) => item?.probe === 'barrier'), 'a second valid broadcast must cross the same path');
    assert.equal(await first.client.removeChannel(first.channel), 'ok');
    await waitFor(() => second.channel.presenceState()[writerId]?.length === 1, 'closing one connection must preserve the other under the same key');

    const observe = (peer) => ({ status: peer.status,
      receivedPresence: Boolean(peer.channel.presenceState()[writerId]?.length),
      receivedLock: peer.locks.some((item) => item?.probe === 'valid'),
    });
    const results = {
      foreignRoom: observe(foreignRoom), otherRealmRoom: observe(realmRoom),
      anonymousRoom: observe(anonRoom), anonymousGlobal: observe(anonGlobal),
      malformedSend: ['ok', 'error', 'timed out'].includes(malformedResult) ? malformedResult : 'unproven',
      malformedDelivered: second.locks.some((item) => item?.probe === 'malformed'),
    };
    diagnostic(JSON.stringify(results));
    const failures = ['foreignRoom', 'otherRealmRoom', 'anonymousRoom', 'anonymousGlobal']
      .filter((key) => results[key].status !== 'denied' || results[key].receivedPresence || results[key].receivedLock);
    if (!['ok', 'error'].includes(results.malformedSend)) failures.push('unproven-lock-probe');
    if (results.malformedDelivered) failures.push('unvalidated-lock-payload');
    assert.deepEqual(failures, [], 'Realtime isolation or lock payload boundary failed');
  } finally {
    await Promise.all(clients.map(async (client) => {
      try { await client.removeAllChannels(); } finally { client.realtime.disconnect(); }
    }));
  }
}
