import { useState } from 'react';
import { Fs, Field, Textarea, LangTabs, ScopeTabs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDescriptionScope } from '../../../services/object-workspace-parser';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

const LANG_LABELS: Record<string, string> = {
  fr: 'Français', en: 'English', cre: 'Créole', de: 'Deutsch', es: 'Español',
};

const EMPTY_FIELD = { baseValue: '', values: {} as Record<string, string> };
const emptyOverlay = (): ObjectWorkspaceDescriptionScope => ({
  recordId: null, scope: 'object', placeId: null, label: 'Personnalisée', visibility: 'public',
  description: { ...EMPTY_FIELD }, chapo: { ...EMPTY_FIELD }, adaptedDescription: { ...EMPTY_FIELD },
  mobileDescription: { ...EMPTY_FIELD }, editorialDescription: { ...EMPTY_FIELD },
});

/** Section 04 — multilingual descriptions: default (shared) layer + per-organisation personalised overlay. */
export function SectionDescriptions({ editor, permissions, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
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
    const updated = updateTranslatableField(activeScopeData[field], active, descriptions.localLanguage, value);
    const nextScope = { ...activeScopeData, [field]: updated };
    editor.replaceModule('descriptions', onOrg
      ? { ...descriptions, orgOverlay: nextScope }
      : { ...descriptions, object: nextScope });
  }

  const tabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code,
    filled: Boolean(
      readTranslatableField(activeScopeData.description, code, descriptions.localLanguage).trim()
      || readTranslatableField(activeScopeData.chapo, code, descriptions.localLanguage).trim(),
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
    onOrg ? readTranslatableField(descriptions.object[field], active, descriptions.localLanguage) : '';
  const hint = (base: string, field: 'chapo' | 'description') => {
    const fb = fallback(field);
    const current = readTranslatableField(activeScopeData[field], active, descriptions.localLanguage).trim();
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
      <div className="desc-selectors">
        {scopeTabs.length > 1 ? (
          <ScopeTabs tabs={scopeTabs} active={scope} onSelect={(c) => setScope(c as 'canonical' | 'org')} />
        ) : (
          <span />
        )}
        {tabs.length > 0 && <LangTabs tabs={tabs} active={active} onSelect={setLanguage} />}
      </div>

      <Field label="Accroche" required={!onOrg} hint={hint('≤ 160 caractères — accroche courte affichée en tête de la fiche', 'chapo')}>
        <Textarea
          value={readTranslatableField(activeScopeData.chapo, active, descriptions.localLanguage)}
          onChange={(v) => patchField('chapo', v)}
          placeholder={fallback('chapo')}
          disabled={readOnly}
          data-testid="chapo-textarea"
          count max={160} rows={5}
        />
      </Field>

      <Field label="Descriptif" required={!onOrg} hint={hint('Texte principal de la fiche détail', 'description')}>
        <Textarea
          value={readTranslatableField(activeScopeData.description, active, descriptions.localLanguage)}
          onChange={(v) => patchField('description', v)}
          placeholder={fallback('description')}
          disabled={readOnly}
          rich count max={2000} rows={12}
        />
      </Field>

      {/* « Descriptif du plan d'accès » moved to §02 Localisation (object_location.direction);
          description_adapted is single-owned by §10 Accessibilité since the §04 hand-off. */}

      {readOnly && (
        <p className="muted" style={{ marginTop: 8 }}>
          Lecture seule : vos droits ne permettent pas d'éditer la version {missingScope}.
        </p>
      )}
    </Fs>
  );
}
