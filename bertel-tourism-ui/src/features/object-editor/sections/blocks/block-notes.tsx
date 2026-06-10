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
