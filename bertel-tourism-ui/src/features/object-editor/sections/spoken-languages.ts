import type {
  ObjectWorkspaceLanguageItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

/**
 * ref_language codes that differ from the description i18n value-key space.
 * Verified live 2026-06-16: only Créole differs — ref_language.code = 'rcf'
 * (Créole réunionnais) vs the description value key 'cre'. fr/en/de/es align.
 */
const SPOKEN_TO_DESC_KEY: Record<string, string> = { rcf: 'cre' };

/** Map a spoken-language (ref_language) code to the description i18n value key. */
export function spokenCodeToDescKey(code: string): string {
  return SPOKEN_TO_DESC_KEY[code] ?? code;
}

/**
 * Description tabs to show in §04 = content languages ∪ spoken languages
 * (each mapped into the description key space), de-duplicated, order preserved
 * (content languages first, then any newly-introduced spoken language).
 */
export function descLanguageTabs(
  available: string[],
  spoken: ObjectWorkspaceLanguageItem[],
): string[] {
  const ordered = [...available, ...spoken.map((item) => spokenCodeToDescKey(item.code))];
  return Array.from(new Set(ordered.filter(Boolean)));
}

const STATIC_LANG_LABELS: Record<string, string> = {
  fr: 'Français', en: 'English', cre: 'Créole', de: 'Deutsch', es: 'Español',
};

/** Tab label: static label first, then the ref_language option name, then the raw code. */
export function resolveLanguageLabel(code: string, options: WorkspaceReferenceOption[]): string {
  return STATIC_LANG_LABELS[code] ?? options.find((option) => option.code === code)?.label ?? code;
}
