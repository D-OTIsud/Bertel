interface TextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  rich?: boolean;
  count?: boolean;
  max?: number;
  /** Accessible label for the textarea when no visible `<label>` is associated via htmlFor. */
  'aria-label'?: string;
}

export function Textarea({ value, onChange, placeholder, rows, rich, count, max = 300, 'aria-label': ariaLabel }: TextareaProps) {
  const len = value?.length ?? 0;
  return (
    <>
      <textarea
        className={`textarea${rich ? ' rich' : ''}`}
        value={value}
        placeholder={placeholder}
        style={rows ? { minHeight: rows * 18 } : undefined}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
      {count && <div className={`char-count${len > max ? ' over' : ''}`}>{len} / {max} caractères</div>}
    </>
  );
}
