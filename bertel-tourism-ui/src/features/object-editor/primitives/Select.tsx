export interface SelectOption {
  v: string;
  l: string;
}

interface SelectProps {
  value: string;
  options: (string | SelectOption)[];
  onChange: (next: string) => void;
  'aria-label'?: string;
}

export function Select({ value, options, onChange, 'aria-label': ariaLabel }: SelectProps) {
  return (
    <select className="select" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
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
