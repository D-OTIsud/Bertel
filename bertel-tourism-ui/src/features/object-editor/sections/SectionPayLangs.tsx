import { Chip, ChipMultiSelect, ChipSet, Fs } from '../primitives';
import type { SectionProps } from './section-types';

function toggleCode(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

export function SectionPayLangs({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const paymentCount = characteristics.selectedPaymentCodes.length;
  const langCount = characteristics.selectedLanguages.length;

  /** Reconcile the language selection from a flat code list (modal picker) : keep the existing
   *  row (and its maîtrise level) for codes still present, seed a default level for new ones. */
  function setLanguages(codes: string[]) {
    const level = characteristics.languageLevelOptions[0];
    editor.replaceModule('characteristics', {
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

  return (
    <Fs
      num="12"
      title="Modes de paiement & langues"
      sub="Acceptés au comptoir · langues parlées"
      folded={folded}
      pill={{
        tone: paymentCount > 0 || langCount > 0 ? 'ok' : 'warn',
        label:
          paymentCount > 0 && langCount > 0
            ? `${paymentCount} paiement(s) · ${langCount} langue(s)`
            : paymentCount > 0
              ? `${paymentCount} paiement(s)`
              : langCount > 0
                ? `${langCount} langue(s)`
                : 'À compléter',
      }}
    >
      <div className="chip-group__label" style={{ marginTop: 0 }}>
        Modes de paiement acceptés
      </div>
      <ChipSet>
        {characteristics.paymentOptions.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedPaymentCodes.includes(option.code)}
            onClick={() =>
              editor.replaceModule('characteristics', {
                ...characteristics,
                selectedPaymentCodes: toggleCode(characteristics.selectedPaymentCodes, option.code),
              })
            }
          />
        ))}
      </ChipSet>

      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Langues parlées
      </div>
      <ChipMultiSelect
        options={characteristics.languageOptions}
        selected={characteristics.selectedLanguages.map((item) => item.code)}
        modalTitle="Choisir les langues parlées"
        searchPlaceholder="Rechercher une langue…"
        onChange={setLanguages}
      />
    </Fs>
  );
}
