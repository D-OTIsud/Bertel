/**
 * Schéma PERSISTÉ du brouillon local du portail (18a) — fonctions pures.
 *
 * Le stockage lui-même vit dans `usePortalDraft.ts` (clé `portal-draft:<userId>:<objectId>`,
 * préfixée par le compte, purgée à la déconnexion). Ce fichier ne décrit que la FORME de
 * ce qui est écrit, et la manière de le relire sans jamais rejouer n'importe quoi.
 *
 * LE MESSAGE À L'OFFICE FAIT PARTIE DU BROUILLON. Il peut être la SEULE chose que le
 * partenaire a saisie (« ma piscine est en travaux, ne publiez pas la photo »), et un
 * envoi sans modification est refusé par le serveur : ce message ne peut donc pas vivre
 * dans un simple état d'écran, où un rechargement — ou un téléphone qui met l'onglet en
 * veille — l'effacerait sans un mot.
 *
 * L'EMPREINTE protège du travail en parallèle : si l'office a modifié la fiche depuis que
 * le brouillon a été pris, rejouer les valeurs locales écraserait son travail. On stocke
 * l'empreinte des tranches DU PORTAIL au moment de la prise ; l'appelant compare et décide.
 * Ce que l'office change AILLEURS (tags, juridique, médias) ne touche pas l'empreinte : ce
 * n'est pas un conflit, et le faire passer pour tel ferait perdre le brouillon pour rien.
 */
import type { WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { PORTAL_MODULES } from './portal-rubrics';
import { MODULE_KEY_MAP } from '../object-editor/editor-state';

export const PORTAL_DRAFT_VERSION = 1;

export interface PortalDraftPayload {
  version: number;
  objectId: string;
  /** Empreinte des tranches du portail au moment où le brouillon a été pris. */
  fingerprint: string;
  /** Le message à l'office — jamais `undefined`, une chaîne vide au pire. */
  note: string;
  /** Les tranches modifiées, par module. Seuls les modules du registre sont conservés. */
  modules: Partial<Record<WorkspaceModuleId, unknown>>;
  savedAt: string;
}

/** JSON déterministe : les clés d'un objet sont triées, pour que deux lectures de la même
 *  donnée rendent la même empreinte quel que soit l'ordre d'insertion. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

/** FNV-1a 32 bits, en hexadécimal. Pas de cryptographie ici : on compare deux états
 *  d'une même fiche sur le même appareil, pas des secrets. */
function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, '0');
}

export function portalDraftFingerprint(modules: ObjectWorkspaceModules): string {
  const source = PORTAL_MODULES.map((module) => {
    const key = MODULE_KEY_MAP[module];
    return [module, (modules as unknown as Record<string, unknown>)[key] ?? null] as const;
  });
  return hash(stableStringify(source));
}

export function serializePortalDraft(input: Omit<PortalDraftPayload, 'version'>): string {
  return JSON.stringify({ ...input, version: PORTAL_DRAFT_VERSION, modules: keepPortalModules(input.modules) });
}

function keepPortalModules(modules: unknown): Partial<Record<WorkspaceModuleId, unknown>> {
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) return {};
  const kept: Partial<Record<WorkspaceModuleId, unknown>> = {};
  for (const module of PORTAL_MODULES) {
    // Un module hors registre serait envoyé sans avoir jamais eu d'écran : on ne le
    // relit pas, même s'il traîne dans un brouillon d'une version antérieure.
    if (Object.prototype.hasOwnProperty.call(modules, module)) {
      kept[module] = (modules as Record<string, unknown>)[module];
    }
  }
  return kept;
}

/**
 * Relit un brouillon. Rend `null` — jamais une valeur approximative — dès que la forme
 * n'est pas celle attendue : rejouer un brouillon d'une autre version enverrait à l'office
 * des tranches dont on ne connaît plus le sens.
 */
export function parsePortalDraft(raw: string | null | undefined): PortalDraftPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.version !== PORTAL_DRAFT_VERSION) return null;
  if (typeof record.objectId !== 'string' || !record.objectId) return null;
  return {
    version: PORTAL_DRAFT_VERSION,
    objectId: record.objectId,
    fingerprint: typeof record.fingerprint === 'string' ? record.fingerprint : '',
    note: typeof record.note === 'string' ? record.note : '',
    modules: keepPortalModules(record.modules),
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
  };
}

/** Un brouillon qui ne porte QUE le message n'est PAS vide : c'est un cas courant. */
export function isPortalDraftEmpty(payload: PortalDraftPayload): boolean {
  return payload.note.trim() === '' && Object.keys(payload.modules).length === 0;
}
