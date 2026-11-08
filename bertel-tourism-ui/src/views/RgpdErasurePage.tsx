'use client';

// Effacement RGPD (Art. 17) — refonte §p1..p4 (cf. docs/design/rgpd-redesign).
// Écran le plus dangereux de l'app : le poids visuel et les garde-fous sont portés au niveau de
// l'enjeu. Sécurité (P1) : window.confirm → ConfirmDialog + saisie-pour-confirmer (mode delete) ;
// mode à escalade visuelle + bouton contextuel. Thème (P2) : tokens info/warn/danger réels.
// Clarté (P3) : résolution du sujet + résultat structuré. États/focus (P4) : landmark, accès
// refusé pédagogique, cible 44px. Le contrat backend (requestErasure) est inchangé.

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
  resumeErasureCleanup,
  lookupErasureStart,
  ERASURE_SUBJECT_KINDS,
  ERASURE_KIND_LABELS,
  ERASURE_ID_HINT,
  type ErasureSubjectKind,
  type ErasureMode,
  type ErasureResult,
} from '@/services/rgpd';
import {
  admitStartReference,
  computeStartFingerprint,
  isConfirmedCompletion,
  isResultBoundToRequest,
  readStartReference,
  releaseConfirmedStartReference,
  type RgpdStartReference,
} from '@/services/rgpd-start-reference';
import { strictErrorMessage } from '../lib/strict-error-message';

type SessionSnapshot = ReturnType<typeof useSessionStore.getState>;

/** Compte courant confirmé par Auth ; `key` change aussi à chaque epoch (ABA). */
interface Owner {
  key: string;
  userId: string;
}

interface ErasureSnapshot {
  subjectKind: ErasureSubjectKind;
  subjectId: string;
  mode: ErasureMode;
  reason: string | null;
}

interface ConfirmationState {
  owner: Owner;
  snapshot: ErasureSnapshot;
}

interface DoneState {
  ownerKey: string;
  requestId: string;
  result: ErasureResult;
  /** null quand la reprise vient d'une référence seule : sujet et mode restent inconnus. */
  subject: { mode: ErasureMode; kind: ErasureSubjectKind; id: string } | null;
}

interface RecoveryState {
  ownerKey: string;
  reference: RgpdStartReference;
}

function ownerOf(state: SessionSnapshot): Owner | null {
  const authority = state.authAuthority;
  if (!authority?.hydrated || !authority.userId || state.userId !== authority.userId) return null;
  return { key: `${authority.epoch}:${authority.userId}`, userId: authority.userId };
}

function ownerIsCurrent(owner: Owner): boolean {
  return ownerOf(useSessionStore.getState())?.key === owner.key;
}

function sameSnapshot(left: ErasureSnapshot, right: ErasureSnapshot): boolean {
  return (
    left.subjectKind === right.subjectKind &&
    left.subjectId === right.subjectId &&
    left.mode === right.mode &&
    left.reason === right.reason
  );
}

/** Jeton seulement si la session Supabase appartient encore au compte attendu. */
async function readOwnerToken(owner: Owner): Promise<string | null> {
  const client = getSupabaseClient();
  const session = client ? (await client.auth.getSession()).data.session : null;
  const token = session?.access_token ?? '';
  if (!token || session?.user?.id !== owner.userId || !ownerIsCurrent(owner)) return null;
  return token;
}

export default function RgpdErasurePage() {
  const ownerKey = useSessionStore((s) => ownerOf(s)?.key ?? null);
  // Le changement de compte/epoch remonte tout le formulaire avant le premier commit.
  return <AccountErasurePage key={ownerKey ?? 'guest'} />;
}

function AccountErasurePage() {
  const role = useSessionStore((s) => s.role);
  const ownerKey = useSessionStore((s) => ownerOf(s)?.key ?? null);
  const allowed = role === 'owner' || role === 'super_admin';

  const [subjectKind, setSubjectKind] = useState<ErasureSubjectKind>('actor');
  const [subjectId, setSubjectId] = useState('');
  const [mode, setMode] = useState<ErasureMode>('anonymize');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState | null>(null);
  const [resolverKey, setResolverKey] = useState(0);

  const currentSnapshot: ErasureSnapshot = {
    subjectKind,
    subjectId: subjectId.trim(),
    mode,
    reason: reason.trim() || null,
  };
  const formRef = useRef(currentSnapshot);
  formRef.current = currentSnapshot;
  const runRef = useRef<object | null>(null);
  const resumeRef = useRef<object | null>(null);
  const lastOwnerKeyRef = useRef<string | null>(null);

  const handleResolved = useCallback((id: string) => setSubjectId(id), []);

  // Lecture seule au montage ou au changement de compte : aucune requête n'est lancée ici.
  useEffect(() => {
    const previousOwnerKey = lastOwnerKeyRef.current;
    lastOwnerKeyRef.current = ownerKey;
    if (previousOwnerKey !== null && previousOwnerKey !== ownerKey) {
      runRef.current = null;
      resumeRef.current = null;
      setBusy(false);
      setResuming(false);
      setConfirmation(null);
      setDone(null);
      setSubjectKind('actor');
      setSubjectId('');
      setMode('anonymize');
      setReason('');
      setResolverKey((key) => key + 1);
    }
    const owner = ownerOf(useSessionStore.getState());
    if (!allowed || !owner || owner.key !== ownerKey) {
      setRecovery(null);
      return;
    }
    const stored = readStartReference(owner.userId);
    setRecovery(stored.kind === 'present' ? { ownerKey: owner.key, reference: stored.reference } : null);
  }, [ownerKey, allowed]);

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

  // Un clic reste lié à la référence affichée, même si un autre onglet remplace le stockage.
  function referenceIsCurrent(owner: Owner, reference: RgpdStartReference): boolean {
    const stored = readStartReference(owner.userId);
    if (stored.kind === 'present' && stored.reference.requestId === reference.requestId &&
        stored.reference.fingerprint === reference.fingerprint) return true;
    if (stored.kind === 'present' || stored.kind === 'absent') {
      setDone(null);
      setRecovery(stored.kind === 'present' ? { ownerKey: owner.key, reference: stored.reference } : null);
    }
    return false;
  }

  function openConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSubject) {
      toast.error('Sélectionnez ou saisissez un sujet valide.');
      return;
    }
    const owner = ownerOf(useSessionStore.getState());
    if (!owner) {
      toast.error('Session expirée — reconnectez-vous.');
      return;
    }
    const stored = readStartReference(owner.userId);
    setDone(null);
    if (stored.kind !== 'absent') {
      if (stored.kind === 'present') setRecovery({ ownerKey: owner.key, reference: stored.reference });
      toast.error("Échec de l'effacement.");
      return;
    }
    setConfirmation({ owner, snapshot: currentSnapshot });
  }

  async function runErasure() {
    const pending = confirmation;
    if (!pending || runRef.current || resumeRef.current) return;
    const run = {};
    runRef.current = run;
    setBusy(true);
    const { owner, snapshot } = pending;
    const admissible = () =>
      runRef.current === run && ownerIsCurrent(owner) && sameSnapshot(snapshot, formRef.current);
    try {
      if (!admissible()) {
        if (ownerIsCurrent(owner)) toast.error("Échec de l'effacement.");
        return;
      }
      const token = await readOwnerToken(owner);
      if (!token) {
        if (ownerIsCurrent(owner)) toast.error('Session expirée — reconnectez-vous.');
        return;
      }
      const fingerprint = await computeStartFingerprint(snapshot);
      const admission = fingerprint
        ? await admitStartReference({
            userId: owner.userId,
            fingerprint,
            isCurrent: admissible,
            send: (reference) => requestErasure({ ...snapshot, requestId: reference.requestId, accessToken: token }),
          })
        : ({ kind: 'refused' } as const);
      if (admission.kind !== 'started') {
        if (ownerIsCurrent(owner)) {
          if (admission.kind === 'blocked') setRecovery({ ownerKey: owner.key, reference: admission.reference });
          toast.error("Échec de l'effacement.");
        }
        return;
      }

      const { reference } = admission;
      if (ownerIsCurrent(owner)) setRecovery({ ownerKey: owner.key, reference });
      const res = await admission.sent;
      if (!ownerIsCurrent(owner)) return;
      if (!referenceIsCurrent(owner, reference)) {
        toast.error("Échec de l'effacement.");
        return;
      }

      const confirmed = isConfirmedCompletion(res, reference.requestId);
      if (!isResultBoundToRequest(res, reference.requestId) || (res.status === 'completed' && !confirmed)) {
        toast.error("Échec de l'effacement.");
        return;
      }
      if (confirmed) {
        const released = await releaseConfirmedStartReference({
          userId: owner.userId,
          reference,
          result: res,
          isCurrent: () => ownerIsCurrent(owner),
        });
        if (!ownerIsCurrent(owner)) return;
        if (released) setRecovery(null);
        else if (!referenceIsCurrent(owner, reference)) return;
      }

      setDone({
        ownerKey: owner.key,
        requestId: reference.requestId,
        result: res,
        subject: { mode: snapshot.mode, kind: snapshot.subjectKind, id: snapshot.subjectId },
      });
      if (confirmed) {
        toast.success(snapshot.mode === 'delete' ? 'Sujet supprimé.' : 'Sujet anonymisé.');
        // Une saisie différente appartient à un autre snapshot : elle n'est pas vidée.
        if (sameSnapshot(snapshot, formRef.current)) {
          setSubjectId('');
          setReason('');
          setResolverKey((key) => key + 1);
        }
      } else {
        toast.warning("Effacement enregistré, nettoyage incomplet — voir le rapport ci-dessous.");
      }
    } catch (err) {
      if (ownerIsCurrent(owner)) toast.error(strictErrorMessage(err, "Échec de l'effacement."));
    } finally {
      if (runRef.current === run) {
        runRef.current = null;
        setBusy(false);
        setConfirmation(null);
      }
    }
  }

  // Reprise explicite : référence persistée → lookup → RESUME du vrai operationId. Jamais de START.
  async function resumeCleanup(reference: RgpdStartReference) {
    const owner = ownerOf(useSessionStore.getState());
    if (!owner || runRef.current || resumeRef.current) return;
    const run = {};
    resumeRef.current = run;
    setResuming(true);
    const live = () => resumeRef.current === run && ownerIsCurrent(owner);
    try {
      const token = await readOwnerToken(owner);
      if (!live()) return;
      if (!token) {
        toast.error('Session expirée — reconnectez-vous.');
        return;
      }
      if (!referenceIsCurrent(owner, reference)) {
        toast.error('Échec de la reprise.');
        return;
      }
      const { operationId } = await lookupErasureStart(reference.requestId, token);
      if (!live()) return;
      if (!referenceIsCurrent(owner, reference)) {
        toast.error('Échec de la reprise.');
        return;
      }
      const res = await resumeErasureCleanup(operationId, token);
      if (!live()) return;
      if (!referenceIsCurrent(owner, reference)) {
        toast.error('Échec de la reprise.');
        return;
      }

      const confirmed = isConfirmedCompletion(res, reference.requestId, operationId);
      if (!isResultBoundToRequest(res, reference.requestId, operationId) || (res.status === 'completed' && !confirmed)) {
        toast.error('Échec de la reprise.');
        return;
      }
      if (confirmed) {
        const released = await releaseConfirmedStartReference({
          userId: owner.userId,
          reference,
          result: res,
          operationId,
          isCurrent: () => ownerIsCurrent(owner),
        });
        if (!live()) return;
        if (released) setRecovery(null);
        else if (!referenceIsCurrent(owner, reference)) return;
      }

      setDone((previous) => ({
        ownerKey: owner.key,
        requestId: reference.requestId,
        result: res,
        subject:
          previous?.ownerKey === owner.key && previous.requestId === reference.requestId &&
          previous.result.operationId.toLowerCase() === operationId.toLowerCase()
            ? previous.subject
            : null,
      }));
      if (confirmed) {
        toast.success('Nettoyage repris et terminé.');
      } else {
        toast.warning('Nettoyage repris — toujours incomplet, voir le rapport.');
      }
    } catch (err) {
      if (live()) toast.error(strictErrorMessage(err, 'Échec de la reprise.'));
    } finally {
      if (resumeRef.current === run) {
        resumeRef.current = null;
        setResuming(false);
      }
    }
  }

  // Tout état d'un autre compte/epoch est masqué dès ce rendu, sans attendre l'effet de reset.
  const visibleRecovery = recovery?.ownerKey === ownerKey ? recovery : null;
  const visibleDone = done?.ownerKey === ownerKey &&
    (!visibleRecovery || done.requestId === visibleRecovery.reference.requestId) ? done : null;
  const visibleConfirmation = confirmation?.owner.key === ownerKey ? confirmation : null;
  const dialogSnapshot = visibleConfirmation?.snapshot ?? currentSnapshot;
  const dialogIsDelete = dialogSnapshot.mode === 'delete';

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

      {visibleDone ? (
        <ErasureResultPanel
          result={visibleDone.result}
          mode={visibleDone.subject?.mode}
          subjectLabel={visibleDone.subject ? ERASURE_KIND_LABELS[visibleDone.subject.kind] : undefined}
          subjectId={visibleDone.subject?.id}
          reference={visibleRecovery?.reference.requestId}
          onResume={visibleRecovery ? () => resumeCleanup(visibleRecovery.reference) : undefined}
          resuming={resuming}
        />
      ) : (
        visibleRecovery &&
        !busy && (
          <ErasureResultPanel
            reference={visibleRecovery.reference.requestId}
            onResume={() => resumeCleanup(visibleRecovery.reference)}
            resuming={resuming}
          />
        )
      )}

      <ConfirmDialog
        open={visibleConfirmation !== null}
        tone={dialogIsDelete ? 'danger' : 'default'}
        title={dialogIsDelete ? 'Supprimer définitivement le sujet ?' : 'Anonymiser le sujet ?'}
        confirmLabel={dialogIsDelete ? 'Supprimer le sujet' : 'Anonymiser'}
        busy={busy}
        confirmGate={
          dialogIsDelete
            ? {
                expected: [dialogSnapshot.subjectId, 'SUPPRIMER'],
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
              Vous allez {dialogIsDelete ? <strong>supprimer définitivement</strong> : 'anonymiser'} le sujet
              ci-dessous. Cette action est journalisée{dialogIsDelete ? ' et irréversible' : ''}.
            </span>
            <span className="block space-y-1 rounded-shellMd border border-line bg-bgTint p-2 text-xs">
              <span className="flex justify-between gap-2">
                <span className="text-ink-2">Type</span>
                <span className="text-right text-ink">{ERASURE_KIND_LABELS[dialogSnapshot.subjectKind]}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span className="text-ink-2">Identifiant</span>
                <span className="break-all text-right font-mono text-ink">{dialogSnapshot.subjectId}</span>
              </span>
              <span className="flex justify-between gap-2">
                <span className="text-ink-2">Mode</span>
                <span className={dialogIsDelete ? 'font-medium text-danger-ink' : 'font-medium text-teal'}>
                  {dialogIsDelete ? 'Suppression dure' : 'Anonymisation'}
                </span>
              </span>
            </span>
          </span>
        }
        onCancel={() => setConfirmation(null)}
        onConfirm={runErasure}
      />
    </main>
  );
}
