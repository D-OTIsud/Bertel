'use client';

/**
 * « Présentez votre établissement » — l'accroche et le texte de présentation, en français.
 *
 * Le texte n'est JAMAIS nettoyé : un texte simple est déjà du Markdown valide, et
 * « nettoyer » abîmerait une saisie riche. Le compteur est annoncé (`aria-live`) mais
 * discrètement : il compte, il ne gronde pas.
 */
import { useEffect } from 'react';
import { PortalField, PortalRubricActions, useRubricForm } from './rubric-kit';
import { setPresentation } from '../portal-bindings';
import { readTranslatableField } from '../../object-editor/sections/descriptions-field';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceDescriptionsModule } from '../../../services/object-workspace-parser';

const CHAPO_MAX = 160;
const DESCRIPTION_MAX = 2000;
/** En dessous, le texte publié est trop court pour donner envie — on le dit, sans bloquer. */
const DESCRIPTION_SHORT = 120;

interface PresentationForm {
  chapo: string;
  description: string;
}

export function PresentationRubric({ editor, formKey, onDone, onCancel, onDirtyChange }: PortalRubricFormProps) {
  const descriptions = editor.draft.descriptions as ObjectWorkspaceDescriptionsModule;
  const { form, setForm, dirty } = useRubricForm<PresentationForm>(formKey, () => ({
    chapo: readTranslatableField(descriptions.object.chapo, 'fr', 'fr') ?? '',
    description: readTranslatableField(descriptions.object.description, 'fr', 'fr') ?? '',
  }));

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const tooShort = form.description.trim().length > 0 && form.description.trim().length < DESCRIPTION_SHORT;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    editor.replaceModule('descriptions', setPresentation(descriptions, form.chapo, form.description));
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
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
            value={form.chapo}
            onChange={(event) => setForm((previous) => ({ ...previous, chapo: event.target.value }))}
          />
        )}
      </PortalField>
      <p className="muted portal-counter" aria-live="polite">
        {`${form.chapo.length} caractères sur ${CHAPO_MAX}`}
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
            value={form.description}
            onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
          />
        )}
      </PortalField>
      <p className="muted portal-counter" aria-live="polite">
        {`${form.description.length} caractères sur ${DESCRIPTION_MAX}`}
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
