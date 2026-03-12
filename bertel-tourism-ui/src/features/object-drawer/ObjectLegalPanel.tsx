import type { LegalItem } from './utils';
import { parseLegal } from './utils';

interface ObjectLegalPanelProps {
  raw: Record<string, unknown>;
}

function getLegalTone(record: LegalItem): 'green' | 'orange' | 'red' | 'neutral' {
  const days = Number(record.daysUntilExpiry);
  const status = record.status.toLowerCase();

  if (Number.isFinite(days)) {
    if (days < 0) {
      return 'red';
    }
    if (days <= 30) {
      return 'orange';
    }
    return 'green';
  }

  if (status.includes('expire') || status.includes('missing')) {
    return 'red';
  }

  if (status.includes('renew') || status.includes('request')) {
    return 'orange';
  }

  return 'neutral';
}

export function ObjectLegalPanel({ raw }: ObjectLegalPanelProps) {
  const legalRecords = parseLegal(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Conformite</span>
            <h2>Documents & alertes</h2>
          </div>
          <button type="button" className="ghost-button">Demander un document</button>
        </div>
        <div className="stack-list">
          {legalRecords.length > 0 ? legalRecords.map((record) => (
            <article key={`${record.label}-${record.documentId}`} className="legal-card">
              <div className="legal-card__header">
                <strong>{record.label}</strong>
                <span className={`status-pill status-pill--${getLegalTone(record)}`}>
                  {record.status}
                </span>
              </div>
              <div className="legal-card__grid">
                <span>Document: {record.documentId}</span>
                <span>Validite: {record.validityMode}</span>
                <span>Jours restants: {record.daysUntilExpiry}</span>
                <span>Livraison: {record.deliveredAt}</span>
              </div>
            </article>
          )) : <p>Le panneau est pret pour `object_legal`, `requested_at`, `delivered_at` et `days_until_expiry`.</p>}
        </div>
      </section>
    </div>
  );
}