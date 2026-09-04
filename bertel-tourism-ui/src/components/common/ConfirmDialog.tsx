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
  attestation,
  className,
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
  /**
   * 18a/D9 — DÉCLARATION cochée, distincte de la confirmation. Le serveur ne peut pas vérifier
   * un report fait à la main dans l'éditeur ; il ne peut que l'IMPUTER (attested_by/attested_at).
   * L'écran est donc la seule vraie garde : l'attestation doit demander un geste propre, jamais
   * être l'effet de bord d'un clic sur le bouton de confirmation. `required` verrouille la
   * confirmation tant que la case n'est pas cochée, et `hint` DIT pourquoi (une case grisée sans
   * raison se lit comme une panne).
   */
  attestation?: {
    label: ReactNode;
    checked: boolean;
    onChange: (next: boolean) => void;
    required?: boolean;
    hint?: ReactNode;
  };
  /**
   * Classe posée sur la CARTE de la fenêtre. `Modal` fait un `createPortal` vers
   * `document.body` : la fenêtre n'est donc descendante d'aucun conteneur d'écran, et une
   * surface qui relève ses tailles (le portail partenaire : boutons 48 px, texte 1.05 rem)
   * n'atteindrait jamais ses boutons sans ce crochet. Envelopper le message ne suffit pas —
   * le pied vit hors du corps.
   */
  className?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [gateValue, setGateValue] = useState('');
  // Réinitialise la saisie à la fermeture pour que la prochaine ouverture reparte propre.
  useEffect(() => {
    if (!open) setGateValue('');
  }, [open]);

  const gatePass =
    !confirmGate ||
    confirmGate.expected.some((candidate) => {
      const trimmed = candidate.trim();
      return trimmed !== '' && trimmed === gateValue.trim();
    });
  // 18a/D9 : une attestation `required` non cochée bloque au même titre qu'un gate manqué.
  const attestationMissing = Boolean(attestation?.required) && !attestation?.checked;
  const confirmBlocked = busy || !gatePass || attestationMissing;
  // D10/A4 : la raison du blocage reste joignable — « en cours » (sr-only), le hint du gate,
  // ou celui de l'attestation.
  const confirmReasonId = busy
    ? 'confirm-busy-reason'
    : confirmGate && !gatePass
      ? 'confirm-gate-hint'
      : attestationMissing
        ? 'confirm-attestation-hint'
        : undefined;

  return (
    <Modal
      title={title}
      open={open}
      className={className}
      onOpenChange={(next) => { if (!next) onCancel(); }}
      footer={
        <>
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          {busy && (
            <span id="confirm-busy-reason" className="sr-only">
              Traitement en cours…
            </span>
          )}
          <button
            type="button"
            className={tone === 'danger' ? 'primary-button primary-button--danger' : 'primary-button'}
            aria-disabled={confirmBlocked || undefined}
            aria-describedby={confirmReasonId}
            onClick={() => {
              if (confirmBlocked) return;
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
      {attestation && (
        <div className="confirm-attestation">
          <label htmlFor="confirm-attestation-input" className="confirm-attestation__label">
            <input
              id="confirm-attestation-input"
              type="checkbox"
              checked={attestation.checked}
              onChange={(event) => attestation.onChange(event.target.checked)}
              aria-describedby={attestation.hint ? 'confirm-attestation-hint' : undefined}
            />
            <span>{attestation.label}</span>
          </label>
          {attestation.hint && (
            <p id="confirm-attestation-hint" className="confirm-attestation__hint" aria-live="polite">
              {attestation.hint}
            </p>
          )}
        </div>
      )}
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
