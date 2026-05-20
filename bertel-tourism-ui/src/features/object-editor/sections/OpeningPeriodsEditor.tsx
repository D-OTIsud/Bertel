import { useMemo, useState } from 'react';
import { Input, ScheduleEditor, Select } from '../primitives';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';
import {
  buildRibbonSegments,
  currentPeriodIndex,
  formatPeriodRange,
  MONTHS,
  periodKind,
  periodWeekSummary,
  todayMonthFraction,
  todayWeekdayIndex,
  type OpeningPeriodKind,
} from './blocks/opening-period-meta';
import { scheduleRowsFromPeriod } from './blocks/opening-schedule';

interface OpeningPeriodsEditorProps {
  periods: ObjectWorkspaceOpeningPeriod[];
  onPeriodsChange: (periods: ObjectWorkspaceOpeningPeriod[]) => void;
  onAddPeriod: () => void;
}

const BUCKET_OPTIONS = [
  { v: 'current', l: 'Courante' },
  { v: 'next-year', l: 'N+1' },
  { v: 'undated', l: 'Sans date' },
] as const;

function fmtSlotTime(value: string): string {
  if (!value) {
    return '—';
  }
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function weekPreviewCell(
  period: ObjectWorkspaceOpeningPeriod,
  dayIndex: number,
  highlightToday: boolean,
) {
  const row = scheduleRowsFromPeriod(period)[dayIndex];
  const weekday = row ?? { code: 'monday', label: 'lundi', slots: [null, null] };
  const slots = weekday.slots.filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));
  const isOpen = slots.some((slot) => slot.start || slot.end);
  const isToday = highlightToday && dayIndex === todayWeekdayIndex();
  const short = weekday.shortLabel ?? weekday.label.slice(0, 3);
  return (
    <div
      key={weekday.code}
      className={`opC__week-cell${isOpen ? '' : ' closed'}${isToday ? ' is-today' : ''}`}
    >
      <div className="d">{short}</div>
      <div className="h">
        {isOpen
          ? slots.map((slot, slotIndex) => (
              <div key={`${weekday.code}-${slotIndex}`}>
                {fmtSlotTime(slot.start)}
                <br />
                {fmtSlotTime(slot.end)}
              </div>
            ))
          : 'Fermé'}
      </div>
    </div>
  );
}

export function OpeningPeriodsEditor({ periods, onPeriodsChange, onAddPeriod }: OpeningPeriodsEditorProps) {
  const nowIndex = currentPeriodIndex(periods);
  const [selectedIndex, setSelectedIndex] = useState(nowIndex);
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => ({ [nowIndex]: true }));

  const ribbonSegments = useMemo(() => buildRibbonSegments(periods), [periods]);
  const nowPct = (todayMonthFraction() / 12) * 100;
  const selected = periods[selectedIndex];
  const selectedKind = selected ? periodKind(selected) : 'standard';

  function updatePeriod(index: number, patch: Partial<ObjectWorkspaceOpeningPeriod>) {
    onPeriodsChange(periods.map((period, periodIndex) => (periodIndex === index ? { ...period, ...patch } : period)));
  }

  function removePeriod(index: number) {
    const next = periods.filter((_, periodIndex) => periodIndex !== index);
    onPeriodsChange(next);
    if (selectedIndex >= next.length) {
      setSelectedIndex(Math.max(0, next.length - 1));
    }
  }

  function toggleExpanded(index: number) {
    setExpanded((state) => ({ ...state, [index]: !state[index] }));
    setSelectedIndex(index);
  }

  const allClosedDays = periods.flatMap((period) =>
    period.closedDays.map((day) => ({ periodLabel: period.label, day })),
  );

  return (
    <div className="op opC">
      <div className="opB__top">
        <div className="opB__status">
          <span className="opB__pill">
            <span className="dot" />
            {periods.length} période(s) · vue annuelle
          </span>
          {selected && (
            <span className="opB__until">
              {selected.label || 'Période'} · <strong>{formatPeriodRange(selected)}</strong>
            </span>
          )}
        </div>
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
                className={`opB__seg ${segment.kind}${selectedIndex === segment.periodIndex ? ' is-selected' : ''}${segment.periodIndex === nowIndex ? ' is-now' : ''}`}
                style={{
                  left: `${(segment.start / 12) * 100}%`,
                  width: `${((segment.end - segment.start) / 12) * 100}%`,
                }}
                onClick={() => {
                  setSelectedIndex(segment.periodIndex);
                  setExpanded((state) => ({ ...state, [segment.periodIndex]: true }));
                }}
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="chip-group__label" style={{ marginTop: 0 }}>
          Périodes saisonnières
        </div>
        <button type="button" className="op__more" onClick={onAddPeriod}>
          + Ajouter une période
        </button>
      </div>

      {periods.map((period, index) => {
        const kind = periodKind(period);
        const isNow = index === nowIndex;
        const isOpen = Boolean(expanded[index]);
        const cardKind: OpeningPeriodKind = kind === 'standard' ? 'low' : kind;
        return (
          <div
            key={`${period.recordId ?? 'period'}-${index}`}
            className={`opC__card ${cardKind}${isNow ? ' is-now' : ''}${isOpen ? ' is-open' : ''}`}
          >
            <div className="opC__card-head" onClick={() => toggleExpanded(index)} role="presentation">
              <span className="opC__card-stripe" />
              <div className="opC__card-info">
                <div className="opC__card-name">
                  {period.label || `Période ${index + 1}`}
                  {isNow && <span className="opC__card-now">en cours</span>}
                </div>
                <div className="opC__card-range">{formatPeriodRange(period)}</div>
              </div>
              <div className="opC__card-summary">
                <span>{periodWeekSummary(period)}</span>
                <button
                  type="button"
                  className="opC__chev"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(index);
                  }}
                  aria-expanded={isOpen}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="del"
                  onClick={(event) => {
                    event.stopPropagation();
                    removePeriod(index);
                  }}
                  aria-label="Supprimer la période"
                >
                  ×
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="opC__card-body">
                <Input
                  value={period.label}
                  placeholder="Nom de période"
                  onChange={(label) => updatePeriod(index, { label })}
                />
                <div className="grid-3" style={{ marginBottom: 12, marginTop: 10 }}>
                  <Input type="date" value={period.startDate} onChange={(startDate) => updatePeriod(index, { startDate })} />
                  <Input type="date" value={period.endDate} onChange={(endDate) => updatePeriod(index, { endDate })} />
                  <Select
                    value={period.bucket}
                    options={[...BUCKET_OPTIONS]}
                    onChange={(bucket) => updatePeriod(index, { bucket: bucket as ObjectWorkspaceOpeningPeriod['bucket'] })}
                  />
                </div>

                {kind === 'shut' ? (
                  <p className="opB__week-shut">Établissement fermé pendant cette période.</p>
                ) : (
                  <>
                    <div className="opC__week">{WEEKDAY_PREVIEW.map((_, dayIndex) => weekPreviewCell(period, dayIndex, isNow))}</div>
                    <div className="chip-group__label" style={{ marginTop: 14 }}>
                      Horaires détaillés
                    </div>
                    <ScheduleEditor
                      rows={scheduleRowsFromPeriod(period)}
                      colA="Plage 1"
                      colB="Plage 2"
                      onChange={(rows) => {
                        onPeriodsChange(
                          periods.map((entry, periodIndex) =>
                            periodIndex === index
                              ? {
                                  ...entry,
                                  weekdays: rows.map((row) => ({
                                    code: row.code,
                                    label: row.label,
                                    slots: row.slots.filter((slot): slot is NonNullable<typeof slot> => Boolean(slot)),
                                  })),
                                }
                              : entry,
                          ),
                        );
                      }}
                    />
                  </>
                )}

                <div className="chip-group__label" style={{ marginTop: 12 }}>
                  Jours fermés (codes)
                </div>
                <Input
                  value={period.closedDays.join(', ')}
                  placeholder="ex. monday, 2026-12-25"
                  onChange={(value) =>
                    updatePeriod(index, {
                      closedDays: value
                        .split(',')
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            )}
          </div>
        );
      })}

      {periods.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>
          Aucune période — ajoutez une saison ou une fermeture annuelle.
        </p>
      )}

      <div className="opC__excep-card">
        <div className="opC__excep-head">
          <h4>Fermetures exceptionnelles & jours fériés</h4>
        </div>
        {allClosedDays.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: 0 }}>Aucune fermeture exceptionnelle déclarée.</p>
        ) : (
          <div className="opC__excep-list">
            {allClosedDays.map((entry, index) => (
              <div key={`${entry.day}-${index}`} className="opC__excep-row">
                <span className="date">{entry.day}</span>
                <span className="reason">{entry.periodLabel || 'Période'}</span>
                <span className="status closed">Fermé</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && selectedKind !== 'shut' && (
        <div className="opB__detail" style={{ marginTop: 8 }}>
          <div className="opB__detail-l">
            <div className="opB__detail-eyebrow">{selectedIndex === nowIndex ? 'Période en cours' : 'Période sélectionnée'}</div>
            <h4 className="opB__detail-name">
              <i style={{ background: `var(--op-${selectedKind === 'standard' ? 'low' : selectedKind})` }} />
              {selected.label || 'Sans nom'}
              {selectedIndex === nowIndex && <span className="opB__now-chip">en cours</span>}
            </h4>
            <div className="opB__detail-range">{formatPeriodRange(selected)}</div>
            <dl className="opB__detail-meta">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt>Résumé</dt>
                <dd>{periodWeekSummary(selected)}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

const WEEKDAY_PREVIEW = [0, 1, 2, 3, 4, 5, 6] as const;
