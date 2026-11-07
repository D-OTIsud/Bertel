import { useCallback, useMemo, useState } from 'react';
import { usePresenceRoom } from '../../../hooks/usePresenceRoom';
import { useSessionStore } from '../../../store/session-store';
import {
  computeRoster,
  derivePeerSavedNotice,
  groupPeersBySection,
  hasUnsavedEdits,
  type EditorPeer,
  type PeerSavedEvent,
  type PeerSavedNotice,
  type RosterEntry,
} from './editor-presence';

/** Broadcast event a peer sends after a successful save of the fiche. */
const SAVED_EVENT = 'object:saved';
// Module constant ⇒ referentially stable, so usePresenceRoom never resubscribes on it.
const SUBSCRIBE_EVENTS = [SAVED_EVENT] as const;
// Demo-only: sections the mock editors are scattered onto so the showcase shows badges.
const DEMO_SHOWCASE_SECTIONS = ['06', '13', '03'];

/**
 * Demo showcase: give the mock editors (which have no real `activeSection`) a section so
 * the per-section badges are visible without a second live client. No-op for real peers
 * (anyone who already carries an activeSection) and the current user.
 */
function scatterDemoPeers(peers: readonly EditorPeer[], selfId: string): EditorPeer[] {
  let placed = 0;
  return peers.map((peer) => {
    if (peer.activeSection || peer.userId === selfId) {
      return peer;
    }
    const section = DEMO_SHOWCASE_SECTIONS[placed % DEMO_SHOWCASE_SECTIONS.length];
    placed += 1;
    return { ...peer, activeSection: section, editing: placed % 2 === 1 };
  });
}

interface EditorPresenceExtra extends Record<string, unknown> {
  activeSection: string;
  editing: boolean;
}

interface UseEditorPresenceArgs {
  objectId: string;
  /** The section the current user is on (from the scroll spy). */
  activeSection: string;
  /** The editor's dirty-module map (`editor.dirtySections`). */
  dirtySections: Partial<Record<string, boolean>>;
}

export interface UseEditorPresenceResult {
  /** All people on the fiche (self first), for the save-bar band. */
  roster: RosterEntry[];
  /** Other editors grouped by the section they are on, for per-section badges. */
  peersBySection: Record<string, EditorPeer[]>;
  /** A non-self peer's save to warn about, or null. */
  savedNotice: PeerSavedNotice | null;
  dismissSavedNotice: () => void;
  /** Announce a successful save to the other editors of this fiche. */
  broadcastSaved: (modules: string[]) => void;
}

/**
 * Editor-room presence: composes `usePresenceRoom` with the editor's active section,
 * dirty state, and save signal. The single presence piece the full-page editor consumes.
 */
export function useEditorPresence({
  objectId,
  activeSection,
  dirtySections,
}: UseEditorPresenceArgs): UseEditorPresenceResult {
  const selfId = useSessionStore((state) => state.userId) ?? 'anonymous';
  const userName = useSessionStore((state) => state.userName);
  const demoMode = useSessionStore((state) => state.demoMode);
  const [savedEvent, setSavedEvent] = useState<PeerSavedEvent | null>(null);

  const editing = hasUnsavedEdits(dirtySections);
  const trackExtra = useMemo<EditorPresenceExtra>(
    () => ({ activeSection, editing }),
    [activeSection, editing],
  );

  const handleEvent = useCallback((event: string, payload: unknown) => {
    if (event !== SAVED_EVENT || !payload || typeof payload !== 'object') {
      return;
    }
    const candidate = payload as Partial<PeerSavedEvent>;
    if (
      typeof candidate.userId === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.at === 'number'
    ) {
      setSavedEvent({ userId: candidate.userId, name: candidate.name, at: candidate.at });
    }
  }, []);

  const { peers, broadcast } = usePresenceRoom<EditorPresenceExtra>(`room:${objectId}`, {
    trackExtra,
    subscribeEvents: SUBSCRIBE_EVENTS,
    onEvent: handleEvent,
  });

  const displayPeers = useMemo(
    () => (demoMode ? scatterDemoPeers(peers, selfId) : peers),
    [peers, demoMode, selfId],
  );
  const roster = useMemo(() => computeRoster(displayPeers, selfId), [displayPeers, selfId]);
  const peersBySection = useMemo(
    () => groupPeersBySection(displayPeers, selfId),
    [displayPeers, selfId],
  );
  const savedNotice = useMemo(() => derivePeerSavedNotice(savedEvent, selfId), [savedEvent, selfId]);

  const dismissSavedNotice = useCallback(() => setSavedEvent(null), []);

  const broadcastSaved = useCallback(
    (modules: string[]) => {
      void broadcast(SAVED_EVENT, {
        userId: selfId,
        name: userName || 'Un collègue',
        at: Date.now(),
        modules,
      });
    },
    [broadcast, selfId, userName],
  );

  return { roster, peersBySection, savedNotice, dismissSavedNotice, broadcastSaved };
}
