import type { ReactNode } from 'react';

interface ChipProps {
  label: string;
  on?: boolean;
  sm?: boolean;
  /** Native tooltip — used for ref action descriptions from the database. */
  title?: string;
  onClick?: () => void;
}

/** A chip is a toggle when `onClick` is given, otherwise a static display tag. */
export function Chip({ label, on, sm, title, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={`chip${on ? ' is-on' : ''}${sm ? ' size-sm' : ''}`}
      aria-pressed={Boolean(on)}
      title={title}
      onClick={onClick}
      disabled={!onClick}
    >
      {label}
    </button>
  );
}

interface ChipSetProps {
  children: ReactNode;
}

export function ChipSet({ children }: ChipSetProps) {
  return <div className="chip-set">{children}</div>;
}
