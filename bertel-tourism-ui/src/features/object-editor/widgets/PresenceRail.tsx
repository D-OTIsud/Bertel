import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePresenceRoom } from '../../../hooks/usePresenceRoom';
import type { PresenceMember } from '../../../types/domain';
import { formatPresenceDuration, initials } from '../../../lib/presence';

interface PresenceRailProps {
  objectId: string;
}

// Minute-granular label, so a 30s refresh keeps it accurate without churning renders.
const TICK_MS = 30_000;
// How long the "X a quitté la page" snackbar stays up.
const PRESENCE_LEAVE_TOAST_MS = 5_000;

/**
 * Peers who were in the room on the previous sync but are gone now — the editors who just left.
 * Excludes the current user (self is never reported as "departed", e.g. on presence flapping).
 */
export function computeDepartedPeers(
  previous: PresenceMember[],
  next: PresenceMember[],
  selfUserId: string,
): PresenceMember[] {
  const presentIds = new Set(next.map((peer) => peer.userId));
  return previous.filter((peer) => peer.userId !== selfUserId && !presentIds.has(peer.userId));
}


export function PresenceRail({ objectId }: PresenceRailProps) {
  const { peers, me, typingUsers } = usePresenceRoom(`room:${objectId}`);
  const [now, setNow] = useState(() => Date.now());
  const previousPeersRef = useRef<PresenceMember[]>(peers);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Notify when another editor leaves the page. Compares each presence sync against the
  // previous one; no toast on first render (previous === current) or when a peer joins.
  useEffect(() => {
    const departed = computeDepartedPeers(previousPeersRef.current, peers, me?.userId ?? '');
    previousPeersRef.current = peers;
    departed.forEach((peer) => {
      toast(`${peer.name} a quitté la page`, { duration: PRESENCE_LEAVE_TOAST_MS });
    });
  }, [peers, me?.userId]);

  return (
    <div className="card">
      <h4>
        En cours d'édition <span className="small-act">Live</span>
      </h4>
      {peers.length === 0 ? (
        <p className="rail-empty">Aucun autre éditeur connecté.</p>
      ) : (
        peers.map((peer, index) => {
          const duration = formatPresenceDuration(peer.onlineSince, now);
          return (
            <div key={`${peer.userId}-${index}`} className="peer">
              <span className="peer__av" style={{ background: peer.color || 'var(--accent)' }}>
                {initials(peer.name) || '?'}
              </span>
              <span className="peer__body">
                <strong>{peer.name}</strong>
                {duration && <small>{duration}</small>}
              </span>
              {typingUsers.includes(peer.name) && <span className="tag-mini">is editing</span>}
            </div>
          );
        })
      )}
    </div>
  );
}
