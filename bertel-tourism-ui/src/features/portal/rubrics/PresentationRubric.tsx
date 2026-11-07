'use client';

/**
 * « Présentez votre établissement » — le français et ses traductions, gardés en brouillon.
 *
 * Le texte n'est JAMAIS nettoyé : un texte simple est déjà du Markdown valide, et
 * « nettoyer » abîmerait une saisie riche. Le compteur est annoncé (`aria-live`) mais
 * discrètement : il compte, il ne gronde pas.
 */
import { useEffect, useState } from 'react';
import { PortalField, PortalRubricActions, useRubricForm } from './rubric-kit';
import { setPresentation, type PortalPresentationTranslations } from '../portal-bindings';
import { readTranslatableField } from '../../object-editor/sections/descriptions-field';
import { descLanguageTabs, resolveLanguageLabel } from '../../object-editor/sections/spoken-languages';
import { AiTranslateButton } from '../../../components/ai/AiTranslateButton';
import { useServiceAvailability } from '../../../hooks/useServiceAvailability';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceDescriptionsModule } from '../../../services/object-workspace-parser';

const CHAPO_MAX = 160;
const DESCRIPTION_MAX = 2000;
/** En dessous, le texte publié est trop court pour donner envie — on le dit, sans bloquer. */
const DESCRIPTION_SHORT = 120;

interface PresentationForm {
  chapo: string;
  description: string;
  // Facultatif pour relire sans perte les anciens caches, qui ne contenaient que le FR.
  translations?: PortalPresentationTranslations;
}

export function PresentationRubric({ editor, formKey, onDone, onCancel, onDirtyChange, formCache }: PortalRubricFormProps) {
  const { translation } = useServiceAvailability();
  const descriptions = editor.draft.descriptions as ObjectWorkspaceDescriptionsModule;
  const { form, setForm, dirty } = useRubricForm<PresentationForm>(formKey, () => ({
    chapo: readTranslatableField(descriptions.object.chapo, 'fr', 'fr') ?? '',
    description: readTranslatableField(descriptions.object.description, 'fr', 'fr') ?? '',
  }), formCache);
  const [selection, setSelection] = useState({ formKey, language: 'fr' });
  const language = selection.formKey === formKey ? selection.language : 'fr';
  const characteristics = editor.draft.characteristics;
  const languageOptions = characteristics.languageOptions ?? [];
  const languages = descLanguageTabs(
    ['fr', 'en', 'cre', 'de', 'es', ...(descriptions.availableLanguages ?? []),
      ...Object.keys(descriptions.object.chapo.values), ...Object.keys(descriptions.object.description.values),
      ...Object.keys(form.translations ?? {})],
    characteristics.selectedLanguages ?? [],
  );

  function readField(field: 'chapo' | 'description', code = language): string {
    return code === 'fr'
      ? form[field]
      : form.translations?.[code]?.[field] ?? readTranslatableField(descriptions.object[field], code, 'fr');
  }

  function patchFields(fields: Partial<{ chapo: string; description: string }>) {
    setForm((previous) => language === 'fr'
      ? { ...previous, ...fields }
      : { ...previous, translations: {
          ...previous.translations,
          [language]: { ...previous.translations?.[language], ...fields },
        } });
  }

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const chapo = readField('chapo');
  const description = readField('description');
  const languageLabel = resolveLanguageLabel(language, languageOptions);
  const tooShort = description.trim().length > 0 && description.trim().length < DESCRIPTION_SHORT;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    editor.replaceModule('descriptions', setPresentation(descriptions, form.chapo, form.description, form.translations));
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      <div className="portal-shortcuts" role="group" aria-label="Langue de la présentation">
        {languages.map((code) => (
          <button
            key={code}
            type="button"
            className="portal-pill"
            aria-pressed={language === code}
            onClick={() => setSelection({ formKey, language: code })}
          >
            {resolveLanguageLabel(code, languageOptions)}
          </button>
        ))}
      </div>
      <p className="muted" aria-live="polite">Langue de saisie : {languageLabel}</p>
      {translation && language !== 'fr' ? (
        <AiTranslateButton
          objectId={editor.objectId}
          sourceLanguage="fr"
          targetLanguage={language}
          sourceLabel="Français"
          targetLabel={languageLabel}
          fields={{ chapo: form.chapo, description: form.description }}
          existingValues={{ chapo, description }}
          contextKey={formKey}
          onTranslated={(translations) => patchFields({
            ...(typeof translations.chapo === 'string' ? { chapo: translations.chapo } : {}),
            ...(typeof translations.description === 'string' ? { description: translations.description } : {}),
          })}
        />
      ) : translation ? (
        <p className="muted">Choisissez une autre langue pour traduire vos textes en un clic avec l’IA.</p>
      ) : null}
      <PortalField
        id="portal-chapo"
        label="En une phrase"
        hint="La phrase que le visiteur lit en premier. Exemple : « Cuisine créole au feu de bois, terrasse sous les longanis. »"
      >
        {(slots) => (
          <textarea
            {...slots}
            rows={2}
            maxLength={CHAPO_MAX}
            lang={language === 'cre' ? 'rcf' : language}
            value={chapo}
            onChange={(event) => patchFields({ chapo: event.target.value })}
          />
        )}
      </PortalField>
      <p className="muted portal-counter" aria-live="polite">
        {`${chapo.length} caractères sur ${CHAPO_MAX}`}
      </p>

      <PortalField
        id="portal-description"
        label="Présentez votre établissement"
        hint="Ce que vous proposez, l’ambiance, ce qui vous rend unique."
      >
        {(slots) => (
          <textarea
            {...slots}
            rows={8}
            maxLength={DESCRIPTION_MAX}
            lang={language === 'cre' ? 'rcf' : language}
            value={description}
            onChange={(event) => patchFields({ description: event.target.value })}
          />
        )}
      </PortalField>
      <p className="muted portal-counter" aria-live="polite">
        {`${description.length} caractères sur ${DESCRIPTION_MAX}`}
      </p>
      {tooShort ? (
        <p className="muted">
          Quelques phrases de plus donneraient davantage envie de venir. Vous pouvez valider tel quel.
        </p>
      ) : null}

      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
