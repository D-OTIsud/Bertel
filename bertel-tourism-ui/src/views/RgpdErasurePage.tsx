'use client';

import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { useSessionStore } from '@/store/session-store';
import { getSupabaseClient } from '@/lib/supabase';
import {
  requestErasure,
  ERASURE_SUBJECT_KINDS,
  ERASURE_KIND_LABELS,
  ERASURE_ID_HINT,
  type ErasureSubjectKind,
  type ErasureMode,
  type ErasureResult,
} from '@/services/rgpd';

export default function RgpdErasurePage() {
  const role = useSessionStore((s) => s.role);
  const allowed = role === 'owner' || role === 'super_admin';

  const [subjectKind, setSubjectKind] = useState<ErasureSubjectKind>('actor');
  const [subjectId, setSubjectId] = useState('');
  const [mode, setMode] = useState<ErasureMode>('anonymize');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ErasureResult | null>(null);

  if (!allowed) {
    return (
      <section className="p-6">
        <p className="text-sm text-ink-3">
          Accès réservé au référent RGPD (administrateur plateforme).
        </p>
      </section>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = subjectId.trim();
    if (!id) {
      toast.error('Identifiant du sujet requis.');
      return;
    }
    const verb = mode === 'delete' ? 'SUPPRIMER définitivement' : 'anonymiser';
    const ok = window.confirm(
      `Confirmer : ${verb} le sujet « ${ERASURE_KIND_LABELS[subjectKind]} » d'identifiant ${id} ?\n\n` +
        'Cette action est journalisée et irréversible. Le journal d\'audit est purgé de la PII du sujet.',
    );
    if (!ok) return;

    setBusy(true);
    setResult(null);
    try {
      const client = getSupabaseClient();
      const token = client ? (await client.auth.getSession()).data.session?.access_token ?? '' : '';
      if (!token) {
        toast.error('Session expirée — reconnectez-vous.');
        return;
      }
      const res = await requestErasure({
        subjectKind,
        subjectId: id,
        mode,
        reason: reason.trim() || null,
        accessToken: token,
      });
      setResult(res);
      toast.success(mode === 'delete' ? 'Sujet supprimé.' : 'Sujet anonymisé.');
      setSubjectId('');
      setReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'effacement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ink">Effacement RGPD (Art. 17)</h1>
        <p className="text-sm text-ink-3">
          Traitement d&apos;une demande d&apos;effacement / anonymisation, par sujet identifié.
        </p>
      </header>

      <div className="rounded-[12px] border border-info-border bg-info-bg p-3 text-[13px] leading-relaxed text-ink-2">
        Bertel est un référentiel touristique : la quasi-totalité des données est publique
        (établissements = personnes morales). Cet outil agit <strong>uniquement</strong> sur les
        données personnelles d&apos;un sujet précis (acteur, contacts privés, CRM, déclarant, avis…) —
        jamais sur le référentiel public. L&apos;anonymisation conserve la structure (liens préservés) ;
        la suppression dure cascade. Le journal d&apos;audit est purgé de la PII du sujet et chaque
        opération est tracée dans le registre des effacements.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-2">Type de sujet</span>
          <select
            value={subjectKind}
            onChange={(e) => setSubjectKind(e.target.value as ErasureSubjectKind)}
            className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            {ERASURE_SUBJECT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ERASURE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-2">Identifiant du sujet</span>
          <input
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder={ERASURE_ID_HINT[subjectKind]}
            className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
          />
          <span className="text-xs text-ink-3">{ERASURE_ID_HINT[subjectKind]}</span>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink-2">Mode</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name="mode"
              checked={mode === 'anonymize'}
              onChange={() => setMode('anonymize')}
            />
            Anonymiser <span className="text-ink-3">(recommandé — conserve la structure)</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name="mode"
              checked={mode === 'delete'}
              onChange={() => setMode('delete')}
            />
            Supprimer définitivement <span className="text-ink-3">(cascade dure)</span>
          </label>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-2">Motif / référence de la demande</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Ex. demande d'effacement reçue le … / réf. dossier …"
            className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-[10px] bg-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-2 disabled:opacity-50"
        >
          {busy ? 'Traitement…' : mode === 'delete' ? 'Supprimer le sujet' : 'Anonymiser le sujet'}
        </button>
      </form>

      {result && (
        <div className="space-y-2 rounded-[12px] border border-line bg-surface2 p-3 text-[13px] text-ink-2">
          <p className="font-medium text-ink">Effacement effectué</p>
          {result.storageDeleted.length > 0 && (
            <p>Fichiers supprimés du stockage : {result.storageDeleted.length}</p>
          )}
          {result.storageError && (
            <p className="text-orange">Avertissement stockage : {result.storageError}</p>
          )}
          {result.authUserDeleted && <p>Compte d&apos;authentification supprimé.</p>}
          {result.authError && <p className="text-orange">Avertissement compte : {result.authError}</p>}
          <details className="mt-1">
            <summary className="cursor-pointer text-ink-3">Détail technique (rapport)</summary>
            <pre className="mt-2 overflow-x-auto rounded-[8px] bg-surface p-2 text-xs text-ink-2">
              {JSON.stringify(result.report, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
