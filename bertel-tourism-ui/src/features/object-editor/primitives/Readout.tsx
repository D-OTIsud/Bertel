import type { ReactNode } from 'react';

interface ReadoutProps {
  value: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  mono?: boolean;
  prefix?: ReactNode;
  placeholder?: string;
}

/**
 * Display-only value, visually distinct from an editable input (the X3 read-only
 * treatment). Use for canonical / reference fields — ID OTI, object type, derived
 * values — so they don't read as editable. Borderless, tinted, non-interactive:
 * no `<input>`, no border, so there is nothing that looks like a write target.
 */
export function Readout({ value, mono, prefix, placeholder, ...accessibility }: ReadoutProps) {
  const isEmpty = !value;
  return (
    <div {...accessibility} className={`readout${mono ? ' mono' : ''}${isEmpty ? ' is-empty' : ''}`}>
      {prefix && <span className="readout__prefix" aria-hidden="true">{prefix}</span>}
      <span className="readout__value">{value || placeholder || '—'}</span>
    </div>
  );
}
