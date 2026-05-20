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

function emptySlot(): ScheduleSlot {
  return { start: '', end: '' };
}

function normalizeSlots(row: ScheduleRow): Array<ScheduleSlot | null> {
  return [row.slots[0] ?? null, row.slots[1] ?? null];
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
    const isOpen = normalizeSlots(row).some((slot) => slot && (slot.start || slot.end));
    replaceRow(index, { ...row, slots: isOpen ? [null, null] : [emptySlot(), null] });
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

  return (
    <div className="sched">
      <div className="sched__head">Jour</div>
      <div className="sched__head">{colA}</div>
      <div className="sched__head">{colB}</div>
      <div className="sched__head">Copier</div>
      {rows.map((row, rowIndex) => {
        const slots = normalizeSlots(row);
        const isOpen = slots.some((slot) => slot && (slot.start || slot.end));
        return (
          <div key={row.code} style={{ display: 'contents' }}>
            <button type="button" className={`sched__day ${isOpen ? 'is-on' : ''}`} onClick={() => toggleRow(rowIndex)}>
              <span className="ck">{isOpen ? '✓' : ''}</span>
              {row.shortLabel ?? row.code}
              <small>{row.label}</small>
            </button>
            {slots.map((slot, slotIndex) => (
              <div key={`${row.code}-${slotIndex}`} className={`sched__slot ${!slot ? 'is-closed' : ''}`}>
                <input
                  value={slot?.start ?? 'Fermé'}
                  readOnly={!slot}
                  onChange={(event) => patchSlot(rowIndex, slotIndex, { start: event.target.value })}
                />
                {slot && <span className="dash">-</span>}
                {slot && (
                  <input
                    value={slot.end}
                    onChange={(event) => patchSlot(rowIndex, slotIndex, { end: event.target.value })}
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              className="sched__copy"
              title="Copier sur toute la semaine"
              onClick={() => onChange?.(rows.map((other) => ({ ...other, slots: normalizeSlots(row) })))}
            >
              ↓
            </button>
          </div>
        );
      })}
      <div className="sched__hint">
        <button type="button" className="chip size-sm">Tous les jours</button>
        <button type="button" className="chip size-sm">Lun-Ven</button>
        <button type="button" className="chip size-sm">Week-end</button>
      </div>
    </div>
  );
}
