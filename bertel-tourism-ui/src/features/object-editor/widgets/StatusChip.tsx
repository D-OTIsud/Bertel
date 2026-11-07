const STATUS_PILL: Record<string, { tone: 'ok' | 'warn'; label: string }> = {
  published: { tone: 'ok', label: 'Publié — en ligne' },
  draft: { tone: 'warn', label: 'Brouillon' },
  hidden: { tone: 'warn', label: 'Hors ligne' },
  archived: { tone: 'warn', label: 'Archivé' },
};

/**
 * Persistent publication-status indicator at the top of the editor rail.
 * Display-only — the lifecycle is managed in §21 Publication (gated by `publish_object`).
 * Moved out of §01 Identité so the status is visible from every section.
 */
export function StatusChip({ status }: { status: string }) {
  const pill = STATUS_PILL[status] ?? { tone: 'warn' as const, label: status };
  return (
    <div className="edit-side__status">
      <span className="edit-side__status-label">Statut</span>
      <span className="edit-side__status-value">
        <span
          className={`identity-status__dot identity-status__dot--${status}`}
          aria-hidden="true"
        />
        <span className={`fs-pill ${pill.tone}`}>{pill.label}</span>
      </span>
    </div>
  );
}
