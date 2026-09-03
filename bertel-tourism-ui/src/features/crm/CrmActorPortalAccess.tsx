'use client';

// Carte « Accès portail » de la fiche prestataire (18a/D1). Rail droit de CrmActorFiche,
// juste sous la carte acteur — TOUJOURS visible, hors de la région repliable : c'est par ici
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
//  - inviter envoie un e-mail à une vraie personne : le geste passe par une confirmation qui
//    NOMME l'adresse. La révocation aussi — elle supprime un compte.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import {
  getPortalAccessStatus,
  invitePortalAccess,
  resendPortalAccess,
  revokePortalAccess,
} from '../../services/actor-access';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { CRM_READ_ONLY_REASON, formatShort } from './crm-view-utils';

const NO_EMAIL_REASON = 'Ajoutez d’abord une adresse e-mail à cet acteur.';
const ALREADY_LINKED_REASON =
  'Cet acteur est déjà rattaché à un compte interne — un administrateur doit défaire ce lien avant d’ouvrir un accès.';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

export function CrmActorPortalAccess({
  actorId,
  canWrite,
  emailChannels,
}: {
  actorId: string;
  canWrite: boolean;
  /** Adresses `email` des coordonnées de l'acteur, principale d'abord (fournies par la fiche). */
  emailChannels: string[];
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'invite' | 'revoke' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
  function onSettled(close: boolean) {
    return {
      onSuccess: () => {
        setActionError(null);
        if (close) setConfirming(null);
        refresh();
      },
      onError: (error: unknown) => {
        if (close) setConfirming(null);
        setActionError(messageOf(error));
      },
    };
  }

  const account = statusQuery.data?.account ?? null;
  const linkedToOtherAccount = statusQuery.data?.linkedToOtherAccount === true;
  const inviteEmail = chosenEmail ?? emailChannels[0] ?? '';

  const invite = useMutation({ mutationFn: () => invitePortalAccess(actorId, inviteEmail), ...onSettled(true) });
  const resend = useMutation({
    mutationFn: () => resendPortalAccess(actorId, account?.email ?? inviteEmail),
    ...onSettled(false),
  });
  const revoke = useMutation({ mutationFn: () => revokePortalAccess(actorId), ...onSettled(true) });

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
                onClick={() => resend.mutate()}
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
