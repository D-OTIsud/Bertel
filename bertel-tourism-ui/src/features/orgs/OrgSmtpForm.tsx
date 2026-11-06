'use client';
// Relais SMTP d'une ORG (18g) : chaque organisation expédie ses e-mails MÉTIER — envoi d'une
// liste, notifications CRM et portail acteur — par son propre fournisseur.
//
// Le mot de passe est en ÉCRITURE SEULE, comme la clé des fournisseurs IA : posé une fois, il
// n'est jamais relu ; le champ vide CONSERVE celui en place (on peut donc changer d'hôte sans
// ressaisir le secret), et « Retirer le mot de passe » l'efface, secret Vault compris.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getSupabaseClient } from '@/lib/supabase';
import {
  getOrgSmtp,
  saveOrgSmtp,
  deleteOrgSmtp,
  testOrgSmtp,
  secureForPort,
  SMTP_PORTS,
  type OrgSmtpSnapshot,
} from '@/services/org-smtp';

const PORT_LABELS: Record<number, string> = {
  587: '587 — STARTTLS (recommandé)',
  465: '465 — TLS implicite',
  25: '25 — relais direct',
  2525: '2525 — repli si 25 est filtré',
};

interface FormState {
  host: string;
  port: number;
  fromEmail: string;
  fromName: string;
  username: string;
  password: string;
  isEnabled: boolean;
}

const EMPTY: FormState = { host: '', port: 587, fromEmail: '', fromName: '', username: '', password: '', isEnabled: false };

function fromSnapshot(snap: OrgSmtpSnapshot): FormState {
  return {
    host: snap.host ?? '',
    port: snap.port ?? 587,
    fromEmail: snap.fromEmail ?? '',
    fromName: snap.fromName ?? '',
    username: snap.username ?? '',
    password: '', // jamais relu
    isEnabled: snap.isEnabled,
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Erreur inattendue.';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR');
}

export function OrgSmtpForm({ orgId }: { orgId: string }) {
  const [snap, setSnap] = useState<OrgSmtpSnapshot | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmClearPassword, setConfirmClearPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await getOrgSmtp(orgId);
      setSnap(next);
      setForm(fromSnapshot(next));
      setError(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function persist(opts: { clearPassword?: boolean } = {}) {
    if (!form.host.trim() || !form.fromEmail.trim()) {
      toast.error('L’hôte et l’adresse d’expédition sont requis.');
      return;
    }
    setBusy(true);
    try {
      const next = await saveOrgSmtp(orgId, {
        host: form.host,
        port: form.port,
        // Dérivé du port, jamais saisi : la base impose (port = 465) = secure, et laisser les
        // deux se contredire produit un échec de handshake qu'on lit comme « le fournisseur
        // ne marche pas ».
        secure: secureForPort(form.port),
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        username: form.username,
        password: opts.clearPassword ? null : form.password,
        isEnabled: form.isEnabled,
        clearPassword: opts.clearPassword === true,
      });
      setSnap(next);
      setForm(fromSnapshot(next));
      toast.success(opts.clearPassword ? 'Mot de passe retiré.' : 'Relais enregistré.');
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
      setConfirmClearPassword(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await deleteOrgSmtp(orgId);
      setConfirmDelete(false);
      await reload();
      toast.success('Relais supprimé.');
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTesting(true);
    try {
      const client = getSupabaseClient();
      const token = client ? (await client.auth.getSession()).data.session?.access_token : null;
      if (!token) {
        toast.error('Session indisponible.');
        return;
      }
      const result = await testOrgSmtp(orgId, token);
      if (result.ok) toast.success(result.detail);
      else toast.error(result.detail);
      await reload();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setTesting(false);
    }
  }

  if (error) return <div className="inline-alert inline-alert--danger" role="alert">{error}</div>;
  if (loading) return <p className="muted">Chargement…</p>;

  const hasPassword = snap?.hasPassword === true;
  const sendingOff = !snap?.isEnabled;
  const unsaved = !!snap && JSON.stringify(form) !== JSON.stringify(fromSnapshot(snap));

  return (
    <div className="field-block">
      {sendingOff && (
        <div className="inline-alert inline-alert--warning" role="status">
          Les invitations à vos partenaires <strong>ne partent pas</strong> tant que ce relais n’est pas activé.
        </div>
      )}

      <label className="field-block" htmlFor="orgsmtp-host">
        <span>Serveur SMTP</span>
        <input
          id="orgsmtp-host"
          value={form.host}
          onChange={(e) => setField('host', e.target.value)}
          placeholder="smtp.exemple.fr"
          autoComplete="off"
          disabled={busy}
        />
        <span className="muted">Nom d’hôte seul — ni « smtp:// », ni « :587 ».</span>
      </label>

      <label className="field-block" htmlFor="orgsmtp-port">
        <span>Port</span>
        <select
          id="orgsmtp-port"
          value={form.port}
          onChange={(e) => setField('port', Number(e.target.value))}
          disabled={busy}
        >
          {SMTP_PORTS.map((p) => (
            <option key={p} value={p}>{PORT_LABELS[p]}</option>
          ))}
        </select>
        <span className="muted">
          Le chiffrement suit le port : TLS implicite sur 465, STARTTLS sinon. Tous les envois
          sont chiffrés.
        </span>
      </label>

      <label className="field-block" htmlFor="orgsmtp-from-email">
        <span>Adresse d’expédition</span>
        <input
          id="orgsmtp-from-email"
          type="email"
          value={form.fromEmail}
          onChange={(e) => setField('fromEmail', e.target.value)}
          placeholder="ne-pas-repondre@exemple.fr"
          autoComplete="off"
          disabled={busy}
        />
        <span className="muted">
          Utilisez un domaine que votre fournisseur est autorisé à signer : une adresse d’un
          domaine tiers sera rejetée par les destinataires (SPF/DMARC).
        </span>
      </label>

      <label className="field-block" htmlFor="orgsmtp-from-name">
        <span>Nom d’expéditeur</span>
        <input
          id="orgsmtp-from-name"
          value={form.fromName}
          onChange={(e) => setField('fromName', e.target.value)}
          placeholder={snap?.fromNameFallback ?? ''}
          autoComplete="off"
          disabled={busy}
        />
        <span className="muted">Vide = le nom de marque de votre organisation.</span>
      </label>

      <label className="field-block" htmlFor="orgsmtp-username">
        <span>Identifiant</span>
        <input
          id="orgsmtp-username"
          value={form.username}
          onChange={(e) => setField('username', e.target.value)}
          autoComplete="off"
          disabled={busy}
        />
        <span className="muted">
          À laisser vide si votre relais autorise l’envoi par l’adresse IP du serveur.
        </span>
      </label>

      <label className="field-block" htmlFor="orgsmtp-password">
        <span>
          Mot de passe {hasPassword && <span className="muted">(configuré ✓ — laisser vide pour conserver)</span>}
        </span>
        <input
          id="orgsmtp-password"
          type="password"
          value={form.password}
          onChange={(e) => setField('password', e.target.value)}
          placeholder={hasPassword ? '•••• conservé' : ''}
          autoComplete="new-password"
          disabled={busy}
        />
        {hasPassword && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => setConfirmClearPassword(true)}
            disabled={busy}
          >
            Retirer le mot de passe
          </button>
        )}
      </label>

      <label className="field-block">
        <span className="inline-actions">
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => setField('isEnabled', e.target.checked)}
            disabled={busy}
          />
          Activer l’envoi par ce relais
        </span>
        <span className="muted">
          Activez puis enregistrez pour tester la connexion. Le test n’envoie aucun e-mail.
        </span>
      </label>

      {snap?.lastTestAt && (
        <p className={snap.lastTestOk ? 'muted' : 'inline-alert inline-alert--danger'} role="status">
          Dernier test {formatDate(snap.lastTestAt)} —{' '}
          {snap.lastTestOk ? 'connexion établie.' : `échec : ${snap.lastTestError ?? 'raison inconnue'}`}
        </p>
      )}

      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={() => { void persist(); }} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => { void runTest(); }}
          disabled={testing || busy || unsaved || !snap?.configured || !snap.isEnabled}
        >
          {testing ? 'Test…' : 'Tester la connexion'}
        </button>
        {snap?.configured && (
          <button type="button" className="ghost-button" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Supprimer le relais
          </button>
        )}
      </div>
      {unsaved ? <p className="muted">Enregistrez vos modifications avant de tester la connexion.</p> : null}

      <ConfirmDialog
        open={confirmClearPassword}
        title="Retirer le mot de passe ?"
        message="Le mot de passe enregistré sera effacé. Si votre relais exige une authentification, les envois de votre organisation échoueront jusqu’à ce qu’un nouveau soit saisi."
        confirmLabel="Retirer"
        tone="danger"
        busy={busy}
        onConfirm={() => { void persist({ clearPassword: true }); }}
        onCancel={() => setConfirmClearPassword(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce relais ?"
        message="La configuration et le mot de passe seront supprimés. Les invitations aux partenaires ne pourront plus être envoyées par cet office."
        confirmLabel="Supprimer définitivement"
        tone="danger"
        busy={busy}
        onConfirm={() => { void doDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
