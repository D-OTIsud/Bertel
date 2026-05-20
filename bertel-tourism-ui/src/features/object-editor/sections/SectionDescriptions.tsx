import { Fs, Field, Textarea, LangTabs } from '../primitives';
import type { SectionProps } from './section-types';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

/** Section 02 — multilingual accroche (chapo) and descriptif. */
export function SectionDescriptions({ editor }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const active = descriptions.activeLanguage;
  const objectScope = descriptions.object;

  function setLanguage(code: string) {
    editor.replaceModule('descriptions', { ...descriptions, activeLanguage: code });
  }

  function patchField(field: 'chapo' | 'description', value: string) {
    const updated = updateTranslatableField(objectScope[field], active, descriptions.localLanguage, value);
    const nextObject =
      field === 'chapo'
        ? { ...objectScope, chapo: updated }
        : { ...objectScope, description: updated };
    editor.replaceModule('descriptions', { ...descriptions, object: nextObject });
  }

  const tabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: code,
    filled: Boolean(objectScope.description.values[code] || objectScope.chapo.values[code]),
  }));

  return (
    <Fs num="02" title="Descriptions" sub="Accroche et descriptif — multilingue">
      {tabs.length > 0 && <LangTabs tabs={tabs} active={active} onSelect={setLanguage} />}
      <Field label="Accroche" hint="≤ 160 caractères — affichée sous le titre dans l'Explorer">
        <Textarea
          value={readTranslatableField(objectScope.chapo, active)}
          onChange={(v) => patchField('chapo', v)}
          count
          max={160}
          rows={2}
        />
      </Field>
      <Field label="Descriptif">
        <Textarea
          value={readTranslatableField(objectScope.description, active)}
          onChange={(v) => patchField('description', v)}
          rich
          count
          max={2000}
        />
      </Field>
    </Fs>
  );
}
