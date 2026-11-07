import type { PresenceMember } from '../../types/domain';

interface AvatarStackProps {
  people: PresenceMember[];
}

export function AvatarStack({ people }: AvatarStackProps) {
  const visiblePeople = people.slice(0, 3);
  const overflow = people.length - visiblePeople.length;

  if (visiblePeople.length === 0) {
    return null;
  }

  return (
    <div className="avatar-stack" aria-label={`${people.length} utilisateurs presents`}>
      {visiblePeople.map((person) => (
        <span
          key={person.userId}
          className="avatar-chip"
          style={{ backgroundColor: person.color }}
          title={person.name}
        >
          {person.avatar}
        </span>
      ))}
      {overflow > 0 ? <span className="avatar-chip avatar-chip--overflow">+{overflow}</span> : null}
    </div>
  );
}
