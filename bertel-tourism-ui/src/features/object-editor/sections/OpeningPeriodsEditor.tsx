import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';
import {
  buildRibbonSegments,
  classifyOpeningSeason,
  formatPeriodRange,
  MONTHS,
  periodKind,
  periodWeekSummary,
  todayMonthFraction,
  type OpeningPeriodKind,
} from './blocks/opening-period-meta';
import { scheduleRowsFromPeriod } from './blocks/opening-schedule';
import { classifyClosedDays } from './opening-period-edit';
import { tagChipStyle } from '../../../utils/explorer-card';

/** Read-only per-day hours for the expanded row detail. */
function periodDayHours(period: ObjectWorkspaceOpeningPeriod): { short: string; text: string; open: boolean }[] {
  return scheduleRowsFromPeriod(period).map((row) => {
    const slots = row.slots.filter((slot): slot is NonNullable<typeof slot> => Boolean(slot && (slot.start || slot.end)));
    const fmt = (value: string) => (value.length >= 5 ? value.slice(0, 5) : value || '—');
    return {
      short: row.shortLabel ?? row.code,
      open: slots.length > 0,
      text: slots.length > 0 ? slots.map((slot) => `${fmt(slot.start)}–${fmt(slot.end)}`).join(' · ') : 'Fermé',
    };
  });
}
import type { ObjectWorkspaceOpeningPeriodTypeOption } from '../../../services/object-workspace-parser';

interface OpeningPeriodsListProps {
  periods: ObjectWorkspaceOpeningPeriod[];
  /** Admin-managed period-type catalog (drives the row/ribbon colour + label). */
  periodTypeOptions: ObjectWorkspaceOpeningPeriodTypeOption[];
  /** Index of the period considered "en cours" (currentPeriodIndex). */
  currentIndex: number;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

// Row stripe colour keyed to the inferred kind. 'standard' reuses the low/off-season tint.
const STRIPE_VAR: Record<OpeningPeriodKind, string> = {
  high: 'var(--op-high)',
  low: 'var(--op-low)',
  shut: 'var(--op-shut)',
  standard: 'var(--op-low)',
};

// Presentational label for the period's recurrence layer (replaces the dropped `bucket` scope).
const RECURRENCE_LABEL: Record<ObjectWorkspaceOpeningPeriod['recurrence'], string> = {
  always: 'Toute l’année',
  cyclic: 'Cyclique',
  fixed: 'Dates fixes',
};

// Compact one-line row: stripe · name(+badge) · range · week summary · actions.
const ROW_COLS = '8px minmax(0, 1.4fr) minmax(0, 1.1fr) minmax(0, 1fr) auto';

/**
 * Presentational §14 period list: a read-only annual ribbon overview plus a compact
 * one-line repeater. All add/edit happens in the OpeningPeriodEditModal owned by the
 * section — this component only emits onAdd/onEdit/onDelete. (File still named
 * OpeningPeriodsEditor for import stability; it is now a list, not an inline editor.)
 */
export function OpeningPeriodsEditor({ periods, periodTypeOptions, currentIndex, onAdd, onEdit, onDelete }: OpeningPeriodsListProps) {
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const ribbonSegments = useMemo(() => buildRibbonSegments(periods), [periods]);
  const nowPct = (todayMonthFraction() / 12) * 100;

  const typeByCode = useMemo(
    () => new Map(periodTypeOptions.map((option) => [option.code, option])),
    [periodTypeOptions],
  );
  // Season "étiquette": a coloured chip driven by the explicit type, then label keywords,
  // and independent of opening hours (classifyOpeningSeason — so a "Haute saison" period with
  // no fixed hours stays teal instead of greying to 'shut'). The stripe + ribbon reuse the
  // same hex so the row's colour is consistent; untyped/unclassifiable rows fall back to the
  // inferred kind tint.
  const seasonChip = (period: ObjectWorkspaceOpeningPeriod) => classifyOpeningSeason(period, typeByCode);
  const periodColor = (period: ObjectWorkspaceOpeningPeriod): string =>
    seasonChip(period)?.hex || STRIPE_VAR[periodKind(period)];
  const periodName = (period: ObjectWorkspaceOpeningPeriod, index: number): string =>
    period.label || typeByCode.get(period.seasonTypeCode)?.label || `Période ${index + 1}`;

  const closedDays = useMemo(
    () =>
      periods.flatMap((period, index) =>
        classifyClosedDays(period.closedDays).map((entry) => ({
          label: entry.label,
          periodLabel: period.label || `Période ${index + 1}`,
        })),
      ),
    [periods],
  );

  if (periods.length === 0) {
    return (
      <div className="op opC">
        <div className="op__empty">
          <h4>Aucune période</h4>
          <p className="muted">Ajoutez une saison, une plage horaire ou une fermeture annuelle pour structurer vos horaires.</p>
          <button type="button" className="rep-add" onClick={onAdd}>
            + Ajouter une période
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="op opC">
      <div className="opB__top">
        <span className="opB__pill">
          <span className="dot" />
          {periods.length} période(s) · vue annuelle
        </span>
        <div className="opB__legend">
          <span>
            <i style={{ background: 'var(--op-high)' }} />
            Haute saison
          </span>
          <span>
            <i style={{ background: 'var(--op-low)' }} />
            Hors saison
          </span>
          <span>
            <i style={{ background: 'var(--op-shut)' }} />
            Fermé
          </span>
        </div>
      </div>

      {ribbonSegments.length > 0 && (
        <>
          <div className="opB__ribbon">
            {ribbonSegments.map((segment, index) => (
              <button
                key={`${segment.periodIndex}-${index}`}
                type="button"
                className={`opB__seg ${segment.kind}${selectedIndex === segment.periodIndex ? ' is-selected' : ''}${segment.periodIndex === currentIndex ? ' is-now' : ''}`}
                style={{
                  left: `${(segment.start / 12) * 100}%`,
                  width: `${((segment.end - segment.start) / 12) * 100}%`,
                  background: periodColor(periods[segment.periodIndex]),
                }}
                aria-label={`${segment.abbr} — ${formatPeriodRange(periods[segment.periodIndex])}`}
                onClick={() => setSelectedIndex(segment.periodIndex)}
              >
                <span className="opB__seg-label">{segment.abbr}</span>
              </button>
            ))}
            <div className="opB__now-mark" style={{ left: `${nowPct}%` }} />
          </div>
          <div className="opB__scale">
            {MONTHS.map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
        </>
      )}

      <div className="chip-group__label" style={{ margin: '12px 0 4px' }}>
        Périodes saisonnières
      </div>

      <div className="repeater">
        {periods.map((period, index) => {
          const label = periodName(period, index);
          const chip = seasonChip(period);
          // Avoid "Haute saison · Haute saison": when the visible name IS the season chip's
          // label, the coloured chip stands in for the name; otherwise show name then chip.
          const chipIsName = chip ? chip.label.trim().toLowerCase() === label.trim().toLowerCase() : false;
          const isNow = index === currentIndex;
          const isExpanded = Boolean(expanded[index]);
          const dateClosures = classifyClosedDays(period.closedDays)
            .filter((entry) => entry.kind !== 'weekday')
            .map((entry) => entry.label);
          return (
            <div key={`${period.recordId ?? 'period'}-${index}`} className="opC__row-wrap">
              <div
                className={`rep-row${selectedIndex === index ? ' is-selected' : ''}`}
                style={{ gridTemplateColumns: ROW_COLS, alignItems: 'center' }}
              >
                <span style={{ display: 'block', width: 8, height: 28, borderRadius: 3, background: periodColor(period) }} />
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  {!chipIsName && <span style={{ fontWeight: 600 }}>{label}</span>}
                  {/* Coloured season "étiquette" (haute / mi / hors saison …). */}
                  {chip && (
                    <span className="pill" style={{ ...tagChipStyle(chip.hex), fontSize: 11, fontWeight: 600 }}>
                      {chip.label}
                    </span>
                  )}
                  {/* Recurrence layer badge. 'always' is omitted: the range column already
                      reads "Toute l’année", so a second identical chip would be redundant. */}
                  {period.recurrence !== 'always' && (
                    <span className="pill" style={{ fontSize: 10 }}>
                      {RECURRENCE_LABEL[period.recurrence]}
                    </span>
                  )}
                  {isNow && (
                    <span className="pill ok" style={{ fontSize: 10 }}>
                      en cours
                    </span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {formatPeriodRange(period)}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {periodWeekSummary(period)}
                </div>
                <div className="rep-row__act">
                  <button
                    type="button"
                    aria-label={`Détails de ${label}`}
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((state) => ({ ...state, [index]: !state[index] }))}
                    style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}
                  >
                    <ChevronDown
                      size={14}
                      aria-hidden
                      style={{ transform: isExpanded ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`Modifier ${label}`}
                    onClick={() => onEdit(index)}
                    style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button type="button" className="del" aria-label={`Supprimer ${label}`} onClick={() => onDelete(index)}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="opC__row-detail">
                  <div className="opC__row-hours">
                    {periodDayHours(period).map((day) => (
                      <span key={day.short} className={day.open ? '' : 'muted'}>
                        <strong>{day.short}</strong> {day.text}
                      </span>
                    ))}
                  </div>
                  {dateClosures.length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Fermetures exceptionnelles : {dateClosures.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="rep-add" onClick={onAdd}>
        + Ajouter une période
      </button>

      {closedDays.length > 0 && (
        <div className="opC__excep-card">
          <div className="opC__excep-head">
            <h4>Fermetures exceptionnelles & jours fériés</h4>
          </div>
          <div className="opC__excep-list">
            {closedDays.map((entry, index) => (
              <div key={`${entry.label}-${index}`} className="opC__excep-row">
                <span className="date">{entry.label}</span>
                <span className="reason">{entry.periodLabel}</span>
                <span className="status closed">Fermé</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
