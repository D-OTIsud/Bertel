import type { MouseEvent } from 'react';

export type SeasonState = '' | 'high' | 'peak' | 'closed';

const MONTHS = ['JAN', 'FEV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOU', 'SEP', 'OCT', 'NOV', 'DEC'];

interface SeasonPickerProps {
  value: SeasonState[];
  onChange?: (next: SeasonState[]) => void;
}

function nextState(value: SeasonState): SeasonState {
  if (value === '') return 'high';
  if (value === 'high') return 'peak';
  if (value === 'peak') return '';
  return '';
}

export function SeasonPicker({ value, onChange }: SeasonPickerProps) {
  function patch(index: number, state: SeasonState) {
    const next = [...value];
    next[index] = state;
    onChange?.(next);
  }

  function closeMonth(event: MouseEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    patch(index, 'closed');
  }

  return (
    <>
      <div className="season-picker">
        {MONTHS.map((month, index) => {
          const state = value[index] ?? '';
          return (
            <button
              type="button"
              key={month}
              className={`cell ${state}`}
              onClick={() => patch(index, nextState(state))}
              onContextMenu={(event) => closeMonth(event, index)}
            >
              {month}
            </button>
          );
        })}
      </div>
      <div className="season-legend">
        <span><i className="l-closed" /> Fermé</span>
        <span><i className="l-high" /> Saison haute</span>
        <span><i className="l-peak" /> Pic</span>
      </div>
    </>
  );
}
