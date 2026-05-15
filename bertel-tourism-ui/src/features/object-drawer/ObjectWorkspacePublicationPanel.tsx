import type {
  ObjectWorkspaceModerationItem,
  ObjectWorkspacePublicationModule,
  ObjectWorkspacePublicationSelectionItem,
} from '../../services/object-workspace-parser';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspacePublicationPanelProps {
  value: ObjectWorkspacePublicationModule;
  commercialVisibility: string;
  visibilityDirty: boolean;
  access: ObjectWorkspaceModuleAccess;
  saving: boolean;
  statusMessage: string | null;
  settingsSaveAction: SaveActionState;
  onCommercialVisibilityChange: (nextValue: string) => void;
  onSaveSettings: () => void;
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

function formatModerationAction(value: string): string {
  switch (value) {
    case 'insert':
      return 'Creation';
    case 'delete':
      return 'Suppression';
    case 'update':
      return 'Mise a jour';
    default:
      return value || 'Modification';
  }
}

function formatModerationStatus(value: string): string {
  switch (value) {
    case 'pending':
      return 'En attente';
    case 'approved':
      return 'Validee';
    case 'rejected':
      return 'Refusee';
    case 'applied':
      return 'Appliquee';
    default:
      return value || 'En cours';
  }
}

function formatPublicationStatus(value: string): string {
  switch (value) {
    case 'published':
      return 'Publie';
    case 'proofing':
      return 'En relecture';
    case 'planning':
      return 'En preparation';
    default:
      return value || 'Statut non precise';
  }
}

function formatWorkflowStatus(value: string): string {
  switch (value) {
    case 'selected':
      return 'Selectionne';
    case 'proof_sent':
      return 'BAT envoye';
    case 'validated':
      return 'Valide';
    default:
      return value || 'Workflow en cours';
  }
}

function formatCommercialVisibility(value: string): string {
  switch (value) {
    case 'active':
      return 'Active';
    case 'lapsed':
      return 'En pause';
    case 'suspended':
      return 'Suspendue';
    default:
      return value || 'Non renseignee';
  }
}

function renderModerationItem(item: ObjectWorkspaceModerationItem) {
  return (
    <article key={item.id} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.summary}</span>
          <p>{formatModerationAction(item.action)} · {formatModerationStatus(item.status)}</p>
        </div>
        <small>{formatDateLabel(item.submittedAt, 'Date non disponible')}</small>
      </div>
      {item.reviewNote && <p>{item.reviewNote}</p>}
    </article>
  );
}

function renderPublicationSelection(item: ObjectWorkspacePublicationSelectionItem) {
  const meta = [
    item.publicationYear ? `Edition ${item.publicationYear}` : '',
    formatPublicationStatus(item.publicationStatus),
    formatWorkflowStatus(item.workflowStatus),
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
  commercialVisibility,
  access,
  saving,
  statusMessage,
  onCommercialVisibilityChange,
  onTogglePublication,
}: ObjectWorkspacePublicationPanelProps) {
  const isPublished = value.status === 'published';
  const actionLabel = isPublished ? 'Retirer du public' : 'Publier';
  const publishHint = access.disabledReason ?? (
    isPublished
      ? 'La fiche est actuellement visible par le public.'
      : 'La fiche restera interne tant que vous ne la publiez pas.'
  );

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Publication</span>
            <h2>Publication</h2>
            <p>Reglez ici la diffusion commerciale de la fiche, sa visibilite publique et le suivi editorial.</p>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => onTogglePublication(!isPublished)}
                disabled={saving || !access.canDirectWrite}
              >
                {saving ? 'Traitement...' : actionLabel}
              </Button>
            </div>
            {!access.canDirectWrite && <small className="text-muted-foreground">{publishHint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Statut public</span>
            <strong>{isPublished ? 'Publiee' : 'Non publiee'}</strong>
            <p>{isPublished ? 'La fiche est accessible au public.' : 'La fiche reste visible uniquement en interne.'}</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Premiere publication</span>
            <strong>{formatDateLabel(value.publishedAt, 'Non publiee')}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Visibilite commerciale</span>
            <strong>{formatCommercialVisibility(commercialVisibility)}</strong>
            <p>Ce reglage pilote la diffusion commerciale de la fiche.</p>
          </article>
        </div>

        <div className="drawer-grid">
          <div className="field-block">
            <Label htmlFor="publication-commercial-visibility">Visibilite commerciale</Label>
            <Select
              id="publication-commercial-visibility"
              value={commercialVisibility}
              onChange={(event) => onCommercialVisibilityChange(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="lapsed">En pause</option>
              <option value="suspended">Suspendue</option>
            </Select>
            <p>Choisissez si la fiche peut etre diffusee commercialement, mise en pause ou suspendue.</p>
          </div>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Action de publication</span>
            <strong>{actionLabel}</strong>
            <p>{publishHint}</p>
          </article>
        </div>
      </article>

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
          <p>{value.moderation.unavailableReason ?? 'Non disponible dans ce contexte.'}</p>
        )}
      </article>

      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="facet-title">Supports imprimes</span>
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
          <p>{value.printPublications.unavailableReason ?? 'Non disponible dans ce contexte.'}</p>
        )}
      </article>
    </div>
  );
}
