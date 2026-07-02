'use client';

// Effacement RGPD (Art. 17) — refonte §p1..p4 (cf. docs/design/rgpd-redesign).
// Écran le plus dangereux de l'app : le poids visuel et les garde-fous sont portés au niveau de
// l'enjeu. Sécurité (P1) : window.confirm → ConfirmDialog + saisie-pour-confirmer (mode delete) ;
// mode à escalade visuelle + bouton contextuel. Thème (P2) : tokens info/warn/danger réels.
// Clarté (P3) : résolution du sujet + résultat structuré. États/focus (P4) : landmark, accès
// refusé pédagogique, cible 44px. Le contrat backend (requestErasure) est inchangé.

import { type FormEvent, useCallback, useState } from 'react';
import { Info, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useSessionStore } from '@/store/session-store';
import { getSupabaseClient } from '@/lib/supabase';
import { Callout } from '@/components/ui/Callout';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PermissionDenied } from '@/components/common/PermissionDenied';
import { ModeSelect } from './rgpd/ModeSelect';
import { SubjectResolver } from './rgpd/SubjectResolver';
import { ErasureResultPanel } from './rgpd/ErasureResultPanel';
import {
  requestErasure,
  ERASURE_SUBJECT_KINDS,
  ERASURE_KIND_LABELS,
  ERASURE_ID_HINT,
  type ErasureSubjectKind,
  type ErasureMode,
  type ErasureResult,
} from '@/services/rgpd';

interface DoneState {
  result: ErasureResult;
  mode: ErasureMode;
  kind: ErasureSubjectKind;
  id: string;
}

export default function RgpdErasurePage() {
  const role = useSessionStore((s) => s.role);
  const allowed = role === 'owner' || role === 'super_admin';

  const [subjectKind, setSubjectKind] = useState<ErasureSubjectKind>('actor');
  const [subjectId, setSubjectId] = useState('');
  const [mode, setMode] = useState<ErasureMode>('anonymize');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [done, setDone] = useState<DoneState | null>(null);
  const [resolverKey, setResolverKey] = useState(0);

  const handleResolved = useCallback((id: string) => setSubjectId(id), []);

  if (!allowed) {
    return (
      <main aria-labelledby="rgpd-denied-title" className="mx-auto max-w-md p-6">
        <PermissionDenied
          headingId="rgpd-denied-title"
          description={
            <>
              Cet outil d&apos;effacement RGPD est réservé au référent RGPD (administrateur plateforme). Pour
              faire traiter une demande d&apos;effacement, contactez votre administrateur ou le DPO.
            </>
          }
        />
      </main>
    );
  }

  const isDelete = mode === 'delete';
  const hasSubject = subjectId.trim().length > 0;

  function openConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSubject) {
      toast.error('Sélectionnez ou saisissez un sujet valide.');
      return;
    }
    setDone(null);
    setPendingConfirm(true);
  }

  async function runErasure() {
    setBusy(true);
    try {
      const client = getSupabaseClient();
      const token = client ? ((await client.auth.getSession()).data.session?.access_token ?? '') : '';
      if (!token) {
        toast.error('Session expirée — reconnectez-vous.');
        setPendingConfirm(false);
        return;
      }
      const res = await requestErasure({
        subjectKind,
        subjectId: subjectId.trim(),
        mode,
        reason: reason.trim() || null,
        accessToken: token,
      });
      setDone({ result: res, mode, kind: subjectKind, id: subjectId.trim() });
      toast.success(mode === 'delete' ? 'Sujet supprimé.' : 'Sujet anonymisé.');
      setSubjectId('');
      setReason('');
      setResolverKey((key) => key + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'effacement.");
    } finally {
      setBusy(false);
      setPendingConfirm(false);
    }
  }

  return (
    <main aria-labelledby="rgpd-title" className="mx-auto max-w-2xl space-y-5 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <UserX size={20} className="text-ink-2" aria-hidden />
          <h1 id="rgpd-title" className="text-xl font-semibold text-ink">
            Effacement RGPD (Art. 17)
          </h1>
        </div>
        <p className="text-sm text-ink-2">
          Traitement d&apos;une demande d&apos;effacement / anonymisation, par sujet identifié.
        </p>
        <p className="text-xs text-ink-3">Accès réservé au référent RGPD · chaque opération est journalisée.</p>
      </header>

      <Callout
        variant="info"
        ariaLabel="Périmètre de l'outil"
        icon={<Info size={16} />}
        title="Ce que cet outil touche — et ce qu'il ne touche pas"
        chips={[
          { label: '✓ Données du sujet' },
          { label: '✗ Référentiel public' },
          { label: '⊕ Tracé au registre' },
        ]}
      >
        Bertel est un référentiel touristique : la quasi-totalité des données est publique
        (établissements = personnes morales). Cet outil agit <strong>uniquement</strong> sur les données
        personnelles d&apos;un sujet précis (acteur, contacts privés, CRM, déclarant, avis…) — jamais sur le
        référentiel public. L&apos;anonymisation conserve la structure ; la suppression dure cascade.
      </Callout>

      <form onSubmit={openConfirm} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4 border-0 p-0">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink-2">Type de sujet</span>
            <select
              value={subjectKind}
              onChange={(event) => setSubjectKind(event.target.value as ErasureSubjectKind)}
              className="w-full rounded-shellLg border border-line bg-surface px-3 py-2 text-sm text-ink"
            >
              {ERASURE_SUBJECT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ERASURE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          <SubjectResolver
            key={`${subjectKind}-${resolverKey}`}
            kind={subjectKind}
            onResolved={handleResolved}
            hint={ERASURE_ID_HINT[subjectKind]}
            disabled={busy}
          />

          <div className="space-y-1">
            <span className="text-sm font-medium text-ink-2">Mode</span>
            <ModeSelect value={mode} onChange={setMode} disabled={busy} />
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink-2">Motif / référence de la demande</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Ex. demande d'effacement reçue le … / réf. dossier …"
              className="w-full rounded-shellLg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
        </fieldset>

        <div className="space-y-1.5">
          <button
            type="submit"
            disabled={busy || !hasSubject}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-shellLg px-4 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              isDelete ? 'bg-danger-strong hover:opacity-90' : 'bg-teal hover:bg-teal-2'
            }`}
          >
            {busy ? 'Traitement…' : isDelete ? 'Supprimer le sujet' : 'Anonymiser le sujet'}
          </button>
          <p className={isDelete ? 'text-xs text-danger-ink' : 'text-xs text-ink-2'}>
            {isDelete
              ? 'Irréversible — confirmation par saisie requise.'
              : 'Action journalisée. Une confirmation sera demandée.'}
          </p>
        </div>
      </form>

      {done && (
        <ErasureResultPanel
          result={done.result}
          mode={done.mode}
          subjectLabel={ERASURE_KIND_LABELS[done.kind]}
          subjectId={done.id}
        />
      )}

      <ConfirmDialog
        open={pendingConfirm}
        tone={isDelete ? 'danger' : 'default'}
        title={isDelete ? 'Supprimer définitivement le sujet ?' : 'Anonymiser le sujet ?'}
        confirmLabel={isDelete ? 'Supprimer le sujet' : 'Anonymiser'}
        busy={busy}
        confirmGate={
          isDelete
            ? {
                expected: [subjectId.trim(), 'SUPPRIMER'],
                label: (
                  <>
                    Tapez l&apos;identifiant du sujet ou le mot <strong>SUPPRIMER</strong> pour confirmer.
                  </>
                ),
              }
            : undefined
        }
        message={
          <span className="block space-y-2">
            <span className="block">
              Vous allez {isDelete ? <strong>supprimer définitivement</strong> : 'anonymiser'} le sujet
              ci-dessous. Cette action est journalisée{isDelete ? ' et irréversible' : ''}.
            </span>
            <span className="block space-y-1 rounded-shellMd border border-line bg-bgTint p-2 text-xs">
              <span className="flex justify-between gap-2">
                <span className="text-ink-2">Type</span>
                <span className="text-right text-ink">{ERASURE_KIND_LABELS[subjectKind]}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span className="text-ink-2">Identifiant</span>
                <span className="break-all text-right font-mono text-ink">{subjectId.trim()}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span className="text-ink-2">Mode</span>
                <span className={isDelete ? 'font-medium text-danger-ink' : 'font-medium text-teal'}>
                  {isDelete ? 'Suppression dure' : 'Anonymisation'}
                </span>
              </span>
            </span>
          </span>
        }
        onCancel={() => setPendingConfirm(false)}
        onConfirm={runErasure}
      />
    </main>
  );
}
