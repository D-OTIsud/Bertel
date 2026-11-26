// §111 Section 06 ITI — pure helpers for the editable distance/duration/elevation
// metric steppers (the +/- buttons were inert placeholders before).

export interface StepOptions {
  /** Increment applied per +/- click (in the field's own unit). */
  step: number;
  /** Lower bound (metrics are never negative). Default 0. */
  min?: number;
  /** Minimum decimal places for decimal fields; 0/default keeps integer fields integer. */
  decimals?: number;
}

/**
 * Step a numeric string field by `delta * step`, clamped to `min`, formatted to
 * at least `decimals`, preserving entered precision up to 15 decimal places. Tolerates
 * empty / non-numeric current values (treated as `min`).
 * Returns a string so it round-trips through the draft model (values are strings).
 */
export function stepMetric(current: string | null | undefined, delta: number, opts: StepOptions): string {
  const min = opts.min ?? 0;
  const normalized = String(current ?? '').trim().replace(',', '.');
  const parsed = Number(normalized);
  const [coefficient, exponent = '0'] = normalized.toLowerCase().split('e');
  const enteredDecimals = Number.isFinite(parsed)
    ? Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent))
    : 0;
  // Bound pasted precision to Number's useful range and toFixed's supported range.
  const decimals = opts.decimals ? Math.min(15, Math.max(opts.decimals, enteredDecimals)) : 0;
  const base = Number.isFinite(parsed) ? parsed : min;
  const next = Math.max(min, base + delta * opts.step);
  // Format directly: multiplying a very large finite value by 10 ** decimals can overflow.
  return decimals > 0 ? next.toFixed(decimals) : String(Math.round(next));
}

/** Format a duration in minutes as a compact "Xh", "Xh YY", or "YY min" label. */
export function formatDurationShort(minutes: string | number | null | undefined): string {
  const total = Math.round(Number(minutes ?? NaN));
  if (!Number.isFinite(total) || total <= 0) return '—';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}
