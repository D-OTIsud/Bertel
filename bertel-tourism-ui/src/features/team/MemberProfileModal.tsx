'use client';

// Identité d'un membre, éditée par un administrateur. Complément de ProfileEditModal (§171),
// qui reste la surface unique de SON PROPRE profil : cette modale ne s'ouvre jamais sur soi.
//
// Rappel de contrat : les contrôles désactivés ci-dessous sont un confort de lecture. La règle
// vit dans /api/admin/user-profile, qui la ré-évalue.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/common/Modal';
import { AvatarPicker } from '@/components/common/AvatarPicker';
import type { OrgMember } from '@/services/rbac';
import {
  getMemberProfile,
  updateMemberProfile,
  uploadMemberAvatar,
  sendMemberSignInLink,
  sendMemberMagicLink,
  type MemberProfile,
} from '@/services/team-profile';

const PLATFORM_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'tourism_agent', label: 'Agent (aucun rang plateforme)' },
  { value: 'super_admin', label: 'Super administrateur' },
  { value: 'owner', label: 'Propriétaire de la plateforme' },
];

export function MemberProfileModal({ member, canEditPlatformRole, onClose, onSaved }: {
  member: OrgMember | null;
  /** L'appelant est-il `owner` ? Seul un owner peut attribuer ou retirer un rang plateforme. */
  canEditPlatformRole: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loaded, setLoaded] = useState<MemberProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [platformRole, setPlatformRole] = useState('tourism_agent');
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Resynchronisation PENDANT LE RENDU sur l'IDENTITÉ de la ligne. Modal reste monté pendant son
  // animation de sortie : un état figé au montage écrirait les valeurs du membre précédent sur la
  // clé du suivant. Un useEffect ne suffirait pas — deux effets du même commit liraient tous deux
  // l'état d'avant, et le chargement repartirait sur l'ancien id.
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  if (member && member.userId !== syncedUserId) {
    setSyncedUserId(member.userId);
    setLoaded(null);
    setName(member.displayName ?? '');
    setEmail(member.email ?? '');
    setPlatformRole('tourism_agent');
    setAvatarUrl(null);
  }

  const userId = member?.userId ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getMemberProfile(userId)
      .then((p) => {
        if (cancelled) return;
        setLoaded(p);
        setName(p.displayName ?? '');
        setEmail(p.email ?? '');
        setPlatformRole(p.platformRole ?? 'tourism_agent');
        setAvatarUrl(p.avatarUrl);
      })
      .catch((e: Error) => { if (!cancelled) toast.error(e.message); });
    return () => { cancelled = true; };
  }, [userId]);

  const neverConnected = member?.lastSeenAt === null;
  const signInLabel = neverConnected ? 'Renvoyer l’invitation' : 'Réinitialiser le mot de passe';

  async function send(kind: 'signin' | 'magic') {
    if (!member?.email) { toast.error('Ce compte n’a pas d’adresse e-mail.'); return; }
    setBusy(true);
    try {
      if (kind === 'signin') await sendMemberSignInLink(member.email);
      else await sendMemberMagicLink(member.email);
      toast.success(`Lien envoyé à ${member.email}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!member) return;
    const trimmed = name.trim();
    if (trimmed === '') { toast.error('Le nom ne peut pas être vide.'); return; }
    const patch: Parameters<typeof updateMemberProfile>[0] = { userId: member.userId };
    if (trimmed !== (loaded?.displayName ?? '')) patch.displayName = trimmed;
    const nextEmail = email.trim().toLowerCase();
    if (nextEmail !== (loaded?.email ?? '').toLowerCase()) patch.email = nextEmail;
    if (canEditPlatformRole && platformRole !== (loaded?.platformRole ?? 'tourism_agent')) {
      patch.platformRole = platformRole;
    }
    if (Object.keys(patch).length === 1) { onClose(); return; }

    setBusy(true);
    try {
      await updateMemberProfile(patch);
      toast.success('Profil mis à jour.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAvatarSelected(file: File) {
    if (!member) return;
    setAvatarBusy(true);
    try {
      setAvatarUrl(await uploadMemberAvatar(member.userId, file));
      toast.success('Photo mise à jour.');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  // Comme ProfileEditModal (§149) : `name` peut valoir l'e-mail quand aucun vrai nom n'est
  // enregistré (repli côté serveur) — ne pas en tirer des initiales trompeuses.
  const trimmedName = name.trim();
  const hasRealName = trimmedName !== '' && trimmedName !== (member?.email ?? '').trim();
  const initials = hasRealName
    ? trimmedName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
    : '?';

  return (
    <Modal
      open={member !== null}
      title={`Profil de ${member?.displayName ?? member?.email ?? 'ce membre'}`}
      onOpenChange={(next) => { if (!next) onClose(); }}
      footer={
        <>
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className="primary-button" onClick={() => void save()}
            disabled={busy || name.trim() === '' || loaded === null}>
            {busy ? 'Enregistrement…' : loaded === null ? 'Chargement du profil…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <AvatarPicker
        avatarUrl={avatarUrl}
        alt={`Photo de ${member?.displayName ?? member?.email ?? 'ce membre'}`}
        initials={initials}
        disabled={avatarBusy}
        buttonContent={avatarBusy ? 'Envoi…' : avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
        onFileSelected={(file) => void onAvatarSelected(file)}
      />

      <div className="field-block">
        <label htmlFor="memberProfileName">Nom affiché</label>
        <input id="memberProfileName" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>

      <div className="field-block">
        <label htmlFor="memberProfileEmail">E-mail de connexion</label>
        <p className="pref__hint" id="memberProfileEmailWarning">
          Le changement est immédiat, sans courriel de confirmation. Cette adresse sert aussi à
          rattacher un utilisateur aux prestataires : la modifier peut changer les fiches dont ce
          membre est propriétaire.
        </p>
        <input id="memberProfileEmail" type="email" value={email} aria-describedby="memberProfileEmailWarning"
          onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </div>

      <div className="field-block">
        <label htmlFor="memberProfileRole">Rôle plateforme</label>
        {!canEditPlatformRole && (
          <p className="pref__hint" id="memberProfileRoleReason">
            Seul un owner peut attribuer ou retirer un rang plateforme.
          </p>
        )}
        <select id="memberProfileRole" className="select" value={platformRole}
          disabled={!canEditPlatformRole}
          aria-describedby={canEditPlatformRole ? undefined : 'memberProfileRoleReason'}
          onChange={(e) => setPlatformRole(e.target.value)}>
          {PLATFORM_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="field-block">
        <span>Accès au compte</span>
        <div className="inline-actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void send('signin')}>
            {signInLabel}
          </button>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void send('magic')}>
            Envoyer un lien de connexion
          </button>
        </div>
        <p className="pref__hint">
          Les deux liens atterrissent sur l’application. Un envoi trop rapproché est refusé par la
          limite de débit de Supabase — le message d’erreur le dit.
        </p>
      </div>
    </Modal>
  );
}
