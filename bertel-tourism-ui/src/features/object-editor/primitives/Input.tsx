import type { ReactNode } from 'react';

interface InputProps {
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'date' | 'time' | 'number';
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  mono?: boolean;
  lg?: boolean;
  readOnly?: boolean;
  /** Accessible label for the input when no visible `<label>` is associated via htmlFor. */
  'aria-label'?: string;
}

export function Input({ value, onChange, type = 'text', placeholder, prefix, suffix, mono, lg, readOnly, 'aria-label': ariaLabel }: InputProps) {
  const cls = `input${mono ? ' mono' : ''}${lg ? ' lg' : ''}${prefix ? ' has-prefix' : ''}${suffix ? ' has-suffix' : ''}`;
  const field = (
    <input
      type={type}
      className={cls}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
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
