'use client';

/**
 * « Vos coordonnées » — téléphone, e-mail, site internet.
 *
 * Trois appels à `upsertPublicContact`, CHAÎNÉS sur la tranche précédente : partir trois
 * fois de `editor.draft.contacts` ne garderait que la dernière écriture. L'updater part
 * lui-même de la tranche courante, donc tout ce que l'écran ne montre pas — le fax interne,
 * les réseaux sociaux, le contact de l'office — traverse intact.
 */
import { useEffect } from 'react';
import { PortalField, PortalRubricActions, focusPortalField, useRubricForm } from './rubric-kit';
import { readPublicContact, upsertPublicContact } from '../portal-bindings';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceContactsModule } from '../../../services/object-workspace-parser';

interface ContactsForm {
  phone: string;
  email: string;
  website: string;
  emailError: string | null;
  writeError: string | null;
}

/** Contrôle VOLONTAIREMENT permissif : il attrape la faute de frappe (« contact@ »),
 *  pas les adresses exotiques mais valides. Refuser une vraie adresse coûterait plus
 *  cher qu'accepter une faute que l'office verra. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function ContactsRubric({ editor, formKey, onDone, onCancel, onDirtyChange, formCache }: PortalRubricFormProps) {
  const contacts = editor.draft.contacts as ObjectWorkspaceContactsModule;
  const { form, setForm, dirty } = useRubricForm<ContactsForm>(formKey, () => ({
    phone: readPublicContact(contacts, 'phone'),
    email: readPublicContact(contacts, 'email'),
    website: readPublicContact(contacts, 'website'),
    emailError: null,
    writeError: null,
  }), formCache);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (form.email.trim() && !looksLikeEmail(form.email)) {
      setForm((previous) => ({
        ...previous,
        emailError: 'Vérifiez cette adresse e-mail (exemple : contact@exemple.re).',
      }));
      // Le focus reste sinon sur « Valider » : au clavier comme au lecteur d'écran, il
      // faut alors retrouver le champ fautif à l'aveugle.
      focusPortalField('portal-email');
      return;
    }
    try {
      let next = contacts;
      next = upsertPublicContact(next, 'phone', form.phone);
      next = upsertPublicContact(next, 'email', form.email);
      next = upsertPublicContact(next, 'website', form.website);
      editor.replaceModule('contacts', next);
    } catch {
      // Un genre absent du catalogue : le dire plutôt que laisser un bouton sans effet.
      setForm((previous) => ({
        ...previous,
        writeError: 'Nous n’avons pas pu enregistrer ces coordonnées. Contactez votre office de tourisme.',
      }));
      return;
    }
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      <PortalField id="portal-phone" label="Téléphone">
        {(slots) => (
          <input
            {...slots}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
          />
        )}
      </PortalField>

      <PortalField id="portal-email" label="E-mail" error={form.emailError}>
        {(slots) => (
          <input
            {...slots}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, email: event.target.value, emailError: null }))
            }
          />
        )}
      </PortalField>

      <PortalField id="portal-website" label="Site internet (facultatif)" hint="Exemple : www.exemple.re">
        {(slots) => (
          <input
            {...slots}
            type="url"
            inputMode="url"
            autoComplete="url"
            value={form.website}
            onChange={(event) => setForm((previous) => ({ ...previous, website: event.target.value }))}
          />
        )}
      </PortalField>

      {form.writeError ? (
        <p className="field-error" role="alert">
          {form.writeError}
        </p>
      ) : null}

      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
