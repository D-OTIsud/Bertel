import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceCapacityItem,
  ObjectWorkspaceCapacityPoliciesModule,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceCapacityPoliciesPanelProps {
  value: ObjectWorkspaceCapacityPoliciesModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceCapacityPoliciesModule) => void;
  onSave: () => void;
}

function sortCapacityItems(items: ObjectWorkspaceCapacityItem[]): ObjectWorkspaceCapacityItem[] {
  return [...items].sort((left, right) => left.metricLabel.localeCompare(right.metricLabel, 'fr'));
}

export function ObjectWorkspaceCapacityPoliciesPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
}: ObjectWorkspaceCapacityPoliciesPanelProps) {
  const disabled = !access.canDirectWrite;

  function patchCapacityItems(nextItems: ObjectWorkspaceCapacityItem[]) {
    onChange({
      ...value,
      capacityItems: sortCapacityItems(nextItems),
    });
  }

  function addCapacityItem() {
    const fallback = value.metricOptions.find((option) => !value.capacityItems.some((item) => item.metricCode === option.code))
      ?? value.metricOptions[0];
    if (!fallback) {
      return;
    }

    patchCapacityItems([
      ...value.capacityItems,
      {
        recordId: null,
        metricId: fallback.id,
        metricCode: fallback.code,
        metricLabel: fallback.label,
        unit: '',
        value: '',
        effectiveFrom: '',
        effectiveTo: '',
      },
    ]);
  }

  function updateCapacityItem(index: number, patch: Partial<ObjectWorkspaceCapacityItem>) {
    patchCapacityItems(value.capacityItems.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }

      const selectedMetric = patch.metricCode
        ? value.metricOptions.find((option) => option.code === patch.metricCode)
        : null;

      return {
        ...item,
        ...patch,
        metricId: selectedMetric?.id ?? item.metricId,
        metricLabel: selectedMetric?.label ?? item.metricLabel,
      };
    }));
  }

  function removeCapacityItem(index: number) {
    patchCapacityItems(value.capacityItems.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Capacites</span>
            <h2>Capacites et politiques</h2>
            <p>Rassemblez ici les capacites, l accueil des groupes et la politique d accueil des animaux.</p>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button type="button" variant="ghost" onClick={addCapacityItem} disabled={disabled || saving}>
                Ajouter une capacite
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
            <span className="facet-title">Capacites</span>
            <strong>{value.capacityItems.length}</strong>
            <p>Les volumes et jauges metier restent des enregistrements structurants, distincts des politiques.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Groupes</span>
            <strong>{value.groupPolicy.groupOnly ? 'Groupe uniquement' : 'Mixte'}</strong>
            <p>Minimum, maximum et notes d accueil groupes.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Animaux</span>
            <strong>{value.petPolicy.hasPolicy ? (value.petPolicy.accepted ? 'Acceptes' : 'Refuses') : 'Non renseigne'}</strong>
            <p>{value.unavailableReason ?? 'Precisez ici si les animaux sont acceptes et sous quelles conditions.'}</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Capacites</span>
              <h3>Metriques structurelles</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.capacityItems.length > 0 ? value.capacityItems.map((item, index) => (
              <article key={`${item.metricCode}-${index}`} className="panel-card panel-card--nested">
                <div className="panel-heading">
                  <div>
                    <span className="facet-title">{item.metricLabel}</span>
                    <h3>{item.value || 'Valeur non renseignee'}{item.unit ? ` ${item.unit}` : ''}</h3>
                  </div>
                  <Button type="button" variant="ghost" disabled={disabled} onClick={() => removeCapacityItem(index)}>
                    Retirer
                  </Button>
                </div>

                <div className="drawer-grid">
                  <div className="field-block">
                    <Label htmlFor={`capacity-metric-${index}`}>Metrique</Label>
                    <select
                      id={`capacity-metric-${index}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      value={item.metricCode}
                      disabled={disabled}
                      onChange={(event) => updateCapacityItem(index, { metricCode: event.target.value })}
                    >
                      {value.metricOptions.map((option) => (
                        <option key={option.id} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`capacity-value-${index}`}>Valeur</Label>
                    <Input
                      id={`capacity-value-${index}`}
                      value={item.value}
                      disabled={disabled}
                      onChange={(event) => updateCapacityItem(index, { value: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`capacity-from-${index}`}>Effective du</Label>
                    <input
                      id={`capacity-from-${index}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      type="date"
                      value={item.effectiveFrom}
                      disabled={disabled}
                      onChange={(event) => updateCapacityItem(index, { effectiveFrom: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`capacity-to-${index}`}>Effective au</Label>
                    <input
                      id={`capacity-to-${index}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      type="date"
                      value={item.effectiveTo}
                      disabled={disabled}
                      onChange={(event) => updateCapacityItem(index, { effectiveTo: event.target.value })}
                    />
                  </div>
                </div>
              </article>
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Capacites</span>
                <p>Aucune capacite n est actuellement renseignee.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Politique groupes</span>
              <h3>Accueil collectif</h3>
            </div>
          </div>

          <div className="drawer-grid">
            <div className="field-block">
              <Label htmlFor="group-policy-min-size">Taille minimale</Label>
              <Input
                id="group-policy-min-size"
                value={value.groupPolicy.minSize}
                disabled={disabled}
                onChange={(event) => onChange({
                  ...value,
                  groupPolicy: { ...value.groupPolicy, minSize: event.target.value },
                })}
              />
            </div>

            <div className="field-block">
              <Label htmlFor="group-policy-max-size">Taille maximale</Label>
              <Input
                id="group-policy-max-size"
                value={value.groupPolicy.maxSize}
                disabled={disabled}
                onChange={(event) => onChange({
                  ...value,
                  groupPolicy: { ...value.groupPolicy, maxSize: event.target.value },
                })}
              />
            </div>

            <label className="field-block">
              <span className="text-sm font-medium">Groupes uniquement</span>
              <input
                type="checkbox"
                checked={value.groupPolicy.groupOnly}
                disabled={disabled}
                onChange={(event) => onChange({
                  ...value,
                  groupPolicy: { ...value.groupPolicy, groupOnly: event.target.checked },
                })}
              />
            </label>

            <div className="field-block field-block--wide">
              <Label htmlFor="group-policy-notes">Notes</Label>
              <textarea
                id="group-policy-notes"
                className="min-h-28 rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                value={value.groupPolicy.notes}
                disabled={disabled}
                onChange={(event) => onChange({
                  ...value,
                  groupPolicy: { ...value.groupPolicy, notes: event.target.value },
                })}
              />
            </div>
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Politique animaux</span>
              <h3>Conditions d accueil</h3>
            </div>
          </div>

          <div className="drawer-grid">
            <label className="field-block">
              <span className="text-sm font-medium">Politique renseignee</span>
              <input
                type="checkbox"
                checked={value.petPolicy.hasPolicy}
                disabled={disabled}
                onChange={(event) => onChange({
                  ...value,
                  petPolicy: {
                    ...value.petPolicy,
                    hasPolicy: event.target.checked,
                  },
                })}
              />
            </label>

            <label className="field-block">
              <span className="text-sm font-medium">Animaux acceptes</span>
              <input
                type="checkbox"
                checked={value.petPolicy.accepted}
                disabled={disabled || !value.petPolicy.hasPolicy}
                onChange={(event) => onChange({
                  ...value,
                  petPolicy: {
                    ...value.petPolicy,
                    accepted: event.target.checked,
                  },
                })}
              />
            </label>

            <div className="field-block field-block--wide">
              <Label htmlFor="pet-policy-conditions">Conditions</Label>
              <textarea
                id="pet-policy-conditions"
                className="min-h-28 rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                value={value.petPolicy.conditions}
                disabled={disabled || !value.petPolicy.hasPolicy}
                onChange={(event) => onChange({
                  ...value,
                  petPolicy: {
                    ...value.petPolicy,
                    conditions: event.target.value,
                  },
                })}
              />
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
