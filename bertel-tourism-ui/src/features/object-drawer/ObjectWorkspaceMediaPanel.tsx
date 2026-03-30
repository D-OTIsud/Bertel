import type { ObjectWorkspaceMediaItem, ObjectWorkspaceMediaModule } from '../../services/object-workspace-parser';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceMediaPanelProps {
  value: ObjectWorkspaceMediaModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess & { canEditPlaceMedia: boolean };
  onAddObjectMedia: () => void;
  onUpdateObjectMedia: (mediaId: string, patch: Partial<ObjectWorkspaceMediaItem>) => void;
  onRemoveObjectMedia: (mediaId: string) => void;
  onSave: () => void;
}

function MediaEditorCard(props: {
  item: ObjectWorkspaceMediaItem;
  typeOptions: ObjectWorkspaceMediaModule['typeOptions'];
  disabled: boolean;
  onChange: (patch: Partial<ObjectWorkspaceMediaItem>) => void;
  onRemove: () => void;
}) {
  const { item, typeOptions, disabled, onChange, onRemove } = props;

  return (
    <article className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.scopeLabel}</span>
          <h3>{item.title || 'Media sans titre'}</h3>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove} disabled={disabled}>
          Retirer
        </Button>
      </div>

      <div className="drawer-grid">
        <div className="field-block">
          <Label htmlFor={`media-type-${item.id}`}>Type</Label>
          <select
            id={`media-type-${item.id}`}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            value={item.typeCode}
            disabled={disabled}
            onChange={(event) => onChange({ typeCode: event.target.value })}
          >
            {typeOptions.map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`media-title-${item.id}`}>Titre</Label>
          <Input id={`media-title-${item.id}`} value={item.title} disabled={disabled} onChange={(event) => onChange({ title: event.target.value })} />
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`media-url-${item.id}`}>URL</Label>
          <Input id={`media-url-${item.id}`} value={item.url} disabled={disabled} onChange={(event) => onChange({ url: event.target.value })} />
        </div>

        <div className="field-block">
          <Label htmlFor={`media-credit-${item.id}`}>Credit</Label>
          <Input id={`media-credit-${item.id}`} value={item.credit} disabled={disabled} onChange={(event) => onChange({ credit: event.target.value })} />
        </div>

        <div className="field-block">
          <Label htmlFor={`media-visibility-${item.id}`}>Visibilite</Label>
          <select
            id={`media-visibility-${item.id}`}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            value={item.visibility}
            disabled={disabled}
            onChange={(event) => onChange({ visibility: event.target.value })}
          >
            <option value="public">public</option>
            <option value="partners">partners</option>
            <option value="private">private</option>
          </select>
        </div>

        <div className="field-block">
          <Label htmlFor={`media-position-${item.id}`}>Position</Label>
          <Input id={`media-position-${item.id}`} value={item.position} disabled={disabled} onChange={(event) => onChange({ position: event.target.value })} />
        </div>

        <div className="field-block">
          <Label htmlFor={`media-rights-${item.id}`}>Droits jusqu au</Label>
          <Input id={`media-rights-${item.id}`} type="date" value={item.rightsExpiresAt} disabled={disabled} onChange={(event) => onChange({ rightsExpiresAt: event.target.value })} />
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`media-tags-${item.id}`}>Tags</Label>
          <Input
            id={`media-tags-${item.id}`}
            value={item.tags.join(', ')}
            disabled={disabled}
            onChange={(event) => onChange({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
          />
        </div>

        <label className="field-block">
          <span className="text-sm font-medium">Media principal</span>
          <input type="checkbox" checked={item.isMain} disabled={disabled} onChange={(event) => onChange({ isMain: event.target.checked })} />
        </label>

        <label className="field-block">
          <span className="text-sm font-medium">Publie</span>
          <input type="checkbox" checked={item.isPublished} disabled={disabled} onChange={(event) => onChange({ isPublished: event.target.checked })} />
        </label>
      </div>
    </article>
  );
}

export function ObjectWorkspaceMediaPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onAddObjectMedia,
  onUpdateObjectMedia,
  onRemoveObjectMedia,
  onSave,
}: ObjectWorkspaceMediaPanelProps) {
  const placeGroups = value.placeItems.reduce<Record<string, ObjectWorkspaceMediaItem[]>>((acc, item) => {
    const key = item.scopeLabel || 'Sous-lieu';
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">B3</span>
            <h2>Medias</h2>
            <p>La portee objet et la portee sous-lieu restent visibles distinctement. Cette premiere iteration edite completement les medias objet.</p>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button type="button" variant="ghost" onClick={onAddObjectMedia} disabled={!access.canDirectWrite || saving}>
                Ajouter un media
              </Button>
              <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
                {saving ? 'Enregistrement...' : saveAction.label}
              </Button>
            </div>
            {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Portee objet</span>
            <strong>{value.objectItems.length} media(s)</strong>
            <p>Edition complete: titre, URL, type, droits, visibilite, ordre, publication et media principal.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Portee sous-lieu</span>
            <strong>{value.placeItems.length} media(s)</strong>
            <p>{access.canEditPlaceMedia ? 'Edition autorisee pour les medias de sous-lieu.' : value.placeScopeUnavailableReason ?? 'Lecture seule sur cette premiere livraison.'}</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        {value.objectItems.length > 0 ? value.objectItems.map((item) => (
          <MediaEditorCard
            key={item.id}
            item={item}
            typeOptions={value.typeOptions}
            disabled={!access.canDirectWrite}
            onChange={(patch) => onUpdateObjectMedia(item.id, patch)}
            onRemove={() => onRemoveObjectMedia(item.id)}
          />
        )) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Galerie objet</span>
            <p>Aucun media objet n est encore rattache a cette fiche.</p>
          </article>
        )}
      </section>

      <section className="drawer-form-stack">
        {Object.entries(placeGroups).length > 0 ? Object.entries(placeGroups).map(([label, items]) => (
          <article key={label} className="panel-card panel-card--nested">
            <span className="facet-title">Sous-lieu</span>
            <h3>{label}</h3>
            <div className="stack-list">
              {items.map((item) => (
                <article key={item.id} className="panel-card panel-card--nested">
                  <strong>{item.title || 'Media sans titre'}</strong>
                  <p>{item.typeLabel || item.typeCode || 'Type non precise'} · {item.visibility || 'public'} · {item.url}</p>
                  {item.tags.length > 0 && <small>{item.tags.join(', ')}</small>}
                </article>
              ))}
            </div>
          </article>
        )) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Sous-lieux</span>
            <p>Aucun media de sous-lieu n est expose par le payload courant.</p>
          </article>
        )}
      </section>
    </div>
  );
}
