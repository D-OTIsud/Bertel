import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
  /** Render the +/- stepper affordance. Inert (disabled) unless `onStep` is provided. */
  hasStep?: boolean;
  /** §111: wire the stepper. delta is +1 (plus) or -1 (minus). When set, the buttons are interactive. */
  onStep?: (delta: 1 | -1) => void;
  /** Optional hover/focus popover content (e.g. the breakdown behind the value). */
  tooltip?: ReactNode;
  /** Accessible label for the info affordance when `tooltip` is set. */
  tooltipLabel?: string;
}

export function StatCard({ label, value, suffix, hasStep, onStep, tooltip, tooltipLabel }: StatCardProps) {
  const interactive = onStep != null;
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
          <div className="stat-card__step" aria-hidden={!interactive}>
            <button
              type="button"
              className="icbtn"
              disabled={!interactive}
              tabIndex={interactive ? 0 : -1}
              aria-label={interactive ? `Diminuer ${label}` : undefined}
              onClick={interactive ? () => onStep(-1) : undefined}
            >
              −
            </button>
            <button
              type="button"
              className="icbtn"
              disabled={!interactive}
              tabIndex={interactive ? 0 : -1}
              aria-label={interactive ? `Augmenter ${label}` : undefined}
              onClick={interactive ? () => onStep(1) : undefined}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
