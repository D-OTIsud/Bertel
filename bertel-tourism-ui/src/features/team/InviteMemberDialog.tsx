'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  inviteUser,
  upsertMembership,
  grantUserPermission,
  friendlyRbacError,
} from '@/services/rbac';
import { BUSINESS_ROLE_CODES, businessRoleLabel, presetPermissionsFor } from '@/features/team/permission-presets';

interface InviteMemberDialogProps {
  orgId: string;
  onDone: () => void;
}

export function InviteMemberDialog({ orgId, onDone }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState('contributor');
  const [busy, setBusy] = useState(false);
  // null = form view; non-null = confirmation view (email the invitation was sent to)
  const [sentTo, setSentTo] = useState<string | null>(null);

  function resetState() {
    setSentTo(null);
    setEmail('');
    setRoleCode('contributor');
  }

  function handleClose() {
    // If closing while the confirmation is shown, reset form so it's clean on next open.
    if (sentTo !== null) resetState();
    setOpen(false);
  }

  async function submit() {
    setBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const invited = await inviteUser({ email: cleanEmail, orgObjectId: orgId, businessRoleCode: roleCode });
      await upsertMembership(invited.userId, orgId, roleCode);
      for (const code of presetPermissionsFor(roleCode)) {
        try { await grantUserPermission(invited.userId, code); } catch (e) { console.warn('preset grant failed', code, e); }
      }
      if (invited.alreadyExisted) {
        toast.success('Utilisateur déjà existant — rattaché à l’organisation.');
        setSentTo(null);
        setOpen(false);
      } else {
        setSentTo(cleanEmail);
        toast.success('Invitation envoyée.');
      }
      onDone();
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    } finally {
      setBusy(false);
    }
  }

  const footer = sentTo === null ? (
    <>
      <button type="button" className="ghost-button" onClick={() => setOpen(false)} disabled={busy}>
        Annuler
      </button>
      <button type="button" className="primary-button" onClick={() => { void submit(); }} disabled={busy || email.trim() === ''}>
        {busy ? 'En cours…' : 'Inviter'}
      </button>
    </>
  ) : (
    <button type="button" className="primary-button" onClick={handleClose}>
      Fermer
    </button>
  );

  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        Inviter
      </button>

      {open && (
        <Modal title="Inviter un membre" onClose={handleClose} footer={footer}>
          {sentTo === null ? (
            <>
              <label className="field-block" htmlFor="invite-email">
                <span>Adresse e-mail</span>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@example.com"
                  disabled={busy}
                />
              </label>

              <label className="field-block" htmlFor="invite-role">
                <span>Rôle métier</span>
                <select
                  id="invite-role"
                  className="select"
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value)}
                  disabled={busy}
                >
                  {BUSINESS_ROLE_CODES.map((code) => (
                    <option key={code} value={code}>{businessRoleLabel(code)}</option>
                  ))}
                </select>
                <span className="pref__hint">Le préréglage de permissions du rôle est appliqué automatiquement (additif).</span>
              </label>
            </>
          ) : (
            <>
              <p className="invite-success-line"><CheckCircle2 size={16} aria-hidden /> Invitation envoyée.</p>
              <p className="muted">
                Un e-mail d’invitation a été envoyé à <strong>{sentTo}</strong>. Le nouveau membre
                cliquera sur le lien reçu pour choisir son mot de passe et accéder à la plateforme.
              </p>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
