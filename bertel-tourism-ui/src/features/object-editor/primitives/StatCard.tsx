interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
  /** Design ref: stepper controls — placeholder until wired. */
  hasStep?: boolean;
}

export function StatCard({ label, value, suffix, hasStep }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__row">
        <span className="stat-card__value">
          {value}
          {suffix && <small className="stat-card__suffix"> {suffix}</small>}
        </span>
        {hasStep && (
          <div className="stat-card__step" aria-hidden>
            <button type="button" className="icbtn" disabled tabIndex={-1}>
              −
            </button>
            <button type="button" className="icbtn" disabled tabIndex={-1}>
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
