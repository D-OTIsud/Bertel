export type EditorToolKey = 'versions' | 'import-export' | 'archive' | 'delete';

export interface EditorToolItem {
  key: EditorToolKey;
  label: string;
  stat?: string;
  disabled: boolean;
  disabledReason?: string;
  danger?: boolean;
}

export interface BuildEditorToolsInput {
  /** Lifecycle status from editor.draft.generalInfo.status. */
  status: string;
  /** permissions.publication.canDirectWrite — gates archive/restore. */
  canArchive: boolean;
  /** permissions.publication.disabledReason — shown when canArchive is false. */
  archiveDisabledReason?: string | null;
  /** object.current_version (from the versions query). When set, the history tool is enabled. */
  currentVersion?: number | null;
  /** §108: hard delete (superuser-only). When falsy the delete tool is omitted entirely. */
  canHardDelete?: boolean;
}

const SOON = 'Bientôt disponible';

/** Restore target mirrors api.rpc_set_object_status's state machine (computeStatusActions). */
export function archiveTargetStatus(status: string, publishedAt: string): 'archived' | 'hidden' | 'draft' {
  if (status === 'archived') {
    return publishedAt ? 'hidden' : 'draft';
  }
  return 'archived';
}

/** Single source of truth for the OUTILS group. Duplicate tool intentionally absent (PO, 2026-06-17). */
export function buildEditorTools(input: BuildEditorToolsInput): EditorToolItem[] {
  const isArchived = input.status === 'archived';
  const tools: EditorToolItem[] = [
    {
      key: 'versions',
      label: 'Versions / historique',
      disabled: input.currentVersion == null,
      disabledReason: input.currentVersion == null ? SOON : undefined,
      stat: input.currentVersion == null ? undefined : `v${input.currentVersion}`,
    },
    // Tranche E — frontend-only tool (JSON/CSV/PDF export + JSON import onto the draft); no gate.
    { key: 'import-export', label: 'Import / export', disabled: false },
    {
      key: 'archive',
      label: isArchived ? 'Restaurer' : 'Archiver',
      danger: !isArchived,
      disabled: !input.canArchive,
      disabledReason: input.canArchive ? undefined : (input.archiveDisabledReason ?? 'Lecture seule — publication.'),
    },
  ];
  // §108 — suppression définitive : superuser-only, et seulement sur une fiche déjà archivée.
  if (input.canHardDelete) {
    tools.push({
      key: 'delete',
      label: 'Supprimer définitivement',
      danger: true,
      disabled: !isArchived,
      disabledReason: isArchived
        ? undefined
        : "Archivez d'abord la fiche avant de pouvoir la supprimer définitivement.",
    });
  }
  return tools;
}
