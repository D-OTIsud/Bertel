/**
 * §46 disabled-with-reason banner for the 6 type-gated workspace modules
 * (rooms / meetingRooms / menus / activity / event / itinerary).
 * Rendered INSTEAD of the module's editable controls when `unavailableReason`
 * is set — the saver throws on that reason, so showing it here surfaces the
 * gate BEFORE save instead of a generic "section en échec" afterwards.
 */
export function ModuleUnavailableNotice({ reason }: { reason: string }) {
  return (
    <p
      role="status"
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
      <strong style={{ color: 'var(--ink-3)' }}>Module désactivé.</strong> {reason}
    </p>
  );
}
