'use client';

// P1-i2 — sélecteur de mode à escalade visuelle. Deux cartes-option (radiogroup) : « Anonymiser »
// (teal, Recommandé) et « Supprimer définitivement » (rouge danger, Irréversible). L'escalade ne
// repose JAMAIS que sur la couleur : badge texte + icône + libellé la portent aussi (WCAG 1.4.1).
// Présentational pur — aucune logique d'effacement ici.

import { AlertTriangle, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { ErasureMode } from '@/services/rgpd';

interface ModeOption {
  value: ErasureMode;
  Icon: LucideIcon;
  title: string;
  badge: string;
  desc: string;
}

const MODES: ModeOption[] = [
  {
    value: 'anonymize',
    Icon: ShieldCheck,
    title: 'Anonymiser',
    badge: 'Recommandé',
    desc: 'Conserve la structure (liens préservés). La PII du sujet est neutralisée.',
  },
  {
    value: 'delete',
    Icon: Trash2,
    title: 'Supprimer définitivement',
    badge: 'Irréversible',
    desc: 'Cascade dure — supprime le sujet et ses données liées.',
  },
];

export function ModeSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: ErasureMode;
  onChange: (mode: ErasureMode) => void;
  disabled?: boolean;
}) {
  function select(mode: ErasureMode) {
    if (!disabled) onChange(mode);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    // Deux options seulement : toute flèche bascule vers l'autre mode.
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      select(value === 'anonymize' ? 'delete' : 'anonymize');
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Mode d'effacement"
      className="grid gap-2 sm:grid-cols-2"
      onKeyDown={handleKeyDown}
    >
      {MODES.map((mode) => {
        const checked = value === mode.value;
        const danger = mode.value === 'delete';
        const cardTone = checked
          ? danger
            ? 'border-danger-strong bg-danger-bg'
            : 'border-teal bg-teal-tint'
          : 'border-line bg-surface hover:border-lineStrong';
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => select(mode.value)}
            className={`flex min-h-[44px] flex-col gap-1 rounded-shellLg border p-3 text-left transition-colors ${cardTone} ${
              disabled ? 'opacity-60' : ''
            }`}
          >
            <span className="flex items-center gap-2">
              <mode.Icon
                size={16}
                aria-hidden
                className={checked ? (danger ? 'text-danger-strong' : 'text-teal') : 'text-ink-3'}
              />
              <span className="text-sm font-semibold text-ink">{mode.title}</span>
              <span
                className={`ml-auto inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium ${
                  danger ? 'border-danger-border text-danger-ink' : 'border-teal text-teal'
                }`}
              >
                {danger && <AlertTriangle size={11} aria-hidden />}
                {mode.badge}
              </span>
            </span>
            <span className="text-xs text-ink-2">{mode.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
