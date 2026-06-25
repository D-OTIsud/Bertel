'use client';

// P3-i2 — panneau de résultat structuré (remplace le JSON.stringify brut). En-tête succès,
// stats chiffrées, lignes clé/valeur, alertes en chips Callout (warn/danger), JSON brut replié.
// `role="status"` + aria-live pour annoncer l'achèvement aux lecteurs d'écran.

import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Callout } from '@/components/ui/Callout';
import type { ErasureMode, ErasureResult } from '@/services/rgpd';

export function ErasureResultPanel({
  result,
  mode,
  subjectLabel,
  subjectId,
}: {
  result: ErasureResult;
  mode: ErasureMode;
  subjectLabel: string;
  subjectId: string;
}) {
  const title = mode === 'delete' ? 'Sujet supprimé' : 'Sujet anonymisé';
  const rowsKey = mode === 'delete' ? 'rows_deleted' : 'rows_anonymized';
  const rowsRaw = result.report[rowsKey];
  const rowsValue = typeof rowsRaw === 'number' ? rowsRaw : '—';

  const stats: { label: string; value: string | number }[] = [
    { label: mode === 'delete' ? 'Lignes supprimées' : 'Lignes anonymisées', value: rowsValue },
    { label: 'Fichiers supprimés', value: result.storageDeleted.length },
    { label: 'Compte auth', value: result.authUserDeleted ? 'Supprimé' : '—' },
  ];

  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-shellXl border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand-green" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-ink-2">
            Opération tracée au registre des effacements. Journal d&apos;audit purgé de la PII.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
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
          <dt className="text-ink-2">Journal d&apos;audit</dt>
          <dd className="text-right text-ink">PII purgée</dd>
        </div>
      </dl>

      {result.storageError && (
        <Callout
          variant="warn"
          ariaLabel="Avertissement stockage"
          icon={<AlertTriangle size={16} />}
          title="Stockage : nettoyage incomplet"
        >
          {result.storageError} — les fichiers restants seront repris par le GC.
        </Callout>
      )}
      {result.authError && (
        <Callout
          variant="danger"
          ariaLabel="Échec compte"
          icon={<ShieldAlert size={16} />}
          title="Compte d'authentification : action manuelle requise"
        >
          {result.authError}
        </Callout>
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
