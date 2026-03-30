import type { ObjectWorkspaceContactItem, ObjectWorkspaceContactsModule } from '../../services/object-workspace-parser';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceContactsPanelProps {
  value: ObjectWorkspaceContactsModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onAddContact: () => void;
  onUpdateContact: (contactId: string, patch: Partial<ObjectWorkspaceContactItem>) => void;
  onRemoveContact: (contactId: string) => void;
  onSave: () => void;
}

function ContactCard(props: {
  item: ObjectWorkspaceContactItem;
  value: ObjectWorkspaceContactsModule;
  disabled: boolean;
  onChange: (patch: Partial<ObjectWorkspaceContactItem>) => void;
  onRemove: () => void;
}) {
  const { item, value, disabled, onChange, onRemove } = props;

  return (
    <article className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.roleLabel || item.kindLabel}</span>
          <h3>{item.value || 'Contact sans valeur'}</h3>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove} disabled={disabled}>
          Retirer
        </Button>
      </div>

      <div className="drawer-grid">
        <div className="field-block">
          <Label htmlFor={`contact-kind-${item.id}`}>Type</Label>
          <select
            id={`contact-kind-${item.id}`}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            value={item.kindCode}
            disabled={disabled}
            onChange={(event) => onChange({ kindCode: event.target.value })}
          >
            {value.kindOptions.map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block">
          <Label htmlFor={`contact-role-${item.id}`}>Role</Label>
          <select
            id={`contact-role-${item.id}`}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            value={item.roleCode}
            disabled={disabled}
            onChange={(event) => onChange({ roleCode: event.target.value })}
          >
            <option value="">Aucun role</option>
            {value.roleOptions.map((option) => (
              <option key={option.id} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`contact-value-${item.id}`}>Valeur</Label>
          <Input id={`contact-value-${item.id}`} value={item.value} disabled={disabled} onChange={(event) => onChange({ value: event.target.value })} />
        </div>

        <div className="field-block">
          <Label htmlFor={`contact-position-${item.id}`}>Position</Label>
          <Input id={`contact-position-${item.id}`} value={item.position} disabled={disabled} onChange={(event) => onChange({ position: event.target.value })} />
        </div>

        <label className="field-block">
          <span className="text-sm font-medium">Public</span>
          <input type="checkbox" checked={item.isPublic} disabled={disabled} onChange={(event) => onChange({ isPublic: event.target.checked })} />
        </label>

        <label className="field-block">
          <span className="text-sm font-medium">Principal</span>
          <input type="checkbox" checked={item.isPrimary} disabled={disabled} onChange={(event) => onChange({ isPrimary: event.target.checked })} />
        </label>
      </div>
    </article>
  );
}

export function ObjectWorkspaceContactsPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onAddContact,
  onUpdateContact,
  onRemoveContact,
  onSave,
}: ObjectWorkspaceContactsPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">B4</span>
            <h2>Contacts publics et web</h2>
            <p>Cet onglet gere uniquement les contacts de l objet. Les contacts d acteurs et d organisations restent dans les modules de relations.</p>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button type="button" variant="ghost" onClick={onAddContact} disabled={!access.canDirectWrite || saving}>
                Ajouter un contact
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
            <span className="facet-title">Contacts objet</span>
            <strong>{value.objectItems.length} canal(aux)</strong>
            <p>Telephone, email, site web et autres canaux publies directement sur la fiche.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Hors perimetre B4</span>
            <p>{value.relatedActorContactsCount} contact(s) acteur et {value.relatedOrganizationContactsCount} contact(s) organisation sont visibles ailleurs, mais non editables ici.</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        {value.objectItems.length > 0 ? value.objectItems.map((item) => (
          <ContactCard
            key={item.id}
            item={item}
            value={value}
            disabled={!access.canDirectWrite}
            onChange={(patch) => onUpdateContact(item.id, patch)}
            onRemove={() => onRemoveContact(item.id)}
          />
        )) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Canaux objet</span>
            <p>Aucun contact objet n est encore renseigne.</p>
          </article>
        )}
      </section>
    </div>
  );
}
