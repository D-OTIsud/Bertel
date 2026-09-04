/**
 * Brouillon local du portail partenaire (18a) — le STOCKAGE.
 *
 * La FORME persistée (schéma, empreinte, garde de version) vit dans `portal-draft-schema.ts` ;
 * ce fichier est la seule porte vers `localStorage`, et le hook qui relie tout ça à l'éditeur.
 *
 * La clé est PRÉFIXÉE PAR LE COMPTE (`portal-draft:<userId>:<objectId>`) : un téléphone ou un
 * ordinateur d'office est souvent partagé, et rejouer le brouillon d'un autre partenaire
 * enverrait ses données à l'office sous le nom du suivant.
 *
 * TROIS RÈGLES QUI ONT CHACUNE COÛTÉ UNE PANNE :
 *
 *  1. L'EMPREINTE SE PREND SUR LES MODULES SERVEUR, jamais sur `editor.baseline`.
 *     `commitModules` réécrit la baseline avec les valeurs ENVOYÉES, alors que la fiche
 *     publiée ne bouge qu'à l'approbation de l'office. Un brouillon écrit pendant la
 *     vérification serait rangé sous une empreinte qu'aucun rechargement ne reproduit :
 *     il serait écarté au retour, avec la bannière mensongère « l'office a modifié votre
 *     fiche ».
 *
 *  2. NI L'EMPREINTE NI LE CONTENU NE PORTENT LES CATALOGUES. Un code ajouté au référentiel
 *     par l'office changerait sinon l'empreinte de TOUS les brouillons ; et les 29 tranches
 *     avec leurs options saturent vite un quota `localStorage` partagé entre les fiches.
 *     Les catalogues sont remis À LA LECTURE depuis les modules serveur
 *     (`restoreCatalogOptions`) : sans eux, les listes déroulantes d'une rubrique restaurée
 *     seraient vides et l'écriture ne saurait plus résoudre un code.
 *
 *  3. LE MESSAGE À L'OFFICE FAIT PARTIE DU BROUILLON. Il peut être la SEULE chose saisie
 *     (« Erreur signalée : … »), et `submit_actor_fiche` refuse un envoi sans modification :
 *     il ne peut donc pas vivre dans un état d'écran, où un rechargement l'effacerait sans
 *     un mot.
 *
 * Tous les accès sont gardés : `localStorage` n'existe pas au rendu serveur, et il JETTE
 * (SecurityError) en navigation privée sur certains navigateurs. Une panne de stockage ne
 * doit pas faire tomber l'écran — au pire, l'appareil ne retient rien.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { MODULE_KEY_MAP } from '../object-editor/editor-state';
import { restoreCatalogOptions, stripCatalogOptions } from '../object-editor/io/object-io-serialize';
import { parsePortalDraft, portalDraftFingerprint, serializePortalDraft } from './portal-draft-schema';
import { PORTAL_MODULES } from './portal-rubrics';

const DRAFT_PREFIX = 'portal-draft:';
const SENT_PREFIX = 'portal-sent:';

/** Temporisation d'écriture. Assez longue pour ne pas écrire à chaque frappe du message,
 *  assez courte pour qu'un onglet mis en veille juste après une saisie ait déjà écrit. */
const WRITE_DEBOUNCE_MS = 800;

type PortalSlices = Partial<Record<WorkspaceModuleId, unknown>>;

/** Préfixe des clés du compte, frontière de segment comprise (`u1` ≠ `u10`). */
function accountPrefix(prefix: string, userId: string): string {
  return `${prefix}${userId}:`;
}

export function portalDraftKey(userId: string, objectId: string): string {
  return `${accountPrefix(DRAFT_PREFIX, userId)}${objectId}`;
}

export function portalSentKey(userId: string, objectId: string): string {
  return `${accountPrefix(SENT_PREFIX, userId)}${objectId}`;
}

function getStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  const store = getStore();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch {
    // Quota atteint ou stockage refusé : l'appareil ne retiendra rien. On ne casse
    // surtout pas la saisie en cours pour autant.
  }
}

function removeRaw(key: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* rien à effacer si le stockage est indisponible */
  }
}

/** Vrai si cette fiche porte des modifications enregistrées sur CET appareil, pour CE compte. */
export function hasPortalDraft(userId: string | null, objectId: string): boolean {
  if (!userId) return false;
  return readRaw(portalDraftKey(userId, objectId)) !== null;
}

/**
 * Efface TOUS les brouillons ET instantanés du compte donné — et rien d'autre.
 *
 * Appelée seulement après une déconnexion RÉUSSIE : tant que le partenaire reste connecté,
 * son travail non envoyé lui appartient encore.
 */
export function clearAllPortalDrafts(userId: string | null): void {
  if (!userId) return;
  const store = getStore();
  if (!store) return;
  try {
    const prefixes = [accountPrefix(DRAFT_PREFIX, userId), accountPrefix(SENT_PREFIX, userId)];
    // Collecte AVANT suppression : retirer une clé pendant l'itération décale les index.
    const doomed: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // Stockage indisponible : il n'y a alors aucun brouillon à effacer.
  }
}

export function clearPortalDraft(userId: string | null, objectId: string): void {
  if (!userId) return;
  removeRaw(portalDraftKey(userId, objectId));
}

/** Les tranches SANS catalogues, prêtes à être écrites. La clé de stockage est le module id
 *  (`capacity-policies`), la clé de `stripCatalogOptions` est la clé de MODULE (`capacityPolicies`). */
function stripSlices(slices: PortalSlices): PortalSlices {
  const byModuleKey: Record<string, unknown> = {};
  for (const module of PORTAL_MODULES) {
    if (Object.prototype.hasOwnProperty.call(slices, module)) {
      byModuleKey[MODULE_KEY_MAP[module]] = slices[module];
    }
  }
  const stripped = stripCatalogOptions(byModuleKey as unknown as ObjectWorkspaceModules) as unknown as Record<
    string,
    unknown
  >;
  const out: PortalSlices = {};
  for (const module of PORTAL_MODULES) {
    const key = MODULE_KEY_MAP[module];
    if (Object.prototype.hasOwnProperty.call(stripped, key)) out[module] = stripped[key];
  }
  return out;
}

/**
 * L'empreinte des tranches du portail QUE CE BROUILLON PORTE, catalogues exclus.
 *
 * Portée aux seules tranches concernées : une empreinte globale faisait perdre un brouillon
 * de tarifs parce que l'office avait corrigé une coquille dans la description — deux
 * travaux sans le moindre rapport. Un brouillon qui ne porte QUE le message n'a alors plus
 * d'empreinte du tout : il ne peut écraser aucun travail, il n'y a rien à comparer.
 */
function fingerprintOf(serverModules: ObjectWorkspaceModules, modules: WorkspaceModuleId[]): string {
  const live = stripCatalogOptions(serverModules) as unknown as Record<string, unknown>;
  const scoped: Record<string, unknown> = {};
  for (const module of modules) {
    const key = MODULE_KEY_MAP[module];
    scoped[key] = live[key];
  }
  // Les tranches absentes hachent comme `null` des deux côtés : l'empreinte ne dépend que
  // de ce que le brouillon transporte.
  return portalDraftFingerprint(scoped as unknown as ObjectWorkspaceModules);
}

function carriedModules(slices: PortalSlices): WorkspaceModuleId[] {
  return PORTAL_MODULES.filter((module) => Object.prototype.hasOwnProperty.call(slices, module));
}

export function writePortalDraft(
  userId: string | null,
  objectId: string,
  serverModules: ObjectWorkspaceModules,
  dirtySlices: PortalSlices,
  note: string,
): void {
  if (!userId) return;
  writeRaw(
    portalDraftKey(userId, objectId),
    serializePortalDraft({
      objectId,
      fingerprint: fingerprintOf(serverModules, carriedModules(dirtySlices)),
      note,
      modules: stripSlices(dirtySlices),
      savedAt: new Date().toISOString(),
    }),
  );
}

export interface PortalDraftRead {
  /** Les tranches enregistrées, catalogues REMIS depuis les modules serveur. */
  draft: PortalSlices;
  note: string;
  savedAt: string;
  /**
   * Les tranches ÉCARTÉES parce que l'office a travaillé dessus entre-temps. L'appelant
   * les NOMME à l'écran : « refaites vos changements » sans dire lesquels n'aide personne.
   */
  droppedModules: WorkspaceModuleId[];
}

export function readPortalDraft(
  userId: string | null,
  objectId: string,
  serverModules: ObjectWorkspaceModules,
): PortalDraftRead | null {
  if (!userId) return null;
  const payload = parsePortalDraft(readRaw(portalDraftKey(userId, objectId)));
  if (!payload || payload.objectId !== objectId) return null;

  const carried = carriedModules(payload.modules);
  // L'office a travaillé sur CES tranches depuis la prise : les rejouer écraserait son
  // travail. On les écarte — et on les NOMME. Le MESSAGE, lui, reste : un texte libre
  // n'écrase rien, et c'est souvent la seule chose que le partenaire ait écrite.
  if (payload.fingerprint !== fingerprintOf(serverModules, carried)) {
    return { draft: {}, note: payload.note, savedAt: payload.savedAt, droppedModules: carried };
  }

  const draft: PortalSlices = {};
  const live = serverModules as unknown as Record<string, unknown>;
  for (const module of carried) {
    const key = MODULE_KEY_MAP[module];
    draft[module] = restoreCatalogOptions(payload.modules[module], live[key], key);
  }
  return { draft, note: payload.note, savedAt: payload.savedAt, droppedModules: [] };
}

// ══════════════════════ Instantané de ce qui a été ENVOYÉ ═══════════════════

/**
 * Ce que le partenaire a envoyé, tel qu'il l'a écrit — une ligne par champ, par rubrique.
 *
 * Sans lui, un rechargement pendant la vérification remet les valeurs PUBLIÉES dans les
 * champs : le partenaire croit que son envoi s'est perdu, ressaisit de mémoire, puis bute
 * sur le refus « une vérification est déjà en cours ».
 */
export interface PortalSentSnapshot {
  submittedAt: string;
  lines: Partial<Record<string, string[]>>;
}

export function writePortalSent(userId: string | null, objectId: string, snapshot: PortalSentSnapshot): void {
  if (!userId) return;
  writeRaw(portalSentKey(userId, objectId), JSON.stringify(snapshot));
}

export function readPortalSent(userId: string | null, objectId: string): PortalSentSnapshot | null {
  if (!userId) return null;
  const raw = readRaw(portalSentKey(userId, objectId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.submittedAt !== 'string') return null;
    const lines: Partial<Record<string, string[]>> = {};
    const source = record.lines;
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (Array.isArray(value)) lines[key] = value.filter((entry): entry is string => typeof entry === 'string');
      }
    }
    return { submittedAt: record.submittedAt, lines };
  } catch {
    // Un instantané illisible ne vaut pas mieux qu'aucun : la rubrique dira seulement
    // « en vérification », sans inventer ce qui a été envoyé.
    return null;
  }
}

export function clearPortalSent(userId: string | null, objectId: string): void {
  if (!userId) return;
  removeRaw(portalSentKey(userId, objectId));
}

// ═════════════════════════════════ Le hook ══════════════════════════════════

interface DraftEditor {
  draft: ObjectWorkspaceModules;
  dirtySections: Partial<Record<WorkspaceModuleId, boolean>>;
  replaceModule: (key: keyof ObjectWorkspaceModules, value: never) => void;
}

export interface UsePortalDraftInput {
  userId: string | null;
  objectId: string;
  /** Les modules tels que le SERVEUR les rend (cache React Query), JAMAIS `editor.baseline`. */
  serverModules: ObjectWorkspaceModules;
  editor: DraftEditor;
}

export interface UsePortalDraftResult {
  /** Le message à l'office. Vit dans le brouillon, pas dans un état d'écran. */
  note: string;
  setNote: (value: string) => void;
  /** Un brouillon existait mais la fiche a changé côté office : il a été écarté. */
  discarded: boolean;
  /** Les modules écartés — l'écran les NOMME plutôt que de dire « refaites vos changements ». */
  discardedModules: WorkspaceModuleId[];
  /** Horodatage du dernier enregistrement local, ou `null`. */
  savedAt: string | null;
  /** Efface le brouillon local ET le message (envoi réussi, ou abandon explicite). */
  clear: () => void;
}

/**
 * Restaure au montage, puis enregistre en différé chaque changement.
 *
 * Monté sous `key={objectId}` par l'appelant : `useObjectEditorState` est init-once et ne
 * resynchronise jamais, la restauration n'a donc qu'UNE occasion de s'exécuter.
 */
export function usePortalDraft({ userId, objectId, serverModules, editor }: UsePortalDraftInput): UsePortalDraftResult {
  const [note, setNote] = useState('');
  const [discarded, setDiscarded] = useState(false);
  const [discardedModules, setDiscardedModules] = useState<WorkspaceModuleId[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [cleared, setCleared] = useState(0);
  const restoredRef = useRef(false);

  // Les dernières valeurs, lues par l'effet de restauration SANS le faire dépendre d'elles :
  // il ne doit s'exécuter qu'une fois, et un `editor` recréé à chaque rendu le relancerait
  // en boucle — en réécrasant la saisie en cours par le brouillon d'origine.
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const serverRef = useRef(serverModules);
  serverRef.current = serverModules;

  useEffect(() => {
    // Pas encore de compte : la session arrive APRÈS le premier rendu. Sortir en marquant
    // la restauration « faite » armait un piège muet — le brouillon n'était jamais relu.
    if (!userId || restoredRef.current) return;
    restoredRef.current = true;
    const stored = readPortalDraft(userId, objectId, serverRef.current);
    if (!stored) {
      // Une clé présente que la lecture a refusée = un brouillon d'une autre VERSION du
      // schéma : rien n'en est réutilisable, mais le silence ferait croire à une perte
      // inexpliquée.
      if (hasPortalDraft(userId, objectId)) {
        setDiscarded(true);
        clearPortalDraft(userId, objectId);
      }
      return;
    }

    for (const [module, slice] of Object.entries(stored.draft) as [WorkspaceModuleId, unknown][]) {
      editorRef.current.replaceModule(MODULE_KEY_MAP[module], slice as never);
    }
    setNote(stored.note);
    setSavedAt(stored.savedAt);
    if (stored.droppedModules.length > 0) {
      setDiscarded(true);
      setDiscardedModules(stored.droppedModules);
    }
  }, [userId, objectId]);

  /** Les tranches modifiées, dans l'ordre stable du registre — la signature sert de
   *  déclencheur d'écriture, elle ne doit pas dépendre de l'ordre d'insertion. */
  const dirtySlices = useMemo(() => {
    const slices: PortalSlices = {};
    for (const module of PORTAL_MODULES) {
      if (editor.dirtySections[module]) slices[module] = editor.draft[MODULE_KEY_MAP[module]];
    }
    return slices;
  }, [editor.dirtySections, editor.draft]);

  const signature = useMemo(() => {
    try {
      return JSON.stringify(stripSlices(dirtySlices));
    } catch {
      return '';
    }
  }, [dirtySlices]);

  useEffect(() => {
    // Tant que la restauration n'a pas eu lieu, écrire écraserait le brouillon stocké
    // par un état vide — précisément celui qu'on vient de lire.
    if (!restoredRef.current || !userId) return;
    const empty = Object.keys(dirtySlices).length === 0 && note.trim() === '';
    const timer = window.setTimeout(() => {
      if (empty) {
        clearPortalDraft(userId, objectId);
        setSavedAt(null);
        return;
      }
      writePortalDraft(userId, objectId, serverRef.current, dirtySlices, note);
      setSavedAt(new Date().toISOString());
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `signature` remplace `dirtySlices` : l'objet est recréé à chaque rendu de l'éditeur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, note, userId, objectId, cleared]);

  const clear = useCallback(() => {
    clearPortalDraft(userId, objectId);
    setNote('');
    setSavedAt(null);
    setDiscarded(false);
    setDiscardedModules([]);
    // Réarme l'effet d'écriture pour qu'il reparte d'un état vide au lieu de réécrire
    // immédiatement ce qu'on vient d'effacer.
    setCleared((value) => value + 1);
  }, [userId, objectId]);

  return { note, setNote, discarded, discardedModules, savedAt, clear };
}
