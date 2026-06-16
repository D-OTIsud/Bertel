import { ChipMultiSelect, Select } from '../primitives';
import type { ObjectWorkspaceCharacteristicsModule } from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';

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

/** §04 — langues parlées (object_language) + niveau de maîtrise par langue. Ajout via modal. */
export function SpokenLanguagesField({ characteristics, onChange }: ControlProps) {
  /** Reconcile from a flat code list (modal) : keep the existing row (and its level)
   *  for codes still present, seed the first level for new ones. */
  function setLanguages(codes: string[]) {
    const level = characteristics.languageLevelOptions[0];
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
          levelId: level?.id ?? '',
          levelCode: level?.code ?? '',
          levelLabel: level?.label ?? '',
        };
      }),
    });
  }

  function setLevel(code: string, levelId: string) {
    const option = characteristics.languageLevelOptions.find((item) => item.id === levelId);
    onChange({
      ...characteristics,
      selectedLanguages: characteristics.selectedLanguages.map((item) =>
        item.code === code
          ? { ...item, levelId, levelCode: option?.code ?? '', levelLabel: option?.label ?? '' }
          : item),
    });
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
      />
      {characteristics.selectedLanguages.length > 0 && (
        <div className="lang-levels">
          {characteristics.selectedLanguages.map((item) => (
            <div className="lang-levels__row" key={item.code}>
              <span className="lang-levels__name">{item.label}</span>
              <Select
                value={item.levelId}
                aria-label={`Niveau ${item.label}`}
                options={[
                  { v: '', l: 'Niveau…' },
                  ...characteristics.languageLevelOptions.map((option) => ({ v: option.id, l: option.label })),
                ]}
                onChange={(levelId) => setLevel(item.code, levelId)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
