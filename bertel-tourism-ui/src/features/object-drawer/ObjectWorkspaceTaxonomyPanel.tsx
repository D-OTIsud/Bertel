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

const ACCOMMODATION_TYPES = new Set(['HOT', 'HPA', 'HLO', 'CAMP', 'RVA']);
const ACTIVITY_TYPES = new Set(['ACT', 'ASC', 'LOI']);
const ACCOMMODATION_SCHEME_CODES = new Set([
  'type_hot',
  'official_classification',
  'hot_stars',
  'camp_stars',
  'meuble_stars',
  'gites_epics',
  'clevacances_keys',
]);
const ACTIVITY_SCHEME_CODES = new Set(['type_act']);

interface ObjectWorkspaceTaxonomyPanelProps {
  value: ObjectWorkspaceTaxonomyModule;
  objectType?: string;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceTaxonomyModule) => void;
  onSave: () => void;
}

interface ObjectWorkspaceTaxonomyFieldsProps {
  value: ObjectWorkspaceTaxonomyModule;
  objectType?: string;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceTaxonomyModule) => void;
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

function shouldShowTaxonomySchemeForType(scheme: ObjectWorkspaceTaxonomyScheme, objectType?: string): boolean {
  const normalizedType = String(objectType ?? '').trim().toUpperCase();
  const normalizedCode = scheme.code.trim().toLowerCase();
  const normalizedDisplayGroup = scheme.displayGroup.trim().toLowerCase();

  if (ACCOMMODATION_TYPES.has(normalizedType)) {
    return normalizedDisplayGroup === 'official_classification' || ACCOMMODATION_SCHEME_CODES.has(normalizedCode);
  }

  if (ACTIVITY_TYPES.has(normalizedType)) {
    return ACTIVITY_SCHEME_CODES.has(normalizedCode);
  }

  return false;
}

export function getVisibleTaxonomySchemes(
  value: ObjectWorkspaceTaxonomyModule,
  objectType?: string,
): ObjectWorkspaceTaxonomyScheme[] {
  if (!objectType) {
    return value.schemes;
  }

  const schemesWithCurrentValues = new Set(
    value.schemes
      .filter((scheme) => scheme.items.length > 0)
      .map((scheme) => scheme.id),
  );

  return value.schemes.filter(
    (scheme) => schemesWithCurrentValues.has(scheme.id) || shouldShowTaxonomySchemeForType(scheme, objectType),
  );
}

export function ObjectWorkspaceTaxonomyFields({
  value,
  objectType,
  access,
  onChange,
}: ObjectWorkspaceTaxonomyFieldsProps) {
  const disabled = !access.canDirectWrite;
  const visibleSchemes = getVisibleTaxonomySchemes(value, objectType);

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
    <section className="drawer-form-stack">
      {visibleSchemes.length > 0 ? visibleSchemes.map((scheme) => {
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
                    <Label htmlFor={`taxonomy-scheme-${scheme.id}`}>Classement</Label>
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
                    <span className="text-sm font-medium">Elements a retenir</span>
                    <div className="drawer-choice-list">
                      {options.map((option) => (
                        <label key={option.id} className="drawer-choice-item">
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
                          <option value="requested">En demande</option>
                          <option value="granted">Obtenu</option>
                          <option value="suspended">Suspendu</option>
                          <option value="expired">Expire</option>
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
                    <p>Aucun classement n est encore renseigne pour cette rubrique.</p>
                  </article>
                )}
              </div>
            </article>
          );
        }) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Classements et categories</span>
            <p>Aucun classement ou categorie specifique n est prevu pour ce type de fiche.</p>
          </article>
        )}
    </section>
  );
}

export function ObjectWorkspaceTaxonomyPanel({
  value,
  objectType,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
}: ObjectWorkspaceTaxonomyPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Classements</span>
            <h2>Classements et categories</h2>
            <p>Renseignez ici les classements, categories ou sous-types utiles a cette fiche.</p>
          </div>
          <div className="stack-list text-right">
            <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
              {saving ? 'Enregistrement...' : saveAction.label}
            </Button>
            {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>
      </article>

      <ObjectWorkspaceTaxonomyFields
        value={value}
        objectType={objectType}
        access={access}
        onChange={onChange}
      />
    </div>
  );
}
