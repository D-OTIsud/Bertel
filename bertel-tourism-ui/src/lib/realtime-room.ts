import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useSessionStore } from '../store/session-store';
import type { PresenceMember } from '../types/domain';
import { createResilientChannel, type ResilientChannelHandle } from './realtime-recovery';
import { readRealtimePresence, realtimeScopeKey } from './realtime-scope';

const roomEvents = ['field:lock', 'field:unlock', 'typing', 'object:saved'] as const;
type RoomEvent = typeof roomEvents[number];

interface RoomSubscriber {
  editor: boolean;
  payload: () => PresenceMember;
  onPresence: (state: ReturnType<typeof readRealtimePresence>) => void;
  onBroadcast: (event: RoomEvent, payload: unknown) => void;
}

interface Room {
  scope: string;
  subscribers: Set<RoomSubscriber>;
  channel: RealtimeChannel | null;
  subscribed: boolean;
  handle?: ResilientChannelHandle;
}

const byClient = new WeakMap<SupabaseClient, Map<string, Room>>();

function tracker(room: Room): RoomSubscriber | undefined {
  const subscribers = [...room.subscribers];
  return subscribers.find((subscriber) => subscriber.editor) ?? subscribers[0];
}

function track(room: Room) {
  const subscriber = tracker(room);
  if (subscriber && room.subscribed) void room.channel?.track(subscriber.payload());
}

/** The SDK reuses a Channel per topic. The editor, rail and preview therefore
 * share its handlers and leave it only after the last view releases it. */
export function joinRealtimeRoom(client: SupabaseClient, topic: string, scope: string, userId: string, subscriber: RoomSubscriber) {
  const rooms = byClient.get(client) ?? new Map<string, Room>();
  byClient.set(client, rooms);
  const existing = rooms.get(topic);
  if (existing && existing.scope !== scope) {
    existing.handle?.dispose();
    rooms.delete(topic);
  }
  const current = rooms.get(topic);
  const room: Room = current ?? { scope, subscribers: new Set(), channel: null, subscribed: false };
  const isCurrent = () => rooms.get(topic) === room && realtimeScopeKey(useSessionStore.getState()) === scope;
  room.subscribers.add(subscriber);

  if (current) {
    if (room.channel && room.subscribed && isCurrent()) {
      subscriber.onPresence(readRealtimePresence(room.channel.presenceState()));
      if (tracker(room) === subscriber) track(room);
    }
  } else {
    rooms.set(topic, room);
    room.handle = createResilientChannel(client, {
      topic,
      config: { config: { private: true, presence: { key: userId }, broadcast: { self: false } } },
      canOpen: isCurrent,
      bind: (channel) => {
        room.channel = channel;
        const acceptsEvents = () => isCurrent() && room.channel === channel;
        channel.on('presence', { event: 'sync' }, () => {
          if (!acceptsEvents()) return;
          const state = readRealtimePresence(channel.presenceState());
          for (const view of room.subscribers) view.onPresence(state);
        });
        // CRM has no application broadcast sender or handler.
        if (!topic.startsWith('room:')) return;
        for (const event of roomEvents) {
          channel.on('broadcast', { event }, ({ payload }) => {
            if (!acceptsEvents()) return;
            for (const view of room.subscribers) view.onBroadcast(event, payload);
          });
        }
      },
      onSubscribed: () => track(room),
      onState: (state) => { room.subscribed = state === 'subscribed'; },
    });
  }

  const isMember = () => isCurrent() && room.subscribers.has(subscriber);
  return {
    updatePresence: () => {
      if (isMember() && tracker(room) === subscriber) track(room);
    },
    send: async (event: RoomEvent, payload: unknown) => {
      if (isMember() && room.subscribed) await room.channel?.send({ type: 'broadcast', event, payload });
    },
    dispose: () => {
      const wasTracker = tracker(room) === subscriber;
      if (!room.subscribers.delete(subscriber) || rooms.get(topic) !== room) return;
      if (room.subscribers.size === 0) {
        rooms.delete(topic);
        room.handle?.dispose();
      } else if (wasTracker && isCurrent()) {
        track(room);
      }
    },
  };
}
