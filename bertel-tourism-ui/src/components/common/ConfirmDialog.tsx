'use client';

// Phase 7 — ConfirmDialog MAISON partagé (vocabulaire de l'app), bâti sur le `Modal` maison.
// Pour les actions destructives / irréversibles des surfaces admin (/settings, /équipe,
// référentiels, /rgpd) : remplace les `window.confirm` natifs et le ConfirmDialog scopé
// `.object-editor` (qui dépend de classes `.btn` indisponibles hors éditeur). Un seul design
// system app-wide.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

/** Keep nested editor confirmations in the same Radix focus/dismissal stack. */
function EditorConfirmShell({ open, title, className, onOpenChange, footer, children }: {
  open: boolean; title: string; className?: string;
  onOpenChange: (open: boolean) => void; footer: ReactNode; children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const scope = useRef<HTMLElement | null>(null);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`object-editor${className ? ` ${className}` : ''}`}
      onOpenAutoFocus={(event) => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        scope.current = opener.current?.closest('section') ?? null;
        const cancel = event.target instanceof HTMLElement ? event.target.querySelector<HTMLButtonElement>('[data-confirm-cancel]:not([disabled])') : null;
        if (cancel) { event.preventDefault(); cancel.focus(); }
      }}
      onCloseAutoFocus={(event) => {
        const target = opener.current?.isConnected ? opener.current
          : scope.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]');
        if (target?.isConnected) { event.preventDefault(); target.focus(); }
      }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      {children}
      <DialogFooter>{footer}</DialogFooter>
    </DialogContent>
  </Dialog>;
}

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
  appearance = 'default',
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
  /** Reuse the editor's Radix shell while sharing confirmation content and guards. */
  appearance?: 'default' | 'editor';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [gateValue, setGateValue] = useState('');
  // 18a/D9 — « on a cliqué alors que c'était bloqué ». Sans cet état, un clic sur un bouton
  // verrouillé ne produit AUCUN changement visible : le hint est là depuis l'ouverture, donc
  // `aria-live` n'annonce rien et l'écran a l'air en panne. C'est le clic qui doit provoquer
  // la réponse, pas le montage.
  const [blockedAttempt, setBlockedAttempt] = useState(false);
  // Deux ConfirmDialog coexistent pendant le fondu de sortie : des id figés se dupliqueraient
  // dans le document, et `htmlFor` pointerait sur la mauvaise case.
  const fieldId = useId();
  const attestationInputId = `${fieldId}-attestation`;
  const attestationHintId = `${fieldId}-attestation-hint`;
  // Réinitialise la saisie à la fermeture pour que la prochaine ouverture reparte propre.
  useEffect(() => {
    if (!open) {
      setGateValue('');
      setBlockedAttempt(false);
    }
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
        ? attestationHintId
        : undefined;
  const Shell = appearance === 'editor' ? EditorConfirmShell : Modal;

  return (
    <Shell
      title={title}
      open={open}
      className={className}
      onOpenChange={(next) => { if (!next) onCancel(); }}
      footer={
        <>
          <button type="button" data-confirm-cancel className={appearance === 'editor' ? 'btn' : 'ghost-button'} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          {busy && (
            <span id="confirm-busy-reason" className="sr-only">
              Traitement en cours…
            </span>
          )}
          <button
            type="button"
            className={appearance === 'editor' ? (tone === 'danger' ? 'btn danger' : 'btn primary') : (tone === 'danger' ? 'primary-button primary-button--danger' : 'primary-button')}
            aria-disabled={confirmBlocked || undefined}
            aria-describedby={confirmReasonId}
            onClick={() => {
              if (confirmBlocked) {
                setBlockedAttempt(true);
                return;
              }
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {appearance === 'editor'
        ? <DialogDescription asChild><p className="confirm-dialog__message">{message}</p></DialogDescription>
        : <p className="confirm-message">{message}</p>}
      {attestation && (
        <div className="confirm-attestation">
          <label htmlFor={attestationInputId} className="confirm-attestation__label">
            <input
              id={attestationInputId}
              type="checkbox"
              checked={attestation.checked}
              onChange={(event) => {
                // Cocher lève le blocage : la réponse au clic refusé n'a plus lieu d'être.
                if (event.target.checked) setBlockedAttempt(false);
                attestation.onChange(event.target.checked);
              }}
              aria-describedby={attestation.hint ? attestationHintId : undefined}
            />
            <span>{attestation.label}</span>
          </label>
          {attestation.hint && (
            <p id={attestationHintId} className="confirm-attestation__hint">
              {attestation.hint}
            </p>
          )}
          {/* Élément NÉ du clic refusé — c'est lui, et non le hint permanent, qui prouve que
              l'écran a réagi (et qu'un lecteur d'écran l'annonce). */}
          {blockedAttempt && attestationMissing && (
            <p className="confirm-attestation__blocked" role="alert">
              Cochez la certification ci-dessus pour pouvoir valider.
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
    </Shell>
  );
}
