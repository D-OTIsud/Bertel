import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const timeout = 7000;
// CLI v2.78.1's Kong routes this path to Realtime v2.78.10's tenant API.
const tenantPath = '/realtime/v1/api/tenants/realtime-dev';

async function waitFor(check, failure) {
  const deadline = performance.now() + timeout;
  while (!check() && performance.now() < deadline) await sleep(50);
  assert.ok(check(), failure);
}

// Realtime v2.78.10 returns this exact Phoenix reason; the locked SDK wraps it in JSON quotes.
function join(channel, topic) {
  return Promise.race([
    new Promise((resolve) => channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') return resolve('joined');
      if (status !== 'CHANNEL_ERROR') return resolve('unproven');
      const reason = error?.message?.replace(/^"|"$/g, '');
      if (reason === 'PrivateOnly: This project only allows private channels') return resolve('private-only');
      if (reason === `Unauthorized: You do not have permissions to read from this Channel topic: ${topic}`) {
        return resolve('policy-denied');
      }
      return resolve('unproven');
    }, timeout)),
    sleep(timeout + 1000, 'unproven', { ref: false }),
  ]);
}

async function tenantMode(local, requested) {
  const read = requested === undefined;
  const response = await local.request(tenantPath, local.service,
    read ? undefined : { tenant: { private_only: requested } }, read ? 'GET' : 'PUT');
  assert.equal(response.status, 200, 'owned Realtime tenant management request must succeed');
  const { data } = await response.json();
  assert.ok(data?.external_id === 'realtime-dev' && typeof data.private_only === 'boolean',
    'the exact CLI tenant and its mode must be attested');
  return data.private_only;
}

export async function testRealtimeSecurity({ local, objectId, publishedId, testObjectId, writer, foreign, testRealm, portal,
  profileless, restoreUnaffiliatedProfile, markTesterAsDiscovery, revokeWriter, diagnostic }) {
  const origin = new URL(local.origin);
  assert.ok(process.env.CURRENT_RIGHTS_DISPOSABLE === 'true' && process.env.GITHUB_ACTIONS === 'true'
    && origin.protocol === 'http:' && origin.hostname === '127.0.0.1' && origin.port
    && origin.origin === local.origin && objectId === 'HOTRUN999999AR01' && publishedId === 'HOTRUN999999AR03'
    && testObjectId === 'HOTRUN999999AR05',
  'only the owned disposable loopback stack and exact object fixtures are allowed');
  const socketOrigin = `ws://${origin.host}`;
  class LoopbackSocket extends WebSocket {
    constructor(address, protocols) {
      const url = new URL(address);
      assert.ok(url.origin === socketOrigin && url.pathname === '/realtime/v1/websocket', 'unexpected Realtime endpoint');
      super(address, protocols);
    }
  }
  const clients = [];
  const open = async (topic, identity, isPrivate = true) => {
    const client = createClient(local.origin, local.anonymous.apikey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      realtime: { transport: LoopbackSocket, timeout },
      global: { fetch: (resource, options) => {
        const url = new URL(resource instanceof Request ? resource.url : resource);
        assert.ok(url.origin === local.origin, 'SDK HTTP must stay on the owned gateway');
        return fetch(resource, { ...options, redirect: 'error' });
      } },
    });
    clients.push(client);
    const { authorization } = identity.headers;
    assert.ok(authorization.startsWith('Bearer '));
    await client.realtime.setAuth(authorization.slice(7));
    const channel = client.channel(topic, { config: {
      private: isPrivate, presence: { key: identity.id, enabled: true }, broadcast: { self: false, ack: true },
    } });
    const seen = new Set();
    channel.on('presence', { event: 'sync' }, () => {});
    channel.on('broadcast', { event: 'field:lock' }, ({ payload }) => seen.add(payload?.probe));
    return { client, channel, id: identity.id, seen, status: await join(channel, topic) };
  };
  const room = `room:${objectId}`;
  const published = `room:${publishedId}`;
  const testRoom = `room:${testObjectId}`;
  const globalTopics = { prod: 'presence:global:prod', test: 'presence:global:test' };
  const crm = { prod: 'crm:tasks:prod', test: 'crm:tasks:test' };
  const anon = { id: 'synthetic-anonymous', headers: local.anonymous };
  const track = (peer, phase = 'initial') => peer.channel.track({ userId: peer.id, phase });
  const send = (peer, probe) => peer.channel.send({
    type: 'broadcast', event: 'field:lock', payload: { field: 'generalInfo.name', userId: peer.id, probe },
  });
  async function positivePair(topic, firstIdentity, secondIdentity) {
    const [first, second] = await Promise.all([open(topic, firstIdentity), open(topic, secondIdentity)]);
    assert.equal(first.status, 'joined', `${topic} first positive`);
    assert.equal(second.status, 'joined', `${topic} second positive`);
    assert.deepEqual(await Promise.all([track(first), track(second)]), ['ok', 'ok']);
    const sameIdentity = first.id === second.id;
    await waitFor(() => second.channel.presenceState()[first.id]?.length === (sameIdentity ? 2 : 1)
      && (sameIdentity || first.channel.presenceState()[second.id]?.length === 1), `${topic} mutual presence`);
    return [first, second];
  }
  async function deniedJoins(cases) {
    for (const [topic, identity, label] of cases) {
      const peer = await open(topic, identity);
      assert.equal(peer.status, 'policy-denied', label);
      assert.deepEqual(Object.keys(peer.channel.presenceState()), [], label + ' presence must remain empty');
      assert.equal(peer.seen.size, 0, label + ' broadcasts must remain empty');
    }
  }
  async function refusedBroadcast(sender, receiver, marker) {
    // v2.78.10 does not ACK an RLS-denied broadcast. Verify the same socket can
    // still send an authorized Presence update and that the receiver sees it.
    assert.equal(await send(sender, marker), 'timed out', marker + ' must not be acknowledged');
    assert.equal(await track(sender, marker), 'ok', marker + ' sender remains live');
    await waitFor(() => receiver.channel.presenceState()[sender.id]?.some((entry) => entry.phase === marker),
      marker + ' authorized Presence barrier must reach the peer');
    assert.equal(receiver.seen.has(marker), false, marker + ' must not be delivered');
  }

  const originalMode = await tenantMode(local);
  try {
    assert.equal(await tenantMode(local, true), true);
    assert.equal(await tenantMode(local), true);
    for (const topic of [room, 'presence:global']) {
      assert.equal((await open(topic, writer, false)).status, 'private-only', 'legacy public client must be explicitly refused');
    }

    const [a1, a2] = await positivePair(room, writer, writer);
    assert.equal(await send(a1, 'writer-draft'), 'ok');
    await waitFor(() => a2.seen.has('writer-draft'), 'canonical draft writer broadcast must reach the second tab');
    await deniedJoins([
      [room, foreign, 'foreign organization draft'],
      [room, testRealm, 'other realm draft'],
      [room, anon, 'anonymous draft'],
      [room.toLowerCase(), writer, 'noncanonical object topic'],
    ]);

    const [publishedWriter, publishedReader] = await positivePair(published, writer, foreign);
    assert.equal(await send(publishedWriter, 'writer-published'), 'ok');
    await waitFor(() => publishedReader.seen.has('writer-published'), 'published reader must receive the canonical writer');
    const [globalWriter, globalForeign] = await positivePair(globalTopics.prod, writer, foreign);
    const [crmWriter, crmForeign] = await positivePair(crm.prod, writer, foreign);
    const testGlobal = await open(globalTopics.test, testRealm);
    const testCrm = await open(crm.test, testRealm);
    const testRoomEditor = await open(testRoom, testRealm);
    for (const peer of [testGlobal, testCrm, testRoomEditor]) {
      assert.equal(peer.status, 'joined', 'test editor joins the roster or object in their own realm');
      assert.equal(await track(peer), 'ok');
      await waitFor(() => peer.channel.presenceState()[testRealm.id]?.length === 1, 'nonempty test roster');
      assert.equal(peer.channel.presenceState()[writer.id], undefined, 'no production identity on the test roster');
    }
    for (const peer of [globalWriter, crmWriter]) {
      assert.equal(peer.channel.presenceState()[testRealm.id], undefined, 'no test identity on the production roster');
    }
    await deniedJoins([
      [published, portal, 'portal persona published room despite HTTP read'],
      [published, profileless, 'profileless persona published room despite HTTP read'],
      [globalTopics.prod, testRealm, 'test to production global roster'], [globalTopics.test, foreign, 'production to test global roster'],
      [globalTopics.prod, anon, 'anonymous global roster'], [globalTopics.prod, portal, 'portal persona global roster'],
      [crm.prod, testRealm, 'test to production CRM roster'], [crm.test, foreign, 'production to test CRM roster'],
      [crm.prod, anon, 'anonymous CRM roster'], [crm.prod, portal, 'portal persona CRM roster'],
    ]);
    await Promise.all([
      refusedBroadcast(publishedReader, publishedWriter, 'published-reader-broadcast'),
      refusedBroadcast(globalWriter, globalForeign, 'global-client-broadcast'),
      refusedBroadcast(crmWriter, crmForeign, 'crm-client-broadcast'),
    ]);

    const unaffiliated = await restoreUnaffiliatedProfile();
    await deniedJoins([
      [published, unaffiliated, 'default staff profile without affiliation cannot join a published room'],
      [globalTopics.prod, unaffiliated, 'default staff profile without affiliation cannot join the roster'],
    ]);
    for (const peer of [testGlobal, testCrm, testRoomEditor]) {
      assert.equal(await peer.client.removeChannel(peer.channel), 'ok');
    }
    const discovery = await markTesterAsDiscovery();
    await deniedJoins([
      [testRoom, testRealm, 'original tester JWT cannot rejoin after the account becomes public discovery'],
      [testRoom, discovery, 'public discovery cannot join a test room even with fixture write authority'],
      [globalTopics.test, discovery, 'public discovery cannot join the test roster'],
      [crm.test, discovery, 'public discovery cannot join the test CRM roster'],
    ]);

    assert.equal(await a1.client.removeChannel(a1.channel), 'ok');
    await waitFor(() => a2.channel.presenceState()[writer.id]?.length === 1, 'closing a tab preserves the other connection');
    await revokeWriter();
    // A new socket with the original token exercises policy reevaluation at join.
    await deniedJoins([[room, writer, 'same JWT rejoin after committed revocation']]);
    diagnostic('PrivateOnly readback and legacy denial, private room/roster roles, broadcast delivery boundaries and same-JWT rejoin passed.');
  } finally {
    try {
      await Promise.all(clients.map(async (client) => {
        try { await client.removeAllChannels(); } finally { client.realtime.disconnect(); }
      }));
    } finally {
      assert.equal(await tenantMode(local, originalMode), originalMode);
      assert.equal(await tenantMode(local), originalMode);
    }
  }
}
