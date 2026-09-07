'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, PlugZap, Save, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import { useSessionStore } from '../../store/session-store';
import {
  getSmtpSettings,
  saveSmtpSettings,
  testSmtpConnection,
  type SmtpSettings as SavedSmtpSettings,
  type SmtpSettingsInput,
} from '../../services/smtp-settings';
import './settings-panels.css';

const EMPTY: SmtpSettingsInput = {
  enabled: true, host: '', port: 587, secure: false, fromEmail: '',
  fromName: 'Bertel', authMode: 'relay', user: '', password: '',
};

function toForm(settings: SavedSmtpSettings): SmtpSettingsInput {
  return {
    enabled: settings.enabled, host: settings.host, port: settings.port,
    secure: settings.secure, fromEmail: settings.fromEmail, fromName: settings.fromName,
    authMode: settings.authMode, user: settings.user, password: '',
  };
}

async function accessToken() {
  const client = getSupabaseClient();
  const session = client ? await client.auth.getSession() : null;
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Reconnectez-vous pour gérer les e-mails de la plateforme.');
  return token;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Impossible de terminer cette opération.';
}

export function SmtpSettings() {
  const demoMode = useSessionStore((state) => state.demoMode);
  const [settings, setSettings] = useState<SavedSmtpSettings | null>(null);
  const [form, setForm] = useState<SmtpSettingsInput>({ ...EMPTY });
  const [loading, setLoading] = useState(!demoMode);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; detail: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (demoMode) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    void accessToken().then(getSmtpSettings).then((value) => {
      if (cancelled) return;
      setSettings(value);
      setForm(toForm(value));
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(errorText(error));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [demoMode, reload]);

  const dirty = settings ? JSON.stringify(form) !== JSON.stringify(toForm(settings)) : false;
  const disabled = demoMode || loading || !!loadError || !settings?.editable || !!busy;
  const canKeepPassword = settings?.source === 'database' && settings.hasPassword
    && form.host.trim() === settings.host && form.user.trim() === settings.user;
  const status = settings?.configured ? 'Configuré' : settings?.source === 'database' && !settings.enabled ? 'Envois suspendus' : 'À configurer';

  function update<K extends keyof SmtpSettingsInput>(key: K, value: SmtpSettingsInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (disabled) return;
    setBusy('save');
    setFeedback(null);
    try {
      const value = await saveSmtpSettings(await accessToken(), {
        ...form,
        user: form.authMode === 'password' ? form.user : '',
        password: form.authMode === 'password' && form.password ? form.password : undefined,
      });
      setSettings(value);
      setForm(toForm(value));
      setFeedback({ ok: true, detail: 'Configuration enregistrée. Elle sera utilisée pour les prochains envois.' });
    } catch (error) {
      setFeedback({ ok: false, detail: errorText(error) });
    } finally { setBusy(null); }
  }

  async function test() {
    if (dirty || !settings?.configured || busy || demoMode) return;
    setBusy('test');
    setFeedback(null);
    try { setFeedback(await testSmtpConnection(await accessToken())); }
    catch (error) { setFeedback({ ok: false, detail: errorText(error) }); }
    finally { setBusy(null); }
  }

  return (
    <section className="settings-pane settings-admin" aria-labelledby="smtp-title">
      <header className="settings-pane__head settings-admin__header">
        <div className="settings-admin__title-group">
          <span className="settings-admin__icon"><Mail size={22} aria-hidden="true" /></span>
          <div>
            <h2 id="smtp-title">E-mails &amp; SMTP</h2>
            <p>Configurez l’envoi des listes et des notifications de Bertel.</p>
          </div>
        </div>
        {!loading && !loadError && !demoMode && <span className={`badge ${settings?.configured ? 'badge--ok' : 'badge--neutral'}`}>{status}</span>}
      </header>

      {demoMode && <div className="settings-admin__note" role="status">Aperçu en mode démonstration. Connectez-vous avec un compte super-administrateur pour configurer les envois.</div>}
      {loading && <p className="settings-admin__hint" role="status">Chargement de la configuration SMTP…</p>}
      {loadError && <div className="settings-admin__note settings-admin__note--danger" role="alert"><p>{loadError}</p><button type="button" className="ghost-button" onClick={() => setReload((value) => value + 1)}>Réessayer</button></div>}
      {settings && !settings.editable && <div className="settings-admin__note" role="status">L’administration SMTP doit être activée sur le serveur avant de pouvoir enregistrer ces réglages. La configuration actuelle reste utilisée.</div>}

      <form className="settings-admin__body" onSubmit={(event) => void save(event)} aria-busy={loading || !!busy}>
        <fieldset className="settings-admin__section smtp-settings__fieldset" disabled={disabled}>
          <legend>Expéditeur des listes et adresse par défaut</legend>
          <p className="settings-admin__hint">Les listes sont envoyées avec ce nom et cette adresse. Les notifications d’affectation de tâche utilisent le nom et l’adresse du créateur de la tâche.</p>
          <p className="settings-admin__hint">Si le créateur est inconnu ou n’a plus d’adresse e-mail, l’adresse par défaut est utilisée.</p>
          <div className="settings-admin__form-grid">
            <label className="settings-admin__field"><span>Nom de l’expéditeur</span><input className="input" required value={form.fromName} autoComplete="organization" maxLength={150} onChange={(event) => update('fromName', event.target.value)} placeholder="Office de tourisme" /></label>
            <label className="settings-admin__field"><span>Adresse e-mail de l’expéditeur</span><input className="input" type="email" required value={form.fromEmail} autoComplete="email" onChange={(event) => update('fromEmail', event.target.value)} placeholder="contact@votre-domaine.fr" /><small>Utilisez une adresse autorisée par votre fournisseur SMTP.</small></label>
          </div>
        </fieldset>

        <fieldset className="settings-admin__section smtp-settings__fieldset" disabled={disabled}>
          <legend>Connexion au serveur SMTP</legend>
          <div className="settings-admin__form-grid">
            <label className="settings-admin__field settings-admin__field--wide"><span>Serveur SMTP</span><input className="input" required value={form.host} autoComplete="off" spellCheck={false} onChange={(event) => update('host', event.target.value)} placeholder="smtp-relay.gmail.com" /></label>
            <label className="settings-admin__field"><span>Sécurité de la connexion</span><select className="input" value={form.secure ? 'tls' : 'starttls'} onChange={(event) => { const secure = event.target.value === 'tls'; setForm((current) => ({ ...current, secure, port: current.port === 587 || current.port === 465 ? secure ? 465 : 587 : current.port })); setFeedback(null); }}><option value="starttls">STARTTLS — généralement port 587</option><option value="tls">TLS — généralement port 465</option></select><small>La connexion est toujours chiffrée.</small></label>
            <label className="settings-admin__field"><span>Port SMTP</span><input className="input" type="number" min={1} max={65535} required value={form.port || ''} onChange={(event) => update('port', Number(event.target.value))} /></label>
            <label className="settings-admin__field settings-admin__field--wide"><span>Authentification</span><select className="input" value={form.authMode} onChange={(event) => { setForm((current) => ({ ...current, authMode: event.target.value as SmtpSettingsInput['authMode'], password: '' })); setFeedback(null); }}><option value="relay">Relais autorisé par adresse IP</option><option value="password">Identifiant et mot de passe</option></select></label>
            {form.authMode === 'password' ? <>
              <label className="settings-admin__field"><span>Identifiant SMTP</span><input className="input" required value={form.user} autoComplete="off" onChange={(event) => update('user', event.target.value)} /></label>
              <label className="settings-admin__field"><span id="smtp-password-label">Mot de passe SMTP</span><input aria-labelledby="smtp-password-label" aria-describedby="smtp-password-hint" className="input" type="password" required={!canKeepPassword} value={form.password ?? ''} autoComplete="new-password" onChange={(event) => update('password', event.target.value)} placeholder={canKeepPassword ? 'Mot de passe déjà enregistré' : 'Mot de passe fourni par votre service'} /><small id="smtp-password-hint">{canKeepPassword ? 'Laissez vide pour conserver le mot de passe enregistré.' : 'Saisissez le mot de passe SMTP ou le mot de passe d’application.'}</small></label>
            </> : <p className="settings-admin__note settings-admin__field--wide">Votre fournisseur SMTP doit autoriser l’adresse IP publique du serveur Bertel. Aucun identifiant ni mot de passe n’est nécessaire.</p>}
          </div>
        </fieldset>

        <div className="settings-admin__section">
          <div className="settings-admin__section-head"><div><h3>Envois de la plateforme</h3><p className="settings-admin__hint">Les listes et notifications utilisent la même configuration.</p></div></div>
          <label className="smtp-settings__toggle"><input type="checkbox" checked={form.enabled} disabled={disabled} onChange={(event) => update('enabled', event.target.checked)} /><span>Activer l’envoi d’e-mails</span></label>
          {!form.enabled && <p className="settings-admin__hint">Après enregistrement, les envois seront suspendus. Le partage des listes par lien restera disponible.</p>}
          {settings?.source === 'environment' && <p className="settings-admin__hint">Réglages actuels fournis par le serveur. Enregistrez ce formulaire pour les gérer depuis Bertel.</p>}
        </div>

        <div className="settings-admin__note"><ShieldCheck size={19} aria-hidden="true" /><p>Ces réglages concernent les e-mails envoyés par Bertel. Les liens de connexion et de réinitialisation du mot de passe se configurent séparément dans Supabase Auth.</p></div>
        {feedback && <div className={`settings-admin__note ${feedback.ok ? 'settings-admin__note--success' : 'settings-admin__note--danger'}`} role={feedback.ok ? 'status' : 'alert'}>{feedback.ok && <CheckCircle2 size={19} aria-hidden="true" />}<p>{feedback.detail}</p></div>}
        <footer className="settings-admin__footer">
          <p className="settings-admin__hint">{dirty ? 'Enregistrez vos modifications avant de tester la connexion.' : 'Le test vérifie la connexion au serveur, sans envoyer d’e-mail.'}</p>
          <div className="settings-admin__actions">
            <button className="ghost-button" type="button" disabled={demoMode || loading || !!loadError || !!busy || dirty || !settings?.configured} onClick={() => void test()}><PlugZap size={16} aria-hidden="true" />{busy === 'test' ? 'Test en cours…' : 'Tester la connexion'}</button>
            <button className="primary-button" type="submit" disabled={disabled || (!dirty && settings?.source === 'database')}><Save size={16} aria-hidden="true" />{busy === 'save' ? 'Enregistrement…' : 'Enregistrer les réglages'}</button>
          </div>
        </footer>
      </form>
    </section>
  );
}
