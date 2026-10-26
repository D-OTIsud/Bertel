import { useState } from 'react';
import { EditorModal, Field, Chip, ChipSet, Toggle } from '../primitives';
import { ACTOR_VISIBILITY_OPTIONS } from '../sections/actor-links';
import type {
  ObjectWorkspaceActorLinkItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import './catalog-modals.css';

interface ProviderEditModalProps {
  open: boolean;
  /** The actor link being edited (attached prestataire). */
  actor: ObjectWorkspaceActorLinkItem;
  roleOptions: WorkspaceReferenceOption[];
  /**
   * §208 — motif (ou `null`) pour lequel la note n'est pas saisissable sur CETTE fiche. Verdict
   * PAR APPELANT + PAR FICHE porté par le module (`actorNoteWriteUnavailableReason`), jamais lu
   * sur la ligne : un lien qu'on vient d'ajouter n'a pas de verdict serveur à lui.
   */
  noteUnavailableReason: string | null;
  onClose: () => void;
  /** Returns the patched link — the section commits it and reconciles the one-primary-per-role rule. */
  onSave: (actor: ObjectWorkspaceActorLinkItem) => void;
}

/**
 * §19 — focused edit modal for one attached prestataire (actor_object_role link): role,
 * visibility, "principal" flag and free note. Mirrors §03/§08 (display card → modal). The
 * attach itself stays in ProviderCards (ActorPicker); this modal never changes the actor identity.
 */
export function ProviderEditModal({
  open,
  actor,
  roleOptions,
  noteUnavailableReason,
  onClose,
  onSave,
}: ProviderEditModalProps) {
  const [draft, setDraft] = useState(actor);
  const set = (patch: Partial<ObjectWorkspaceActorLinkItem>) =>
    setDraft((current) => ({ ...current, ...patch }));

  // Keep the current role selectable even if the catalog no longer lists it (legacy code).
  const roleSelectOptions = [
    ...(roleOptions.some((option) => option.code === draft.roleCode)
      ? []
      : [{ v: draft.roleCode, l: draft.roleLabel || draft.roleCode }]),
    ...roleOptions.map((option) => ({ v: option.code, l: option.label })),
  ];

  function setRole(roleCode: string) {
    const role = roleOptions.find((option) => option.code === roleCode);
    set({ roleCode, roleId: role?.id ?? draft.roleId, roleLabel: role?.label ?? roleCode });
  }

  return (
    <EditorModal
      open={open}
      eyebrow="Prestataire rattaché à la fiche"
      title={actor.displayName}
      footerNote="Prêt à appliquer au brouillon"
      saveLabel="Appliquer"
      onClose={onClose}
      onSave={() =>
        onSave({ ...draft, note: noteUnavailableReason === null ? draft.note.trim() : actor.note })
      }
    >
      <section className="ed-catalog-section ed-provider-role" aria-label={`Rôle de ${actor.displayName}`}>
        <h3>Quel est son rôle ici ?</h3>
        <ChipSet>
          {roleSelectOptions.map((role) => (
            <Chip
              key={role.v}
              label={role.l}
              on={draft.roleCode === role.v}
              onClick={() => setRole(role.v)}
            />
          ))}
        </ChipSet>
        <Toggle
          label="Contact principal pour ce rôle"
          sub={`C’est la personne à contacter en premier comme ${draft.roleLabel.toLowerCase() || 'prestataire'}.`}
          on={draft.isPrimary}
          onChange={(isPrimary) => set({ isPrimary })}
        />
      </section>
      <section className="ed-catalog-section" aria-label={`Visibilité de ${actor.displayName}`}>
        <h3>Qui peut voir ce rattachement ?</h3>
        <div className="ed-modal__segmented">
          {['public', 'partners', 'private'].map((visibility) => (
            <button
              key={visibility}
              type="button"
              aria-pressed={(draft.visibility || 'public') === visibility}
              onClick={() => set({ visibility })}
            >
              {visibility === 'public'
                ? 'Tout le monde'
                : ACTOR_VISIBILITY_OPTIONS.find((option) => option.v === visibility)?.l}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          {draft.visibility === 'private'
            ? 'Visible seulement dans Bertel, par votre équipe.'
            : draft.visibility === 'partners'
              ? 'Visible par les partenaires autorisés.'
              : 'Visible sur la fiche publique.'}
        </p>
      </section>
      <details
        className="ed-catalog-section ed-catalog-details"
        open={Boolean(draft.note) || noteUnavailableReason !== null}
      >
        <summary>Ajouter une note interne</summary>
        <Field label="Note" hint={noteUnavailableReason ?? undefined}>
          <textarea
            className="input ed-provider-note"
            value={draft.note}
            placeholder="Rôle réel, référent, conditions…"
            aria-label={`Note sur ${actor.displayName}`}
            readOnly={noteUnavailableReason !== null}
            // §208/T13b — un appelant restreint qui enregistre voit sa note REPORTÉE par le
            // serveur quoi qu'il envoie (api.save_object_relations) ; sur un lien NEUF, elle part
            // à NULL. Un champ éditable ici saisirait une valeur silencieusement ignorée à
            // l'enregistrement (write-trap). Le motif vient du module (verdict par fiche), jamais
            // de `actor.contactsRestricted` — qui est muet sur un lien pas encore enregistré.
            onChange={
              noteUnavailableReason !== null ? () => undefined : (event) => set({ note: event.target.value })
            }
          />
        </Field>
      </details>
      <div className="ed-catalog-summary">
        <small>Sur la fiche : </small>
        <strong>
          {draft.visibility === 'private'
            ? 'Non affiché publiquement'
            : draft.visibility === 'partners'
              ? 'Visible par les partenaires'
              : `${actor.displayName} · ${draft.roleLabel}`}
        </strong>
      </div>
    </EditorModal>
  );
}
