import type { Issue } from '../editor-validation';

interface IssuesRailProps {
  items: Issue[];
  onGoToSection: (num: string) => void;
}

export function IssuesRail({ items, onGoToSection }: IssuesRailProps) {
  return (
    <div className="card">
      <h4>
        À corriger <span className="small-act">{items.length} ›</span>
      </h4>
      {items.length === 0 ? (
        <p className="rail-empty">Aucun point bloquant détecté.</p>
      ) : (
        items.map((item) => (
          <button
            type="button"
            key={`${item.section}-${item.message}`}
            className="issue"
            onClick={() => onGoToSection(item.section)}
          >
            <span className={`issue__dot ${item.tone}`} />
            <span className="issue__body">
              <strong>Section {item.section}</strong>
              <small>{item.message}</small>
            </span>
            <span className="issue__go">Aller ›</span>
          </button>
        ))
      )}
    </div>
  );
}
