import { useState } from 'react';
import { Fs, Field, Textarea, LangTabs, ScopeTabs } from '../primitives';
import type { SectionProps } from './section-types';
import { useSessionStore } from '../../../store/session-store';
import type { ObjectWorkspaceDescriptionScope } from '../../../services/object-workspace-parser';
import { readTranslatableField, updateTranslatableField } from './descriptions-field';

const LANG_LABELS: Record<string, string> = {
  fr: 'Français', en: 'English', cre: 'Créole', de: 'Deutsch', es: 'Español',
};

const EMPTY_FIELD = { baseValue: '', values: {} as Record<string, string> };
const emptyOverlay = (): ObjectWorkspaceDescriptionScope => ({
  recordId: null, scope: 'object', placeId: null, label: 'Mon organisation', visibility: 'public',
  description: { ...EMPTY_FIELD }, chapo: { ...EMPTY_FIELD }, adaptedDescription: { ...EMPTY_FIELD },
  mobileDescription: { ...EMPTY_FIELD }, editorialDescription: { ...EMPTY_FIELD },
});

/** Section 04 — multilingual descriptions, canonical + per-organisation overlay. */
export function SectionDescriptions({ editor, permissions, folded }: SectionProps) {
  const descriptions = editor.draft.descriptions;
  const active = descriptions.activeLanguage;
  const canEditOrg = permissions.descriptions?.canEditOrgEnrichment ?? false;
  const canEditCanonical = permissions.descriptions?.canEditCanonical ?? false;
  const orgName = useSessionStore((s) => s.orgName);

  // Scope is local UI navigation (must not mark the module dirty). Default to the
  // org layer for contributors who cannot edit canonical.
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

  function patchField(field: 'chapo' | 'description' | 'adaptedDescription', value: string) {
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

  const scopeTabs = [
    { code: 'canonical', label: 'Canonique' },
    ...(canEditOrg ? [{ code: 'org', label: `Mon organisation${orgName ? ` · ${orgName}` : ''}` }] : []),
  ];

  // In org scope, show the canonical value as a greyed fallback hint when the overlay field is empty.
  const fallback = (field: 'chapo' | 'description' | 'adaptedDescription') =>
    onOrg ? readTranslatableField(descriptions.object[field], active, descriptions.localLanguage) : '';
  const hint = (base: string, field: 'chapo' | 'description' | 'adaptedDescription') => {
    const fb = fallback(field);
    return onOrg && fb ? `Hérité du canonique : « ${fb.slice(0, 80)} » — saisir pour personnaliser` : base;
  };

  const readOnly = onOrg ? !canEditOrg : !canEditCanonical;
  const missingScope = onOrg ? 'overlay ORG' : 'canonique';

  return (
    <Fs
      num="04"
      title="Descriptions"
      sub="Accroche, descriptif, plan d'accès — par langue et par organisation"
      folded={folded}
      pill={{ tone: 'ok', label: onOrg ? 'Mon organisation' : 'Canonique' }}
    >
      {scopeTabs.length > 1 && <ScopeTabs tabs={scopeTabs} active={scope} onSelect={(c) => setScope(c as 'canonical' | 'org')} />}
      {tabs.length > 0 && <LangTabs tabs={tabs} active={active} onSelect={setLanguage} />}

      <Field label="Accroche" hint={hint("≤ 160 caractères — apparaît sous le titre dans l'Explorer", 'chapo')}>
        <Textarea
          value={readTranslatableField(activeScopeData.chapo, active, descriptions.localLanguage)}
          onChange={(v) => patchField('chapo', v)}
          placeholder={fallback('chapo')}
          disabled={readOnly}
          data-testid="chapo-textarea"
          count max={160} rows={2}
        />
      </Field>

      <Field label="Descriptif" required={!onOrg} hint={hint('Texte principal de la fiche détail', 'description')}>
        <Textarea
          value={readTranslatableField(activeScopeData.description, active, descriptions.localLanguage)}
          onChange={(v) => patchField('description', v)}
          placeholder={fallback('description')}
          disabled={readOnly}
          rich count max={2000}
        />
      </Field>

      <Field label="Descriptif du plan d'accès" hint={hint("Itinéraire textuel ; complète les coordonnées GPS", 'adaptedDescription')}>
        <Textarea
          value={readTranslatableField(activeScopeData.adaptedDescription, active, descriptions.localLanguage)}
          onChange={(v) => patchField('adaptedDescription', v)}
          placeholder={fallback('adaptedDescription')}
          disabled={readOnly}
          rows={4}
        />
      </Field>

      {readOnly && (
        <p className="muted" style={{ marginTop: 8 }}>
          Lecture seule : vos droits ne permettent pas d'éditer la couche {missingScope}.
        </p>
      )}
    </Fs>
  );
}
