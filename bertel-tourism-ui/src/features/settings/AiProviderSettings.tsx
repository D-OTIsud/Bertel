'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Check, KeyRound, Plus, RefreshCw, ShieldAlert, ShieldCheck, Wifi } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import {
  listAiProviders,
  upsertAiProvider,
  setActiveAiProvider,
  deleteAiProvider,
  testAiConnection,
  type AiApiKind,
  type AiProvider,
} from '../../services/ai-provider';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import './settings-panels.css';

/**
 * Super-admin settings section for the platform AI provider (menu extraction and translation). Add/edit a
 * provider (label, kind, base URL, model, key), switch the active one, test the connection. The API
 * key is write-only — once set it shows « configurée ✓ » and is never read back. Spec §4.4 / 7.3.
 *
 * The saved configuration and the edit form are separate: connection tests always target the
 * active, saved provider. Activation and deletion keep their platform-wide confirmation.
 */

const API_KINDS: { value: AiApiKind; label: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI-compatible (OpenAI, OpenRouter, Groq, Ollama, vLLM, Kimi…)' },
  { value: 'anthropic', label: 'Anthropic (API native — bientôt)' },
];

const EMPTY = {
  label: '',
  apiKind: 'openai_compatible' as AiApiKind,
  baseUrl: '',
  model: '',
  maxOutputTokens: 4096,
  isActive: true,
  apiKey: '',
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Erreur inattendue.';
}

export function AiProviderSettings() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHasKey, setEditingHasKey] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState<AiProvider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AiProvider | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      setProviders(await listAiProviders());
    } catch (err) {
      setLoadError(message(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  function startNew() {
    setEditingId(null);
    setEditingHasKey(false);
    setForm({ ...EMPTY });
  }
  function startEdit(p: AiProvider) {
    setEditingId(p.id);
    setEditingHasKey(p.hasKey);
    setForm({ label: p.label, apiKind: p.apiKind, baseUrl: p.baseUrl, model: p.model, maxOutputTokens: p.maxOutputTokens, isActive: p.isActive, apiKey: '' });
    labelRef.current?.focus();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.label.trim() || !form.baseUrl.trim() || !form.model.trim()) {
      toast.error('Libellé, base URL et modèle sont requis.');
      return;
    }
    setBusy(true);
    try {
      await upsertAiProvider({
        id: editingId ?? undefined,
        label: form.label,
        apiKind: form.apiKind,
        baseUrl: form.baseUrl,
        model: form.model,
        maxOutputTokens: Number(form.maxOutputTokens) || 4096,
        isActive: form.isActive,
        apiKey: form.apiKey || undefined,
      });
      toast.success('Fournisseur enregistré.');
      startNew();
      await reload();
    } catch (err) {
      toast.error(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function doActivate(id: string) {
    setActionBusy(true);
    try {
      await setActiveAiProvider(id);
      setConfirmActivate(null);
      await reload();
      toast.success('Fournisseur actif mis à jour.');
    } catch (err) {
      toast.error(message(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function doRemove(id: string) {
    setActionBusy(true);
    try {
      await deleteAiProvider(id);
      if (editingId === id) startNew();
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      toast.error(message(err));
    } finally {
      setActionBusy(false);
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
      const result = await testAiConnection(token);
      if (result.ok) toast.success(result.detail);
      else toast.error(result.detail);
    } catch (err) {
      toast.error(message(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <section aria-labelledby="ai-provider-heading" className="settings-pane settings-admin">
      <div className="settings-pane__head settings-admin__header">
        <div className="settings-admin__heading">
          <span className="settings-admin__icon"><Bot size={22} aria-hidden="true" /></span>
          <div>
            <h2 id="ai-provider-heading">Fournisseurs IA</h2>
            <p>Configurez le moteur de traduction des descriptions et d’extraction des cartes de restaurant.</p>
          </div>
        </div>
        <span className="badge badge--info badge--xs">Super-admin</span>
      </div>

      <div className="settings-admin__body">
        <section className="settings-admin__section" aria-labelledby="ai-configured-heading">
          <div className="settings-admin__section-head">
            <div>
              <h3 id="ai-configured-heading">Fournisseurs configurés</h3>
              <p id="ai-test-hint">Un seul fournisseur actif. Le test utilise sa configuration enregistrée.</p>
            </div>
            <button type="button" className="ghost-button" onClick={runTest} disabled={testing || loading || !!loadError || !providers.some((p) => p.isActive)} aria-describedby="ai-test-hint">
              <Wifi size={16} aria-hidden="true" /> {testing ? 'Test…' : 'Tester la connexion'}
            </button>
          </div>
          {loadError ? (
            <div className="settings-admin__note settings-admin__note--danger" role="alert">
              <ShieldAlert size={18} aria-hidden="true" />
              <div><strong>Impossible de charger les fournisseurs</strong><p>{loadError}</p></div>
              <button type="button" className="ghost-button" onClick={() => void reload()}><RefreshCw size={14} aria-hidden="true" /> Réessayer</button>
            </div>
          ) : loading ? (
            <p className="settings-admin__empty" role="status">Chargement des fournisseurs…</p>
          ) : providers.length === 0 ? (
            <EmptyState
              mode="no-data"
              title="Aucun fournisseur configuré"
              description="Renseignez un fournisseur ci-dessous pour activer la traduction et l’extraction de carte."
              action={{ label: 'Configurer un fournisseur', onClick: () => labelRef.current?.focus() }}
            />
          ) : (
            <ul className="settings-admin__provider-list">
              {providers.map((p) => (
                <li key={p.id} className={`settings-admin__provider${p.isActive ? ' settings-admin__provider--active' : ''}`}>
                  <div className="settings-admin__section-head">
                    <h4>{p.label}</h4>
                    <span className={p.isActive ? 'badge badge--ok' : 'badge badge--muted'}>
                      {p.isActive && <Check size={13} aria-hidden="true" />} {p.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <dl className="settings-admin__provider-meta">
                    <div><dt>Modèle</dt><dd><code>{p.model}</code></dd></div>
                    <div><dt>Base URL</dt><dd><code>{p.baseUrl}</code></dd></div>
                  </dl>
                  <div className="settings-admin__provider-footer">
                    <span className="settings-admin__key-state"><KeyRound size={14} aria-hidden="true" /> {p.hasKey ? 'Clé configurée' : 'Sans clé API'}</span>
                    <div className="settings-admin__actions">
                      {!p.isActive && <button type="button" className="ghost-button" onClick={() => setConfirmActivate(p)} disabled={actionBusy}>Activer</button>}
                      <button type="button" className="ghost-button" onClick={() => startEdit(p)} disabled={busy}>Modifier</button>
                      <button type="button" className="ghost-button settings-admin__danger-action" onClick={() => setConfirmDelete(p)} disabled={actionBusy} aria-label={`Supprimer ${p.label}`}>Supprimer</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      <form onSubmit={save} className="settings-admin__section" aria-labelledby="ai-form-heading">
        <div className="settings-admin__section-head">
          <div>
            <h3 id="ai-form-heading">{editingId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
            <p>{editingId ? 'Mettez à jour la connexion et les réglages du modèle.' : 'Ajoutez une connexion à un service IA ou à un modèle local.'}</p>
          </div>
          {!editingId && <Plus size={18} className="muted" aria-hidden="true" />}
        </div>

        <fieldset className="settings-admin__form-fields" disabled={busy || loading || !!loadError}>
        <div className="settings-admin__form-grid">
        <div className="settings-admin__field">
          <label htmlFor="ai-label">Libellé</label>
          <input id="ai-label" ref={labelRef} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="OpenRouter · gpt-4o-mini" />
        </div>

        <div className="settings-admin__field">
          <label htmlFor="ai-kind">Type d’API</label>
          <select id="ai-kind" value={form.apiKind} onChange={(e) => setForm((f) => ({ ...f, apiKind: e.target.value as AiApiKind }))}>
            {API_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>

        <div className="settings-admin__field">
          <label htmlFor="ai-base">Base URL</label>
          <input id="ai-base" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://openrouter.ai/api/v1" />
        </div>

        <div className="settings-admin__field">
          <label htmlFor="ai-model">Modèle</label>
          <input id="ai-model" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="openai/gpt-4o-mini" />
        </div>

        <div className="settings-admin__field">
          <label htmlFor="ai-key">Clé API</label>
          <input id="ai-key" type="password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder={editingHasKey ? '•••• conservée' : 'sk-…'} autoComplete="off" aria-describedby="ai-key-hint" />
          <p id="ai-key-hint">{editingHasKey ? 'Clé configurée : laisser vide pour conserver la clé actuelle.' : 'Facultative pour un fournisseur local sans authentification.'}</p>
        </div>

        <div className="settings-admin__field">
          <label htmlFor="ai-max">Max tokens (sortie)</label>
          <input id="ai-max" type="number" value={form.maxOutputTokens} min={256} max={32768} onChange={(e) => setForm((f) => ({ ...f, maxOutputTokens: Number(e.target.value) }))} />
        </div>
        </div>

        <div className="settings-admin__note">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>La clé API est chiffrée côté serveur et n’est jamais renvoyée dans l’interface.</p>
        </div>

        <label className="settings-admin__check">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          <span>Définir comme fournisseur actif<small>Le changement prend effet à l’enregistrement pour toute la plateforme.</small></span>
        </label>

        <div className="settings-admin__footer">
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          {editingId && <button type="button" className="ghost-button" onClick={startNew} disabled={busy}>Annuler la modification</button>}
        </div>
        </fieldset>
      </form>
      </div>

      <ConfirmDialog
        open={Boolean(confirmActivate)}
        title="Activer ce fournisseur ?"
        confirmLabel="Activer"
        busy={actionBusy}
        message={confirmActivate ? `« ${confirmActivate.label} » deviendra le fournisseur IA en service pour toute la plateforme (traduction et extraction de carte).` : ''}
        onCancel={() => setConfirmActivate(null)}
        onConfirm={() => confirmActivate && void doActivate(confirmActivate.id)}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        tone="danger"
        title="Supprimer ce fournisseur ?"
        confirmLabel="Supprimer définitivement"
        busy={actionBusy}
        message={
          confirmDelete
            ? `« ${confirmDelete.label} » sera supprimé et sa clé API effacée.${confirmDelete.isActive ? ' Ce fournisseur est ACTIF : la traduction et l’extraction de carte seront interrompues tant qu’un autre n’est pas activé.' : ''}`
            : ''
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void doRemove(confirmDelete.id)}
      />
    </section>
  );
}
