import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
  /** Design ref: stepper controls — placeholder until wired. */
  hasStep?: boolean;
  /** Optional hover/focus popover content (e.g. the breakdown behind the value). */
  tooltip?: ReactNode;
  /** Accessible label for the info affordance when `tooltip` is set. */
  tooltipLabel?: string;
}

export function StatCard({ label, value, suffix, hasStep, tooltip, tooltipLabel }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">
        <span>{label}</span>
        {tooltip != null && (
          <span className="stat-card__info" tabIndex={0} role="note" aria-label={tooltipLabel ?? label}>
            <Info size={13} aria-hidden />
            <span className="stat-card__pop" role="tooltip">{tooltip}</span>
          </span>
        )}
      </div>
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
