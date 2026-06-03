'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
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

  return (
    <Dialog open={open} onOpenChange={(next) => {
      // If closing while temp is shown, reset form so it's clean on next open
      if (!next && temp !== null) resetState();
      setOpen(next);
    }}>
      <DialogTrigger asChild>
        <Button size="sm">Inviter</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un membre</DialogTitle>
        </DialogHeader>

        {temp === null ? (
          /* ── Form view ── */
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label htmlFor="invite-email" className="text-sm font-medium">
                  Adresse e-mail
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@example.com"
                  className="flex h-10 w-full rounded-xl border border-input bg-background/80 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  disabled={busy}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="invite-role" className="text-sm font-medium">
                  Rôle métier
                </label>
                <Select
                  id="invite-role"
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value)}
                  disabled={busy}
                >
                  {BUSINESS_ROLE_CODES.map((code) => (
                    <option key={code} value={code}>{capitalize(code)}</option>
                  ))}
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                type="button"
                onClick={() => { void submit(); }}
                disabled={busy || email.trim() === ''}
              >
                {busy ? 'En cours…' : 'Inviter'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Password-reveal view (shown once) ── */
          <>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Communiquez ce mot de passe temporaire au nouveau membre ; il pourra le changer après connexion.
              </p>

              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-input bg-muted px-3 py-2 font-mono text-sm break-all">
                  {temp}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(temp!).then(() => {
                      toast.success('Copié');
                    }).catch(() => {
                      toast.error('Échec de la copie.');
                    });
                  }}
                >
                  Copier
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  resetState();
                  setOpen(false);
                }}
              >
                Fermer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
