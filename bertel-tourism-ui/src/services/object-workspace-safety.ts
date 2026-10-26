import type { WorkspaceModuleId } from './object-workspace';

// A missing compliance summary is a display limitation, not a failed legal-record read.
// Keep this precise exception shared with the loader; other legal failures still block saves.
export const LEGAL_SUMMARY_UNAVAILABLE = 'Le resume de conformite n est pas completement expose pour ce profil.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Client-side loss prevention, never an authorization or complete-read proof. */
export function workspaceSaveBlockedReason(module: WorkspaceModuleId, value: unknown): string | null {
  if (!isRecord(value)) return 'Les données de cette section ne sont pas chargées. Rechargez la fiche avant de sauvegarder.';
  if (typeof value.unavailableReason === 'string' && value.unavailableReason
    && !(module === 'legal' && value.unavailableReason === LEGAL_SUMMARY_UNAVAILABLE)) {
    return value.unavailableReason;
  }

  const collections: Partial<Record<WorkspaceModuleId, string[]>> = {
    rooms: ['items'], 'meeting-rooms': ['items'], menus: ['items'], places: ['items'],
    openings: ['periods'], pricing: ['prices', 'discounts'], legal: ['records'],
  };
  const required = collections[module] ?? [];
  if (required.some((key) => !Array.isArray(value[key]))) {
    return 'Les données de cette section sont incomplètes. Rechargez la fiche avant de sauvegarder.';
  }
  const items = Array.isArray(value.items) ? value.items : [];
  const childKeys = module === 'rooms' ? ['amenityCodes', 'mediaIds', 'beds']
    : module === 'meeting-rooms' ? ['equipmentCodes'] : module === 'menus' ? ['items'] : [];
  if (childKeys.length && items.some((item) => !isRecord(item) || childKeys.some((key) => !Array.isArray(item[key])))) {
    return 'Les données associées à cette section sont incomplètes. Rechargez la fiche avant de sauvegarder.';
  }
  if (module === 'menus' && items.some((menu) => (menu.items as unknown[]).some((item) =>
    !isRecord(item) || ['mediaIds', 'dietaryTagCodes', 'allergenCodes', 'cuisineTypeCodes'].some((key) => !Array.isArray(item[key]))))) {
    return 'Les données associées aux plats sont incomplètes. Rechargez la fiche avant de sauvegarder.';
  }
  return null;
}

export function assertWorkspaceSaveAvailable(module: WorkspaceModuleId, value: unknown): void {
  const reason = workspaceSaveBlockedReason(module, value);
  if (reason) throw new Error(reason);
}

/** Null/malformed/error responses must not turn into a successfully loaded empty collection. */
export function workspaceReadRows(
  result: PromiseSettledResult<{ data: unknown; error: unknown }>,
): Record<string, unknown>[] | null {
  if (result.status !== 'fulfilled' || result.value.error || !Array.isArray(result.value.data)
    || !result.value.data.every(isRecord)) return null;
  return result.value.data;
}

/** Detect known rows lost between two reads. Rows hidden in BOTH reads remain unknowable here. */
export function knownWorkspaceIdsPresent(
  reference: readonly { recordId: string | null }[],
  rows: readonly Record<string, unknown>[],
): boolean {
  const ids = new Set(rows.map((row) => row.id));
  return rows.every((row) => typeof row.id === 'string' && row.id.length > 0)
    && ids.size === rows.length
    && reference.every((item) => !item.recordId || ids.has(item.recordId));
}
