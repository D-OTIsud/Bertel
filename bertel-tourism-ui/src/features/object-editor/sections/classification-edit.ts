import type {
  ObjectWorkspaceDistinctionGroup,
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionSchemeOption,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

/**
 * Pure helpers for the §08 Classifications & distinctions editor.
 *
 * The distinctions module stores one `object_classification` row per held
 * (scheme, value). The editor manipulates a FLAT list of items (add / edit /
 * delete) and regroups before writing it back to the module — the saver only
 * cares about the flattened union, so grouping is purely a storage detail.
 */

/**
 * Canonical object_classification.status lifecycle (OBJECT_DATA_DICTIONARY.md):
 * granted/requested/suspended/expired. The legacy 'active'/'pending'/'revoked' aliases
 * are NEVER written — every backend label read/filter gates on status='granted', so a
 * non-canonical status makes an editor-authored label invisible. See decision log §30/§31.
 */
export const CLASSIFICATION_STATUS_OPTIONS: readonly { v: string; l: string }[] = [
  { v: 'granted', l: 'Accordée' },
  { v: 'requested', l: 'En cours / demande' },
  { v: 'suspended', l: 'Retirée' },
  { v: 'expired', l: 'Expirée' },
];

/** A blank distinction draft for the "add" modal — defaults to the canonical granted status. */
export function createClassificationDraft(): ObjectWorkspaceDistinctionItem {
  return {
    recordId: null,
    schemeId: '',
    schemeCode: '',
    schemeLabel: '',
    valueId: '',
    valueCode: '',
    valueLabel: '',
    status: 'granted',
    awardedAt: '',
    validUntil: '',
    disabilityTypesCovered: [],
  };
}

/** Regroup a flat item list into per-scheme groups (the module's storage form). */
export function regroupDistinctionItems(
  items: readonly ObjectWorkspaceDistinctionItem[],
): ObjectWorkspaceDistinctionGroup[] {
  const groups: ObjectWorkspaceDistinctionGroup[] = [];
  const byCode = new Map<string, ObjectWorkspaceDistinctionGroup>();
  for (const item of items) {
    let group = byCode.get(item.schemeCode);
    if (!group) {
      group = { schemeCode: item.schemeCode, schemeLabel: item.schemeLabel, items: [] };
      byCode.set(item.schemeCode, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/**
 * Whether a scheme can no longer be added: a single-selection scheme is full once
 * it holds any row; a multi-selection scheme is full only when every value is taken.
 */
export function isSchemeFullyUsed(
  scheme: ObjectWorkspaceDistinctionSchemeOption,
  items: readonly ObjectWorkspaceDistinctionItem[],
): boolean {
  const used = items.filter((item) => item.schemeCode === scheme.code);
  if (scheme.selectionMode === 'single') {
    return used.length > 0;
  }
  return scheme.valueOptions.length > 0 && used.length >= scheme.valueOptions.length;
}

/**
 * Value options still selectable for a scheme — excludes values already taken by
 * other rows. `currentValueCode` (the row being edited) stays selectable.
 */
export function availableValueOptions(
  scheme: ObjectWorkspaceDistinctionSchemeOption,
  items: readonly ObjectWorkspaceDistinctionItem[],
  currentValueCode = '',
): WorkspaceReferenceOption[] {
  const taken = new Set(
    items
      .filter((item) => item.schemeCode === scheme.code && item.valueCode !== currentValueCode)
      .map((item) => item.valueCode),
  );
  return scheme.valueOptions.filter((value) => !taken.has(value.code));
}
