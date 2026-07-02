export interface SelectOption {
  v: string;
  l: string;
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
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o, i) => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        return (
          <option key={`${v}-${i}`} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}
