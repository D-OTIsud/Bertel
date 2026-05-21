interface ToggleProps {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ label, sub, on, onChange }: ToggleProps) {
  return (
    <button type="button" aria-label={label} className={`tog${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <div>
        {label}
        {sub && <small>{sub}</small>}
      </div>
      <span className="tog__sw" />
    </button>
  );
}
