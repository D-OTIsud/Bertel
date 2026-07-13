'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Clock, XCircle, UserCheck } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  inviteUser,
  upsertMembership,
  grantUserPermission,
  friendlyRbacError,
} from '@/services/rbac';
import { BUSINESS_ROLE_CODES, businessRoleLabel, presetPermissionsFor } from '@/features/team/permission-presets';
import { parseInviteEmails } from '@/features/team/parse-invite-emails';

interface InviteMemberDialogProps {
  orgId: string;
  onDone: () => void;
}

// Statut par adresse après une passe d'invitation.
type InviteStatus = 'sent' | 'attached' | 'pending' | 'error';
interface InviteRow { email: string; status: InviteStatus; detail?: string }

const STATUS_META: Record<InviteStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  sent: { icon: CheckCircle2, className: 'invite-row--sent', label: 'Invitation envoyée' },
  attached: { icon: UserCheck, className: 'invite-row--attached', label: 'Déjà membre — rattaché' },
  pending: { icon: Clock, className: 'invite-row--pending', label: 'Déjà invité, jamais connecté' },
  error: { icon: XCircle, className: 'invite-row--error', label: 'Échec' },
};

export function InviteMemberDialog({ orgId, onDone }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState('');
  const [roleCode, setRoleCode] = useState('contributor');
  const [busy, setBusy] = useState(false);
  // null = form view ; non-null = récap de la dernière passe (par adresse).
  const [results, setResults] = useState<InviteRow[] | null>(null);

  function resetState() {
    setResults(null);
    setEmails('');
    setRoleCode('contributor');
  }

  function handleClose() {
    if (results !== null) resetState();
    setOpen(false);
  }

  // Rattache membership + permissions du préréglage au userId (nouveau ou existant).
  async function attach(userId: string) {
    await upsertMembership(userId, orgId, roleCode);
    for (const code of presetPermissionsFor(roleCode)) {
      try { await grantUserPermission(userId, code); } catch (e) { console.warn('preset grant failed', code, e); }
    }
  }

  // Invite (ou ré-invite) une seule adresse et renvoie sa ligne de récap.
  async function inviteOne(email: string, resend: boolean): Promise<InviteRow> {
    try {
      const invited = await inviteUser({ email, orgObjectId: orgId, businessRoleCode: roleCode, resend });
      await attach(invited.userId);
      if (!invited.alreadyExisted) return { email, status: 'sent' };
      if (resend) return { email, status: 'sent' };
      return invited.neverSignedIn ? { email, status: 'pending' } : { email, status: 'attached' };
    } catch (e) {
      return { email, status: 'error', detail: friendlyRbacError(e as { message?: string }) };
    }
  }

  async function submit() {
    const { valid, invalid } = parseInviteEmails(emails);
    if (valid.length === 0) {
      toast.error('Saisissez au moins une adresse e-mail valide.');
      return;
    }
    setBusy(true);
    try {
      const rows: InviteRow[] = [];
      for (const email of valid) {
        rows.push(await inviteOne(email, false));
      }
      for (const bad of invalid) {
        rows.push({ email: bad, status: 'error', detail: 'Adresse invalide.' });
      }
      setResults(rows);
      const sent = rows.filter((r) => r.status === 'sent').length;
      if (sent > 0) toast.success(sent > 1 ? `${sent} invitations envoyées.` : 'Invitation envoyée.');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  // Renvoie l'invitation à toutes les adresses « en attente » (compte jamais connecté).
  async function resendPending() {
    if (!results) return;
    const pending = results.filter((r) => r.status === 'pending').map((r) => r.email);
    if (pending.length === 0) return;
    setBusy(true);
    try {
      const resent = new Map<string, InviteRow>();
      for (const email of pending) {
        resent.set(email, await inviteOne(email, true));
      }
      setResults((prev) => (prev ? prev.map((r) => resent.get(r.email) ?? r) : prev));
      const ok = [...resent.values()].filter((r) => r.status === 'sent').length;
      if (ok > 0) toast.success(ok > 1 ? `${ok} invitations renvoyées.` : 'Invitation renvoyée.');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = results?.filter((r) => r.status === 'pending').length ?? 0;

  const footer = results !== null ? (
    <>
      <button type="button" className="ghost-button" onClick={handleClose} disabled={busy}>
        Fermer
      </button>
      {pendingCount > 0 && (
        <button type="button" className="primary-button" onClick={() => { void resendPending(); }} disabled={busy}>
          {busy ? 'Envoi…' : `Renvoyer ${pendingCount > 1 ? `les ${pendingCount} invitations` : 'l’invitation'}`}
        </button>
      )}
    </>
  ) : (
    <>
      <button type="button" className="ghost-button" onClick={() => setOpen(false)} disabled={busy}>
        Annuler
      </button>
      <button type="button" className="primary-button" onClick={() => { void submit(); }} disabled={busy || emails.trim() === ''}>
        {busy ? 'En cours…' : 'Inviter'}
      </button>
    </>
  );

  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        Inviter
      </button>

      <Modal
        title="Inviter des membres"
        open={open}
        onOpenChange={(next) => { if (!next) handleClose(); }}
        footer={footer}
      >
        {results !== null ? (
          <ul className="invite-results">
            {results.map((row) => {
              const meta = STATUS_META[row.status];
              const Icon = meta.icon;
              return (
                <li key={row.email} className={`invite-row ${meta.className}`}>
                  <Icon size={15} aria-hidden />
                  <span className="invite-row__email">{row.email}</span>
                  <span className="invite-row__label">{row.detail ?? meta.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <label className="field-block" htmlFor="invite-emails">
              <span>Adresses e-mail</span>
              <textarea
                id="invite-emails"
                className="textarea"
                rows={4}
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder={'prenom.nom@example.com\nautre.membre@example.com'}
                disabled={busy}
              />
              <span className="pref__hint">Une adresse par ligne (ou séparées par une virgule). Le même rôle est appliqué à toutes.</span>
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
        )}
      </Modal>
    </>
  );
}
