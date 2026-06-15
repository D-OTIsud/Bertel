import { useEffect, useState } from 'react';
import { usePresenceRoom } from '../../../hooks/usePresenceRoom';

interface PresenceRailProps {
  objectId: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
// Minute-granular label, so a 30s refresh keeps it accurate without churning renders.
const TICK_MS = 30_000;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Human-readable "how long this editor has been in the room" label.
 * Returns null when the join time is unknown (e.g. an older client that did not broadcast it).
 */
export function formatPresenceDuration(onlineSince: number | undefined, now: number): string | null {
  if (onlineSince == null || !Number.isFinite(onlineSince)) {
    return null;
  }

  const elapsedMs = Math.max(0, now - onlineSince);
  const totalMinutes = Math.floor(elapsedMs / MINUTE_MS);

  if (totalMinutes < 1) {
    return "à l'instant";
  }
  if (elapsedMs < HOUR_MS) {
    return `depuis ${totalMinutes} min`;
  }

  const hours = Math.floor(elapsedMs / HOUR_MS);
  const minutes = totalMinutes - hours * 60;
  return minutes === 0 ? `depuis ${hours} h` : `depuis ${hours} h ${minutes} min`;
}

export function PresenceRail({ objectId }: PresenceRailProps) {
  const { peers, typingUsers } = usePresenceRoom(`room:${objectId}`);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

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
