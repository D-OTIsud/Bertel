import type { PresenceMember } from '../../../types/domain';

/**
 * A presence member in the editor room, enriched with the editor-specific payload
 * published via `usePresenceRoom`'s `trackExtra`: the section the peer is currently on,
 * and whether they hold unsaved edits anywhere on the fiche.
 *
 * `editing` is a fiche-level boolean (NOT a per-section claim): the module→section
 * mapping is not 1:1 (e.g. §16 Places shares the `descriptions` module with §04, the §06
 * type block spans rooms/activity/event/itinerary by archetype), so a precise per-section
 * "édite" would lie. The honest signal is "this peer is positioned here AND is editing the
 * fiche". A precise per-section marker is a future refinement.
 */
export interface EditorPeer extends PresenceMember {
  activeSection?: string;
  editing?: boolean;
}

export interface RosterEntry extends PresenceMember {
  isSelf: boolean;
}

export interface PeerSavedEvent {
  userId: string;
  name: string;
  /** Epoch ms when the peer's save completed. */
  at: number;
}

export interface PeerSavedNotice {
  name: string;
  at: number;
}

/**
 * Group the OTHER editors (self excluded) by the section they are currently on.
 * Peers without an `activeSection` are ignored; multiple connections of one person
 * (several tabs) collapse to a single entry per section.
 */
export function groupPeersBySection(
  peers: readonly EditorPeer[],
  selfId: string,
): Record<string, EditorPeer[]> {
  const groups: Record<string, EditorPeer[]> = {};
  const seenPerSection: Record<string, Set<string>> = {};

  for (const peer of peers) {
    if (peer.userId === selfId || !peer.activeSection) {
      continue;
    }
    const section = peer.activeSection;
    const seen = (seenPerSection[section] ??= new Set<string>());
    if (seen.has(peer.userId)) {
      continue;
    }
    seen.add(peer.userId);
    (groups[section] ??= []).push(peer);
  }

  return groups;
}

/**
 * The fiche-level roster for the save-bar band: one entry per person (connections
 * deduped), the current user first and flagged `isSelf`, the rest in arrival order.
 */
export function computeRoster(peers: readonly EditorPeer[], selfId: string): RosterEntry[] {
  const seen = new Set<string>();
  const self: RosterEntry[] = [];
  const others: RosterEntry[] = [];

  for (const peer of peers) {
    if (seen.has(peer.userId)) {
      continue;
    }
    seen.add(peer.userId);
    const entry: RosterEntry = { ...peer, isSelf: peer.userId === selfId };
    (entry.isSelf ? self : others).push(entry);
  }

  return [...self, ...others];
}

/** True when at least one module carries unsaved edits. */
export function hasUnsavedEdits(dirtySections: Partial<Record<string, boolean>>): boolean {
  return Object.values(dirtySections).some(Boolean);
}

/**
 * Decide whether the "a peer just saved this fiche" banner should show. Returns null
 * for the current user's own save (defence in depth over the channel's `broadcast.self:false`).
 */
export function derivePeerSavedNotice(
  event: PeerSavedEvent | null,
  selfId: string,
): PeerSavedNotice | null {
  if (!event || event.userId === selfId) {
    return null;
  }
  return { name: event.name, at: event.at };
}
