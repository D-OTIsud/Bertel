'use client';

// Carte « Accès portail » de la fiche prestataire (18a/D1). Rail droit de CrmActorFiche,
// juste sous la carte acteur, visible avec la permission dédiée : c'est par ici
// qu'un agent d'office ouvre (ou ferme) l'accès d'un partenaire à ses propres fiches.
//
// Toute action passe par /api/crm/actor-access, dont la garde serveur
// (api.user_can_write_crm_actor, évaluée en tant que l'appelant) est LA barrière. `canWrite`
// ici n'est que du no-write-trap : il évite de proposer un geste qui serait refusé.
//
// DEUX RÈGLES DE SURFACE, chacune apprise d'un piège :
//  - jamais un bouton qui échoue : sans canal e-mail, sans droit d'écriture, ou si l'acteur
//    est déjà rattaché à un autre compte, le bouton est DÉSACTIVÉ avec la raison À L'ÉCRAN
//    (pas seulement en `title`, invisible au doigt) ;
//  - tout geste qui envoie un e-mail ou supprime un compte passe par une confirmation qui
//    NOMME l'adresse : inviter, RENVOYER (il invalide le lien précédent) et révoquer.
//
// Le statut est lu derrière `api.user_can_read_crm_actor`, pas le prédicat d'écriture : un
// agent en lecture seule (canWrite=false) doit voir l'état du compte, sinon la carte lui
// afficherait un bandeau d'alerte permanent sur CHAQUE fiche et la branche `blockedReason`
// ci-dessous ne serait jamais atteinte en production. Voir le commentaire de REQUIRED_GATE
// dans `app/api/crm/actor-access/route.ts` : les deux moitiés de cette règle vont ensemble.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import {
  canManageActorPortalAccess,
  getPortalAccessStatus,
  invitePortalAccess,
  resendPortalAccess,
  revokePortalAccess,
  type PortalActionResult,
} from '../../services/actor-access';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useSessionStore } from '../../store/session-store';
import { CRM_READ_ONLY_REASON, formatShort } from './crm-view-utils';

const NO_EMAIL_REASON = 'Ajoutez d’abord une adresse e-mail à cet acteur.';
const ALREADY_LINKED_REASON =
  'Cet acteur est déjà rattaché à un compte interne — un administrateur doit défaire ce lien avant d’ouvrir un accès.';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

interface PortalAccessProps {
  actorId: string;
  canWrite: boolean;
  /** Adresses e-mail des coordonnées de l’acteur, principale d’abord. */
  emailChannels: string[];
}

export function CrmActorPortalAccess(props: PortalAccessProps) {
  const userId = useSessionStore((state) => state.userId);
  const orgId = useSessionStore((state) => state.orgId);
  const permission = useQuery({
    queryKey: ['crm-actor-portal-permission', userId, orgId],
    queryFn: canManageActorPortalAccess,
    enabled: !!userId,
  });
  if (!userId || permission.data !== true) return null;
  return <PortalAccessCard {...props} />;
}

function PortalAccessCard({
  actorId,
  canWrite,
  emailChannels,
}: PortalAccessProps) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'invite' | 'resend' | 'revoke' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Le geste a réussi mais quelque chose mérite d'être dit (trace CRM manquante).
  const [notice, setNotice] = useState<string | null>(null);
  // null = « pas encore choisi » ⇒ la première adresse fait foi, y compris quand les canaux
  // arrivent APRÈS le premier rendu (ils viennent du snapshot de la fiche).
  const [chosenEmail, setChosenEmail] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['crm-actor-portal-access', actorId],
    queryFn: () => getPortalAccessStatus(actorId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['crm-actor-portal-access', actorId] });
  }
  /**
   * `doneLabel` décrit ce qui A ÉTÉ FAIT — il ne sert qu'au cas où la trace CRM manque. Le
   * geste a réussi : ce n'est donc pas une alerte, mais l'agent doit savoir que l'historique
   * de l'acteur ne portera pas ce qu'il vient de faire.
   */
  function onSettled(doneLabel: string) {
    return {
      onSuccess: (result: PortalActionResult) => {
        setActionError(null);
        setNotice(result.traced ? null : `${doneLabel}, mais l’action n’a pas pu être journalisée dans le CRM.`);
        setConfirming(null);
        refresh();
      },
      onError: (error: unknown) => {
        setConfirming(null);
        setNotice(null);
        setActionError(messageOf(error));
      },
    };
  }

  const account = statusQuery.data?.account ?? null;
  const linkedToOtherAccount = statusQuery.data?.linkedToOtherAccount === true;
  const inviteEmail = chosenEmail ?? emailChannels[0] ?? '';

  const invite = useMutation({
    mutationFn: () => invitePortalAccess(actorId, inviteEmail),
    ...onSettled('L’accès a été ouvert'),
  });
  const resend = useMutation({
    mutationFn: () => resendPortalAccess(actorId, account?.email ?? inviteEmail),
    ...onSettled('L’invitation a été renvoyée'),
  });
  const revoke = useMutation({
    mutationFn: () => revokePortalAccess(actorId),
    ...onSettled('L’accès a été révoqué'),
  });

  // Une seule raison rendue à la fois, dans l'ordre où elle bloque réellement.
  const blockedReason = !canWrite
    ? CRM_READ_ONLY_REASON
    : linkedToOtherAccount
      ? ALREADY_LINKED_REASON
      : emailChannels.length === 0
        ? NO_EMAIL_REASON
        : null;

  return (
    <div className="rcard crm-portal-access" role="group" aria-label="Accès portail">
      <h4>
        <span className="crm-portal-access__title">
          <KeyRound size={13} aria-hidden /> Accès portail
        </span>
      </h4>

      {statusQuery.isLoading ? (
        <p className="crm-rail__empty">Chargement…</p>
      ) : statusQuery.isError ? (
        // Une panne de lecture ne doit PAS se lire « cet acteur n'a pas d'accès » : sans ce
        // bras, l'agent inviterait quelqu'un qui a déjà un compte.
        <div className="inline-alert" role="alert">
          {messageOf(statusQuery.error)}
        </div>
      ) : account ? (
        <>
          <p className="crm-portal-access__line">
            <span>{account.email ?? '—'}</span>
            <span className={'pill-mini' + (account.lastSignInAt ? ' principal' : '')}>
              {account.lastSignInAt ? 'Actif' : 'Invité'}
            </span>
          </p>
          <p className="crm-rail__empty">
            {account.lastSignInAt
              ? `Dernière connexion le ${formatShort(account.lastSignInAt)}`
              : `Invité le ${formatShort(account.invitedAt)} · jamais connecté`}
          </p>
          <div className="inline-actions crm-portal-access__actions">
            {!account.lastSignInAt && (
              <button
                type="button"
                className="crm-btn sm"
                disabled={!canWrite || resend.isPending}
                title={canWrite ? undefined : CRM_READ_ONLY_REASON}
                onClick={() => setConfirming('resend')}
              >
                {resend.isPending ? 'Envoi…' : 'Renvoyer l’invitation'}
              </button>
            )}
            <button
              type="button"
              className="crm-btn sm crm-btn--danger-ghost"
              disabled={!canWrite || revoke.isPending}
              title={canWrite ? undefined : CRM_READ_ONLY_REASON}
              onClick={() => setConfirming('revoke')}
            >
              Révoquer
            </button>
          </div>
          {/* Même règle que le bras « pas de compte » : la raison est À L'ÉCRAN, pas seulement
              en `title`. Un `title` ne se lit ni au doigt ni par toutes les aides techniques —
              l'énoncer en tête du fichier et ne l'appliquer qu'à moitié ne vaut rien. */}
          {!canWrite && <p className="crm-rail__note">{CRM_READ_ONLY_REASON}</p>}
        </>
      ) : (
        <>
          <p className="crm-rail__empty">Cet acteur n’a pas encore accès au portail.</p>
          {emailChannels.length > 1 && (
            <label className="crm-portal-access__pick">
              <span>Adresse à inviter</span>
              <select
                value={inviteEmail}
                disabled={!canWrite}
                onChange={(event) => setChosenEmail(event.target.value)}
              >
                {emailChannels.map((email) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="crm-btn sm crm-rail__add"
            disabled={Boolean(blockedReason) || invite.isPending}
            title={blockedReason ?? undefined}
            onClick={() => setConfirming('invite')}
          >
            {emailChannels.length === 1 ? `Inviter ${emailChannels[0]}` : 'Inviter'}
          </button>
          {/* La raison est à l'écran, pas seulement en infobulle : un `title` ne se lit ni au
              doigt, ni par toutes les aides techniques. */}
          {blockedReason && <p className="crm-rail__note">{blockedReason}</p>}
        </>
      )}

      {actionError && (
        <div className="inline-alert" role="alert">
          {actionError}
        </div>
      )}
      {/* `status` et non `alert` : le geste a RÉUSSI, seule la trace manque. Une alerte rouge
          ferait croire à un échec et pousserait l'agent à recommencer. */}
      {notice && (
        <p className="crm-rail__note" role="status">
          {notice}
        </p>
      )}

      <ConfirmDialog
        open={confirming === 'invite'}
        title="Ouvrir l’accès au portail"
        message={
          <>
            Un e-mail d’invitation part immédiatement à <strong>{inviteEmail}</strong>. La personne y
            choisit son mot de passe, puis peut consulter ses fiches et proposer des corrections à
            l’office. Vous pourrez révoquer cet accès à tout moment.
          </>
        }
        confirmLabel="Envoyer l’invitation"
        cancelLabel="Annuler"
        busy={invite.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => invite.mutate()}
      />
      {/* Renvoyer n'est pas anodin : un nouvel e-mail part, ET le lien précédent cesse de
          fonctionner. Même exigence de confirmation que l'invitation. */}
      <ConfirmDialog
        open={confirming === 'resend'}
        title="Renvoyer l’invitation"
        message={
          <>
            Une nouvelle invitation part à <strong>{account?.email ?? inviteEmail}</strong>. Le lien
            envoyé précédemment cessera de fonctionner.
          </>
        }
        confirmLabel="Renvoyer"
        cancelLabel="Annuler"
        busy={resend.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => resend.mutate()}
      />
      <ConfirmDialog
        open={confirming === 'revoke'}
        title="Révoquer l’accès portail"
        message="Le compte de connexion sera supprimé. L’acteur, ses fiches et l’historique de ses envois restent intacts, et vous pourrez l’inviter à nouveau plus tard."
        confirmLabel="Révoquer"
        cancelLabel="Annuler"
        tone="danger"
        busy={revoke.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => revoke.mutate()}
      />
    </div>
  );
}
