import type { SupabaseClient } from '@supabase/supabase-js';
import { createResilientChannel, REALTIME_LIB_GRACE_MS } from './realtime-recovery';
import { makeFakeRealtimeClient } from './realtime-recovery.test-utils';

function setup() {
  const { client, created } = makeFakeRealtimeClient();
  const onState = jest.fn();
  const onSubscribed = jest.fn();
  const handle = createResilientChannel(client as unknown as SupabaseClient, {
    topic: 'presence:test',
    config: { config: { presence: { key: 'u1' } } },
    bind: (channel) => {
      channel.on('presence', { event: 'sync' }, () => {});
    },
    onSubscribed,
    onState,
  });
  return { client, created, onState, onSubscribed, handle };
}

describe('createResilientChannel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens a channel, binds it and reports the subscription', () => {
    const { created, onState, onSubscribed } = setup();

    expect(created).toHaveLength(1);
    expect(created[0].bindings).toEqual(['presence']);
    expect(onState).toHaveBeenCalledWith('connecting');

    created[0].emit('SUBSCRIBED');
    expect(onState).toHaveBeenLastCalledWith('subscribed');
    expect(onSubscribed).toHaveBeenCalledWith(created[0]);
  });

  // LE bug : realtime-js retire un canal CLOSED de socket.channels et remet son rejoinTimer
  // à zéro — plus rien ne le ressuscite. Seul un canal NEUF récupère le temps réel.
  it('builds a brand new channel after a terminal CLOSED', () => {
    const { client, created, onState } = setup();
    created[0].emit('SUBSCRIBED');

    created[0].emit('CLOSED');
    expect(onState).toHaveBeenLastCalledWith('closed');
    expect(created).toHaveLength(1); // pas encore : on laisse passer le pas de backoff

    jest.advanceTimersByTime(1_000);
    expect(created).toHaveLength(2);
    expect(created[1]).not.toBe(created[0]);
    expect(created[1].bindings).toEqual(['presence']); // les handlers sont réinstallés
    expect(client.removeChannel).toHaveBeenCalledWith(created[0]);
  });

  it('leaves the library its own rejoin window on CHANNEL_ERROR, then takes over', () => {
    const { created, onState } = setup();
    created[0].emit('SUBSCRIBED');

    created[0].emit('CHANNEL_ERROR');
    expect(onState).toHaveBeenLastCalledWith('error');

    jest.advanceTimersByTime(REALTIME_LIB_GRACE_MS - 1_000);
    expect(created).toHaveLength(1); // le rejoinTimer de realtime-js a encore la main

    jest.advanceTimersByTime(1_000);
    expect(created).toHaveLength(2);
  });

  it('cancels its takeover when the library rejoins on its own', () => {
    const { created } = setup();
    created[0].emit('CHANNEL_ERROR');
    created[0].emit('SUBSCRIBED'); // rejoin interne réussi

    jest.advanceTimersByTime(120_000);
    expect(created).toHaveLength(1);
  });

  it('retryNow rebuilds immediately, without waiting for the backoff', () => {
    const { created, handle } = setup();
    created[0].emit('CHANNEL_ERROR');

    handle.retryNow();
    expect(created).toHaveLength(2);
  });

  it('retries when the tab comes back to the foreground', () => {
    const { created } = setup();
    created[0].emit('SUBSCRIBED');
    created[0].emit('CLOSED');

    document.dispatchEvent(new Event('visibilitychange'));
    expect(created).toHaveLength(2);
  });

  it('stays put when the tab comes back and the channel is healthy', () => {
    const { created } = setup();
    created[0].emit('SUBSCRIBED');

    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(created).toHaveLength(1);
  });

  // realtime-js rend le MÊME canal tant que le précédent n'a pas fini de quitter le topic ;
  // or subscribe() est un no-op hors état "closed" — s'y abonner serait un abonnement muet.
  it('reschedules instead of subscribing into the void when the topic is still busy', () => {
    const { client, created } = setup();
    const corpse = created[0];
    corpse.emit('CLOSED');
    client.removeChannel.mockImplementationOnce(async () => {
      client.keepTopicBusy(corpse);
      return 'ok';
    });

    jest.advanceTimersByTime(1_000);
    expect(created).toHaveLength(1);
    expect(corpse.subscribe).toHaveBeenCalledTimes(1); // pas de second subscribe muet

    jest.advanceTimersByTime(2_000); // pas de backoff suivant : le topic s'est libéré
    expect(created).toHaveLength(2);
  });

  it('dispose tears the channel down and stops every retry', () => {
    const { client, created, handle } = setup();
    created[0].emit('SUBSCRIBED');

    handle.dispose();
    expect(created[0].untrack).toHaveBeenCalled();
    expect(created[0].unsubscribe).toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledWith(created[0]);

    created[0].emit('CLOSED');
    jest.advanceTimersByTime(120_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(created).toHaveLength(1);
  });
});
