import type { ReactNode } from 'react';

interface RepeaterProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  columns: string;
  renderRow: (item: T, index: number) => ReactNode;
  addLabel: string;
  onAdd: () => void;
  /** Disables the add affordance (e.g. every available option is already used). */
  addDisabled?: boolean;
  /** Tooltip explaining WHY adding is disabled. */
  addDisabledReason?: string;
}

/** A list of grid rows with an "add" affordance — the editor's repeated-row pattern. */
export function Repeater<T>({ items, getKey, columns, renderRow, addLabel, onAdd, addDisabled = false, addDisabledReason }: RepeaterProps<T>) {
  return (
    <>
      <div className="repeater">
        {items.map((item, i) => (
          <div key={getKey(item, i)} className="rep-row" style={{ gridTemplateColumns: columns }}>
            {renderRow(item, i)}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="rep-add"
        onClick={onAdd}
        disabled={addDisabled}
        title={addDisabled ? addDisabledReason : undefined}
      >
        + {addLabel}
      </button>
    </>
  );
}
