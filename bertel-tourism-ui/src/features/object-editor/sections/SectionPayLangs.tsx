import { Chip, ChipSet, Fs } from '../primitives';
import type { SectionProps } from './section-types';

function toggleCode(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

export function SectionPayLangs({ editor, folded }: SectionProps) {
  const characteristics = editor.draft.characteristics;
  const paymentCount = characteristics.selectedPaymentCodes.length;
  const langCount = characteristics.selectedLanguages.length;

  function toggleLanguage(code: string) {
    const existing = characteristics.selectedLanguages.find((item) => item.code === code);
    const option = characteristics.languageOptions.find((item) => item.code === code);
    const level = characteristics.languageLevelOptions[0];
    editor.replaceModule('characteristics', {
      ...characteristics,
      selectedLanguages: existing
        ? characteristics.selectedLanguages.filter((item) => item.code !== code)
        : option
          ? [
              ...characteristics.selectedLanguages,
              {
                languageId: option.id,
                code: option.code,
                label: option.label,
                levelId: level?.id ?? '',
                levelCode: level?.code ?? '',
                levelLabel: level?.label ?? '',
              },
            ]
          : characteristics.selectedLanguages,
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
      <ChipSet>
        {characteristics.languageOptions.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedLanguages.some((item) => item.code === option.code)}
            onClick={() => toggleLanguage(option.code)}
          />
        ))}
      </ChipSet>
    </Fs>
  );
}
