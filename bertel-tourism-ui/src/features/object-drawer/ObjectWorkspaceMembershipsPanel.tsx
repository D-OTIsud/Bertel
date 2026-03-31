import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceMembershipsPanelProps {
  value: ObjectWorkspaceMembershipModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceMembershipModule) => void;
  onSave: () => void;
}

const MEMBERSHIP_STATUSES = ['prospect', 'invoiced', 'paid', 'canceled', 'lapsed'];

function buildDraftMembership(value: ObjectWorkspaceMembershipModule): ObjectWorkspaceMembershipItem | null {
  const defaultScopeOption = value.scopeOptions[0];
  const defaultCampaign = value.campaignOptions[0];
  const defaultTier = value.tierOptions[0];

  if (!defaultScopeOption || !defaultCampaign || !defaultTier) {
    return null;
  }

  return {
    recordId: null,
    scope: 'object',
    orgObjectId: defaultScopeOption.orgObjectId,
    orgLabel: defaultScopeOption.label,
    campaignId: defaultCampaign.id,
    campaignCode: defaultCampaign.code,
    campaignLabel: defaultCampaign.label,
    tierId: defaultTier.id,
    tierCode: defaultTier.code,
    tierLabel: defaultTier.label,
    status: 'prospect',
    startsAt: '',
    endsAt: '',
    paymentDate: '',
    metadataJson: '',
    visibilityImpact: 'Suivi commercial interne',
  };
}

function deriveVisibilityImpact(status: string): string {
  switch (status.trim().toLowerCase()) {
    case 'paid':
      return 'Visibilite active';
    case 'invoiced':
      return 'Activation conditionnee au paiement';
    case 'lapsed':
      return 'Visibilite commerciale lapsed';
    case 'canceled':
      return 'Aucun impact commercial actif';
    default:
      return 'Suivi commercial interne';
  }
}

export function ObjectWorkspaceMembershipsPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
}: ObjectWorkspaceMembershipsPanelProps) {
  const disabled = !access.canDirectWrite;
  const objectScopeCount = value.items.filter((item) => item.scope === 'object').length;
  const organizationScopeCount = value.items.length - objectScopeCount;
  const activeCount = value.items.filter((item) => ['paid', 'invoiced'].includes(item.status)).length;

  function updateItem(index: number, patch: Partial<ObjectWorkspaceMembershipItem>) {
    onChange({
      ...value,
      items: value.items.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const selectedCampaign = patch.campaignCode
          ? value.campaignOptions.find((option) => option.code === patch.campaignCode)
          : null;
        const selectedTier = patch.tierCode
          ? value.tierOptions.find((option) => option.code === patch.tierCode)
          : null;
        const selectedScope = patch.orgObjectId
          ? value.scopeOptions.find((option) => option.orgObjectId === patch.orgObjectId)
          : null;
        const nextStatus = patch.status ?? item.status;

        return {
          ...item,
          ...patch,
          campaignId: selectedCampaign?.id ?? item.campaignId,
          campaignLabel: selectedCampaign?.label ?? item.campaignLabel,
          tierId: selectedTier?.id ?? item.tierId,
          tierLabel: selectedTier?.label ?? item.tierLabel,
          orgLabel: selectedScope?.label ?? item.orgLabel,
          visibilityImpact: deriveVisibilityImpact(nextStatus),
        };
      }),
    });
  }

  function removeItem(index: number) {
    onChange({
      ...value,
      items: value.items.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function addMembership() {
    const nextItem = buildDraftMembership(value);
    if (!nextItem) {
      return;
    }

    onChange({
      ...value,
      items: [...value.items, nextItem],
    });
  }

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Adhésions</h2>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={addMembership}
                disabled={disabled || saving || value.scopeOptions.length === 0 || value.campaignOptions.length === 0 || value.tierOptions.length === 0}
              >
                Ajouter une adhesion
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
            <span className="facet-title">Adhesions actives</span>
            <strong>{activeCount}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Portee objet</span>
            <strong>{objectScopeCount}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Portee organisation</span>
            <strong>{organizationScopeCount}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Perimetre resolu</span>
            <strong>{value.scopeOptions.length}</strong>
            <p>{value.unavailableReason ?? 'Organisation(s) de rattachement disponibles pour rattacher ou relire les adhesions.'}</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        {value.items.length > 0 ? value.items.map((item, index) => (
          <article key={item.recordId ?? `membership-${index}`} className="panel-card panel-card--nested">
            <div className="panel-heading">
              <div>
                <span className="facet-title">{item.scope === 'object' ? 'Portee objet' : 'Portee organisation'}</span>
                <h3>{item.campaignLabel || 'Adhesion'}{item.tierLabel ? ` · ${item.tierLabel}` : ''}</h3>
              </div>
              <div className="stack-list text-right">
                <strong>{item.status || 'prospect'}</strong>
                <Button type="button" variant="ghost" onClick={() => removeItem(index)} disabled={disabled}>
                  Retirer
                </Button>
              </div>
            </div>

            <div className="drawer-grid">
              <div className="field-block">
                <Label htmlFor={`membership-scope-${index}`}>Portee</Label>
                <select
                  id={`membership-scope-${index}`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={item.scope}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { scope: event.target.value as ObjectWorkspaceMembershipItem['scope'] })}
                >
                  <option value="object">Objet</option>
                  <option value="organization">Organisation</option>
                </select>
              </div>

              <div className="field-block">
                <Label htmlFor={`membership-org-${index}`}>Organisation porteuse</Label>
                <select
                  id={`membership-org-${index}`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={item.orgObjectId}
                  disabled={disabled || value.scopeOptions.length === 0}
                  onChange={(event) => updateItem(index, { orgObjectId: event.target.value })}
                >
                  {value.scopeOptions.map((option) => (
                    <option key={option.orgObjectId} value={option.orgObjectId}>
                      {option.label}{option.isPrimary ? ' (principale)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-block">
                <Label htmlFor={`membership-campaign-${index}`}>Campagne</Label>
                <select
                  id={`membership-campaign-${index}`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={item.campaignCode}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { campaignCode: event.target.value })}
                >
                  {value.campaignOptions.map((option) => (
                    <option key={option.id} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-block">
                <Label htmlFor={`membership-tier-${index}`}>Palier</Label>
                <select
                  id={`membership-tier-${index}`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={item.tierCode}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { tierCode: event.target.value })}
                >
                  {value.tierOptions.map((option) => (
                    <option key={option.id} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-block">
                <Label htmlFor={`membership-status-${index}`}>Statut</Label>
                <select
                  id={`membership-status-${index}`}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={item.status}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { status: event.target.value })}
                >
                  {MEMBERSHIP_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-block">
                <Label htmlFor={`membership-starts-${index}`}>Debut</Label>
                <Input
                  id={`membership-starts-${index}`}
                  type="date"
                  value={item.startsAt}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { startsAt: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor={`membership-ends-${index}`}>Fin</Label>
                <Input
                  id={`membership-ends-${index}`}
                  type="date"
                  value={item.endsAt}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { endsAt: event.target.value })}
                />
              </div>

              <div className="field-block">
                <Label htmlFor={`membership-payment-${index}`}>Date de paiement</Label>
                <Input
                  id={`membership-payment-${index}`}
                  type="date"
                  value={item.paymentDate}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { paymentDate: event.target.value })}
                />
              </div>

              <article className="panel-card panel-card--nested field-block">
                <span className="facet-title">Impact commercial</span>
                <p>{item.visibilityImpact}</p>
              </article>

              <article className="panel-card panel-card--nested field-block">
                <span className="facet-title">Organisation cible</span>
                <p>{item.orgLabel || 'Organisation non resolue'}</p>
              </article>

              <div className="field-block field-block--wide">
                <Label htmlFor={`membership-metadata-${index}`}>Metadata JSON</Label>
                <textarea
                  id={`membership-metadata-${index}`}
                  className="min-h-24 rounded-2xl border border-input bg-background px-4 py-3 text-sm"
                  value={item.metadataJson}
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { metadataJson: event.target.value })}
                />
              </div>
            </div>
          </article>
        )) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Adhesions</span>
            <p>{value.unavailableReason ?? 'Aucune adhesion n est actuellement rattachee a cet objet ou a son organisation porteuse.'}</p>
          </article>
        )}
      </section>
    </div>
  );
}
