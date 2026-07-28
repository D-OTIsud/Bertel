import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeConnState } from './presence';

/**
 * Canal realtime qui se reconstruit tout seul.
 *
 * POURQUOI (realtime-js 2.99.1, vérifié dans la source) : un canal qui atteint l'état
 * CLOSED est DÉFINITIVEMENT mort. `RealtimeChannel._onClose` fait trois choses
 * irréversibles — `rejoinTimer.reset()`, `state = closed`, et surtout
 * `socket._remove(this)`. Sorti de `socket.channels`, le canal n'est plus servi par le
 * routage des messages (`_onConnMessage`), ni par la boucle de rejoin de la reconnexion
 * socket (`_onConnOpen`), ni par `_triggerChanError` ; et `_onError` sort tôt tant que
 * l'état est `closed`. AUCUN mécanisme de la librairie ne peut le ranimer : seul un
 * canal NEUF (`client.channel(topic)`) rétablit le temps réel. C'est la raison pour
 * laquelle une session ouverte longtemps finissait en « Temps réel interrompu »
 * jusqu'au rechargement complet de la page.
 *
 * CHANNEL_ERROR / TIMED_OUT sont un cas différent : là, le `rejoinTimer` de la
 * librairie retente tout seul et un rejoin réussi re-déclenche SUBSCRIBED. On lui
 * laisse donc sa fenêtre (REALTIME_LIB_GRACE_MS) avant d'intervenir — sinon on
 * détruirait un canal en cours de guérison à chaque micro-coupure réseau.
 */

/** Pas de backoff entre deux reconstructions. Plafond volontairement bas : une reprise
 *  ratée coûte une poignée de messages, pas des données. */
export const RECOVERY_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

/** Fenêtre laissée au rejoinTimer interne de realtime-js avant qu'on reconstruise. */
export const REALTIME_LIB_GRACE_MS = 20_000;

export interface ResilientChannelOptions {
  topic: string;
  /** Second argument de `client.channel(topic, …)`. */
  config?: Parameters<SupabaseClient['channel']>[1];
  /** Installe les handlers `.on(...)`. Rappelée à CHAQUE reconstruction. */
  bind: (channel: RealtimeChannel) => void;
  /** Appelée quand le canal est effectivement SUBSCRIBED (ex. `track` de présence). */
  onSubscribed?: (channel: RealtimeChannel) => void | Promise<void>;
  /** Notifie l'état de connexion (alimente la pastille réseau). */
  onState?: (state: RealtimeConnState) => void;
}

export interface ResilientChannelHandle {
  /** Reconstruit tout de suite, sans attendre le backoff (bouton « Reconnecter »). */
  retryNow: () => void;
  dispose: () => void;
}

export function createResilientChannel(
  client: SupabaseClient,
  options: ResilientChannelOptions,
): ResilientChannelHandle {
  let current: RealtimeChannel | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let subscribed = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleReopen = (minDelayMs = 0) => {
    if (disposed) return;
    clearTimer();
    const step = RECOVERY_BACKOFF_MS[Math.min(attempt, RECOVERY_BACKOFF_MS.length - 1)];
    attempt += 1;
    timer = setTimeout(open, Math.max(minDelayMs, step));
  };

  function open() {
    if (disposed) return;
    clearTimer();
    subscribed = false;

    const previous = current;
    current = null;
    if (previous) {
      // Indispensable : `client.channel(topic)` RÉUTILISE un canal existant de même
      // topic. Sans ce retrait, on récupérerait le cadavre au lieu d'un canal neuf.
      void client.removeChannel(previous);
    }

    options.onState?.('connecting');
    const channel = client.channel(options.topic, options.config);

    if (previous && channel === previous) {
      // Le canal précédent n'a pas encore fini de quitter le topic (phx_leave en vol) :
      // realtime-js nous rend le même objet, et `subscribe()` n'est un no-op silencieux
      // que hors état "closed". On retente au pas suivant plutôt que de s'abonner dans
      // le vide.
      current = previous;
      scheduleReopen();
      return;
    }

    current = channel;
    options.bind(channel);

    channel.subscribe((status) => {
      // Réponse tardive d'un canal déjà remplacé : elle ne doit plus piloter l'état.
      if (channel !== current || disposed) return;

      if (status === 'SUBSCRIBED') {
        subscribed = true;
        attempt = 0;
        clearTimer();
        options.onState?.('subscribed');
        void options.onSubscribed?.(channel);
        return;
      }

      subscribed = false;
      if (status === 'CLOSED') {
        options.onState?.('closed');
        scheduleReopen();
        return;
      }
      // CHANNEL_ERROR | TIMED_OUT : la librairie retente d'abord toute seule.
      options.onState?.('error');
      scheduleReopen(REALTIME_LIB_GRACE_MS);
    });
  }

  const retryNow = () => {
    if (disposed) return;
    attempt = 0;
    open();
  };

  // Retour d'onglet / retour de réseau : les deux moments où l'utilisateur constate la
  // panne. On ne reconstruit que si le canal n'est pas déjà sain.
  const retryIfBroken = () => {
    if (disposed || subscribed) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    retryNow();
  };

  window.addEventListener('online', retryIfBroken);
  document.addEventListener('visibilitychange', retryIfBroken);

  open();

  return {
    retryNow,
    dispose: () => {
      disposed = true;
      clearTimer();
      window.removeEventListener('online', retryIfBroken);
      document.removeEventListener('visibilitychange', retryIfBroken);
      const channel = current;
      current = null;
      if (channel) {
        void channel.untrack();
        void channel.unsubscribe();
        void client.removeChannel(channel);
      }
    },
  };
}
