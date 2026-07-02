import type { ReactNode } from 'react';

interface InputProps {
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'date' | 'time' | 'number' | 'datetime-local';
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  mono?: boolean;
  lg?: boolean;
  readOnly?: boolean;
  onBlur?: () => void;
  /** Injecté par <Field> (D2) : association label↔contrôle. */
  id?: string;
  /** Accessible label for the input when no visible `<label>` is associated via htmlFor. */
  'aria-label'?: string;
  /** Injectés par <Field> (D2) : erreur / hint accessibles. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

export function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  prefix,
  suffix,
  mono,
  lg,
  readOnly,
  onBlur,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
}: InputProps) {
  const cls = `input${mono ? ' mono' : ''}${lg ? ' lg' : ''}${prefix ? ' has-prefix' : ''}${suffix ? ' has-suffix' : ''}`;
  const field = (
    <input
      type={type}
      className={cls}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      id={id}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      aria-required={ariaRequired}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  );
  if (!prefix && !suffix) {
    return field;
  }
  return (
    <div className="input-wrap">
      {prefix && <span className="prefix">{prefix}</span>}
      {field}
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}
