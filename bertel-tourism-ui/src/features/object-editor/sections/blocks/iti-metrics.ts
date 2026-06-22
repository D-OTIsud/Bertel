// §111 Section 06 ITI — pure helpers for the editable distance/duration/elevation
// metric steppers (the +/- buttons were inert placeholders before).

export interface StepOptions {
  /** Increment applied per +/- click (in the field's own unit). */
  step: number;
  /** Lower bound (metrics are never negative). Default 0. */
  min?: number;
  /** Decimal places to keep on the result. Default 0. */
  decimals?: number;
}

/**
 * Step a numeric string field by `delta * step`, clamped to `min`, formatted to
 * `decimals`. Tolerates empty / non-numeric current values (treated as `min`).
 * Returns a string so it round-trips through the draft model (values are strings).
 */
export function stepMetric(current: string | null | undefined, delta: number, opts: StepOptions): string {
  const min = opts.min ?? 0;
  const decimals = opts.decimals ?? 0;
  const parsed = Number(String(current ?? '').replace(',', '.'));
  const base = Number.isFinite(parsed) ? parsed : min;
  const next = Math.max(min, base + delta * opts.step);
  // Avoid float artifacts (0.1 + 0.2) — round to the requested precision.
  const factor = 10 ** decimals;
  const rounded = Math.round(next * factor) / factor;
  return decimals > 0 ? rounded.toFixed(decimals) : String(Math.round(rounded));
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
