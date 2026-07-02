interface TextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Disables the textarea (read-only layer indicator). Forwarded to the underlying <textarea>. */
  disabled?: boolean;
  rows?: number;
  rich?: boolean;
  count?: boolean;
  max?: number;
  /** Injecté par <Field> (D2) : association label↔contrôle. */
  id?: string;
  /** Accessible label for the textarea when no visible `<label>` is associated via htmlFor. */
  'aria-label'?: string;
  /** Injectés par <Field> (D2) : erreur / hint accessibles. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  'data-testid'?: string;
}

export function Textarea({
  value,
  onChange,
  placeholder,
  disabled,
  rows,
  rich,
  count,
  max = 300,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  'data-testid': testId,
}: TextareaProps) {
  const len = value?.length ?? 0;
  return (
    <>
      <textarea
        className={`textarea${rich ? ' rich' : ''}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        style={rows ? { minHeight: rows * 18 } : undefined}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      />
      {count && <div className={`char-count${len > max ? ' over' : ''}`}>{len} / {max} caractères</div>}
    </>
  );
}
