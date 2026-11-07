'use client';

// P3-i2 — panneau de résultat structuré (remplace le JSON.stringify brut). En-tête dont le
// titre/l'icône dépendent de `result.status` (jamais un succès de façade quand une tâche de
// nettoyage n'est pas acquittée ou qu'un document personnel reste retenu ailleurs), stats
// chiffrées, alertes en chips Callout, bouton de reprise explicite, JSON brut replié.
// `role="status"` + aria-live pour annoncer l'achèvement aux lecteurs d'écran.

import { AlertTriangle, CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react';
import { Callout } from '@/components/ui/Callout';
import type { ErasureMode, ErasureResult } from '@/services/rgpd';

export function ErasureResultPanel({
  result,
  mode,
  subjectLabel,
  subjectId,
  onResume,
  resuming,
}: {
  result: ErasureResult;
  mode: ErasureMode;
  subjectLabel: string;
  subjectId: string;
  onResume?: () => void;
  resuming?: boolean;
}) {
  const isComplete = result.status === 'completed';
  const title = isComplete
    ? mode === 'delete'
      ? 'Sujet supprimé'
      : 'Sujet anonymisé'
    : result.status === 'partial'
      ? 'Effacement partiel — nettoyage incomplet'
      : "Échec du nettoyage — l'effacement en base a eu lieu, le nettoyage non";
  const manualReview = result.report.manualReviewRequired === true;
  const authRetained = result.report.authRetained === true;
  // Le statut auth ne se lit PLUS sur un champ posé à l'instant de l'appel (`authRetained` false
  // n'a jamais existé pour delete : voir le RPC) — il se dérive de la tâche auth_delete réelle,
  // seule source de vérité sur ce qui a effectivement eu lieu.
  const authDeleteTask = result.tasks.find((t) => t.action === 'auth_delete');
  const authStatusLabel = authRetained
    ? 'Conservé — profil anonymisé seulement'
    : authDeleteTask
      ? authDeleteTask.status === 'succeeded'
        ? 'Supprimé'
        : authDeleteTask.status === 'failed'
          ? 'Suppression demandée — échouée, à reprendre'
          : 'Suppression demandée — en cours'
      : null;

  const stats: { label: string; value: string | number }[] = [
    { label: 'Tâches acquittées', value: `${result.counts.succeeded}/${result.counts.total}` },
    { label: 'En attente', value: result.counts.pending },
    { label: 'Échouées', value: result.counts.failed },
    { label: 'Documents retenus', value: typeof result.report.retainedSharedDocuments === 'number' ? result.report.retainedSharedDocuments : 0 },
  ];

  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-shellXl border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        {isComplete ? (
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand-green" aria-hidden />
        ) : (
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        )}
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-ink-2">
            Opération tracée au registre des effacements (operationId ci-dessous) — journal d&apos;audit rédigé pour les
            champs attribuables à ce sujet, pas une purge globale.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-shellLg border border-line bg-bgTint p-2 text-center">
            <dt className="text-xs text-ink-2">{stat.label}</dt>
            <dd className="text-base font-semibold text-ink">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">Sujet</dt>
          <dd className="text-right text-ink">{subjectLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">Identifiant</dt>
          <dd className="break-all text-right font-mono text-xs text-ink">{subjectId}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">Mode</dt>
          <dd className="text-right text-ink">{mode === 'delete' ? 'Suppression dure' : 'Anonymisation'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-2">operationId</dt>
          <dd className="break-all text-right font-mono text-xs text-ink">{result.operationId}</dd>
        </div>
        {authStatusLabel && (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Compte auth</dt>
            <dd className="text-right text-ink">{authStatusLabel}</dd>
          </div>
        )}
      </dl>

      {result.cleanupStatusUnavailable && (
        <Callout
          variant="warn"
          ariaLabel="Statut de nettoyage non confirmé"
          icon={<AlertTriangle size={16} />}
          title="Statut non confirmé"
        >
          L&apos;effacement a été enregistré (operationId ci-dessus), mais son statut de nettoyage n&apos;a pas pu être
          rechargé pour confirmation. Reprenez l&apos;opération pour vérifier son état réel.
        </Callout>
      )}
      {manualReview && (
        <Callout variant="warn" ariaLabel="Revue manuelle requise" icon={<AlertTriangle size={16} />} title="Document(s) personnel(s) retenu(s)">
          Au moins un document reste référencé ailleurs (promu, pièce légale/label en cours…) et n&apos;a pas été
          supprimé — une revue manuelle est requise avant de le considérer réglé.
        </Callout>
      )}
      {result.counts.failed > 0 && (
        <Callout variant="danger" ariaLabel="Tâches échouées" icon={<ShieldAlert size={16} />} title="Nettoyage incomplet">
          {result.counts.failed} tâche(s) de nettoyage ont échoué. Reprenez l&apos;opération avec l&apos;operationId
          ci-dessus.
        </Callout>
      )}
      {!isComplete && onResume && (
        <button
          type="button"
          onClick={onResume}
          disabled={resuming}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-shellLg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-bgTint disabled:opacity-50"
        >
          <RotateCcw size={16} aria-hidden />
          {resuming ? 'Reprise en cours…' : "Reprendre le nettoyage de cette opération"}
        </button>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-3">Détail technique (rapport JSON)</summary>
        <pre className="mt-2 overflow-x-auto rounded-shellMd bg-bgTint p-2 text-xs text-ink-2">
          {JSON.stringify(result.report, null, 2)}
        </pre>
      </details>
    </div>
  );
}
