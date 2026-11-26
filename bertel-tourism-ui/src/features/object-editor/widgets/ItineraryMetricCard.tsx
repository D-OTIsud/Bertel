import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onStep: (delta: 1 | -1) => void;
}

/** Keep intermediate decimals editable while excluding negative or malformed numbers. */
function metricInput(value: string, decimal: boolean): string | null {
  const next = value.trim();
  if (!next) return '';
  if (!(decimal ? /^\d*([.,]\d*)?$/ : /^\d+$/).test(next)) return null;
  const normalized = /^[.,]/.test(next) ? `0${next}` : next;
  const parsed = Number(normalized.replace(',', '.'));
  if (!Number.isFinite(parsed) || (!decimal && !Number.isSafeInteger(parsed))) return null;
  return normalized;
}

function MetricFrame({ label, inputId, disabled, onStep, children }: {
  label: string;
  inputId?: string;
  disabled?: boolean;
  onStep: MetricCardProps['onStep'];
  children: ReactNode;
}) {
  return (
    <div className="stat-card iti-metric-card">
      <div className="stat-card__label">
        {inputId ? <label htmlFor={inputId}>{label}</label> : <span>{label}</span>}
      </div>
      <div className="iti-metric-card__controls">
        <button type="button" className="icbtn" aria-label={`Diminuer ${label}`} disabled={disabled} onClick={() => onStep(-1)}>−</button>
        {children}
        <button type="button" className="icbtn" aria-label={`Augmenter ${label}`} disabled={disabled} onClick={() => onStep(1)}>+</button>
      </div>
    </div>
  );
}

export function ItineraryMetricCard({ label, value, unit, decimal = false, disabled, onChange, onStep }: MetricCardProps & {
  unit: 'km' | 'm';
  decimal?: boolean;
}) {
  const id = useId();
  return (
    <MetricFrame label={label} inputId={id} disabled={disabled} onStep={onStep}>
      <div className="iti-metric-card__entry">
        <input id={id} name={id} type="text" inputMode={decimal ? 'decimal' : 'numeric'}
          className="iti-metric-card__input" value={value} disabled={disabled} spellCheck={false}
          pattern={decimal ? '[0-9]+([.,][0-9]*)?' : '[0-9]*'} aria-describedby={`${id}-unit`}
          onChange={(event) => {
            const next = metricInput(event.target.value, decimal);
            if (!disabled && next !== null) onChange(next);
          }} />
        <small id={`${id}-unit`} className="iti-metric-card__unit">{unit}</small>
      </div>
    </MetricFrame>
  );
}

function durationParts(value: string): { hours: string; minutes: string } {
  if (!value.trim()) return { hours: '', minutes: '' };
  const total = Number(value);
  if (!Number.isSafeInteger(total) || total < 0) return { hours: '', minutes: '' };
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

export function ItineraryDurationCard({ value, disabled, onChange, onStep }: Omit<MetricCardProps, 'label'>) {
  const id = useId();
  const [parts, setParts] = useState(() => durationParts(value));
  const lastValue = useRef(value);

  // Imports, resets and shortcuts replace the total; typing keeps either segment clearable.
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setParts(durationParts(value));
    }
  }, [value]);

  function changePart(part: 'hours' | 'minutes', input: string) {
    const next = metricInput(input, false);
    if (disabled || next === null) return;
    const updated = { ...parts, [part]: next };
    const total = Number(updated.hours) * 60 + Number(updated.minutes);
    if (!Number.isSafeInteger(total)) return;
    const nextValue = updated.hours === '' && updated.minutes === '' ? '' : String(total);
    lastValue.current = nextValue;
    setParts(updated);
    onChange(nextValue);
  }

  return (
    <MetricFrame label="Durée" disabled={disabled} onStep={onStep}>
      <div className="iti-metric-card__duration" role="group" aria-label="Durée" onBlur={(event) => {
        // Normalize overflow (e.g. 90 min) only after leaving both fields, preserving tab-to-clear.
        if (!event.currentTarget.contains(event.relatedTarget)) setParts(durationParts(value));
      }}>
        <div className="iti-metric-card__entry">
          <label className="sr-only" htmlFor={`${id}-hours`}>Durée, heures</label>
          <input id={`${id}-hours`} name={`${id}-hours`} type="text" inputMode="numeric" pattern="[0-9]*"
            className="iti-metric-card__input" value={parts.hours} disabled={disabled} spellCheck={false}
            onChange={(event) => changePart('hours', event.target.value)} />
          <small className="iti-metric-card__unit" aria-hidden="true">h</small>
        </div>
        <div className="iti-metric-card__entry">
          <label className="sr-only" htmlFor={`${id}-minutes`}>Durée, minutes</label>
          <input id={`${id}-minutes`} name={`${id}-minutes`} type="text" inputMode="numeric" pattern="[0-9]*"
            className="iti-metric-card__input" value={parts.minutes} disabled={disabled} spellCheck={false}
            onChange={(event) => changePart('minutes', event.target.value)} />
          <small className="iti-metric-card__unit" aria-hidden="true">min</small>
        </div>
      </div>
    </MetricFrame>
  );
}
