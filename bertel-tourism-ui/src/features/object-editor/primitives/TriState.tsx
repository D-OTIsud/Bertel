export type TriStateValue = 'yes' | 'conditional' | 'no';

interface TriStateProps {
  label: string;
  sub?: string;
  value: TriStateValue;
  onChange: (next: TriStateValue) => void;
}

const OPTIONS: Array<{ value: TriStateValue; label: string; tone: 'ok' | 'mid' | 'no' }> = [
  { value: 'yes', label: 'Oui', tone: 'ok' },
  { value: 'conditional', label: 'Cond.', tone: 'mid' },
  { value: 'no', label: 'Non', tone: 'no' },
];

export function TriState({ label, sub, value, onChange }: TriStateProps) {
  return (
    <div className="aud-row">
      <div className="aud-row__lbl">
        {label}
        {sub && <small>{sub}</small>}
      </div>
      <div className="tri">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? `is-on ${option.tone}` : ''}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
