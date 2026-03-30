import type {
  ObjectWorkspaceModerationItem,
  ObjectWorkspacePublicationModule,
  ObjectWorkspacePublicationSelectionItem,
} from '../../services/object-workspace-parser';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import { Button } from '@/components/ui/button';

interface ObjectWorkspacePublicationPanelProps {
  value: ObjectWorkspacePublicationModule;
  access: ObjectWorkspaceModuleAccess;
  saving: boolean;
  statusMessage: string | null;
  onTogglePublication: (publish: boolean) => void;
}

function formatDateLabel(value: string, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function renderModerationItem(item: ObjectWorkspaceModerationItem) {
  return (
    <article key={item.id} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.summary}</span>
          <p>{item.targetTable} · {item.action} · {item.status}</p>
        </div>
        <small>{formatDateLabel(item.submittedAt, 'Date non disponible')}</small>
      </div>
      {item.reviewNote && <p>{item.reviewNote}</p>}
    </article>
  );
}

function renderPublicationSelection(item: ObjectWorkspacePublicationSelectionItem) {
  const meta = [
    item.publicationCode,
    item.publicationYear,
    item.publicationStatus,
    item.workflowStatus,
  ].filter(Boolean).join(' · ');

  return (
    <article key={`${item.publicationId}-${item.workflowStatus}-${item.pageNumber}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.publicationName || item.publicationCode || 'Publication'}</span>
          <p>{meta || 'Workflow print sans metadonnees detaillees.'}</p>
        </div>
        <small>{item.pageNumber ? `Page ${item.pageNumber}` : 'Page non affectee'}</small>
      </div>
      {item.customPrintText && <p>{item.customPrintText}</p>}
    </article>
  );
}

export function ObjectWorkspacePublicationPanel({
  value,
  access,
  saving,
  statusMessage,
  onTogglePublication,
}: ObjectWorkspacePublicationPanelProps) {
  const isPublished = value.status === 'published';
  const actionLabel = isPublished ? 'Retirer du public' : 'Publier';
  const publishHint = access.disabledReason ?? (
    isPublished
      ? 'La depubication repasse la fiche en statut masque.'
      : 'La publication utilise la RPC metier dediee du backend.'
  );

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">A3</span>
            <h2>Publication et moderation</h2>
            <p>Ce module porte l etat editorial, la publication et les surfaces internes de validation sans les melanger aux onglets metier.</p>
          </div>
          <div className="stack-list text-right">
            <Button
              type="button"
              variant="outline"
              onClick={() => onTogglePublication(!isPublished)}
              disabled={saving || !access.canDirectWrite}
            >
              {saving ? 'Traitement...' : actionLabel}
            </Button>
            <small className="text-muted-foreground">{publishHint}</small>
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Statut courant</span>
            <strong>{value.status || 'draft'}</strong>
            <p>{value.isEditing ? 'La fiche porte un marqueur d edition en cours.' : 'Aucune edition en attente n est signalee par le flag objet.'}</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Premiere publication</span>
            <strong>{formatDateLabel(value.publishedAt, 'Non publiee')}</strong>
            <p>Le backend conserve la date de premiere publication meme en cas de retrait temporaire.</p>
          </article>
        </div>
      </article>

      <div className="drawer-grid">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Moderation</span>
              <h3>{value.moderation.pendingCount} changement(s) en attente</h3>
            </div>
          </div>

          {value.moderation.availability === 'available' ? (
            value.moderation.items.length > 0 ? (
              <div className="stack-list">
                {value.moderation.items.map(renderModerationItem)}
              </div>
            ) : (
              <p>Aucune proposition en attente pour cette fiche.</p>
            )
          ) : (
            <p>{value.moderation.unavailableReason ?? 'La file de moderation n est pas encore exposee dans ce contexte live.'}</p>
          )}
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Publications print</span>
              <h3>{value.printPublications.selectionCount} support(s) lies</h3>
            </div>
          </div>

          {value.printPublications.availability === 'available' ? (
            value.printPublications.items.length > 0 ? (
              <div className="stack-list">
                {value.printPublications.items.map(renderPublicationSelection)}
              </div>
            ) : (
              <p>Aucun support print n est actuellement rattache a cette fiche.</p>
            )
          ) : (
            <p>{value.printPublications.unavailableReason ?? 'Le workflow print n est pas encore raccorde a ce profil.'}</p>
          )}
        </article>
      </div>
    </div>
  );
}
