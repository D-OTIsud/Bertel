import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceExternalIdentifierItem,
  ObjectWorkspaceOriginItem,
  ObjectWorkspaceSyncIdentifiersModule,
} from '../../services/object-workspace-parser';

interface ObjectWorkspaceSyncIdentifiersPanelProps {
  value: ObjectWorkspaceSyncIdentifiersModule;
  access: ObjectWorkspaceModuleAccess;
  statusMessage: string | null;
}

function renderDate(value: string): string {
  return value || 'Non renseigne';
}

function renderExternalIdentifier(item: ObjectWorkspaceExternalIdentifierItem) {
  return (
    <article key={`${item.id}-${item.sourceSystem}-${item.externalId}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.sourceSystem}</span>
          <h3>{item.externalId}</h3>
        </div>
        <strong>{item.organizationObjectId || 'ORG non remontee'}</strong>
      </div>

      <div className="stack-list text-sm text-muted-foreground">
        <span>Derniere synchro: {renderDate(item.lastSyncedAt)}</span>
        <span>Cree le: {renderDate(item.createdAt)}</span>
        <span>Mis a jour le: {renderDate(item.updatedAt)}</span>
      </div>
    </article>
  );
}

function renderOrigin(origin: ObjectWorkspaceOriginItem, index: number) {
  return (
    <article key={`${origin.sourceSystem}-${origin.sourceObjectId}-${index}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{origin.sourceSystem || 'Source non precisee'}</span>
          <h3>{origin.sourceObjectId || 'Objet source non precise'}</h3>
        </div>
        <strong>{origin.importBatchId || 'Sans lot import'}</strong>
      </div>

      <div className="stack-list text-sm text-muted-foreground">
        <span>Premier import: {renderDate(origin.firstImportedAt)}</span>
        <span>Cree le: {renderDate(origin.createdAt)}</span>
        <span>Mis a jour le: {renderDate(origin.updatedAt)}</span>
      </div>
    </article>
  );
}

export function ObjectWorkspaceSyncIdentifiersPanel({
  value,
  access,
  statusMessage,
}: ObjectWorkspaceSyncIdentifiersPanelProps) {
  const note = statusMessage ?? access.disabledReason;
  const uniqueSourceCount = new Set(value.externalIdentifiers.map((item) => item.sourceSystem.toLowerCase())).size;

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Synchronisation</h2>
          </div>
          <div className="stack-list text-right">
            <strong>Lecture seule</strong>
            {note && <small className="text-muted-foreground">{note}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Identifiants externes</span>
            <strong>{value.externalIdentifiers.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Systèmes sources</span>
            <strong>{uniqueSourceCount}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Origines</span>
            <strong>{value.origins.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Derniere source de MAJ</span>
            <strong>{value.objectUpdatedAtSource || 'Non renseignee'}</strong>
            <p>Horodatage objet: {renderDate(value.objectUpdatedAt || value.objectCreatedAt)}</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Identifiants externes</span>
              <h3>Liens de synchronisation</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.externalIdentifiers.length > 0 ? value.externalIdentifiers.map(renderExternalIdentifier) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Identifiants</span>
                <p>{value.externalIdentifiersVisibilityNote ?? 'Aucun identifiant externe visible pour cette fiche.'}</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Origines</span>
              <h3>Provenance et import</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.origins.length > 0 ? value.origins.map(renderOrigin) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Provenance</span>
                <p>{value.originsVisibilityNote ?? 'Aucune origine n est actuellement exposee.'}</p>
              </article>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
