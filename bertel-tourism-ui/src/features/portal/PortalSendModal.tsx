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

/**
 * L'envoi n'a même pas pu être PRÉPARÉ. Les bâtisseurs de payload lisent des tranches
 * brutes et jettent sur une donnée incomplète : ce n'est ni le réseau ni l'office. Servir
 * « Vérifiez votre connexion » désignerait un problème inexistant, et le partenaire
 * chercherait son wifi pendant que la panne est ailleurs.
 */
const PREPARE_ERROR =
  'Nous n’avons pas pu préparer votre envoi : une rubrique contient une information que nous ne savons pas relire. Contactez votre office de tourisme — vos modifications restent enregistrées sur cet appareil.';

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
  /**
   * Les rubriques mises DE CÔTÉ pour cet envoi. Elles ne partent pas, et RIEN n'est
   * détruit : `resetModule` remettrait la tranche à la baseline — les valeurs tapées
   * seraient perdues et le brouillon réécrit sans elles 800 ms plus tard, sous un libellé
   * qui promet exactement le contraire (« je le garde, je l'enverrai plus tard »).
   */
  const [excluded, setExcluded] = useState<Set<WorkspaceModuleId>>(new Set());

  // Le message N'A PAS d'état local : il vit dans le brouillon (il peut être la SEULE chose
  // saisie, et un envoi sans modification est refusé). Il est donc « resynchronisé » par
  // construction — un `useState(() => note)` figé afficherait le texte de l'ouverture
  // précédente. Seule l'erreur se remet à zéro à chaque ouverture.
  useEffect(() => {
    if (open) {
      setError(null);
      // La mise de côté vaut pour UN envoi : rouvrir la fenêtre repart de tout.
      setExcluded(new Set());
    }
  }, [open]);

  const modified = rubrics.filter((rubric) => rubric.state === 'dirty');
  const sending = modified.filter((rubric) => !excluded.has(rubric.module));

  async function handleSend() {
    if (busy || sending.length === 0) return;
    setBusy(true);
    setError(null);

    const seen = new Set<WorkspaceModuleId>();
    const modules: WorkspaceModuleId[] = [];
    const envelopes: SubmitPendingChangeInput[] = [];

    // La CONSTRUCTION est gardée SÉPARÉMENT : hors d'un try, l'exception laisserait le
    // bouton bloqué sur « Envoi… » — un bouton qui ne répond plus ; dans le même try que
    // l'appel, elle emprunterait le message du RÉSEAU, qui ne décrit pas ce qui s'est passé.
    try {
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
    } catch {
      setError(PREPARE_ERROR);
      setBusy(false);
      return;
    }

    try {
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
        {modified.map((rubric) => {
          const off = excluded.has(rubric.module);
          return (
            <li key={rubric.id} data-excluded={off || undefined}>
              <span className="portal-send-list__title">{rubric.title}</span>
              <span className="muted">
                {off
                  ? 'ne partira pas cette fois'
                  : isAutoDispatchModule(rubric.module)
                    ? // Il vient de cliquer « Valider » : « appliqué dès validation » lui
                      // ferait croire que c'est déjà en ligne.
                      'l’office les publiera tout de suite'
                    : 'l’office les recopiera lui-même'}
              </span>
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  setExcluded((previous) => {
                    const next = new Set(previous);
                    if (off) next.delete(rubric.module);
                    else next.add(rubric.module);
                    return next;
                  })
                }
              >
                {off ? 'Remettre dans l’envoi' : 'Retirer de l’envoi'}
              </button>
            </li>
          );
        })}
      </ul>
      {sending.length === 0 ? (
        <p className="muted">
          Vous n’envoyez rien pour l’instant. Remettez au moins une rubrique dans l’envoi.
        </p>
      ) : null}

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
