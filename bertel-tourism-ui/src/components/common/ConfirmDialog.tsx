'use client';

// Phase 7 — ConfirmDialog MAISON partagé (vocabulaire de l'app), bâti sur le `Modal` maison.
// Pour les actions destructives / irréversibles des surfaces admin (/settings, /équipe,
// référentiels, /rgpd) : remplace les `window.confirm` natifs et le ConfirmDialog scopé
// `.object-editor` (qui dépend de classes `.btn` indisponibles hors éditeur). Un seul design
// system app-wide.

import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'default',
  busy = false,
  confirmGate,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  /** Phrase explicite décrivant exactement ce que l'action va faire. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` ⇒ bouton de confirmation rouge (suppression / désactivation). */
  tone?: 'default' | 'danger';
  /** Désactive les boutons pendant le traitement. */
  busy?: boolean;
  /**
   * P1-i1 — garde « saisie-pour-confirmer » proportionnée au risque (RGPD suppression dure) :
   * tant que la saisie (trim) ne figure pas exactement dans `expected`, le bouton de confirmation
   * reste désactivé. Absent ⇒ confirmation simple (cas réversible). Comparaison sensible à la casse
   * (le mot-clé `SUPPRIMER` doit être tapé tel quel).
   */
  confirmGate?: { expected: string[]; label: ReactNode };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [gateValue, setGateValue] = useState('');
  // Réinitialise la saisie à la fermeture pour que la prochaine ouverture reparte propre.
  useEffect(() => {
    if (!open) setGateValue('');
  }, [open]);

  if (!open) return null;

  const gatePass =
    !confirmGate ||
    confirmGate.expected.some((candidate) => {
      const trimmed = candidate.trim();
      return trimmed !== '' && trimmed === gateValue.trim();
    });
  const confirmDisabled = busy || !gatePass;

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'primary-button primary-button--danger' : 'primary-button'}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
      {confirmGate && (
        <div className="mt-3 space-y-1">
          <label htmlFor="confirm-gate-input" className="block text-sm font-medium text-ink-2">
            {confirmGate.label}
          </label>
          <input
            id="confirm-gate-input"
            value={gateValue}
            onChange={(event) => setGateValue(event.target.value)}
            aria-describedby="confirm-gate-hint"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-shellLg border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
          />
          <p
            id="confirm-gate-hint"
            aria-live="polite"
            className={gatePass ? 'text-xs font-medium text-brand-green' : 'text-xs text-ink-2'}
          >
            {gatePass ? '✓ Confirmation validée.' : 'La saisie doit correspondre exactement.'}
          </p>
        </div>
      )}
    </Modal>
  );
}
