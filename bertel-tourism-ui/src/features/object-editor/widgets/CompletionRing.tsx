import type { SectionCompletionStatus } from '../editor-completion';

export interface CompletionRingSection {
  label: string;
  pct: number;
  stat: SectionCompletionStatus;
}

interface CompletionRingProps {
  overall: number;
  sections: CompletionRingSection[];
  /** Publiable = aucun bloquant de validation. Découplé du % (richesse). Optionnel (rétro-compat). */
  publishable?: boolean;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function CompletionRing({ overall, sections, publishable }: CompletionRingProps) {
  const percent = clampPct(overall);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="card completion-card">
      <h4>
        Complétude <span className="small-act">Voir détails ›</span>
      </h4>
      <div className="edit-nav__ring" aria-label={`Complétude ${percent}%`}>
        <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-hidden="true">
          <circle cx="74" cy="74" r={radius} fill="none" stroke="rgba(24,49,59,0.08)" strokeWidth="10" />
          <circle
            cx="74"
            cy="74"
            r={radius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
          />
        </svg>
        <div className="edit-nav__ring__center">
          <div>
            <div className="num">
              {percent}
              <small>%</small>
            </div>
            <div className="lbl">richesse de la fiche</div>
          </div>
        </div>
      </div>
      {publishable !== undefined && (
        <div className="completion-card__row completion-card__publish">
          <span className={`edit-nav__dot ${publishable ? 'ok' : 'warn'}`} />
          <span className="completion-card__label">
            {publishable ? 'Publiable' : 'Publication bloquée'}
          </span>
        </div>
      )}
      <div className="completion-card__list">
        {sections.map((section) => (
          <div key={section.label} className="completion-card__row">
            <span className={`edit-nav__dot ${section.stat}`} />
            <span className="completion-card__label">{section.label}</span>
            <span className="pill-mini">{clampPct(section.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
