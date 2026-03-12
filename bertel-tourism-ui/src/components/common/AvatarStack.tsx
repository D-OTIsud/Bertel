import type { PresenceMember } from '../../types/domain';

interface AvatarStackProps {
  people: PresenceMember[];
}

export function AvatarStack({ people }: AvatarStackProps) {
  return (
    <div className="avatar-stack" aria-label="Utilisateurs presents">
      {people.map((person) => (
        <span
          key={person.userId}
          className="avatar-chip"
          style={{ backgroundColor: person.color }}
          title={person.name}
        >
          {person.avatar}
        </span>
      ))}
    </div>
  );
}