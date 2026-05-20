import type { EditorMode } from '../shell/EditorTopbar';
import type { Issue } from '../editor-validation';

interface ValidationBannerProps {
  blockers: Issue[];
  warnings: Issue[];
  typeCode: string;
  mode: EditorMode;
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

export function ValidationBanner({ blockers, warnings, typeCode, mode, onGoToSection }: ValidationBannerProps) {
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
      <div className="val-banner__col val-banner__col--gate">
        <div className="val-banner__gate">
          <div className="val-banner__gate-num">{blockers.length === 0 ? 'OK' : blockers.length}</div>
          <div>
            <strong>
              {blockers.length === 0
                ? 'Publication possible'
                : `${blockers.length} blocage${blockers.length > 1 ? 's' : ''} restant${blockers.length > 1 ? 's' : ''}`}
            </strong>
            <small>
              Mode {mode} · type {typeCode || '—'} · publication via le bouton en haut à droite
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
