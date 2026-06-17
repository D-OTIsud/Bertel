export type EditorToolKey = 'versions' | 'import-export' | 'archive';

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
  return [
    {
      key: 'versions',
      label: 'Versions / historique',
      disabled: input.currentVersion == null,
      disabledReason: input.currentVersion == null ? SOON : undefined,
      stat: input.currentVersion == null ? undefined : `v${input.currentVersion}`,
    },
    { key: 'import-export', label: 'Import / export', disabled: true, disabledReason: SOON },
    {
      key: 'archive',
      label: isArchived ? 'Restaurer' : 'Archiver',
      danger: !isArchived,
      disabled: !input.canArchive,
      disabledReason: input.canArchive ? undefined : (input.archiveDisabledReason ?? 'Lecture seule — publication.'),
    },
  ];
}
