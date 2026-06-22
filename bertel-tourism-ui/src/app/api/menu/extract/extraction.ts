import { z } from 'zod';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem } from '../../../../services/object-workspace-parser';

/**
 * Pure extraction helpers for /api/menu/extract (Phase 2). No network, no secrets — fully
 * unit-tested. The route composes these around the provider adapter:
 *   buildExtractionPrompt → (provider vision call) → parseExtraction → mapExtractionToMenu.
 * Design: docs/superpowers/specs/2026-06-22-ai-menu-extraction-design.md §5.
 *
 * Safety contract (locked decision D3): the model is constrained to the allowed section + dietary
 * vocabularies; allergens are NEVER requested nor accepted; inferred dietary is returned as a
 * SEPARATE suggestion list (suggestedDietaryByDish) — never pre-applied to the dish — so the human
 * confirms it in the modal before save.
 */

export interface AllowedOption {
  id: string;
  code: string;
  label: string;
}

export interface ExtractionInputs {
  menuTitle: string;
  allowedSections: AllowedOption[];
  allowedDietary: AllowedOption[];
  lang?: string;
}

/** The JSON shape the model must return. Lenient on optionals; price may come back as number. */
export const extractedMenuSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  dishes: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.union([z.string(), z.number()]).optional(),
        section: z.string().optional(),
        dietary: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});
export type ExtractedMenu = z.infer<typeof extractedMenuSchema>;

export interface MappedExtraction {
  menu: ObjectWorkspaceMenu;
  /** Inferred dietary CODES, parallel to menu.items — shown as unchecked "suggestions" in the modal. */
  suggestedDietaryByDish: string[][];
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Build the (system, user) prompt. The user message is paired with the carte images by the route. */
export function buildExtractionPrompt(inp: {
  allowedSections: AllowedOption[];
  allowedDietary: AllowedOption[];
  lang?: string;
}): { system: string; user: string } {
  const sections = inp.allowedSections.map((s) => s.label).filter(Boolean);
  const dietary = inp.allowedDietary.map((d) => d.label).filter(Boolean);
  const lang = inp.lang || 'fr';

  const system = [
    "Tu es un assistant qui extrait le contenu d'une carte de restaurant à partir d'images.",
    'Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans bloc de code.',
    'Schéma attendu : {"title": string, "description": string, "dishes": [{"name": string, "description": string, "price": string, "section": string, "dietary": [string]}]}.',
    `"section" DOIT être l'un de ces libellés exactement, ou "" si incertain : ${sections.join(' | ') || '(aucune)'}.`,
    `"dietary" ne peut contenir QUE ces libellés, et seulement quand le plat l'indique CLAIREMENT : ${dietary.join(' | ') || '(aucun)'}.`,
    "N'invente jamais de régime. Et surtout : n'inclus JAMAIS d'allergènes — ne devine pas les allergènes, ils sont saisis par un humain.",
    '"price" est une chaîne telle qu\'affichée (ex. "12 €", "15.50"), ou "" si absent.',
    `Langue des libellés et descriptions : ${lang}.`,
  ].join('\n');

  const user =
    "Voici les images de la carte complète. Extrais tous les plats avec leur section, prix et description, en respectant strictement le schéma et les libellés autorisés. N'ajoute pas d'allergènes.";

  return { system, user };
}

/** Strip an optional code fence, JSON.parse, validate against the schema. */
export function parseExtraction(raw: string): { ok: true; data: ExtractedMenu } | { ok: false; error: string } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    // Fall back to the first {...} block if the model wrapped the JSON in prose.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: 'no JSON object found in model output' };
    try {
      json = JSON.parse(match[0]);
    } catch {
      return { ok: false, error: 'model output is not valid JSON' };
    }
  }
  const parsed = extractedMenuSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  return { ok: true, data: parsed.data };
}

function priceToString(price: string | number | undefined): string {
  if (price === undefined || price === null) return '';
  return typeof price === 'number' ? String(price) : price.trim();
}

/** Map a validated extraction into a draft ObjectWorkspaceMenu + the separate dietary suggestions. */
export function mapExtractionToMenu(data: ExtractedMenu, inp: ExtractionInputs): MappedExtraction {
  const sectionByLabel = new Map(inp.allowedSections.map((s) => [normalize(s.label), s]));
  const dietaryByLabel = new Map(inp.allowedDietary.map((d) => [normalize(d.label), d]));

  const suggestedDietaryByDish: string[][] = [];

  const items: ObjectWorkspaceMenuItem[] = (data.dishes ?? []).map((dish, index) => {
    const section = dish.section ? sectionByLabel.get(normalize(dish.section)) : undefined;
    const suggested = (dish.dietary ?? [])
      .map((label) => dietaryByLabel.get(normalize(label))?.code)
      .filter((code): code is string => Boolean(code));
    // de-dup while preserving order
    suggestedDietaryByDish.push([...new Set(suggested)]);

    return {
      recordId: null,
      name: dish.name.trim(),
      description: (dish.description ?? '').trim(),
      price: priceToString(dish.price),
      currency: '',
      kindId: '',
      kindCode: '',
      kindLabel: '',
      unitId: '',
      unitCode: '',
      unitLabel: '',
      mediaIds: [],
      available: true,
      position: String(index + 1),
      dietaryTagCodes: [], // never pre-applied — suggestions are confirmed in the modal
      allergenCodes: [], // never inferred (safety)
      cuisineTypeCodes: [],
      sectionCode: section?.code ?? '',
      sectionId: section?.id ?? '',
      sectionLabel: section?.label ?? '',
    };
  });

  const name = inp.menuTitle.trim() || (data.title ?? '').trim() || 'Carte';

  const menu: ObjectWorkspaceMenu = {
    recordId: null,
    categoryId: '',
    categoryCode: '',
    categoryLabel: '',
    name,
    description: (data.description ?? '').trim(),
    active: true,
    visibility: 'public',
    position: '1',
    items,
  };

  return { menu, suggestedDietaryByDish };
}
