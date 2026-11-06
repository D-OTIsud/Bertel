interface ToggleProps {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, sub, on, onChange, disabled }: ToggleProps) {
  return (
    <button type="button" aria-label={label} disabled={disabled && !on} className={`tog${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <div>
        {label}
        {sub && <small>{sub}</small>}
      </div>
      <span className="tog__sw" />
    </button>
  );
}
