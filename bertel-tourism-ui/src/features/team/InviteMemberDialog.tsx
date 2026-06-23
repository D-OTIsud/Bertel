'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/common/Modal';
import {
  inviteUser,
  upsertMembership,
  grantUserPermission,
  friendlyRbacError,
} from '@/services/rbac';
import { BUSINESS_ROLE_CODES, presetPermissionsFor } from '@/features/team/permission-presets';

interface InviteMemberDialogProps {
  orgId: string;
  onDone: () => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function InviteMemberDialog({ orgId, onDone }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState('contributor');
  const [busy, setBusy] = useState(false);
  // null = form view; non-null = password-reveal view (shown once after successful new invite)
  const [temp, setTemp] = useState<string | null>(null);

  function resetState() {
    setTemp(null);
    setEmail('');
    setRoleCode('contributor');
  }

  function handleClose() {
    // If closing while temp is shown, reset form so it's clean on next open.
    if (temp !== null) resetState();
    setOpen(false);
  }

  async function submit() {
    setBusy(true);
    try {
      const invited = await inviteUser({ email: email.trim().toLowerCase(), orgObjectId: orgId, businessRoleCode: roleCode });
      await upsertMembership(invited.userId, orgId, roleCode);
      for (const code of presetPermissionsFor(roleCode)) {
        try { await grantUserPermission(invited.userId, code); } catch (e) { console.warn('preset grant failed', code, e); }
      }
      if (invited.alreadyExisted) {
        toast.success('Utilisateur déjà existant — rattaché à l’organisation.');
        setTemp(null);
        setOpen(false);
      } else {
        setTemp(invited.tempPassword);
        toast.success('Invitation créée.');
      }
      onDone();
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    } finally {
      setBusy(false);
    }
  }

  const footer = temp === null ? (
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
          {temp === null ? (
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
                    <option key={code} value={code}>{capitalize(code)}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <p className="muted">
                Communiquez ce mot de passe temporaire au nouveau membre ; il pourra le changer après connexion.
              </p>
              <div className="invite-temp-row">
                <code className="invite-temp-code">{temp}</code>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    navigator.clipboard.writeText(temp ?? '').then(() => {
                      toast.success('Copié');
                    }).catch(() => {
                      toast.error('Échec de la copie.');
                    });
                  }}
                >
                  Copier
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
