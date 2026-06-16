export interface ScheduleSlot {
  start: string;
  end: string;
}

export interface ScheduleRow {
  code: string;
  label: string;
  shortLabel?: string;
  slots: Array<ScheduleSlot | null>;
}

interface ScheduleEditorProps {
  rows: ScheduleRow[];
  colA?: string;
  colB?: string;
  onChange?: (rows: ScheduleRow[]) => void;
}

// Day-group quick-select presets (additive: open the named days, leave the rest untouched).
const GROUP_ALL = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const GROUP_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const GROUP_WEEKEND = ['saturday', 'sunday'];

function emptySlot(): ScheduleSlot {
  return { start: '', end: '' };
}

function normalizeSlots(row: ScheduleRow): Array<ScheduleSlot | null> {
  return [row.slots[0] ?? null, row.slots[1] ?? null];
}

function rowIsOpen(row: ScheduleRow): boolean {
  return normalizeSlots(row).some((slot) => slot !== null);
}

export function ScheduleEditor({ rows, colA = 'Service midi', colB = 'Service soir', onChange }: ScheduleEditorProps) {
  function replaceRow(index: number, nextRow: ScheduleRow) {
    onChange?.(rows.map((row, rowIndex) => (rowIndex === index ? nextRow : row)));
  }

  function toggleRow(index: number) {
    const row = rows[index];
    if (!row) {
      return;
    }
    replaceRow(index, { ...row, slots: rowIsOpen(row) ? [null, null] : [emptySlot(), null] });
  }

  function patchSlot(rowIndex: number, slotIndex: number, patch: Partial<ScheduleSlot>) {
    const row = rows[rowIndex];
    if (!row) {
      return;
    }
    const slots = normalizeSlots(row);
    slots[slotIndex] = { ...(slots[slotIndex] ?? emptySlot()), ...patch };
    replaceRow(rowIndex, { ...row, slots });
  }

  function openSlot(rowIndex: number, slotIndex: number) {
    const row = rows[rowIndex];
    if (!row || normalizeSlots(row)[slotIndex]) {
      return;
    }
    const slots = normalizeSlots(row);
    slots[slotIndex] = emptySlot();
    replaceRow(rowIndex, { ...row, slots });
  }

  // Copy this day's slots onto the IMMEDIATELY following day only (not the whole week).
  function copyToNextDay(rowIndex: number) {
    const row = rows[rowIndex];
    if (!row || rowIndex + 1 >= rows.length) {
      return;
    }
    onChange?.(rows.map((other, otherIndex) => (otherIndex === rowIndex + 1 ? { ...other, slots: normalizeSlots(row) } : other)));
  }

  // Quick-select: ensure every day in the group is open (adds an empty slot to closed ones);
  // days outside the group are left as-is (non-destructive).
  function openGroup(codes: string[]) {
    const set = new Set(codes);
    onChange?.(rows.map((row) => (set.has(row.code) && !rowIsOpen(row) ? { ...row, slots: [emptySlot(), null] } : row)));
  }

  return (
    <div className="sched">
      <div className="sched__head">Jour</div>
      <div className="sched__head">{colA}</div>
      <div className="sched__head">{colB}</div>
      <div className="sched__head">Copier</div>
      {rows.map((row, rowIndex) => {
        const slots = normalizeSlots(row);
        const isOpen = rowIsOpen(row);
        const isLast = rowIndex === rows.length - 1;
        return (
          <div key={row.code} style={{ display: 'contents' }}>
            <button
              type="button"
              className={`sched__day ${isOpen ? 'is-on' : ''}`}
              aria-pressed={isOpen}
              onClick={() => toggleRow(rowIndex)}
            >
              <span className="ck">{isOpen ? '✓' : ''}</span>
              {row.shortLabel ?? row.code}
              <small>{row.label}</small>
            </button>
            {slots.map((slot, slotIndex) => {
              const colLabel = slotIndex === 0 ? colA : colB;
              return (
                <div key={`${row.code}-${slotIndex}`} className={`sched__slot ${!slot ? 'is-closed' : ''}`}>
                  {slot ? (
                    <>
                      <input
                        type="time"
                        aria-label={`${row.label} · ${colLabel} · début`}
                        value={slot.start}
                        onChange={(event) => patchSlot(rowIndex, slotIndex, { start: event.target.value })}
                      />
                      <span className="dash">-</span>
                      <input
                        type="time"
                        aria-label={`${row.label} · ${colLabel} · fin`}
                        value={slot.end}
                        onChange={(event) => patchSlot(rowIndex, slotIndex, { end: event.target.value })}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      className="sched__open-slot"
                      aria-label={`Ouvrir ${row.label} · ${colLabel}`}
                      onClick={() => openSlot(rowIndex, slotIndex)}
                    >
                      Fermé
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="sched__copy"
              title="Copier sur le jour suivant"
              aria-label={`Copier ${row.label} sur le jour suivant`}
              disabled={isLast || !isOpen}
              onClick={() => copyToNextDay(rowIndex)}
            >
              ↓
            </button>
          </div>
        );
      })}
      <div className="sched__hint">
        <button type="button" className="chip size-sm" onClick={() => openGroup(GROUP_ALL)}>
          Tous les jours
        </button>
        <button type="button" className="chip size-sm" onClick={() => openGroup(GROUP_WEEK)}>
          Lun-Ven
        </button>
        <button type="button" className="chip size-sm" onClick={() => openGroup(GROUP_WEEKEND)}>
          Week-end
        </button>
      </div>
    </div>
  );
}
