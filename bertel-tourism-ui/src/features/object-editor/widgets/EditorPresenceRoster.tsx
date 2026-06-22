import { initials } from '../../../lib/presence';
import type { RosterEntry } from '../presence/editor-presence';

interface EditorPresenceRosterProps {
  roster: RosterEntry[];
}

/**
 * Save-bar band: stacked avatars of everyone currently on the fiche + a "N live" count.
 * Stays quiet when the user is alone (only renders once a second editor is present).
 */
export function EditorPresenceRoster({ roster }: EditorPresenceRosterProps) {
  if (roster.length < 2) {
    return null;
  }

  return (
    <div className="editor-roster" aria-label={`${roster.length} personnes sur la fiche`}>
      <span className="editor-roster__stack">
        {roster.map((member) => (
          <span
            key={member.userId}
            className={`editor-roster__chip${member.isSelf ? ' is-self' : ''}`}
            style={{ background: member.color || 'var(--accent)' }}
            title={member.isSelf ? `${member.name} · Vous` : member.name}
          >
            {initials(member.name) || '?'}
          </span>
        ))}
      </span>
      <span className="editor-roster__count">{roster.length} live</span>
    </div>
  );
}
