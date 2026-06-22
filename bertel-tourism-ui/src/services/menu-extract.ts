import type { ObjectWorkspaceMenu } from './object-workspace-parser';

/**
 * Client bridge to POST /api/menu/extract (§06 carte → draft menu). The route holds the AI key
 * server-side; this only ships image bytes + the allowed vocabularies and returns a draft menu the
 * editor reviews. PDF pages are rasterized to images CLIENT-side before calling this (see modal).
 * Spec: docs/superpowers/specs/2026-06-22-ai-menu-extraction-design.md §6.
 */

export interface ExtractImage {
  mime: string;
  base64: string;
}
export interface RefOpt {
  id: string;
  code: string;
  label: string;
}
export interface ExtractInput {
  objectId: string;
  menuTitle: string;
  images: ExtractImage[];
  allowedSections: RefOpt[];
  allowedDietary: RefOpt[];
  lang?: string;
}
export interface ExtractResult {
  menu: ObjectWorkspaceMenu;
  /** Inferred dietary CODES per dish — shown as unchecked suggestions, never pre-applied. */
  suggestedDietaryByDish: string[][];
  truncated: boolean;
}

export async function extractMenuFromImages(
  input: ExtractInput,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractResult> {
  const resp = await fetchImpl('/api/menu/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      object_id: input.objectId,
      menu_title: input.menuTitle,
      images: input.images,
      allowed_sections: input.allowedSections,
      allowed_dietary: input.allowedDietary,
      lang: input.lang ?? 'fr',
    }),
  });

  let payload: unknown = null;
  try {
    payload = await resp.json();
  } catch {
    /* leave null */
  }

  if (!resp.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail)
        : payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : `Analyse impossible (${resp.status})`;
    throw new Error(detail);
  }

  return payload as ExtractResult;
}

/** Read a browser File into {mime, base64} for the extraction request (images only). */
export function readFileAsBase64(file: File): Promise<ExtractImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('lecture du fichier impossible'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve({ mime: file.type || 'image/jpeg', base64: comma >= 0 ? result.slice(comma + 1) : result });
    };
    reader.readAsDataURL(file);
  });
}

/** Pure: commit the dietary codes the human accepted (per dish) into the draft menu, immutably. */
export function applyDietarySuggestions(menu: ObjectWorkspaceMenu, acceptedByDish: string[][]): ObjectWorkspaceMenu {
  return {
    ...menu,
    items: menu.items.map((item, index) => ({
      ...item,
      dietaryTagCodes: [...new Set(acceptedByDish[index] ?? [])],
    })),
  };
}
