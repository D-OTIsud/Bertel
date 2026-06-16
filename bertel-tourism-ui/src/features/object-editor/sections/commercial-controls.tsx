import { useState } from 'react';
import { ChipMultiSelect, EditorModal, Select } from '../primitives';
import type { ObjectWorkspaceCharacteristicsModule } from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';

type LanguageItem = ObjectWorkspaceCharacteristicsModule['selectedLanguages'][number];
type LevelOption = ObjectWorkspaceCharacteristicsModule['languageLevelOptions'][number];

interface ControlProps {
  characteristics: ObjectWorkspaceCharacteristicsModule;
  onChange: (next: ObjectWorkspaceCharacteristicsModule) => void;
}

/** §13 — modes de paiement acceptés (object_payment_method). Source d'état : characteristics. */
export function PaymentChips({ characteristics, onChange }: ControlProps) {
  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Modes de paiement acceptés
      </div>
      {characteristics.unavailableReason ? (
        <ModuleUnavailableNotice reason={characteristics.unavailableReason} />
      ) : (
        <ChipMultiSelect
          options={characteristics.paymentOptions}
          selected={characteristics.selectedPaymentCodes}
          modalTitle="Choisir les modes de paiement"
          searchPlaceholder="Rechercher un mode de paiement…"
          onChange={(codes) => onChange({ ...characteristics, selectedPaymentCodes: codes })}
        />
      )}
    </>
  );
}

/** §04 — langues parlées (object_language). Le niveau de maîtrise est facultatif : il se règle
 *  dans une modale dédiée (bouton « Ajouter un niveau ») et se révèle en tooltip sur la puce langue. */
export function SpokenLanguagesField({ characteristics, onChange }: ControlProps) {
  /** Reconcile from a flat code list (modal) : keep the existing row (and its level)
   *  for codes still present, seed new ones WITHOUT a level (level is optional). */
  function setLanguages(codes: string[]) {
    onChange({
      ...characteristics,
      selectedLanguages: codes.map((code) => {
        const existing = characteristics.selectedLanguages.find((item) => item.code === code);
        if (existing) return existing;
        const option = characteristics.languageOptions.find((item) => item.code === code);
        return {
          languageId: option?.id ?? '',
          code,
          label: option?.label ?? code,
          levelId: '',
          levelCode: '',
          levelLabel: '',
        };
      }),
    });
  }

  /** Apply the staged per-language levels from the modal in one update. */
  function applyLevels(levelByCode: Record<string, string>) {
    onChange({
      ...characteristics,
      selectedLanguages: characteristics.selectedLanguages.map((item) => {
        const levelId = levelByCode[item.code] ?? '';
        const option = characteristics.languageLevelOptions.find((candidate) => candidate.id === levelId);
        return { ...item, levelId, levelCode: option?.code ?? '', levelLabel: option?.label ?? '' };
      }),
    });
  }

  /** Native tooltip on each language chip: the level when set, else the removal hint. */
  function chipTitle(code: string): string {
    const item = characteristics.selectedLanguages.find((language) => language.code === code);
    return item?.levelLabel ? `Niveau : ${item.levelLabel} · cliquer pour retirer` : 'Retirer';
  }

  if (characteristics.unavailableReason) {
    return (
      <>
        <div className="chip-group__label" style={{ marginTop: 0 }}>Langues parlées</div>
        <ModuleUnavailableNotice reason={characteristics.unavailableReason} />
      </>
    );
  }

  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Langues parlées</div>
      <ChipMultiSelect
        options={characteristics.languageOptions}
        selected={characteristics.selectedLanguages.map((item) => item.code)}
        modalTitle="Choisir les langues parlées"
        searchPlaceholder="Rechercher une langue…"
        onChange={setLanguages}
        chipTitle={chipTitle}
      />
      {characteristics.selectedLanguages.length > 0 && (
        <LanguageLevelsModal
          selectedLanguages={characteristics.selectedLanguages}
          levelOptions={characteristics.languageLevelOptions}
          onApply={applyLevels}
        />
      )}
    </>
  );
}

/** Optional level assignment for the selected languages. Staged draft, applied on « Valider ».
 *  Leaving « Aucun niveau » clears the level — the level stays facultatif throughout. */
function LanguageLevelsModal({
  selectedLanguages,
  levelOptions,
  onApply,
}: {
  selectedLanguages: LanguageItem[];
  levelOptions: LevelOption[];
  onApply: (levelByCode: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const hasAnyLevel = selectedLanguages.some((item) => Boolean(item.levelId));
  const levelChoices = [
    { v: '', l: 'Aucun niveau' },
    ...levelOptions.map((option) => ({ v: option.id, l: option.label })),
  ];

  function startEditing() {
    setDraft(Object.fromEntries(selectedLanguages.map((item) => [item.code, item.levelId])));
    setOpen(true);
  }

  return (
    <>
      <button type="button" className="rep-add" onClick={startEditing}>
        {hasAnyLevel ? 'Modifier les niveaux' : 'Ajouter un niveau'}
      </button>
      <EditorModal
        open={open}
        title="Niveau de maîtrise par langue"
        saveLabel="Valider"
        onClose={() => setOpen(false)}
        onSave={() => {
          onApply(draft);
          setOpen(false);
        }}
      >
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Le niveau est facultatif. Laissez « Aucun niveau » pour ne pas le préciser.
        </p>
        <div className="lang-level-grid">
          {selectedLanguages.map((item) => (
            <div className="lang-level-grid__row" key={item.code}>
              <span className="lang-level-grid__name">{item.label}</span>
              <Select
                value={draft[item.code] ?? ''}
                aria-label={`Niveau ${item.label}`}
                options={levelChoices}
                onChange={(levelId) => setDraft((prev) => ({ ...prev, [item.code]: levelId }))}
              />
            </div>
          ))}
        </div>
      </EditorModal>
    </>
  );
}
