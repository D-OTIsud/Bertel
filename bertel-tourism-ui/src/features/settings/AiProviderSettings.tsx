'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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

/**
 * Super-admin settings section for the platform AI provider (§06 carte extraction). Add/edit a
 * provider (label, kind, base URL, model, key), switch the active one, test the connection. The API
 * key is write-only — once set it shows « configurée ✓ » and is never read back. Spec §4.4 / 7.3.
 *
 * Phase 7.3 fidélité : vocabulaire maison (plus de styles inline), liste en table avec badge/dot,
 * et ConfirmDialog sur Activer ET Supprimer (toutes deux modifient le fournisseur EN SERVICE pour
 * toute la plateforme / sont destructives).
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
    try {
      setProviders(await listAiProviders());
    } catch (err) {
      toast.error(message(err));
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
    } finally {
      setTesting(false);
    }
  }

  return (
    <section aria-labelledby="ai-provider-heading" className="ai-provider">
      <div className="settings-pane__head">
        <div>
          <h2 id="ai-provider-heading">Fournisseurs IA</h2>
          <p>
            Moteur d’extraction des cartes de restaurant (§06). La clé reste côté serveur (chiffrée) et n’est
            jamais renvoyée. Un seul fournisseur actif à la fois.
          </p>
        </div>
        <span className="badge badge--info badge--xs">Super-admin</span>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : providers.length === 0 ? (
        <EmptyState
          mode="no-data"
          title="Aucun fournisseur configuré"
          description="Renseignez un fournisseur ci-dessous pour activer l’extraction de carte."
          action={{ label: 'Configurer un fournisseur', onClick: () => labelRef.current?.focus() }}
        />
      ) : (
        <table className="data-table ai-provider-table">
          <thead>
            <tr>
              <th scope="col">Fournisseur</th>
              <th scope="col">Base URL</th>
              <th scope="col">Modèle</th>
              <th scope="col">Clé</th>
              <th scope="col">État</th>
              <th scope="col" className="data-table__actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.label}</strong></td>
                <td><code className="ai-base-url">{p.baseUrl}</code></td>
                <td>{p.model}</td>
                <td>{p.hasKey ? <span className="badge badge--ok">Clé configurée</span> : <span className="muted">sans clé</span>}</td>
                <td>
                  {p.isActive ? (
                    <span className="state-row__v"><span className="dot dot--ok" aria-hidden /> Actif</span>
                  ) : (
                    <span className="state-row__v muted"><span className="dot dot--off" aria-hidden /> Inactif</span>
                  )}
                </td>
                <td className="data-table__actions">
                  <div className="inline-actions">
                    {!p.isActive && (
                      <button type="button" className="ghost-button" onClick={() => setConfirmActivate(p)}>Activer</button>
                    )}
                    <button type="button" className="ghost-button" onClick={() => startEdit(p)}>Modifier</button>
                    <button type="button" className="ghost-button ai-provider-delete" onClick={() => setConfirmDelete(p)} aria-label={`Supprimer ${p.label}`}>Supprimer</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={save} className="ai-provider-form">
        <strong className="ai-provider-form__title">{editingId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</strong>

        <div className="field-block">
          <label htmlFor="ai-label">Libellé</label>
          <input id="ai-label" ref={labelRef} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="OpenRouter · gpt-4o-mini" />
        </div>

        <div className="field-block">
          <label htmlFor="ai-kind">Type d’API</label>
          <select id="ai-kind" value={form.apiKind} onChange={(e) => setForm((f) => ({ ...f, apiKind: e.target.value as AiApiKind }))}>
            {API_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>

        <div className="field-block">
          <label htmlFor="ai-base">Base URL</label>
          <input id="ai-base" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://openrouter.ai/api/v1" />
        </div>

        <div className="field-block">
          <label htmlFor="ai-model">Modèle</label>
          <input id="ai-model" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="openai/gpt-4o-mini" />
        </div>

        <div className="field-block">
          <label htmlFor="ai-key">Clé API {editingHasKey && <span className="muted">(configurée ✓ — laisser vide pour conserver)</span>}</label>
          <input id="ai-key" type="password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder={editingHasKey ? '•••• conservée' : 'sk-…  (vide pour un fournisseur local sans clé)'} autoComplete="off" />
        </div>

        <div className="field-block ai-provider-form__narrow">
          <label htmlFor="ai-max">Max tokens (sortie)</label>
          <input id="ai-max" type="number" value={form.maxOutputTokens} min={256} max={32768} onChange={(e) => setForm((f) => ({ ...f, maxOutputTokens: Number(e.target.value) }))} />
        </div>

        <label className="ai-provider-form__check">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Définir comme fournisseur actif
        </label>

        <div className="inline-actions">
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          {editingId && <button type="button" className="ghost-button" onClick={startNew}>Nouveau</button>}
          <button type="button" className="ghost-button" onClick={runTest} disabled={testing}>{testing ? 'Test…' : 'Tester la connexion'}</button>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(confirmActivate)}
        title="Activer ce fournisseur ?"
        confirmLabel="Activer"
        busy={actionBusy}
        message={confirmActivate ? `« ${confirmActivate.label} » deviendra le fournisseur IA en service pour TOUTE la plateforme (extraction de carte §06).` : ''}
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
            ? `« ${confirmDelete.label} » sera supprimé et sa clé API effacée.${confirmDelete.isActive ? ' Ce fournisseur est ACTIF : l’extraction de carte (§06) sera interrompue tant qu’un autre n’est pas activé.' : ''}`
            : ''
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void doRemove(confirmDelete.id)}
      />
    </section>
  );
}
