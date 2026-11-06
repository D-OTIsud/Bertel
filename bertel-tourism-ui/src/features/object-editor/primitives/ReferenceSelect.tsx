import type { WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface ReferenceSelectProps {
  value: string;
  options: (WorkspaceReferenceOption & { disabled?: boolean })[];
  onChange: (code: string, option: WorkspaceReferenceOption | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  /** Accessible label when no visible `<label>` is associated via htmlFor. */
  'aria-label'?: string;
}

/**
 * <select> bound to workspace reference data. Always renders the current value —
 * a code absent from `options` (stale/legacy data) is shown as its own entry
 * rather than collapsing the control to a blank selection.
 */
export function ReferenceSelect({
  value,
  options,
  onChange,
  allowEmpty = false,
  emptyLabel = '—',
  placeholder,
  'aria-label': ariaLabel,
}: ReferenceSelectProps) {
  const known = options.some((o) => o.code === value);
  return (
    <select
      className="select"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = e.target.value;
        const option = options.find((o) => o.code === next);
        if (option?.disabled || (next === value && !option)) return;
        onChange(next, option ?? null);
      }}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {!allowEmpty && value === '' && placeholder && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map((o) => (
        <option key={o.id || o.code} value={o.code} disabled={o.disabled}>
          {o.label}{o.disabled ? o.code === value ? ' — à requalifier' : ' — indisponible' : ''}
        </option>
      ))}
      {!known && value !== '' && <option value={value} disabled>{value} — à requalifier</option>}
    </select>
  );
}
