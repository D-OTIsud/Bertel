export interface SelectOption {
  v: string;
  l: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: (string | SelectOption)[];
  onChange: (next: string) => void;
  /** Injecté par <Field> (D2) : association label↔contrôle. */
  id?: string;
  'aria-label'?: string;
  /** Injectés par <Field> (D2) : erreur / hint accessibles. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

export function Select({
  value,
  options,
  onChange,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: SelectProps) {
  return (
    <select
      className="select"
      value={value}
      id={id}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      aria-required={ariaRequired}
      onChange={(e) => {
        const next = e.target.value;
        const option = options.find((item) => (typeof item === 'string' ? item : item.v) === next);
        if (typeof option !== 'string' && option?.disabled) return;
        if (next === value && option === undefined) return;
        onChange(next);
      }}
    >
      {options.map((o, i) => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        const disabled = typeof o !== 'string' && o.disabled;
        return (
          <option key={`${v}-${i}`} value={v} disabled={disabled}>
            {l}{disabled ? v === value ? ' — à requalifier' : ' — indisponible' : ''}
          </option>
        );
      })}
      {value !== '' && !options.some((option) => (typeof option === 'string' ? option : option.v) === value)
        && <option value={value} disabled>{value} — à requalifier</option>}
    </select>
  );
}
