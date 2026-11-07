// Callout — encart sémantique réutilisable (RGPD refonte §p2). Variantes info/warn/danger,
// pilotées par les familles de tokens `info`/`warn`/`danger` (styles.css + tailwind.config).
// Slots : icon, title, children, chips. `role="note"` pour les lecteurs d'écran.

import type { ReactNode } from 'react';

export type CalloutVariant = 'info' | 'warn' | 'danger';

const VARIANT: Record<CalloutVariant, { box: string; icon: string; chip: string }> = {
  info: { box: 'bg-info-bg border-info-border text-info-ink', icon: 'text-info-accent', chip: 'border-info-border' },
  warn: { box: 'bg-warn-bg border-warn-border text-warn-ink', icon: 'text-warn-strong', chip: 'border-warn-border' },
  danger: {
    box: 'bg-danger-bg border-danger-border text-danger-ink',
    icon: 'text-danger-strong',
    chip: 'border-danger-border',
  },
};

export interface CalloutChip {
  icon?: ReactNode;
  label: ReactNode;
}

export function Callout({
  variant = 'info',
  title,
  icon,
  chips,
  ariaLabel,
  children,
}: {
  variant?: CalloutVariant;
  title?: ReactNode;
  icon?: ReactNode;
  chips?: CalloutChip[];
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const v = VARIANT[variant];
  return (
    <div role="note" aria-label={ariaLabel} className={`rounded-shellXl border p-3 ${v.box}`}>
      <div className="flex gap-2.5">
        {icon && (
          <span className={`mt-0.5 shrink-0 ${v.icon}`} aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0 space-y-1.5">
          {title && <p className="text-sm font-semibold leading-snug">{title}</p>}
          {children && <div className="text-[13px] leading-relaxed">{children}</div>}
          {chips && chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-0.5">
              {chips.map((chip, index) => (
                <li
                  key={index}
                  className={`inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs font-medium ${v.chip}`}
                >
                  {chip.icon && (
                    <span aria-hidden className={v.icon}>
                      {chip.icon}
                    </span>
                  )}
                  <span>{chip.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
