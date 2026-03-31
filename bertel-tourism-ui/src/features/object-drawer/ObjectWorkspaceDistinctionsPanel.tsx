import { useState } from 'react';
import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceAccessibilityAmenityItem,
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionsModule,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceDistinctionsPanelProps {
  value: ObjectWorkspaceDistinctionsModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceDistinctionsModule) => void;
  onSave: () => void;
}

function renderDisabilityTypes(types: string[]) {
  if (types.length === 0) {
    return null;
  }
  return <span>Types: {types.join(', ')}</span>;
}

function renderAmenityItem(item: ObjectWorkspaceAccessibilityAmenityItem) {
  return (
    <article key={item.code} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <h3>{item.label}</h3>
        </div>
      </div>
      <div className="stack-list text-sm text-muted-foreground">
        {renderDisabilityTypes(item.disabilityTypes)}
      </div>
    </article>
  );
}

function DistinctionItemCard(props: {
  item: ObjectWorkspaceDistinctionItem;
  disabled: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<ObjectWorkspaceDistinctionItem>) => void;
}) {
  const { item, disabled, onRemove, onChange } = props;
  return (
    <article className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.schemeLabel}</span>
          <h3>{item.valueLabel}</h3>
        </div>
        <div className="stack-list text-right">
          <strong>{item.status || 'active'}</strong>
          <Button type="button" variant="ghost" onClick={onRemove} disabled={disabled}>
            Retirer
          </Button>
        </div>
      </div>
      <div className="drawer-grid">
        <div className="field-block">
          <Label htmlFor={`distinction-status-${item.recordId ?? item.valueCode}`}>Statut</Label>
          <select
            id={`distinction-status-${item.recordId ?? item.valueCode}`}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            value={item.status || 'active'}
            disabled={disabled}
            onChange={(event) => onChange({ status: event.target.value })}
          >
            <option value="active">active</option>
            <option value="pending">pending</option>
            <option value="suspended">suspended</option>
            <option value="expired">expired</option>
          </select>
        </div>
        <div className="field-block">
          <Label htmlFor={`distinction-awarded-${item.recordId ?? item.valueCode}`}>Attribue le</Label>
          <Input
            id={`distinction-awarded-${item.recordId ?? item.valueCode}`}
            type="date"
            value={item.awardedAt}
            disabled={disabled}
            onChange={(event) => onChange({ awardedAt: event.target.value })}
          />
        </div>
        <div className="field-block">
          <Label htmlFor={`distinction-until-${item.recordId ?? item.valueCode}`}>Valide jusqu au</Label>
          <Input
            id={`distinction-until-${item.recordId ?? item.valueCode}`}
            type="date"
            value={item.validUntil}
            disabled={disabled}
            onChange={(event) => onChange({ validUntil: event.target.value })}
          />
        </div>
        {item.disabilityTypesCovered.length > 0 && (
          <article className="panel-card panel-card--nested field-block">
            <span className="facet-title">Types couverts</span>
            <p>{item.disabilityTypesCovered.join(', ')}</p>
          </article>
        )}
      </div>
    </article>
  );
}

export function ObjectWorkspaceDistinctionsPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
}: ObjectWorkspaceDistinctionsPanelProps) {
  const disabled = !access.canDirectWrite;
  const [addingItem, setAddingItem] = useState(false);
  const [draftSchemeId, setDraftSchemeId] = useState('');
  const [draftValueId, setDraftValueId] = useState('');

  const distinctionCount = value.distinctionGroups.reduce((count, group) => count + group.items.length, 0);
  const accessibilityCoverageCount = value.accessibilityAmenityCoverage.reduce(
    (count, item) => count + Math.max(item.disabilityTypes.length, 1),
    0,
  );

  const selectedScheme = value.schemeOptions.find((s) => s.id === draftSchemeId) ?? null;

  function handleAddItem() {
    if (!selectedScheme) return;
    const valueOpt = selectedScheme.valueOptions.find((v) => v.id === draftValueId);
    if (!valueOpt) return;

    const newItem: ObjectWorkspaceDistinctionItem = {
      recordId: null,
      schemeId: selectedScheme.id,
      schemeCode: selectedScheme.code,
      schemeLabel: selectedScheme.label,
      valueId: valueOpt.id,
      valueCode: valueOpt.code,
      valueLabel: valueOpt.label,
      status: 'active',
      awardedAt: '',
      validUntil: '',
      disabilityTypesCovered: [],
    };

    if (selectedScheme.isAccessibility) {
      onChange({ ...value, accessibilityLabels: [...value.accessibilityLabels, newItem] });
    } else {
      const existingGroup = value.distinctionGroups.find((g) => g.schemeCode === selectedScheme.code);
      const nextGroups = existingGroup
        ? value.distinctionGroups.map((g) =>
            g.schemeCode === selectedScheme.code
              ? { ...g, items: [...g.items, newItem] }
              : g,
          )
        : [...value.distinctionGroups, { schemeCode: selectedScheme.code, schemeLabel: selectedScheme.label, items: [newItem] }];
      onChange({ ...value, distinctionGroups: nextGroups });
    }

    setAddingItem(false);
    setDraftSchemeId('');
    setDraftValueId('');
  }

  function removeDistinctionItem(schemeCode: string, item: ObjectWorkspaceDistinctionItem) {
    const nextGroups = value.distinctionGroups
      .map((g) => g.schemeCode === schemeCode ? { ...g, items: g.items.filter((i) => i !== item) } : g)
      .filter((g) => g.items.length > 0);
    onChange({ ...value, distinctionGroups: nextGroups });
  }

  function updateDistinctionItem(schemeCode: string, item: ObjectWorkspaceDistinctionItem, patch: Partial<ObjectWorkspaceDistinctionItem>) {
    const nextGroups = value.distinctionGroups.map((g) =>
      g.schemeCode === schemeCode
        ? { ...g, items: g.items.map((i) => i === item ? { ...i, ...patch } : i) }
        : g,
    );
    onChange({ ...value, distinctionGroups: nextGroups });
  }

  function removeAccessibilityLabel(item: ObjectWorkspaceDistinctionItem) {
    onChange({ ...value, accessibilityLabels: value.accessibilityLabels.filter((i) => i !== item) });
  }

  function updateAccessibilityLabel(item: ObjectWorkspaceDistinctionItem, patch: Partial<ObjectWorkspaceDistinctionItem>) {
    onChange({ ...value, accessibilityLabels: value.accessibilityLabels.map((i) => i === item ? { ...i, ...patch } : i) });
  }

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Labels & certifications</h2>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              {access.canDirectWrite && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setAddingItem((current) => !current); setDraftSchemeId(''); setDraftValueId(''); }}
                  disabled={saving || value.schemeOptions.length === 0}
                >
                  {addingItem ? 'Annuler' : 'Ajouter un label'}
                </Button>
              )}
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
            <span className="facet-title">Distinctions</span>
            <strong>{distinctionCount}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Labels accessibilité</span>
            <strong>{value.accessibilityLabels.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Couverture accessibilité</span>
            <strong>{accessibilityCoverageCount}</strong>
          </article>
        </div>
      </article>

      {addingItem && (
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Nouveau label</span>
              <h3>Selectionner un schema et une valeur</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddItem}
              disabled={!selectedScheme || !draftValueId}
            >
              Ajouter
            </Button>
          </div>
          <div className="drawer-grid">
            <div className="field-block">
              <Label htmlFor="new-label-scheme">Schema</Label>
              <select
                id="new-label-scheme"
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={draftSchemeId}
                onChange={(event) => { setDraftSchemeId(event.target.value); setDraftValueId(''); }}
              >
                <option value="">— Choisir un schema —</option>
                {value.schemeOptions.map((scheme) => (
                  <option key={scheme.id} value={scheme.id}>{scheme.label}</option>
                ))}
              </select>
            </div>
            <div className="field-block">
              <Label htmlFor="new-label-value">Valeur</Label>
              <select
                id="new-label-value"
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={draftValueId}
                disabled={!selectedScheme}
                onChange={(event) => setDraftValueId(event.target.value)}
              >
                <option value="">— Choisir une valeur —</option>
                {(selectedScheme?.valueOptions ?? []).map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </article>
      )}

      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Distinctions</span>
              <h3>Labels et certifications</h3>
            </div>
          </div>
          <div className="stack-list">
            {value.distinctionGroups.length > 0 ? value.distinctionGroups.map((group) => (
              <article key={group.schemeCode} className="panel-card panel-card--nested">
                <div className="panel-heading">
                  <div>
                    <h3>{group.schemeLabel}</h3>
                  </div>
                  <strong>{group.items.length}</strong>
                </div>
                <div className="stack-list">
                  {group.items.map((item) => (
                    <DistinctionItemCard
                      key={item.recordId ?? `${item.schemeCode}-${item.valueCode}`}
                      item={item}
                      disabled={disabled}
                      onRemove={() => removeDistinctionItem(group.schemeCode, item)}
                      onChange={(patch) => updateDistinctionItem(group.schemeCode, item, patch)}
                    />
                  ))}
                </div>
              </article>
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Distinctions</span>
                <p>Aucune distinction certifiee n est actuellement enregistree pour cet objet.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Accessibilite certifiee</span>
              <h3>Labels et perimetres couverts</h3>
            </div>
          </div>
          <div className="stack-list">
            {value.accessibilityLabels.length > 0 ? value.accessibilityLabels.map((item) => (
              <DistinctionItemCard
                key={item.recordId ?? `${item.schemeCode}-${item.valueCode}`}
                item={item}
                disabled={disabled}
                onRemove={() => removeAccessibilityLabel(item)}
                onChange={(patch) => updateAccessibilityLabel(item, patch)}
              />
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Labels accessibilite</span>
                <p>Aucun label d accessibilite n est actuellement enregistre pour cet objet.</p>
              </article>
            )}
          </div>
        </article>

        {value.accessibilityAmenityCoverage.length > 0 && (
          <article className="panel-card panel-card--nested">
            <div className="panel-heading">
              <div>
                <span className="facet-title">Couverture par equipements</span>
                <h3>Indices derives des equipements saisis</h3>
              </div>
            </div>
            <div className="stack-list">
              {value.accessibilityAmenityCoverage.map(renderAmenityItem)}
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
