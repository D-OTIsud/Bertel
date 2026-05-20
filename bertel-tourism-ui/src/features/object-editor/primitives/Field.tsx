import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, required, children }: FieldProps) {
  return (
    <div className="field">
      <div className="field__label">
        <span>
          {label}
          {required && <span className="req"> *</span>}
        </span>
        {hint && (
          <span className="help" title={hint}>
            ?
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
