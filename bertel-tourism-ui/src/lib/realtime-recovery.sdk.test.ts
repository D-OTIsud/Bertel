import type { SupabaseClient } from '@supabase/supabase-js';
import { RealtimeClient } from '@supabase/realtime-js';
import { createResilientChannel } from './realtime-recovery';

interface Frame {
  topic: string;
  event: string;
  payload: unknown;
  ref?: string;
}

function memoryRealtime() {
  const sent: Frame[] = [];
  const sockets: MemorySocket[] = [];
  class MemorySocket {
    readyState = 1;
    onmessage: ((event: { data: string }) => void) | null = null;
    constructor() { sockets.push(this); }
    send(data: string) { sent.push(JSON.parse(data) as Frame); }
    close() { this.readyState = 3; }
  }

  const client = new RealtimeClient('ws://127.0.0.1:1/realtime/v1', {
    params: { apikey: 'synthetic-no-network' }, vsn: '1.0.0',
    transport: MemorySocket as unknown as NonNullable<ConstructorParameters<typeof RealtimeClient>[1]>['transport'],
  });
  const receive = (frame: Frame) => sockets[0]?.onmessage?.({ data: JSON.stringify(frame) });
  return { client, receive, sent };
}

const peer = (reference: string) => ({ metas: [{ phx_ref: reference }] });

it.each(['diff', 'snapshot'])('discards a pre-ACK presence %s before admitting the private join', (input) => {
  jest.useFakeTimers();
  const { client, receive, sent } = memoryRealtime();
  const topic = 'room:HOTRUN999999AR01';
  const wireTopic = 'realtime:' + topic;
  const snapshots: string[][] = [];
  let admitted = false;
  const handle = createResilientChannel(client as unknown as SupabaseClient, {
    topic,
    config: { config: { private: true, presence: { key: 'current-user' } } },
    onState: (state) => { admitted = state === 'subscribed'; },
    bind: (channel) => {
      channel.on('presence', { event: 'sync' }, () => {
        if (admitted) snapshots.push(Object.keys(channel.presenceState()));
      });
    },
  });
  try {
    const join = sent.find((frame) => frame.topic === wireTopic && frame.event === 'phx_join');
    expect(join?.ref).toEqual(expect.any(String));
    const channel = client.getChannels()[0];
    if (input === 'diff') {
      receive({ topic: wireTopic, event: 'presence_diff', ref: 'old-channel',
        payload: { joins: { stale: peer('old') }, leaves: {} } });
      expect(channel.presence.pendingDiffs).toHaveLength(1);
    } else {
      receive({ topic: wireTopic, event: 'presence_state', ref: 'old-channel',
        payload: { stale: peer('old') } });
      expect(channel.presenceState()).toHaveProperty('stale');
    }
    expect(snapshots).toEqual([]);

    receive({ topic: wireTopic, event: 'phx_reply', ref: join?.ref,
      payload: { status: 'ok', response: {} } });
    expect(admitted).toBe(true);
    if (input === 'snapshot') {
      // A new diff can reach a joined channel before its first fresh full state.
      receive({ topic: wireTopic, event: 'presence_diff',
        payload: { joins: { early: peer('new-before-snapshot') }, leaves: {} } });
      expect(snapshots).toEqual([]);
    }
    receive({ topic: wireTopic, event: 'presence_state', payload: { current: peer('valid') } });
    const clean = input === 'diff' ? ['current'] : ['current', 'early'];
    expect(snapshots).toEqual([clean]);

    receive({ topic: wireTopic, event: 'presence_diff',
      payload: { joins: { another: peer('new') }, leaves: {} } });
    receive({ topic: wireTopic, event: 'presence_diff',
      payload: { joins: {}, leaves: { current: peer('valid') } } });
    expect(snapshots).toEqual([clean, [...clean, 'another'], [...clean.slice(1), 'another']]);
  } finally {
    handle.dispose();
    client.disconnect();
    jest.useRealTimers();
  }
});
