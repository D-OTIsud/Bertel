'use client';
// Création d'ORG (superadmin) en 2 étapes : ① identité + périmètre → rpc_create_org ;
// ② invitation optionnelle du premier admin (chaîne existante invite → membership → rôle
// admin org_admin + préréglage de permissions — RPCs déjà superuser-armées).
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/common/Modal';
import { createOrg, friendlyOrgError } from '@/services/orgs';
import { inviteUser, upsertMembership, setAdminRole, grantUserPermission, friendlyRbacError } from '@/services/rbac';
import { BUSINESS_ROLE_CODES, businessRoleLabel, presetPermissionsFor } from '@/features/team/permission-presets';

// Rôle admin remis au premier membre (rang 30 — vérifié en base : ref_org_admin_role).
const FIRST_ADMIN_ROLE_CODE = 'org_admin';

export function CreateOrgDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'infos' | 'admin'>('infos');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'own_objects_only' | 'all_published'>('own_objects_only');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState('contributor');

  function reset() { setStep('infos'); setName(''); setScope('own_objects_only'); setOrgId(null); setEmail(''); setRoleCode('contributor'); }
  function close() { reset(); setOpen(false); }

  async function submitInfos() {
    setBusy(true);
    try {
      const id = await createOrg({ name: name.trim(), regionCode: 'RUN', accessScope: scope });
      setOrgId(id); setStep('admin');
      toast.success(`Organisation « ${name.trim()} » créée.`);
      onDone();
    } catch (e) { toast.error(friendlyOrgError(e as { message?: string })); }
    finally { setBusy(false); }
  }

  async function submitAdmin() {
    if (!orgId) return;
    setBusy(true);
    try {
      const invited = await inviteUser({ email: email.trim(), orgObjectId: orgId, businessRoleCode: roleCode });
      const membershipId = await upsertMembership(invited.userId, orgId, roleCode);
      for (const code of presetPermissionsFor(roleCode)) {
        try { await grantUserPermission(invited.userId, code); } catch (e) { console.warn('preset grant failed', code, e); }
      }
      await setAdminRole(membershipId, FIRST_ADMIN_ROLE_CODE);
      toast.success(`Invitation envoyée à ${email.trim()} — premier admin de l’organisation.`);
      onDone(); close();
    } catch (e) { toast.error(friendlyRbacError(e as { message?: string })); }
    finally { setBusy(false); }
  }

  const footer = step === 'infos' ? (
    <>
      <button type="button" className="ghost-button" onClick={close} disabled={busy}>Annuler</button>
      <button type="button" className="primary-button" onClick={() => { void submitInfos(); }} disabled={busy || name.trim() === ''}>
        {busy ? 'Création…' : 'Créer l’organisation'}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="ghost-button" onClick={() => { onDone(); close(); }} disabled={busy}>Inviter plus tard</button>
      <button type="button" className="primary-button" onClick={() => { void submitAdmin(); }} disabled={busy || email.trim() === ''}>
        {busy ? 'Envoi…' : 'Inviter comme premier admin'}
      </button>
    </>
  );

  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>Nouvelle organisation</button>
      <Modal
        title={step === 'infos' ? 'Nouvelle organisation' : 'Premier administrateur'}
        open={open}
        onOpenChange={(next) => { if (!next) close(); }}
        footer={footer}
      >
        {step === 'infos' ? (
          <>
            <label className="field-block" htmlFor="org-name">
              <span>Nom de l’organisation</span>
              <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="OTI de l’Ouest" disabled={busy} />
            </label>
            <label className="field-block" htmlFor="org-scope">
              <span>Périmètre d’accès aux fiches</span>
              <select id="org-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} disabled={busy}>
                <option value="own_objects_only">Ses fiches uniquement</option>
                <option value="all_published">Tout le publié</option>
              </select>
              <span className="muted">Région : RUN (La Réunion) — immuable une fois posée.</span>
            </label>
          </>
        ) : (
          <>
            <p className="muted">L’organisation est créée. Invitez son premier administrateur : il recevra un e-mail et choisira son mot de passe, puis pourra gérer son équipe en autonomie.</p>
            <label className="field-block" htmlFor="org-admin-email">
              <span>Adresse e-mail</span>
              <input id="org-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="direction@oti-ouest.re" disabled={busy} />
            </label>
            <label className="field-block" htmlFor="org-admin-role">
              <span>Rôle métier</span>
              <select id="org-admin-role" className="select" value={roleCode} onChange={(e) => setRoleCode(e.target.value)} disabled={busy}>
                {BUSINESS_ROLE_CODES.map((code) => <option key={code} value={code}>{businessRoleLabel(code)}</option>)}
              </select>
              <span className="muted">Le rôle d’administration « org_admin » (gestion d’équipe) est ajouté automatiquement.</span>
            </label>
          </>
        )}
      </Modal>
    </>
  );
}
