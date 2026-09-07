import { useState } from 'react';
import { Fs, Field, LangTabs, ScopeTabs } from '../primitives';
import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';
import { AiTranslateButton } from '../../../components/ai/AiTranslateButton';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDescriptionScope } from '../../../services/object-workspace-parser';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';
import { SpokenLanguagesField } from './commercial-controls';
import { descLanguageTabs, resolveLanguageLabel } from './spoken-languages';

const EMPTY_FIELD = { baseValue: '', values: {} as Record<string, string> };
// Canonical description columns are French. localLanguage is a user preference,
// so it must never determine the source text's language or overwrite the base column.
const BASE_LANGUAGE = 'fr';
const emptyOverlay = (): ObjectWorkspaceDescriptionScope => ({
  recordId: null, scope: 'object', placeId: null, label: 'Personnalisée', visibility: 'public',
  description: { ...EMPTY_FIELD }, chapo: { ...EMPTY_FIELD }, adaptedDescription: { ...EMPTY_FIELD },
  mobileDescription: { ...EMPTY_FIELD }, editorialDescription: { ...EMPTY_FIELD },
});

/** Section 04 — multilingual descriptions: default (shared) layer + per-organisation personalised overlay. */
export function SectionDescriptions({ editor, permissions, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const characteristics = editor.draft.characteristics;
  const active = descriptions.activeLanguage;
  const canEditOrg = permissions.descriptions?.canEditOrgEnrichment ?? false;
  const canEditCanonical = permissions.descriptions?.canEditCanonical ?? false;

  // Scope is local UI navigation (must not mark the module dirty). Default to the
  // personalised layer for contributors who cannot edit the default text.
  const [scope, setScope] = useState<'canonical' | 'org'>(
    canEditOrg && !canEditCanonical ? 'org' : 'canonical',
  );
  const onOrg = scope === 'org';
  const activeScopeData: ObjectWorkspaceDescriptionScope = onOrg
    ? descriptions.orgOverlay ?? emptyOverlay()
    : descriptions.object;

  function setLanguage(code: string) {
    editor.replaceModule('descriptions', { ...descriptions, activeLanguage: code });
  }

  function patchField(field: 'chapo' | 'description', value: string) {
    const updated = updateTranslatableField(activeScopeData[field], active, BASE_LANGUAGE, value);
    const nextScope = { ...activeScopeData, [field]: updated };
    editor.replaceModule('descriptions', onOrg
      ? { ...descriptions, orgOverlay: nextScope }
      : { ...descriptions, object: nextScope });
  }

  const tabCodes = descLanguageTabs(
    ['fr', 'en', 'cre', 'de', 'es', ...descriptions.availableLanguages],
    characteristics.selectedLanguages,
  );
  const tabs = tabCodes.map((code) => ({
    code,
    label: resolveLanguageLabel(code, characteristics.languageOptions),
    filled: Boolean(
      readTranslatableField(activeScopeData.description, code, BASE_LANGUAGE).trim()
      || readTranslatableField(activeScopeData.chapo, code, BASE_LANGUAGE).trim(),
    ),
  }));

  // Two independent axes: the scope (Par défaut / Personnalisée) on the left,
  // the language tabs on the right — opposite ends so they aren't confused.
  const scopeTabs = [
    { code: 'canonical', label: 'Par défaut' },
    ...(canEditOrg ? [{ code: 'org', label: 'Personnalisée' }] : []),
  ];

  // In the personalised scope, show the default value as a greyed fallback hint when the overlay field is empty.
  const fallback = (field: 'chapo' | 'description') =>
    onOrg ? readTranslatableField(descriptions.object[field], active, BASE_LANGUAGE) : '';
  const hint = (base: string, field: 'chapo' | 'description') => {
    const fb = fallback(field);
    const current = readTranslatableField(activeScopeData[field], active, BASE_LANGUAGE).trim();
    // Only surface the "inherited from default" hint while the overlay field is
    // still empty — once the user types their own version, show the normal hint.
    return onOrg && fb && current === ''
      ? `Hérité du texte par défaut : « ${fb.slice(0, 80)} » — saisir pour personnaliser`
      : base;
  };

  const readOnly = onOrg ? !canEditOrg : !canEditCanonical;
  const missingScope = onOrg ? 'personnalisée' : 'par défaut';

  return (
    <Fs
      num="04"
      title="Descriptions"
      sub="Accroche et descriptif — par langue, version par défaut ou personnalisée"
      folded={folded}
      pill={{ tone: 'ok', label: onOrg ? 'Personnalisée' : 'Par défaut' }}
    >
      <div className="desc-langs">
        <SpokenLanguagesField
          characteristics={characteristics}
          onChange={(next) => editor.replaceModule('characteristics', next)}
        />
      </div>

      <div className="desc-selectors">
        {scopeTabs.length > 1 ? (
          <ScopeTabs tabs={scopeTabs} active={scope} onSelect={(c) => setScope(c as 'canonical' | 'org')} />
        ) : (
          <span />
        )}
        {tabs.length > 0 && <LangTabs tabs={tabs} active={active} onSelect={setLanguage} />}
      </div>

      {!readOnly && active === BASE_LANGUAGE && (
        <p className="muted">Choisissez une autre langue pour traduire vos textes en un clic avec l’IA.</p>
      )}
      {!readOnly && active !== BASE_LANGUAGE && (
        <AiTranslateButton
          objectId={editor.objectId}
          sourceLanguage={BASE_LANGUAGE}
          targetLanguage={active}
          sourceLabel={resolveLanguageLabel(BASE_LANGUAGE, characteristics.languageOptions)}
          targetLabel={resolveLanguageLabel(active, characteristics.languageOptions)}
          contextKey={JSON.stringify([scope, descriptions])}
          fields={{
            chapo: readTranslatableField(activeScopeData.chapo, BASE_LANGUAGE, BASE_LANGUAGE),
            description: readTranslatableField(activeScopeData.description, BASE_LANGUAGE, BASE_LANGUAGE),
          }}
          existingValues={{
            chapo: readTranslatableField(activeScopeData.chapo, active, BASE_LANGUAGE),
            description: readTranslatableField(activeScopeData.description, active, BASE_LANGUAGE),
          }}
          onTranslated={(translations) => {
            const nextScope = { ...activeScopeData };
            for (const field of ['chapo', 'description'] as const) {
              if (translations[field] !== undefined) {
                nextScope[field] = updateTranslatableField(nextScope[field], active, BASE_LANGUAGE, translations[field]);
              }
            }
            editor.replaceModule('descriptions', onOrg
              ? { ...descriptions, orgOverlay: nextScope }
              : { ...descriptions, object: nextScope });
          }}
        />
      )}

      <Field label="Accroche" required={!onOrg} hint={hint('≤ 160 caractères — accroche courte affichée en tête de la fiche', 'chapo')}>
        <MarkdownEditorLazy
          value={readTranslatableField(activeScopeData.chapo, active, BASE_LANGUAGE)}
          onChange={(md) => patchField('chapo', md)}
          disabled={readOnly}
          ariaLabel={`Accroche — ${resolveLanguageLabel(active, characteristics.languageOptions)}`}
          variant="inline"
        />
        {(() => {
          const len = readTranslatableField(activeScopeData.chapo, active, BASE_LANGUAGE).length;
          return <div className={`char-count${len > 160 ? ' over' : ''}`}>{len} / 160 caractères</div>;
        })()}
      </Field>

      <Field label="Descriptif" required={!onOrg} hint={hint('Texte principal de la fiche détail', 'description')}>
        <MarkdownEditorLazy
          value={readTranslatableField(activeScopeData.description, active, BASE_LANGUAGE)}
          onChange={(md) => patchField('description', md)}
          disabled={readOnly}
          ariaLabel={`Descriptif — ${resolveLanguageLabel(active, characteristics.languageOptions)}`}
          variant="block"
        />
        {(() => {
          const len = readTranslatableField(activeScopeData.description, active, BASE_LANGUAGE).length;
          return <div className={`char-count${len > 2000 ? ' over' : ''}`}>{len} / 2000 caractères</div>;
        })()}
      </Field>

      {/* « Descriptif du plan d'accès » moved to §02 Localisation (object_location.direction);
          description_adapted is single-owned by §10 Accessibilité since the §04 hand-off. */}

      {readOnly && (
        <p className="muted">
          Lecture seule : vos droits ne permettent pas d'éditer la version {missingScope}.
        </p>
      )}
    </Fs>
  );
}
