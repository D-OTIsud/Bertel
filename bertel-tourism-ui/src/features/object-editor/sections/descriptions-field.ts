import type { WorkspaceTranslatableField } from '../../../services/object-workspace-parser';

/**
 * Writes `value` into a translatable field for `language`. The base value
 * tracks the local language; an emptied value drops the language entry.
 * Mirrors the drawer editor's updateTranslatableField.
 */
export function updateTranslatableField(
  field: WorkspaceTranslatableField,
  language: string,
  localLanguage: string,
  value: string,
): WorkspaceTranslatableField {
  const nextValues = { ...field.values };
  if (value.trim()) {
    nextValues[language] = value;
  } else {
    delete nextValues[language];
  }
  return {
    baseValue: language === localLanguage ? value : field.baseValue,
    values: nextValues,
  };
}

/** Reads a translated value, falling back to the canonical text for the local language. */
export function readTranslatableField(
  field: WorkspaceTranslatableField,
  language: string,
  localLanguage: string,
): string {
  return field.values[language] ?? (language === localLanguage ? field.baseValue : '');
}
