import type { ReactNode } from 'react';

/**
 * §46 disabled-with-reason banner for the 6 type-gated workspace modules
 * (rooms / meetingRooms / menus / activity / event / itinerary).
 * Rendered INSTEAD of the module's editable controls when `unavailableReason`
 * is set — the saver throws on that reason, so showing it here surfaces the
 * gate BEFORE save instead of a generic "section en échec" afterwards.
 *
 * role="note": static advisory content — not a live region (role="status"
 * would announce on initial render, which is unhelpful here). The loader
 * also reuses unavailableReason for transient fetch failures; "désactivé"
 * would claim a deliberate gate in those cases, so the prefix is "indisponible".
 */
export function ModuleUnavailableNotice({ reason }: { reason: string }) {
  return (
    <p
      role="note"
      style={{
        fontSize: 12,
        color: 'var(--ink-4)',
        margin: '0 0 12px',
        padding: '8px 12px',
        borderRadius: 'var(--r-md)',
        background: 'var(--bg-tint)',
        border: '1px solid var(--line-soft)',
      }}
    >
      <strong style={{ color: 'var(--ink-3)' }}>Module indisponible.</strong> {reason}
    </p>
  );
}

/**
 * Confirme à l'auteur ce qu'implique une bascule binaire, en clair, au moment où il la coche.
 * role="status" : l'encart apparaît APRÈS le rendu initial (suite à un clic), donc l'annoncer
 * est utile (contrairement à ModuleUnavailableNotice qui est statique au montage).
 */
export function ChoiceConfirmationNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      style={{
        fontSize: 12,
        color: 'var(--ink-3)',
        margin: '12px 0 0',
        padding: '8px 12px',
        borderRadius: 'var(--r-md)',
        background: 'var(--bg-tint)',
        borderLeft: '3px solid var(--accent)',
      }}
    >
      {children}
    </p>
  );
}

/** §48 single-owner rule: a concept is editable in exactly ONE section; the §05 copy points there. */
export function OwnedElsewhereNote({ num, label, summary }: { num: string; label: string; summary?: string }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '4px 0 12px' }}>
      {summary ? <>{summary} · </> : null}Géré dans la section {num} — {label}.
    </p>
  );
}
