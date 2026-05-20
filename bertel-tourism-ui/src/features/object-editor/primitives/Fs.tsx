import { useState, type ReactNode } from 'react';

interface FsProps {
  num: string;
  title: string;
  sub?: string;
  pill?: { tone?: 'ok' | 'warn' | 'req'; label: string };
  folded?: boolean;
  children: ReactNode;
}

/**
 * A numbered, collapsible section card. `id="section-NN"` is the scroll-spy
 * anchor the editor nav targets.
 */
export function Fs({ num, title, sub, pill, folded = false, children }: FsProps) {
  const [open, setOpen] = useState(!folded);
  return (
    <section className="fs" id={`section-${num}`} data-section={num}>
      <div className="fs__head">
        <span className="fs__num">{num}</span>
        <h3>
          {title}
          {sub && <small>{sub}</small>}
        </h3>
        <div className="meta">
          {pill && <span className={`fs-pill ${pill.tone ?? 'ok'}`}>{pill.label}</span>}
          <button
            type="button"
            className="icbtn"
            aria-expanded={open}
            aria-label={open ? 'Replier la section' : 'Déplier la section'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '▾' : '▸'}
          </button>
        </div>
      </div>
      {open && <div className="fs__body">{children}</div>}
    </section>
  );
}
