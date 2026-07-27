'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Plage min/max : deux curseurs superposés **plus** deux champs numériques liés.
 *
 * Pourquoi les deux : un double curseur seul est imprécis à la souris et pénible au
 * clavier, et son état est difficile à lire pour une aide technique. Le curseur sert à
 * explorer l'étendue, les champs à poser une valeur exacte — et ce sont eux qui portent
 * la saisie quand aucune borne n'est connue (cf. `bounded={false}`).
 *
 * `undefined` = borne non posée (« depuis le début » / « jusqu'à la fin »), distinct de
 * la borne du corpus. Seuls les CHAMPS peuvent revenir à cet état, en les vidant : le
 * curseur écrit toujours un nombre. C'est délibéré — si glisser une poignée jusqu'à
 * l'extrémité effaçait la borne, le critère entier disparaîtrait sous le doigt de
 * l'utilisateur (une ligne sans min ni max n'est pas stockée). Le retrait est un geste
 * explicite : la croix.
 */
export interface RangeSliderProps {
  label: string;
  min?: number;
  max?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
  /** Bornes du corpus. Absentes ⇒ curseurs masqués, saisie numérique seule. */
  bounds?: { min: number; max: number } | null;
  /** Unité affichée à côté des valeurs (« pers. », « m² »…). */
  unit?: string;
  step?: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function parseInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function RangeSlider({ label, min, max, onChange, bounds, unit, step = 1 }: RangeSliderProps) {
  const id = useId();
  const lowId = `${id}-min`;
  const highId = `${id}-max`;

  // Position des curseurs : à défaut de borne posée, ils reposent aux extrémités du
  // corpus — la poignée est visible et saisissable sans que le filtre soit actif.
  const low = min ?? bounds?.min;
  const high = max ?? bounds?.max;
  const suffix = unit ? ` ${unit}` : '';

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink-2">{label}</span>
        {bounds ? (
          <span className="text-[11px] text-ink-3">
            {min == null && max == null
              ? `${bounds.min}–${bounds.max}${suffix} observés`
              : `${min ?? bounds.min}–${max ?? bounds.max}${suffix}`}
          </span>
        ) : null}
      </div>

      {bounds && bounds.max > bounds.min ? (
        <div className="relative mb-2 h-4">
          <span aria-hidden="true" className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-surface2" />
          <span
            aria-hidden="true"
            className="absolute top-1.5 h-1 rounded-full bg-teal"
            style={{
              left: `${((clamp(low ?? bounds.min, bounds.min, bounds.max) - bounds.min) / (bounds.max - bounds.min)) * 100}%`,
              right: `${100 - ((clamp(high ?? bounds.max, bounds.min, bounds.max) - bounds.min) / (bounds.max - bounds.min)) * 100}%`,
            }}
          />
          {/* Deux input[range] superposés : chacun reste un contrôle natif — donc
              focusable, pilotable aux flèches et annoncé correctement. */}
          <input
            id={lowId}
            type="range"
            className="range-slider__thumb"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={clamp(low ?? bounds.min, bounds.min, bounds.max)}
            aria-label={`${label} — minimum`}
            aria-valuetext={min == null ? 'sans minimum' : `${min}${suffix}`}
            onChange={(event) => {
              const next = Number(event.target.value);
              onChange(next, max != null && next > max ? next : max);
            }}
          />
          <input
            id={highId}
            type="range"
            className="range-slider__thumb"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={clamp(high ?? bounds.max, bounds.min, bounds.max)}
            aria-label={`${label} — maximum`}
            aria-valuetext={max == null ? 'sans maximum' : `${max}${suffix}`}
            onChange={(event) => {
              const next = Number(event.target.value);
              onChange(min != null && next < min ? next : min, next);
            }}
          />
        </div>
      ) : null}

      <div className={cn('filters-panel__range-grid', bounds ? null : 'mt-0')}>
        <Input
          type="number"
          inputMode="numeric"
          min={bounds?.min}
          max={bounds?.max}
          step={step}
          value={min ?? ''}
          placeholder="Min"
          aria-label={`${label} — minimum`}
          onChange={(event) => onChange(parseInput(event.target.value), max)}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={bounds?.min}
          max={bounds?.max}
          step={step}
          value={max ?? ''}
          placeholder="Max"
          aria-label={`${label} — maximum`}
          onChange={(event) => onChange(min, parseInput(event.target.value))}
        />
      </div>

      {!bounds ? (
        <p className="mt-1 text-[11px] leading-snug text-ink-3">
          Aucune valeur saisie pour l&apos;instant sur ce critère : le filtre reste disponible, sans échelle de référence.
        </p>
      ) : null}
    </div>
  );
}
