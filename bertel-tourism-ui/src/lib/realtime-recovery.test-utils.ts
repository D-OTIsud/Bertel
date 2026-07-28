/**
 * Faux client realtime partagé par les tests de reprise de canal.
 *
 * Il reproduit les DEUX comportements de realtime-js (2.99.1) dont dépend la
 * reconstruction d'un canal mort :
 *  - `channel(topic)` RÉUTILISE un canal existant de même topic — il ne crée un objet
 *    neuf que si le topic est libre ;
 *  - `removeChannel(chan)` retire le canal de la liste, libérant le topic.
 */

export interface FakeRealtimeChannel {
  topic: string;
  /** Types d'événements passés à `.on(...)`, dans l'ordre d'installation. */
  bindings: string[];
  /** Déclenche le callback de `subscribe()` avec un statut realtime. */
  emit: (status: string) => void;
  /** Rejoue le handler `.on('presence', { event: 'sync' })`. */
  syncPresence: () => void;
  on: jest.Mock;
  subscribe: jest.Mock;
  track: jest.Mock;
  untrack: jest.Mock;
  unsubscribe: jest.Mock;
  send: jest.Mock;
  presenceState: jest.Mock;
}

export function makeFakeRealtimeClient() {
  const live = new Map<string, FakeRealtimeChannel>();
  /** Tous les canaux créés depuis le début, dans l'ordre : `created[1]` = reconstruit. */
  const created: FakeRealtimeChannel[] = [];

  const client = {
    channel: jest.fn((topic: string) => {
      const existing = live.get(topic);
      if (existing) return existing;

      let statusCallback: ((status: string) => void) | null = null;
      let presenceSync: (() => void) | null = null;

      const chan: FakeRealtimeChannel = {
        topic,
        bindings: [],
        emit: (status) => statusCallback?.(status),
        syncPresence: () => presenceSync?.(),
        on: jest.fn((type: string, filter: { event?: string }, handler: () => void) => {
          chan.bindings.push(type);
          if (type === 'presence' && filter?.event === 'sync') presenceSync = handler;
          return chan;
        }),
        subscribe: jest.fn((cb: (status: string) => void) => {
          statusCallback = cb;
          return chan;
        }),
        track: jest.fn().mockResolvedValue('ok'),
        untrack: jest.fn().mockResolvedValue('ok'),
        unsubscribe: jest.fn().mockResolvedValue('ok'),
        send: jest.fn().mockResolvedValue('ok'),
        presenceState: jest.fn(() => ({})),
      };

      live.set(topic, chan);
      created.push(chan);
      return chan;
    }),
    removeChannel: jest.fn(async (chan: FakeRealtimeChannel) => {
      live.delete(chan.topic);
      return 'ok';
    }),
    /** Simule un canal qui n'a pas fini de quitter le topic (phx_leave en vol). */
    keepTopicBusy: (chan: FakeRealtimeChannel) => live.set(chan.topic, chan),
  };

  return { client, created };
}
