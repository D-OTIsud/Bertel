'use client';

import { useEffect, useState } from 'react';
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

/**
 * Super-admin settings section for the platform AI provider (§06 carte extraction). Add/edit a
 * provider (label, kind, base URL, model, key), switch the active one, test the connection. The API
 * key is write-only — once set it shows « configurée ✓ » and is never read back. Spec §4.4.
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

  async function activate(id: string) {
    try {
      await setActiveAiProvider(id);
      await reload();
      toast.success('Fournisseur actif mis à jour.');
    } catch (err) {
      toast.error(message(err));
    }
  }

  async function remove(id: string) {
    try {
      await deleteAiProvider(id);
      if (editingId === id) startNew();
      await reload();
    } catch (err) {
      toast.error(message(err));
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
    <section aria-labelledby="ai-provider-heading" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 id="ai-provider-heading" style={{ margin: 0 }}>Fournisseur IA (extraction de carte)</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Configure le moteur utilisé pour l'analyse des cartes de restaurant (§06). La clé reste côté serveur
          (chiffrée) et n'est jamais renvoyée. Un seul fournisseur actif à la fois.
        </p>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : providers.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>Aucun fournisseur configuré.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {providers.map((p) => (
            <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--line)', padding: '8px 0' }}>
              <div style={{ flex: 1 }}>
                <strong>{p.label}</strong>{' '}
                {p.isActive && <span className="pill-mini active">actif</span>}
                <div className="muted" style={{ fontSize: 12 }}>
                  {p.model} · {p.baseUrl} · {p.hasKey ? 'clé configurée ✓' : 'sans clé'}
                </div>
              </div>
              {!p.isActive && (
                <button type="button" className="btn" onClick={() => activate(p.id)}>Activer</button>
              )}
              <button type="button" className="btn" onClick={() => startEdit(p)}>Modifier</button>
              <button type="button" className="btn" onClick={() => remove(p.id)} aria-label={`Supprimer ${p.label}`}>Supprimer</button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <strong style={{ fontSize: 14 }}>{editingId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</strong>

        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Libellé
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="OpenRouter · gpt-4o-mini" />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Type d'API
          <select value={form.apiKind} onChange={(e) => setForm((f) => ({ ...f, apiKind: e.target.value as AiApiKind }))}>
            {API_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Base URL
          <input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://openrouter.ai/api/v1" />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Modèle
          <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="openai/gpt-4o-mini" />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Clé API {editingHasKey && <span className="muted">(configurée ✓ — laisser vide pour conserver)</span>}
          <input type="password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder={editingHasKey ? '•••• conservée' : 'sk-…  (vide pour un fournisseur local sans clé)'} autoComplete="off" />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 13, maxWidth: 200 }}>
          Max tokens (sortie)
          <input type="number" value={form.maxOutputTokens} min={256} max={32768} onChange={(e) => setForm((f) => ({ ...f, maxOutputTokens: Number(e.target.value) }))} />
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Définir comme fournisseur actif
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          {editingId && <button type="button" className="btn" onClick={startNew}>Nouveau</button>}
          <button type="button" className="btn" onClick={runTest} disabled={testing}>{testing ? 'Test…' : 'Tester la connexion'}</button>
        </div>
      </form>
    </section>
  );
}
