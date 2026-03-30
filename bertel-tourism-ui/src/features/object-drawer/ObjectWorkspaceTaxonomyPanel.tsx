import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceTaxonomyItem,
  ObjectWorkspaceTaxonomyModule,
  ObjectWorkspaceTaxonomyScheme,
  WorkspaceReferenceOption,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceTaxonomyPanelProps {
  value: ObjectWorkspaceTaxonomyModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceTaxonomyModule) => void;
  onSave: () => void;
}

function resolveValueOptions(scheme: ObjectWorkspaceTaxonomyScheme): WorkspaceReferenceOption[] {
  if (scheme.valueOptions.length > 0) {
    return scheme.valueOptions;
  }

  return scheme.items.map((item) => ({
    id: item.valueId || `${scheme.id}:${item.valueCode}`,
    code: item.valueCode,
    label: item.valueLabel,
  }));
}

function buildTaxonomyItem(
  scheme: ObjectWorkspaceTaxonomyScheme,
  option: WorkspaceReferenceOption,
  existing?: ObjectWorkspaceTaxonomyItem,
): ObjectWorkspaceTaxonomyItem {
  return existing ?? {
    recordId: null,
    schemeId: scheme.id,
    schemeCode: scheme.code,
    schemeLabel: scheme.label,
    valueId: option.id,
    valueCode: option.code,
    valueLabel: option.label,
    status: '',
    awardedAt: '',
    validUntil: '',
  };
}

function sortSchemeItems(scheme: ObjectWorkspaceTaxonomyScheme, items: ObjectWorkspaceTaxonomyItem[]): ObjectWorkspaceTaxonomyItem[] {
  const orderByCode = new Map(resolveValueOptions(scheme).map((option, index) => [option.code, index]));
  return [...items].sort((left, right) => {
    const leftOrder = orderByCode.get(left.valueCode) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderByCode.get(right.valueCode) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.valueLabel.localeCompare(right.valueLabel, 'fr');
  });
}

function updateScheme(module: ObjectWorkspaceTaxonomyModule, schemeId: string, updater: (scheme: ObjectWorkspaceTaxonomyScheme) => ObjectWorkspaceTaxonomyScheme): ObjectWorkspaceTaxonomyModule {
  return {
    ...module,
    schemes: module.schemes.map((scheme) => (scheme.id === schemeId ? updater(scheme) : scheme)),
  };
}

export function ObjectWorkspaceTaxonomyPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
}: ObjectWorkspaceTaxonomyPanelProps) {
  const disabled = !access.canDirectWrite;

  function handleSingleSelection(schemeId: string, valueCode: string) {
    onChange(updateScheme(value, schemeId, (scheme) => {
      if (!valueCode) {
        return {
          ...scheme,
          items: [],
        };
      }

      const option = resolveValueOptions(scheme).find((candidate) => candidate.code === valueCode);
      if (!option) {
        return scheme;
      }

      const existing = scheme.items.find((item) => item.valueCode === valueCode);
      return {
        ...scheme,
        items: [buildTaxonomyItem(scheme, option, existing)],
      };
    }));
  }

  function handleMultiSelection(schemeId: string, valueCode: string, checked: boolean) {
    onChange(updateScheme(value, schemeId, (scheme) => {
      const option = resolveValueOptions(scheme).find((candidate) => candidate.code === valueCode);
      if (!option) {
        return scheme;
      }

      if (!checked) {
        return {
          ...scheme,
          items: scheme.items.filter((item) => item.valueCode !== valueCode),
        };
      }

      if (scheme.items.some((item) => item.valueCode === valueCode)) {
        return scheme;
      }

      return {
        ...scheme,
        items: sortSchemeItems(scheme, [...scheme.items, buildTaxonomyItem(scheme, option)]),
      };
    }));
  }

  function handleItemPatch(schemeId: string, valueCode: string, patch: Partial<ObjectWorkspaceTaxonomyItem>) {
    onChange(updateScheme(value, schemeId, (scheme) => ({
      ...scheme,
      items: scheme.items.map((item) => (
        item.valueCode === valueCode ? { ...item, ...patch } : item
      )),
    })));
  }

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">A2</span>
            <h2>Taxonomie structurante</h2>
            <p>Ce module gere les classifications structurantes de l objet. Les distinctions, labels d accessibilite et labels de durabilite restent hors de ce perimetre.</p>
          </div>
          <div className="stack-list text-right">
            <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
              {saving ? 'Enregistrement...' : saveAction.label}
            </Button>
            {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Schemas structurants</span>
            <strong>{value.schemes.length}</strong>
            <p>Chaque schema est gere comme un module metier, pas comme un simple formulaire table-driven.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Perimetre</span>
            <p>{value.unavailableReason ?? 'A2 exclut explicitement les distinctions et les labels transversaux qui seront traites ailleurs.'}</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        {value.schemes.length > 0 ? value.schemes.map((scheme) => {
          const options = resolveValueOptions(scheme);
          const selectedCodes = new Set(scheme.items.map((item) => item.valueCode));
          const selectedSingleValue = scheme.items[0]?.valueCode ?? '';

          return (
            <article key={scheme.id} className="panel-card panel-card--nested">
              <div className="panel-heading">
                <div>
                  <span className="facet-title">{scheme.selectionMode === 'multiple' ? 'Selection multiple' : 'Selection unique'}</span>
                  <h3>{scheme.label}</h3>
                  {scheme.description && <p>{scheme.description}</p>}
                </div>
              </div>

              <div className="drawer-grid">
                {scheme.selectionMode === 'single' ? (
                  <div className="field-block field-block--wide">
                    <Label htmlFor={`taxonomy-scheme-${scheme.id}`}>Valeur</Label>
                    <select
                      id={`taxonomy-scheme-${scheme.id}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      value={selectedSingleValue}
                      disabled={disabled}
                      onChange={(event) => handleSingleSelection(scheme.id, event.target.value)}
                    >
                      <option value="">Aucune valeur</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="field-block field-block--wide">
                    <span className="text-sm font-medium">Valeurs</span>
                    <div className="stack-list">
                      {options.map((option) => (
                        <label key={option.id} className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedCodes.has(option.code)}
                            disabled={disabled}
                            onChange={(event) => handleMultiSelection(scheme.id, option.code, event.target.checked)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="stack-list">
                {scheme.items.length > 0 ? sortSchemeItems(scheme, scheme.items).map((item) => (
                  <article key={`${scheme.id}-${item.valueCode}`} className="panel-card panel-card--nested">
                    <div className="panel-heading">
                      <div>
                        <span className="facet-title">{scheme.label}</span>
                        <h3>{item.valueLabel}</h3>
                      </div>
                      {scheme.selectionMode === 'multiple' && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => handleMultiSelection(scheme.id, item.valueCode, false)}
                        >
                          Retirer
                        </Button>
                      )}
                    </div>

                    <div className="drawer-grid">
                      <div className="field-block">
                        <Label htmlFor={`taxonomy-status-${scheme.id}-${item.valueCode}`}>Statut</Label>
                        <select
                          id={`taxonomy-status-${scheme.id}-${item.valueCode}`}
                          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                          value={item.status}
                          disabled={disabled}
                          onChange={(event) => handleItemPatch(scheme.id, item.valueCode, { status: event.target.value })}
                        >
                          <option value="">Non precise</option>
                          <option value="requested">requested</option>
                          <option value="granted">granted</option>
                          <option value="suspended">suspended</option>
                          <option value="expired">expired</option>
                        </select>
                      </div>

                      <div className="field-block">
                        <Label htmlFor={`taxonomy-awarded-${scheme.id}-${item.valueCode}`}>Attribue le</Label>
                        <input
                          id={`taxonomy-awarded-${scheme.id}-${item.valueCode}`}
                          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                          type="date"
                          value={item.awardedAt}
                          disabled={disabled}
                          onChange={(event) => handleItemPatch(scheme.id, item.valueCode, { awardedAt: event.target.value })}
                        />
                      </div>

                      <div className="field-block">
                        <Label htmlFor={`taxonomy-valid-${scheme.id}-${item.valueCode}`}>Valide jusqu au</Label>
                        <input
                          id={`taxonomy-valid-${scheme.id}-${item.valueCode}`}
                          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                          type="date"
                          value={item.validUntil}
                          disabled={disabled}
                          onChange={(event) => handleItemPatch(scheme.id, item.valueCode, { validUntil: event.target.value })}
                        />
                      </div>
                    </div>
                  </article>
                )) : (
                  <article className="panel-card panel-card--nested">
                    <span className="facet-title">{scheme.label}</span>
                    <p>Aucune valeur n est encore selectionnee pour ce schema.</p>
                  </article>
                )}
              </div>
            </article>
          );
        }) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Taxonomie structurante</span>
            <p>Aucun schema structurant n est actuellement expose par le contrat workspace.</p>
          </article>
        )}
      </section>
    </div>
  );
}
