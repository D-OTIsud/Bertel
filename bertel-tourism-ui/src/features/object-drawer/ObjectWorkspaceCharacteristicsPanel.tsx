import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceLanguageItem,
  WorkspaceReferenceOption,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceCharacteristicsPanelProps {
  value: ObjectWorkspaceCharacteristicsModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceCharacteristicsModule) => void;
  onSave: () => void;
}

function toggleCode(list: string[], code: string, checked: boolean): string[] {
  const normalized = code.trim();
  if (!normalized) {
    return list;
  }

  if (checked) {
    return Array.from(new Set([...list, normalized])).sort();
  }

  return list.filter((item) => item !== normalized);
}

function sortLanguageItems(items: ObjectWorkspaceLanguageItem[]): ObjectWorkspaceLanguageItem[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

function renderCheckboxList(props: {
  title: string;
  options: WorkspaceReferenceOption[];
  selectedCodes: string[];
  disabled: boolean;
  onToggle: (code: string, checked: boolean) => void;
}) {
  const { title, options, selectedCodes, disabled, onToggle } = props;
  const selected = new Set(selectedCodes);

  return (
    <article className="panel-card panel-card--nested">
      <span className="facet-title">{title}</span>
      <div className="stack-list">
        {options.length > 0 ? options.map((option) => (
          <label key={option.id} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(option.code)}
              disabled={disabled}
              onChange={(event) => onToggle(option.code, event.target.checked)}
            />
            <span>{option.label}</span>
          </label>
        )) : (
          <p>Aucune option disponible.</p>
        )}
      </div>
    </article>
  );
}

export function ObjectWorkspaceCharacteristicsPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
}: ObjectWorkspaceCharacteristicsPanelProps) {
  const disabled = !access.canDirectWrite;

  function patchLanguages(nextLanguages: ObjectWorkspaceLanguageItem[]) {
    onChange({
      ...value,
      selectedLanguages: sortLanguageItems(nextLanguages),
    });
  }

  function addLanguage() {
    const fallback = value.languageOptions.find((option) => !value.selectedLanguages.some((item) => item.code === option.code))
      ?? value.languageOptions[0];
    if (!fallback) {
      return;
    }

    patchLanguages([
      ...value.selectedLanguages,
      {
        languageId: fallback.id,
        code: fallback.code,
        label: fallback.label,
        levelId: '',
        levelCode: '',
        levelLabel: '',
      },
    ]);
  }

  function updateLanguage(index: number, patch: Partial<ObjectWorkspaceLanguageItem>) {
    const nextLanguages = value.selectedLanguages.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }

      const selectedLanguage = patch.code
        ? value.languageOptions.find((option) => option.code === patch.code)
        : null;
      const selectedLevel = patch.levelCode
        ? value.languageLevelOptions.find((option) => option.code === patch.levelCode)
        : patch.levelCode === ''
          ? { id: '', code: '', label: '' }
          : null;

      return {
        ...item,
        ...patch,
        languageId: selectedLanguage?.id ?? item.languageId,
        label: selectedLanguage?.label ?? item.label,
        levelId: selectedLevel?.id ?? item.levelId,
        levelLabel: selectedLevel?.label ?? item.levelLabel,
      };
    });

    const dedupedByCode = new Map<string, ObjectWorkspaceLanguageItem>();
    for (const item of nextLanguages) {
      dedupedByCode.set(item.code, item);
    }
    patchLanguages(Array.from(dedupedByCode.values()));
  }

  function removeLanguage(index: number) {
    patchLanguages(value.selectedLanguages.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">C1</span>
            <h2>Caracteristiques</h2>
            <p>Ce module transversal regroupe langues, equipements, moyens de paiement et tags d environnement dans un meme cadre metier.</p>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button type="button" variant="ghost" onClick={addLanguage} disabled={disabled || saving}>
                Ajouter une langue
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
            <span className="facet-title">Langues</span>
            <strong>{value.selectedLanguages.length}</strong>
            <p>Langues de service et niveau eventuel.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Paiements</span>
            <strong>{value.selectedPaymentCodes.length}</strong>
            <p>Moyens de paiement publics rattaches a la fiche.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Environnement</span>
            <strong>{value.selectedEnvironmentCodes.length}</strong>
            <p>Tags contextuels et cadres d environnement.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Equipements</span>
            <strong>{value.selectedAmenityCodes.length}</strong>
            <p>{value.unavailableReason ?? 'Le perimetre C1 reste distinct des distinctions, accessibilite et durabilite.'}</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Langues</span>
              <h3>Service et accueil</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.selectedLanguages.length > 0 ? value.selectedLanguages.map((item, index) => (
              <article key={`${item.code}-${index}`} className="panel-card panel-card--nested">
                <div className="panel-heading">
                  <div>
                    <span className="facet-title">Langue</span>
                    <h3>{item.label}</h3>
                  </div>
                  <Button type="button" variant="ghost" disabled={disabled} onClick={() => removeLanguage(index)}>
                    Retirer
                  </Button>
                </div>

                <div className="drawer-grid">
                  <div className="field-block">
                    <Label htmlFor={`characteristics-language-${index}`}>Langue</Label>
                    <select
                      id={`characteristics-language-${index}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      value={item.code}
                      disabled={disabled}
                      onChange={(event) => updateLanguage(index, { code: event.target.value })}
                    >
                      {value.languageOptions.map((option) => (
                        <option key={option.id} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`characteristics-level-${index}`}>Niveau</Label>
                    <select
                      id={`characteristics-level-${index}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      value={item.levelCode}
                      disabled={disabled}
                      onChange={(event) => updateLanguage(index, { levelCode: event.target.value })}
                    >
                      <option value="">Non precise</option>
                      {value.languageLevelOptions.map((option) => (
                        <option key={option.id} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </article>
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Langues</span>
                <p>Aucune langue n est encore selectionnee.</p>
              </article>
            )}
          </div>
        </article>

        {renderCheckboxList({
          title: 'Moyens de paiement',
          options: value.paymentOptions,
          selectedCodes: value.selectedPaymentCodes,
          disabled,
          onToggle: (code, checked) => onChange({
            ...value,
            selectedPaymentCodes: toggleCode(value.selectedPaymentCodes, code, checked),
          }),
        })}

        {renderCheckboxList({
          title: 'Tags environnement',
          options: value.environmentOptions,
          selectedCodes: value.selectedEnvironmentCodes,
          disabled,
          onToggle: (code, checked) => onChange({
            ...value,
            selectedEnvironmentCodes: toggleCode(value.selectedEnvironmentCodes, code, checked),
          }),
        })}

        <article className="panel-card panel-card--nested">
          <span className="facet-title">Equipements</span>
          <div className="stack-list">
            {value.amenityGroups.length > 0 ? value.amenityGroups.map((group) => (
              <article key={group.familyCode} className="panel-card panel-card--nested">
                <span className="facet-title">{group.familyLabel}</span>
                <div className="stack-list">
                  {group.options.map((option) => (
                    <label key={option.id} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={value.selectedAmenityCodes.includes(option.code)}
                        disabled={disabled}
                        onChange={(event) => onChange({
                          ...value,
                          selectedAmenityCodes: toggleCode(value.selectedAmenityCodes, option.code, event.target.checked),
                        })}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </article>
            )) : (
              <p>Aucun equipement n est actuellement expose.</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
