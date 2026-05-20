import type { ReactNode } from 'react';

interface FsProps {
  num: string;
  title: string;
  sub?: string;
  pill?: { tone?: 'ok' | 'warn' | 'req'; label: string };
  /** Mode rapide: render compact header-only row (design: fs--rapide-folded). */
  folded?: boolean;
  children: ReactNode;
}

/**
 * A numbered section card. `id="section-NN"` is the scroll-spy anchor the editor nav targets.
 * When `folded` is true (mode rapide), only the header is shown — no collapsible body.
 */
export function Fs({ num, title, sub, pill, folded = false, children }: FsProps) {
  if (folded) {
    return (
      <section
        className="fs fs--rapide-folded"
        id={`section-${num}`}
        data-section={num}
        role="region"
        aria-label={title}
      >
        <div className="fs__head">
          <span className="fs__num">{num}</span>
          <h3>
            {title}
            {sub && <small>{sub}</small>}
          </h3>
          <div className="meta">
            {pill && <span className={`fs-pill ${pill.tone ?? 'ok'}`}>{pill.label}</span>}
          </div>
        </div>
      </section>
    );
  }

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
        </div>
      </div>
      <div className="fs__body">{children}</div>
    </section>
  );
}
