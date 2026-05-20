interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
}

export function StatCard({ label, value, suffix }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__row">
        <span className="stat-card__value">
          {value}
          {suffix && <small className="stat-card__suffix"> {suffix}</small>}
        </span>
      </div>
    </div>
  );
}
