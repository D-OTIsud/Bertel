import { useEffect, useRef, useState } from 'react';
import { Chip, ChipMultiSelect, ChipSet, EditorModal, Input, Select } from '../primitives';
import { fold } from '../../../components/ui/pickers/fold';
import type { ObjectWorkspaceCharacteristicsModule } from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';

type LanguageItem = ObjectWorkspaceCharacteristicsModule['selectedLanguages'][number];

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

/** §04 — langues parlées (object_language) + niveau de maîtrise facultatif. Deux entrées vers la
 *  même modale combinée (choix des langues + niveau par langue) : le bouton « Choisir / modifier
 *  les langues » (vue d'ensemble) et le clic sur une puce langue (centré sur cette langue). Le
 *  niveau s'affiche en clair sur la puce ; la « × » de la puce retire la langue immédiatement. */
export function SpokenLanguagesField({ characteristics, onChange }: ControlProps) {
  const [open, setOpen] = useState(false);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const selected = characteristics.selectedLanguages;

  function openOverview() {
    setFocusCode(null);
    setOpen(true);
  }
  function openForLanguage(code: string) {
    setFocusCode(code);
    setOpen(true);
  }
  function removeLanguage(code: string) {
    onChange({ ...characteristics, selectedLanguages: selected.filter((item) => item.code !== code) });
  }
  function apply(nextLanguages: LanguageItem[]) {
    onChange({ ...characteristics, selectedLanguages: nextLanguages });
    setOpen(false);
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
      <div className="lang-field">
        {selected.length > 0 ? (
          <div className="lang-chips">
            {selected.map((item) => (
              <LangChip
                key={item.code}
                item={item}
                onOpen={() => openForLanguage(item.code)}
                onRemove={() => removeLanguage(item.code)}
              />
            ))}
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>Aucune langue</span>
        )}
        <button type="button" className="rep-add" onClick={openOverview}>
          {selected.length > 0 ? 'Choisir / modifier les langues' : 'Choisir…'}
        </button>
      </div>
      <LanguagesModal
        open={open}
        characteristics={characteristics}
        focusCode={focusCode}
        onClose={() => setOpen(false)}
        onApply={apply}
      />
    </>
  );
}

/** A selected-language chip: clickable body (opens the level modal centred on it) + a remove « × ».
 *  The proficiency level, when set, is shown in clear next to the label (no longer hover-only). */
function LangChip({ item, onOpen, onRemove }: { item: LanguageItem; onOpen: () => void; onRemove: () => void }) {
  const labelWithLevel = item.levelLabel ? `${item.label} · ${item.levelLabel}` : item.label;
  return (
    <span className="lang-chip">
      <button
        type="button"
        className="chip is-on size-sm lang-chip__body"
        title={item.levelLabel ? `Niveau : ${item.levelLabel} · cliquer pour régler` : 'Cliquer pour régler le niveau'}
        onClick={onOpen}
      >
        {labelWithLevel}
      </button>
      <button type="button" className="lang-chip__del" aria-label={`Retirer ${item.label}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

/** Build the next selectedLanguages from the staged codes + per-code level. Keeps an existing
 *  row's identity and re-resolves its level; new codes are seeded from the option catalogue. The
 *  level stays optional (empty levelId ⇒ no level). */
function reconcileLanguages(
  characteristics: ObjectWorkspaceCharacteristicsModule,
  codes: string[],
  levelByCode: Record<string, string>,
): LanguageItem[] {
  return codes.map((code) => {
    const existing = characteristics.selectedLanguages.find((item) => item.code === code);
    const option = characteristics.languageOptions.find((item) => item.code === code);
    const levelId = levelByCode[code] ?? '';
    const level = characteristics.languageLevelOptions.find((candidate) => candidate.id === levelId);
    return {
      languageId: existing?.languageId ?? option?.id ?? '',
      code,
      label: existing?.label ?? option?.label ?? code,
      levelId,
      levelCode: level?.code ?? '',
      levelLabel: level?.label ?? '',
    };
  });
}

/** Combined modal: pick languages (search + Sélectionnées / Disponibles) AND set each language's
 *  optional level, in one place. Staged draft, applied on « Valider ». A `focusCode` highlights the
 *  row for the language the modal was opened from (chip click). */
function LanguagesModal({
  open,
  characteristics,
  focusCode,
  onClose,
  onApply,
}: {
  open: boolean;
  characteristics: ObjectWorkspaceCharacteristicsModule;
  focusCode: string | null;
  onClose: () => void;
  onApply: (next: LanguageItem[]) => void;
}) {
  const { languageOptions, languageLevelOptions, selectedLanguages } = characteristics;
  const [query, setQuery] = useState('');
  const [codes, setCodes] = useState<string[]>(() => selectedLanguages.map((item) => item.code));
  const [levelByCode, setLevelByCode] = useState<Record<string, string>>(
    () => Object.fromEntries(selectedLanguages.map((item) => [item.code, item.levelId])),
  );

  // Re-seed the staged draft on the closed→open transition only (never mid-edit), so each opening
  // starts from the current selection without clobbering in-progress edits.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setQuery('');
      setCodes(selectedLanguages.map((item) => item.code));
      setLevelByCode(Object.fromEntries(selectedLanguages.map((item) => [item.code, item.levelId])));
    }
    wasOpen.current = open;
  }, [open, selectedLanguages]);

  const labelFor = (code: string) =>
    languageOptions.find((option) => option.code === code)?.label
    ?? selectedLanguages.find((item) => item.code === code)?.label
    ?? code;

  const levelChoices = [
    { v: '', l: 'Aucun niveau' },
    ...languageLevelOptions.map((option) => ({ v: option.id, l: option.label })),
  ];
  const folded = fold(query.trim());
  const available = languageOptions.filter(
    (option) => !codes.includes(option.code) && (folded === '' || fold(option.label).includes(folded)),
  );

  return (
    <EditorModal
      open={open}
      title="Langues parlées & niveaux"
      saveLabel="Valider"
      onClose={onClose}
      onSave={() => onApply(reconcileLanguages(characteristics, codes, levelByCode))}
    >
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Choisissez les langues, puis (facultatif) un niveau de maîtrise pour chacune.
      </p>
      <Input
        value={query}
        aria-label="Rechercher une langue"
        placeholder="Rechercher une langue…"
        onChange={setQuery}
      />

      <div className="chip-group__label" style={{ marginTop: 12 }}>Sélectionnées ({codes.length})</div>
      {codes.length > 0 ? (
        <div className="lang-level-grid">
          {codes.map((code) => (
            <div className={`lang-level-grid__row${focusCode === code ? ' is-focus' : ''}`} key={code}>
              <span className="lang-level-grid__name">{labelFor(code)}</span>
              <div className="lang-level-grid__act">
                <Select
                  value={levelByCode[code] ?? ''}
                  aria-label={`Niveau ${labelFor(code)}`}
                  options={levelChoices}
                  onChange={(levelId) => setLevelByCode((prev) => ({ ...prev, [code]: levelId }))}
                />
                <button
                  type="button"
                  className="lang-chip__del"
                  aria-label={`Retirer ${labelFor(code)}`}
                  onClick={() => setCodes((prev) => prev.filter((value) => value !== code))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>Aucune sélection</span>
      )}

      <div className="chip-group__label" style={{ marginTop: 12 }}>Disponibles</div>
      <ChipSet>
        {available.map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            sm
            onClick={() => setCodes((prev) => (prev.includes(option.code) ? prev : [...prev, option.code]))}
          />
        ))}
      </ChipSet>
    </EditorModal>
  );
}
