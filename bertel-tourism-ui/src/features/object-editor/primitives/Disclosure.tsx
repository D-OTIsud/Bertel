'use client';

import { useId, useState, type ReactNode } from 'react';

interface DisclosureProps {
  title: string;
  /** Résumé affiché à droite du titre (compteur d'état replié). */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Section repliable accessible (impl. 6.2 — divulgation progressive des sections
 * éditeur denses §07/§16). Non contrôlée ; `aria-expanded` + `aria-controls`.
 */
export function Disclosure({ title, summary, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className={`disclosure${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="disclosure__head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="disclosure__chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="disclosure__title">{title}</span>
        {summary ? <span className="disclosure__summary">{summary}</span> : null}
      </button>
      <div id={bodyId} className="disclosure__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
