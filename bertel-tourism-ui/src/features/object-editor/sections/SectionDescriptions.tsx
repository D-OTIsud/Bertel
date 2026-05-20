import { Fs, Field, Textarea, LangTabs } from '../primitives';
import type { SectionProps } from './section-types';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';
import { Provenance } from '../widgets/Provenance';

const LANG_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  cre: 'Créole',
  de: 'Deutsch',
  es: 'Español',
};

/** Section 02 — multilingual descriptions (design: edit-primitives). */
export function SectionDescriptions({ editor, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const active = descriptions.activeLanguage;
  const objectScope = descriptions.object;
  const missingLangs = descriptions.availableLanguages.filter(
    (code) => !objectScope.chapo.values[code] && !objectScope.description.values[code],
  );

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

  function patchEditorial(value: string) {
    const updated = updateTranslatableField(
      objectScope.editorialDescription,
      active,
      descriptions.localLanguage,
      value,
    );
    editor.replaceModule('descriptions', {
      ...descriptions,
      object: { ...objectScope, editorialDescription: updated },
    });
  }

  const tabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code,
    filled: Boolean(objectScope.description.values[code] || objectScope.chapo.values[code]),
  }));

  const otiChapo = readTranslatableField(objectScope.editorialDescription, active);
  const accessText = readTranslatableField(objectScope.adaptedDescription, active);

  return (
    <Fs
      num="02"
      title="Descriptions"
      sub="Accroche, descriptif, descriptifs OTI, plan d'accès — multilingue"
      folded={folded}
      pill={{
        tone: missingLangs.length > 0 ? 'warn' : 'ok',
        label: missingLangs.length > 0 ? `${missingLangs.length} langue(s)` : 'Complet',
      }}
    >
      {tabs.length > 0 && <LangTabs tabs={tabs} active={active} onSelect={setLanguage} />}

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Accroche" hint="≤ 160 caractères — apparaît sous le titre dans l'Explorer">
          <Textarea
            value={readTranslatableField(objectScope.chapo, active)}
            onChange={(v) => patchField('chapo', v)}
            count
            max={160}
            rows={2}
          />
        </Field>
        <Field label="Accroche OTI" hint="Version recommandée par l'office (override Explorer)">
          <Textarea value={otiChapo} onChange={patchEditorial} count max={160} rows={2} />
        </Field>
      </div>

      <Field label="Descriptif" required hint="Texte principal de la fiche détail">
        <Textarea
          value={readTranslatableField(objectScope.description, active)}
          onChange={(v) => patchField('description', v)}
          rich
          count
          max={2000}
        />
        <Provenance source="Importé" when="—" />
      </Field>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Field label="Descriptif OTI">
          <Textarea value={otiChapo} onChange={patchEditorial} rows={4} />
        </Field>
        <Field label="Descriptif du plan d'accès" hint="Itinéraire textuel ; complète les coordonnées GPS">
          <Textarea
            value={accessText}
            onChange={(v) => {
              const updated = updateTranslatableField(
                objectScope.adaptedDescription,
                active,
                descriptions.localLanguage,
                v,
              );
              editor.replaceModule('descriptions', {
                ...descriptions,
                object: { ...objectScope, adaptedDescription: updated },
              });
            }}
            rows={4}
          />
        </Field>
      </div>
    </Fs>
  );
}
