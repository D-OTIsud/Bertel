export interface HistoryRailItem {
  who: string;
  what: string;
  when: string;
}

interface HistoryRailProps {
  items: HistoryRailItem[];
}

export function HistoryRail({ items }: HistoryRailProps) {
  return (
    <div className="card">
      <h4>
        Historique <span className="small-act">Tout voir ›</span>
      </h4>
      {items.length === 0 ? (
        <p className="rail-empty">Aucun historique détaillé exposé.</p>
      ) : (
        items.map((item, index) => (
          <div key={`${item.when}-${index}`} className="history-row">
            <div>
              <strong>{item.who}</strong>
              <small>
                {item.what} <span className="when">· {item.when}</span>
              </small>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
