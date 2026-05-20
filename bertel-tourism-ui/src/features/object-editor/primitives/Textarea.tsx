interface TextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  rich?: boolean;
  count?: boolean;
  max?: number;
}

export function Textarea({ value, onChange, placeholder, rows, rich, count, max = 300 }: TextareaProps) {
  const len = value?.length ?? 0;
  return (
    <>
      <textarea
        className={`textarea${rich ? ' rich' : ''}`}
        value={value}
        placeholder={placeholder}
        style={rows ? { minHeight: rows * 18 } : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {count && <div className={`char-count${len > max ? ' over' : ''}`}>{len} / {max} caractères</div>}
    </>
  );
}
