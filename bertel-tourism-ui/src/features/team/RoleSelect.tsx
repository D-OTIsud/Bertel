'use client';
import type { RefRole } from '@/services/rbac';

/**
 * Returns the subset of roles the caller may assign.
 * Business roles (rank == null) are always assignable.
 * Admin roles are assignable only when their rank is strictly below the caller's rank.
 */
export function filterAssignableRoles(options: RefRole[], callerRank: number): RefRole[] {
  return options.filter((o) => o.rank == null || o.rank < callerRank);
}

export function RoleSelect({ value, options, callerRank, disabled, includeNone, label, onChange }: {
  value: string | null;
  options: RefRole[];               // business roles (rank null) OR admin roles (rank set)
  callerRank: number;               // caller's admin rank (superuser → pass Infinity)
  disabled?: boolean;
  includeNone?: boolean;            // admin role can be "none"
  /** Étiquette accessible (le <th> de colonne n'est pas associé programmatiquement). */
  label?: string;
  onChange: (code: string | null) => void;
}) {
  const assignable = filterAssignableRoles(options, callerRank);
  return (
    <select className="select" aria-label={label} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      {includeNone && <option value="">— aucun —</option>}
      {assignable.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
    </select>
  );
}
