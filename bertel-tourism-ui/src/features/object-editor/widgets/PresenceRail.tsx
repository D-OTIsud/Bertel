import { usePresenceRoom } from '../../../hooks/usePresenceRoom';

interface PresenceRailProps {
  objectId: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function PresenceRail({ objectId }: PresenceRailProps) {
  const { peers, typingUsers } = usePresenceRoom(`room:${objectId}`);

  return (
    <div className="card">
      <h4>
        En cours d'édition <span className="small-act">Live</span>
      </h4>
      {peers.length === 0 ? (
        <p className="rail-empty">Aucun autre éditeur connecté.</p>
      ) : (
        peers.map((peer, index) => (
          <div key={`${peer.userId}-${index}`} className="peer">
            <span className="peer__av" style={{ background: peer.color || 'var(--accent)' }}>
              {initials(peer.name) || '?'}
            </span>
            <span className="peer__body">
              <strong>{peer.name}</strong>
              <small>{peer.userId}</small>
            </span>
            {typingUsers.includes(peer.name) && <span className="tag-mini">is editing</span>}
          </div>
        ))
      )}
    </div>
  );
}
