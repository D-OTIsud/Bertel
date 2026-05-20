import type { Issue } from '../editor-validation';

interface ValidationBannerProps {
  blockers: Issue[];
  warnings: Issue[];
  onGoToSection: (num: string) => void;
}

function issueRow(issue: Issue, action: string, onGoToSection: (num: string) => void) {
  return (
    <div key={`${issue.section}-${issue.message}`} className="val-banner__row">
      <span className="val-banner__sec">§{issue.section}</span>
      <span className="val-banner__txt">{issue.message}</span>
      <button type="button" className="val-banner__go" onClick={() => onGoToSection(issue.section)}>
        {action} ›
      </button>
    </div>
  );
}

export function ValidationBanner({ blockers, warnings, onGoToSection }: ValidationBannerProps) {
  return (
    <div className="val-banner">
      <div className="val-banner__col val-banner__col--block">
        <div className="val-banner__head">
          <span className="val-banner__dot req" />
          Bloque la publication
          <span className="val-banner__count">{blockers.length}</span>
        </div>
        {blockers.length === 0 ? (
          <p className="val-banner__empty">Aucun blocage critique.</p>
        ) : (
          blockers.map((issue) => issueRow(issue, 'Corriger', onGoToSection))
        )}
      </div>
      <div className="val-banner__col val-banner__col--warn">
        <div className="val-banner__head">
          <span className="val-banner__dot warn" />
          Recommandé avant publication
          <span className="val-banner__count">{warnings.length}</span>
        </div>
        {warnings.length === 0 ? (
          <p className="val-banner__empty">Aucun avertissement.</p>
        ) : (
          <>
            {warnings.slice(0, 3).map((issue) => issueRow(issue, 'Voir', onGoToSection))}
            {warnings.length > 3 && (
              <div className="val-banner__more">+ {warnings.length - 3} autres avertissements</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
