'use client';

/**
 * La fenêtre d'envoi — le SEUL endroit d'où quelque chose part.
 *
 * ⚠ `Modal` fait un `createPortal(…, document.body)` : la fenêtre n'est PAS descendante de
 * `.portal-shell`, et aucune règle `.portal-shell …` ne l'atteint. D'où `className="portal-modal"`,
 * sous lequel la Task 12 a déjà posé le contrat de taille (48 px, 1.05 rem).
 *
 * D12 — la surcharge ne touche QUE `field` / `before` / `after`. `section`, `rpc`,
 * `manual_apply` et `payload` sortent de `buildContributorSubmission` et y restent
 * byte-identiques : ce sont les seules clés que le serveur valide, et que
 * `approve_pending_change` rejoue.
 *
 * LA GARDE `unavailableReason` EST ICI. `buildContributorSubmission` n'en a aucune : elle
 * bâtirait sans broncher l'enveloppe d'une rubrique dont la donnée n'a pas chargé. On
 * n'envoie donc QUE ce que `buildPortalRubrics` a marqué `dirty` — un module masqué, sous
 * plancher, ou en mode dégradé n'y figure jamais.
 *
 * UN SEUL APPEL, tout ou rien : `submit_actor_fiche` est transactionnel. En cas d'échec,
 * rien n'est parti et le brouillon local n'est pas touché.
 */
import { useEffect, useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { buildContributorSubmission, isAutoDispatchModule } from '../object-editor/contributor-proposal';
import { MODULE_KEY_MAP } from '../object-editor/editor-state';
import { describePortalChange } from './portal-change-summary';
import { clearPortalDraft, writePortalSent } from './usePortalDraft';
import { submitActorFiche } from '../../services/portal';
import type { ArchetypeCode } from '../object-editor/archetypes';
import type { ObjectEditorState } from '../object-editor/useObjectEditorState';
import type { BuiltPortalRubric } from './portal-rubrics';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import type { SubmitPendingChangeInput } from '../../services/moderation';

/** Les refus que le partenaire peut TRAITER, et ce qu'il doit faire de chacun. Le repli
 *  générique du service (« Rien n'est perdu ») ne dit aucune action : on comble ce blanc. */
const SEND_ERRORS: Record<string, string> = {
  PT409:
    'L’office est déjà en train de vérifier cette fiche. Vous pourrez envoyer ces changements quand la vérification sera terminée.',
  '22023':
    'Une rubrique n’est plus modifiable depuis ici (l’office l’a fermée). Retirez-la de l’envoi, puis réessayez.',
};

const GENERIC_ERROR =
  'Nous n’avons pas pu envoyer vos modifications. Vérifiez votre connexion, puis réessayez dans un instant. Rien n’est perdu : tout est encore enregistré sur cet appareil.';

export interface PortalSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectId: string;
  userId: string | null;
  archetype: ArchetypeCode;
  editor: ObjectEditorState;
  /** TOUTES les rubriques de la fiche — le filtre `dirty` est fait ici, et nulle part ailleurs. */
  rubrics: BuiltPortalRubric[];
  note: string;
  onNoteChange: (value: string) => void;
  onSent: (result: { submissionId: string; modules: WorkspaceModuleId[] }) => void;
}

export function PortalSendModal({
  open,
  onOpenChange,
  objectId,
  userId,
  archetype,
  editor,
  rubrics,
  note,
  onNoteChange,
  onSent,
}: PortalSendModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le message N'A PAS d'état local : il vit dans le brouillon (il peut être la SEULE chose
  // saisie, et un envoi sans modification est refusé). Il est donc « resynchronisé » par
  // construction — un `useState(() => note)` figé afficherait le texte de l'ouverture
  // précédente. Seule l'erreur se remet à zéro à chaque ouverture.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const sending = rubrics.filter((rubric) => rubric.state === 'dirty');

  async function handleSend() {
    if (busy || sending.length === 0) return;
    setBusy(true);
    setError(null);

    const seen = new Set<WorkspaceModuleId>();
    const modules: WorkspaceModuleId[] = [];
    const envelopes: SubmitPendingChangeInput[] = [];

    try {
      // La CONSTRUCTION est dans le try : les bâtisseurs de payload lisent des tranches
      // brutes et peuvent jeter sur une donnée abîmée. Hors du try, l'exception laisserait
      // le bouton bloqué sur « Envoi… », c'est-à-dire un bouton qui ne répond plus.
      for (const rubric of sending) {
        // Deux rubriques ne partagent jamais un module POUR UN MÊME TYPE, mais une double
        // enveloppe se marcherait dessus dans un seul envoi : on ferme la porte.
        if (seen.has(rubric.module)) continue;
        seen.add(rubric.module);
        modules.push(rubric.module);
        const base = buildContributorSubmission(objectId, rubric.module, editor.baseline, editor.draft);
        const readable = describePortalChange(rubric.module, editor.baseline, editor.draft, archetype);
        envelopes.push({ ...base, metadata: { ...base.metadata, ...readable } });
      }

      const result = await submitActorFiche(objectId, envelopes, note.trim() || null);
      // Ce que le partenaire a envoyé, tel qu'il l'a écrit — relu par la notice de rubrique.
      writePortalSent(userId, objectId, {
        submittedAt: new Date().toISOString(),
        lines: Object.fromEntries(
          modules.map((module) => [
            module,
            describePortalChange(module, editor.baseline, editor.draft, archetype)
              .after.split('\n')
              .filter(Boolean),
          ]),
        ),
      });
      editor.commitModules(modules.map((module) => MODULE_KEY_MAP[module]));
      clearPortalDraft(userId, objectId);
      onSent({ submissionId: result.submissionId, modules });
      onOpenChange(false);
    } catch (caught) {
      const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : '';
      setError(SEND_ERRORS[code] ?? GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Envoyer à l’office"
      open={open}
      onOpenChange={onOpenChange}
      className="portal-modal"
      footer={
        <>
          <button type="button" className="ghost-button" onClick={() => onOpenChange(false)} disabled={busy}>
            Pas maintenant
          </button>
          <button
            type="button"
            className="primary-button"
            aria-busy={busy || undefined}
            aria-disabled={busy || sending.length === 0 || undefined}
            onClick={() => void handleSend()}
          >
            {busy ? 'Envoi…' : 'Envoyer'}
          </button>
        </>
      }
    >
      <p>Vous envoyez :</p>
      <ul className="portal-send-list">
        {sending.map((rubric) => (
          <li key={rubric.id}>
            <span className="portal-send-list__title">{rubric.title}</span>
            <span className="muted">
              {isAutoDispatchModule(rubric.module) ? 'appliqués dès validation' : 'l’office la reportera'}
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => editor.resetModule(MODULE_KEY_MAP[rubric.module])}
            >
              Retirer de l’envoi
            </button>
          </li>
        ))}
      </ul>
      {sending.length === 0 ? <p className="muted">Vous n’avez plus aucune modification à envoyer.</p> : null}

      <div className="auth-field">
        <label htmlFor="portal-send-note">Un message pour l’office (facultatif)</label>
        <p className="auth-field__hint" id="portal-send-note-hint">
          Par exemple : « Nouveaux horaires d’été » ou « Le numéro a changé ».
        </p>
        <textarea
          id="portal-send-note"
          className="portal-input"
          aria-describedby="portal-send-note-hint"
          rows={3}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
