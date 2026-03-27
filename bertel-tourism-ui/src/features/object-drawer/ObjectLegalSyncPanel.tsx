import type { ModifierPayload } from '../../services/modifier-payload';
import { ModifierEmptyState, ModifierSectionHero, ModifierTooltip } from './modifier-shared';

interface ObjectLegalSyncPanelProps {
  payload: ModifierPayload;
}

export function ObjectLegalSyncPanel({ payload }: ObjectLegalSyncPanelProps) {
  const { legalRecords, externalSyncs, origins, publications, cachedDiagnostics } = payload.legalSync;
  const hasContent = legalRecords.length > 0 || externalSyncs.length > 0 || origins.length > 0 || publications.length > 0 || cachedDiagnostics.length > 0;

  if (!hasContent) {
    return (
      <ModifierEmptyState
        title="Pas de meta de confiance"
        body="Les documents, synchronisations et caches ne sont pas encore exposes pour cette fiche."
      />
    );
  }

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Legal & Sync"
        title="Conformite et provenance"
        description="Les pieces de confiance restent rassemblees dans une seule zone: documents, IDs externes, origine de donnees, publication et diagnostics caches en lecture seule."
        stats={[
          { label: 'Docs', value: String(legalRecords.length) },
          { label: 'Syncs', value: String(externalSyncs.length) },
          { label: 'Origines', value: String(origins.length) },
          { label: 'Caches', value: String(cachedDiagnostics.length) },
        ]}
        chips={publications.slice(0, 3).map((item) => readString(item.publication_id, 'Publication'))}
      />

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Juridique</span>
          <div className="modifier-card-list">
            {legalRecords.length > 0 ? legalRecords.map((record) => (
              <article key={`${record.label}-${record.documentId}`} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{record.label}</strong>
                  <span className="detail-chip detail-chip--soft">{record.status}</span>
                </div>
                <p className="detail-mini-card__meta">{record.validityMode}</p>
                <small>{record.documentId}</small>
              </article>
            )) : <p>Aucun document legal.</p>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <span className="facet-title">Identifiants externes</span>
          <div className="modifier-card-list">
            {externalSyncs.length > 0 ? externalSyncs.map((sync) => (
              <article key={sync.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{sync.source}</strong>
                  <span className="detail-chip detail-chip--soft">{sync.status}</span>
                </div>
                <p className="detail-mini-card__meta">{sync.externalId}</p>
                <small>{sync.lastSyncAt}</small>
              </article>
            )) : <p>Aucun ID externe expose.</p>}
          </div>
        </section>
      </div>

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Origines & publications</span>
          <div className="modifier-card-list">
            {origins.map((origin, index) => (
              <article key={readString(origin.object_id, `origin-${index}`)} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{readString(origin.source_system, 'Source')}</strong>
                  <span className="detail-chip detail-chip--soft">{readString(origin.source_object_id, 'n/a')}</span>
                </div>
                <p className="detail-mini-card__meta">{readString(origin.first_imported_at, 'Import non date')}</p>
              </article>
            ))}
            {publications.map((publication, index) => (
              <article key={readString(publication.publication_id, `publication-${index}`)} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>Publication</strong>
                  <span className="detail-chip detail-chip--soft">{readString(publication.status, 'linked')}</span>
                </div>
                <p className="detail-mini-card__meta">{readString(publication.publication_id)}</p>
              </article>
            ))}
            {origins.length === 0 && publications.length === 0 && <p>Aucune provenance detaillee.</p>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <span className="facet-title">Caches derives</span>
          <div className="modifier-card-list">
            {cachedDiagnostics.length > 0 ? cachedDiagnostics.map((diagnostic) => (
              <article key={diagnostic.label} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{diagnostic.label}</strong>
                  <ModifierTooltip content={diagnostic.detail}>
                    <span className="detail-chip detail-chip--soft">derive</span>
                  </ModifierTooltip>
                </div>
                <p className="detail-mini-card__meta">{diagnostic.value}</p>
              </article>
            )) : <p>Aucun diagnostic derive.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}
