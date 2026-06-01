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
  /** Accessible label for the textarea when no visible `<label>` is associated via htmlFor. */
  'aria-label'?: string;
  'data-testid'?: string;
}

export function Textarea({ value, onChange, placeholder, disabled, rows, rich, count, max = 300, 'aria-label': ariaLabel, 'data-testid': testId }: TextareaProps) {
  const len = value?.length ?? 0;
  return (
    <>
      <textarea
        className={`textarea${rich ? ' rich' : ''}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        style={rows ? { minHeight: rows * 18 } : undefined}
        aria-label={ariaLabel}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      />
      {count && <div className={`char-count${len > max ? ' over' : ''}`}>{len} / {max} caractères</div>}
    </>
  );
}
