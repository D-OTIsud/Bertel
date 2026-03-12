import type { ExternalSyncItem } from './utils';
import { parseExternalSyncs } from './utils';

interface ObjectExternalSyncPanelProps {
  raw: Record<string, unknown>;
}

function getSyncTone(item: ExternalSyncItem): 'green' | 'orange' | 'red' | 'neutral' {
  const status = item.status.toLowerCase();

  if (status.includes('error') || status.includes('failed')) {
    return 'red';
  }

  if (status.includes('pending') || status.includes('drift')) {
    return 'orange';
  }

  if (status.includes('ok') || status.includes('synced')) {
    return 'green';
  }

  return 'neutral';
}

export function ObjectExternalSyncPanel({ raw }: ObjectExternalSyncPanelProps) {
  const syncItems = parseExternalSyncs(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Connecteurs</span>
            <h2>Identifiants externes & suivi</h2>
          </div>
          <button type="button" className="ghost-button">Voir le statut des syncs</button>
        </div>
        <div className="stack-list">
          {syncItems.length > 0 ? syncItems.map((item) => (
            <article key={item.id} className="legal-card">
              <div className="legal-card__header">
                <div>
                  <strong>{item.source}</strong>
                  <p>{item.externalId}</p>
                </div>
                <span className={`status-pill status-pill--${getSyncTone(item)}`}>
                  {item.status}
                </span>
              </div>
              <div className="legal-card__grid">
                <span>Derniere synchro: {item.lastSyncAt}</span>
                <span>Reference: {item.externalId}</span>
                <span>Note: {item.note}</span>
                <span>Source: {item.source}</span>
              </div>
            </article>
          )) : <p>Le panneau est pret pour `object_external_id`, les derivees de statut et le suivi de qualite des flux.</p>}
        </div>
      </section>
    </div>
  );
}
