import { initials } from '../../../lib/presence';
import type { EditorPeer } from '../presence/editor-presence';

interface SectionPresenceBadgeProps {
  peers: EditorPeer[];
}

const MAX_VISIBLE = 3;

/**
 * Per-section badge: the other editors currently on this section. Shows an "édite" marker
 * when at least one of them holds unsaved edits on the fiche (honest fiche-level signal —
 * see editor-presence.ts on why this is not a per-section claim).
 */
export function SectionPresenceBadge({ peers }: SectionPresenceBadgeProps) {
  if (peers.length === 0) {
    return null;
  }

  const visible = peers.slice(0, MAX_VISIBLE);
  const overflow = peers.length - visible.length;
  const editing = peers.some((peer) => peer.editing);
  const names = peers.map((peer) => peer.name).join(', ');

  return (
    <span className="section-presence" title={`${names} sur cette section`}>
      <span className="section-presence__stack">
        {visible.map((peer) => (
          <span
            key={peer.userId}
            className="section-presence__chip"
            style={{ background: peer.color || 'var(--accent)' }}
          >
            {initials(peer.name) || '?'}
          </span>
        ))}
        {overflow > 0 ? <span className="section-presence__chip is-overflow">+{overflow}</span> : null}
      </span>
      {editing ? <span className="section-presence__editing">édite</span> : null}
    </span>
  );
}
