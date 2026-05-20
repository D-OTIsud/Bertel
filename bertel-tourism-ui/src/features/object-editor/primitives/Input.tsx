import type { ReactNode } from 'react';

interface InputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  mono?: boolean;
  lg?: boolean;
  readOnly?: boolean;
}

export function Input({ value, onChange, placeholder, prefix, suffix, mono, lg, readOnly }: InputProps) {
  const cls = `input${mono ? ' mono' : ''}${lg ? ' lg' : ''}${prefix ? ' has-prefix' : ''}${suffix ? ' has-suffix' : ''}`;
  const field = (
    <input
      className={cls}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
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
