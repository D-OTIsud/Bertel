'use client';
import { Select } from '@/components/ui/select';
import type { RefRole } from '@/services/rbac';

export function RoleSelect({ value, options, callerRank, disabled, includeNone, onChange }: {
  value: string | null;
  options: RefRole[];               // business roles (rank null) OR admin roles (rank set)
  callerRank: number;               // caller's admin rank (superuser → pass Infinity)
  disabled?: boolean;
  includeNone?: boolean;            // admin role can be "none"
  onChange: (code: string | null) => void;
}) {
  // Admin roles: only ranks strictly below the caller's are assignable.
  const assignable = options.filter((o) => o.rank == null || o.rank < callerRank);
  return (
    <Select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      {includeNone && <option value="">— aucun —</option>}
      {assignable.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
    </Select>
  );
}
