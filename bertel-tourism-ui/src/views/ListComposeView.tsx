'use client';

// Module Listes — composition d'une liste (éditeur à gauche + aperçu brandé live à droite).
// Lecture/écriture via les RPC DEFINER. L'aperçu utilise OtiTemplate (le MÊME rendu que la
// page publique), dans le canal choisi (email étroit / PDF A4 / lien web) et la langue choisie.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Copy as CopyListIcon,
  Globe,
  GripVertical,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import OtiTemplate, { itemsToOtiPois } from '@/features/lists/OtiTemplate';
import type { OtiMapSnapshot } from '@/features/lists/oti-map-utils';
import ChannelFrame from '@/features/lists/ChannelFrame';
import {
  buildDraftMetaPatch,
  buildLanguageSwitchPatch,
  currentListIntro,
  currentListName,
  listItemDraftSignature,
  listItemsDiffer as itemsDiffer,
} from '@/features/lists/compose/list-draft';
import { useListOperationScope, useScopedListMutation, obsoleteListOperation, type ListOperationScope } from '@/features/lists/compose/useListOperationScope';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CopyEmailsModal } from '@/components/explorer/CopyEmailsModal';
import { ACCENT_INK } from '@/features/lists/type-meta';
import { useObjectSearch, type ObjectSearchResult } from '@/features/object-editor/useObjectSearch';
import { useUnsavedDraftGuard } from '@/features/object-editor/useUnsavedDraftGuard';
import { useSessionStore } from '@/store/session-store';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import {
  deleteList,
  duplicateList,
  ensureListShareLink,
  getList,
  getListEmailContext,
  LIST_EMAIL_PROTECTION_UNAVAILABLE_MESSAGE,
  listItemFromObjectCard,
  listsQueryKeys,
  mergeEnrichedListItems,
  moveListItem,
  requestListFeature,
  restoreList,
  reviewListFeature,
  sendListByEmail,
  ListEmailUnknownError,
  LIST_EMAIL_RESEND_CONFIRMATION,
  setListFeatured,
  setListItems,
  shareList,
  updateList,
  type ListAccent,
  type ListTemplate,
  type ObjectListDetail,
  type ObjectListItem,
} from '@/services/lists';
import { CoverImage } from '@/features/lists/CoverImage';
import { cn } from '@/lib/utils';
import { strictErrorMessage } from '../lib/strict-error-message';

type Channel = 'email' | 'pdf' | 'web';
const TEMPLATES: Array<{ k: ListTemplate; label: string }> = [
  { k: 'carnet', label: 'Carnet' },
  { k: 'grille', label: 'Grille' },
  { k: 'itineraire', label: 'Itinéraire' },
];
const ACCENTS: Array<{ k: ListAccent; label: string }> = [
  { k: 'teal', label: 'Teal' },
  { k: 'green', label: 'Vert' },
  { k: 'gold', label: 'Or' },
  { k: 'terra', label: 'Terracotta' },
];

/** MET-04/UX-04 — wording matches this view: no "publish" step exists here, only save/send. */
const LIST_UNSAVED_LEAVE_MESSAGE =
  'Cette liste contient des modifications non enregistrées (nom, destinataire, mot d’introduction, notes ou ordre des lieux). Elles seront perdues si vous quittez maintenant. Continuer ?';

/**
 * `get_list` autorise un admin à LIRE une proposition en attente pour l'examiner — cette lecture
 * ne donne PAS le droit d'utiliser la liste (imprimer/envoyer/partager/dupliquer) tant qu'elle
 * n'est pas acceptée à la une : la base le refuse, l'interface ne doit donc jamais le promettre.
 */
const PROPOSAL_REVIEW_ONLY_TITLE =
  "Cette liste est une proposition en cours d'examen : l'impression, l'envoi, le partage et la duplication seront disponibles si elle est acceptée à la une.";

/**
 * Bouton « E-mails » de la barre d'en-tête. Passe le `listId`, JAMAIS les ids
 * résolus par la page : une liste dynamique est plafonnée à 200 côté page, et
 * l'export doit pouvoir en résoudre 2 000 (§211).
 */
export function ListComposeEmailsButton({ listId }: { listId: string }) {
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const [open, setOpen] = useState(false);
  if (!canEditObjects) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5"
      >
        <Mail className="h-4 w-4" /> E-mails
      </button>
      <CopyEmailsModal listId={listId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export default function ListComposeView({ listId }: { listId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userName = useSessionStore((s) => s.userName);
  const userEmail = useSessionStore((s) => s.email);
  const userAvatarUrl = useSessionStore((s) => s.avatarUrl);
  const userId = useSessionStore((s) => s.userId);
  const orgId = useSessionStore((s) => s.orgId);
  const serviceAvailability = useServiceAvailability();

  // Clés PARTAGÉES avec ListsManageView (services/lists.ts:listsQueryKeys) — un changement de
  // session/organisation dans le même onglet (sans rechargement) ne doit jamais servir depuis le
  // cache le détail ou les capacités (`can_edit`…) résolus pour un AUTRE utilisateur/une AUTRE
  // organisation.
  const listKey = listsQueryKeys.detail(listId, userId, orgId);

  const detailQuery = useQuery({ queryKey: listKey, queryFn: () => getList(listId) });
  const detail = detailQuery.data ?? null;
  // can_edit ABSENT du payload (repli fail-closed du service) doit se comporter comme FALSE —
  // jamais un défaut permissif tant que `detail` n'est pas encore résolu.
  const canEdit = Boolean(detail?.canEdit);
  const canManageSharing = Boolean(detail?.canManageSharing);

  const [name, setName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [intro, setIntro] = useState('');
  const [items, setItems] = useState<ObjectListItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [template, setTemplate] = useState<ListTemplate>('carnet');
  const [channel, setChannel] = useState<Channel>('email');
  const [previewLang, setPreviewLang] = useState<'fr' | 'en'>('fr');
  const [mounted, setMounted] = useState(false);
  // Cliché de la carte récap figé par l'aperçu — rendu par l'instance du portail
  // d'impression (display:none : un canvas WebGL ne peut pas s'y rendre).
  const [mapShot, setMapShot] = useState<OtiMapSnapshot | null>(null);
  const [sending, setSending] = useState(false);
  const [langSwitching, setLangSwitching] = useState(false);
  // Couvre TOUTE l'opération dupliquer (flush du brouillon PUIS duplicateList), pas seulement
  // `duplicate.isPending` (qui ne démarre qu'après le flush) : sans ça, les champs restent
  // modifiables pendant le flush lent et peuvent déclencher une autosave APRÈS le snapshot lu par
  // `flushPendingEdits` (revue finale — point 2).
  const [duplicating, setDuplicating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; identity: string; name: string; scope: ListOperationScope } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteOpenerRef = useRef<HTMLButtonElement | null>(null);
  const backLinkRef = useRef<HTMLAnchorElement | null>(null);
  const restoreDeleteFocusRef = useRef(false);
  const [drag, setDrag] = useState<{ from: number | null; over: number | null }>({ from: null, over: null });
  const [addQuery, setAddQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  // Identité (liste + utilisateur + organisation) déjà hydratée dans l'état local. `detail.id`
  // seul NE SUFFIT PAS : un changement d'utilisateur/organisation dans le même onglet (sans
  // rechargement) produit une NOUVELLE requête (clé différente) qui peut résoudre sur LE MÊME
  // listId — si la garde ne comparait que `detail.id`, l'effet resterait no-op et les champs
  // locaux (nom, notes, destinataire…) de l'identité PRÉCÉDENTE resteraient affichés (revue
  // architecte, §listes 2026-09-07).
  const hydratedIdentityKey = useRef<string | null>(null);
  const currentIdentityKey = `${listId}:${userId ?? ''}:${orgId ?? ''}`;
  const identityRef = useRef(currentIdentityKey);
  identityRef.current = currentIdentityKey;
  const saveFailuresRef = useRef(new Map<string, number>());
  // File RÉELLE (pas un simple pointeur) : un thunk ne démarre — donc n'appelle le réseau —
  // qu'une fois le précédent réglé. Un pointeur écrasé par l'appel suivant (ancienne version)
  // laisse une sauvegarde lente répondre APRÈS une plus récente et écraser du contenu approuvé
  // (MET-02). Cette file couvre TOUTES les écritures méta/lieux : blur, ajout, bouton
  // Enregistrer, modèle, langue, autres bascules.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Verrou synchrone (pas un state) : bloque la ré-entrance même dans le même tick, avant que
  // React n'ait eu la chance de committer `sending`/`langSwitching`.
  const operations = useListOperationScope(listId, userId, orgId, () => {
    setLangSwitching(false); setDuplicating(false); setDeleting(false); setCopied(false);
    setDeleteTarget(null); setDeleteError(null);
  });
  const sendScopeRef = useRef({ generation: 0, identity: currentIdentityKey, controller: null as AbortController | null });
  const uncertainSendRef = useRef(new Map<string, { identity: string; operationIds: string[] }>());
  if (sendScopeRef.current.identity !== currentIdentityKey) {
    sendScopeRef.current.generation += 1;
    sendScopeRef.current.identity = currentIdentityKey;
    sendScopeRef.current.controller?.abort();
    uncertainSendRef.current.clear();
  }
  useEffect(() => {
    // A→B→A may be batched into one render. Invalidate synchronously on each real
    // identity/authority change, rather than comparing only the final rendered IDs.
    const unsubscribe = useSessionStore.subscribe((state, previous) => {
      if (state.userId === previous.userId && state.orgId === previous.orgId && state.status === previous.status
        && state.authAuthority === previous.authAuthority
        && state.role === previous.role && state.isTestRealm === previous.isTestRealm && state.demoMode === previous.demoMode
        && state.canEditObjects === previous.canEditObjects && state.adminRank === previous.adminRank) return;
      sendScopeRef.current.generation += 1;
      const controller = sendScopeRef.current.controller;
      if (controller) {
        controller.abort();
        sendScopeRef.current.controller = null;
        setSending(false);
      }
      uncertainSendRef.current.clear();
      setErrorMessage(null);
      setSendNotice(null);
    });
    return () => {
      unsubscribe();
      sendScopeRef.current.generation += 1;
      sendScopeRef.current.controller?.abort();
      sendScopeRef.current.controller = null;
    };
  }, []);
  const emailContextKey = ['list-email-context', listId, userId, orgId] as const;
  const emailContext = useQuery({
    queryKey: emailContextKey,
    enabled: serviceAvailability.email && Boolean(userId), retry: false,
    queryFn: ({ queryKey, signal }) => {
      const [, targetList, targetUser, targetOrg] = queryKey;
      const identity = `${targetList}:${targetUser ?? ''}:${targetOrg ?? ''}`;
      const generation = sendScopeRef.current.generation;
      return getListEmailContext(targetList, { expectedUserId: targetUser, signal, isCurrent: () => {
        const current = useSessionStore.getState();
        return sendScopeRef.current.generation === generation && sendScopeRef.current.identity === identity
          && current.userId === targetUser && current.orgId === targetOrg;
      } });
    },
  });
  useEffect(() => {
    const controller = sendScopeRef.current.controller;
    if (controller?.signal.aborted) {
      sendScopeRef.current.controller = null;
      setSending(false);
    }
    setErrorMessage(null);
    setSendNotice(null);
    setLangSwitching(false); setDuplicating(false); setDeleting(false); setCopied(false);
    setDeleteTarget(null);
    setDeleteError(null);
  }, [currentIdentityKey]);
  useEffect(() => {
    if (deleteTarget || !restoreDeleteFocusRef.current) return;
    const observer = new MutationObserver(restoreFocus);
    function restoreFocus() {
      if (document.querySelector('[role="dialog"][aria-label="Supprimer la liste ?"]')) return;
      restoreDeleteFocusRef.current = false;
      observer.disconnect();
      if (document.activeElement !== document.body) return;
      const opener = deleteOpenerRef.current;
      if (opener?.isConnected && !opener.disabled) opener.focus();
      else backLinkRef.current?.focus();
    }
    observer.observe(document.body, { childList: true, subtree: true });
    restoreFocus();
    return () => observer.disconnect();
  }, [deleteTarget]);
  const lastMovedRef = useRef<{ id: string; dir: 'up' | 'down' } | null>(null);
  const itemsListRef = useRef<HTMLUListElement | null>(null);
  // `saveItems.onSuccess` a besoin des items LES PLUS RÉCENTS, pas de ceux capturés par la
  // fermeture au moment où la mutation a démarré (un ajout en vol pendant le round-trip ne doit
  // pas être écrasé) — une ref à jour évite le piège de fermeture périmée du callback.
  const itemsRef = useRef<ObjectListItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => setMounted(true), []);

  // A configuration may disappear while this page stays open. The send control vanishes
  // immediately; the service repeats the same fresh guard before it can POST.
  useEffect(() => {
    if (!serviceAvailability.email) setSending(false);
  }, [serviceAvailability.email]);

  // Hydrate l'état d'édition à l'arrivée de la liste (ou au changement de liste) UNIQUEMENT :
  // re-hydrater à chaque refetch clobberait les notes/l'ordre non enregistrés (write-trap).
  useEffect(() => {
    if (!detail || hydratedIdentityKey.current === currentIdentityKey) return;
    hydratedIdentityKey.current = currentIdentityKey;
    setName(currentListName(detail));
    setRecipient(detail.recipientLabel ?? '');
    setIntro(currentListIntro(detail));
    setItems(detail.items);
    setTemplate(detail.template);
    setPreviewLang(detail.lang);
  }, [detail, currentIdentityKey]);

  // A11Y-01 — après un déplacement clavier/clic, le focus doit rester sur le lieu déplacé ;
  // s'il atteint une borne, le bouton pressé devient désactivé, donc on bascule sur l'autre
  // bouton du même lieu plutôt que de laisser le focus retomber sur <body>. Déclaré AVANT tout
  // retour anticipé (chargement/liste introuvable) : un Hook après un `return` conditionnel
  // change le nombre de Hooks entre rendus dès que la requête se résout, et React plante.
  useEffect(() => {
    const moved = lastMovedRef.current;
    if (!moved) return;
    lastMovedRef.current = null;
    const idx = items.findIndex((it) => it.objectId === moved.id);
    if (idx === -1) return;
    const preferred = idx === 0 ? 'down' : idx === items.length - 1 ? 'up' : moved.dir;
    const el = itemsListRef.current?.querySelector<HTMLButtonElement>(
      `[data-move-item="${moved.id}"][data-move-dir="${preferred}"]`,
    );
    el?.focus();
  }, [items]);

  /** Met un thunk en file : il ne s'exécute (donc n'appelle `mutateAsync`) qu'une fois TOUT ce
   *  qui précède réglé — succès ou échec. Renvoyé tel quel pour un appelant qui attend/attrape
   *  (envoi, changement de langue) ; `queueBackgroundSave` couvre l'autosave « tire et oublie ». */
  function enqueueSave<T>(run: (scope: ListOperationScope) => Promise<T>, scope = operations.capture()): Promise<T> {
    const started = saveQueueRef.current.then(() => {
      if (!operations.isSessionCurrent(scope)) throw obsoleteListOperation();
      return run(scope);
    });
    saveQueueRef.current = started.then(
      () => undefined,
      () => {
        if (operations.isSessionCurrent(scope)) saveFailuresRef.current.set(scope.identity, (saveFailuresRef.current.get(scope.identity) ?? 0) + 1);
      },
    );
    return started;
  }
  function queueBackgroundSave<T>(run: (scope: ListOperationScope) => Promise<T>): void {
    // Capture before joining the queue. Capturing inside its thunk would re-arm
    // an old gesture after an account A→B→A transition while it was waiting.
    const scope = operations.capture();
    enqueueSave(() => {
      const base = queryClient.getQueryData<ObjectListDetail>(listsQueryKeys.detail(scope.listId, scope.userId, scope.orgId)) ?? detail;
      if (!base?.canEdit || base.id !== scope.listId) return Promise.resolve(undefined as T);
      return run(scope);
    }, scope).catch(() => {});
  }

  const invalidateGrids = (scope = operations.capture()) => {
    void queryClient.invalidateQueries({ queryKey: listsQueryKeys.myLists(scope.orgId, scope.userId) });
    void queryClient.invalidateQueries({ queryKey: listsQueryKeys.featured(scope.orgId, scope.userId) });
    void queryClient.invalidateQueries({ queryKey: listsQueryKeys.proposals(scope.orgId, scope.userId) });
  };
  const invalidate = (scope = operations.capture()) => {
    void queryClient.invalidateQueries({ queryKey: listsQueryKeys.detail(scope.listId, scope.userId, scope.orgId) });
    invalidateGrids(scope);
  };
  const applyFresh = (fresh: ObjectListDetail | null, scope: ListOperationScope) => {
    const key = listsQueryKeys.detail(scope.listId, scope.userId, scope.orgId);
    if (fresh?.id === scope.listId) queryClient.setQueryData(key, fresh);
    else void queryClient.invalidateQueries({ queryKey: key });
    invalidateGrids(scope);
    return fresh?.id === scope.listId;
  };
  const updateMeta = useScopedListMutation(operations, {
    mutationFn: (scope, patch: Parameters<typeof updateList>[1]) => updateList(scope.listId, patch, { signal: scope.signal }),
    copy: (patch) => ({ ...patch }),
    onSuccess: (fresh, _patch, scope) => { applyFresh(fresh, scope); },
    onError: (e) => setErrorMessage(strictErrorMessage(e, "Échec de l'enregistrement. Vos modifications sont conservées ici ; réessayez.")),
  });
  const saveItems = useScopedListMutation(operations, {
    mutationFn: (scope, sent: ObjectListItem[]) => setListItems(scope.listId,
      sent.map((it, i) => ({ object_id: it.objectId, position: i, note_fr: it.noteFr, note_en: it.noteEn })), { signal: scope.signal }),
    copy: (sent) => sent.map((item) => ({ ...item })),
    onSuccess: (fresh, sent, scope) => {
      if (!applyFresh(fresh, scope) || !fresh || !operations.isViewCurrent(scope)) return;
      const { items: merged, rejectedIds } = mergeEnrichedListItems(itemsRef.current, fresh.items, sent);
      setItems(merged);
      if (rejectedIds.length > 0) setErrorMessage(rejectedIds.length === 1
        ? "Un lieu n'a pas pu être enregistré (fiche non publiée) et a été retiré de la liste."
        : `${rejectedIds.length} lieux n'ont pas pu être enregistrés (fiches non publiées) et ont été retirés de la liste.`);
    },
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Enregistrement des lieux impossible. Réessayez.')),
  });
  const applyShare = (info: Awaited<ReturnType<typeof shareList>>, scope: ListOperationScope) => {
    queryClient.setQueryData<ObjectListDetail>(listsQueryKeys.detail(scope.listId, scope.userId, scope.orgId), (old) => old
      ? { ...old, shareToken: info.shareToken, shareEnabled: info.shareEnabled, shareExpiresAt: info.shareExpiresAt } : old);
    invalidateGrids(scope);
  };
  const share = useScopedListMutation(operations, {
    mutationFn: (scope, enable: boolean) => shareList(scope.listId, enable, null, { signal: scope.signal }),
    onSuccess: (info, _enable, scope) => { applyShare(info, scope); },
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Partage impossible. Réessayez.')),
  });
  const ensureShare = useScopedListMutation(operations, {
    mutationFn: (scope, _input: void) => ensureListShareLink(scope.listId, { signal: scope.signal }),
    onSuccess: (info, _input, scope) => { applyShare(info, scope); },
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Partage indisponible. Réessayez.')),
  });
  const applyLifecycleResult = (fresh: ObjectListDetail | null, scope: ListOperationScope) => {
    applyFresh(fresh, scope);
    if (!fresh && operations.isViewCurrent(scope)) router.push('/listes');
  };
  const proposeFeature = useScopedListMutation(operations, {
    mutationFn: (scope, _input: void) => requestListFeature(scope.listId, { signal: scope.signal }),
    onSuccess: (fresh, _input, scope) => { applyFresh(fresh, scope); },
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Proposition à la une impossible.')),
  });
  const toggleFeatured = useScopedListMutation(operations, {
    mutationFn: (scope, featured: boolean) => setListFeatured(scope.listId, featured, { signal: scope.signal }),
    onSuccess: (fresh, _featured, scope) => applyLifecycleResult(fresh, scope),
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Mise à la une impossible.')),
  });
  const review = useScopedListMutation(operations, {
    mutationFn: (scope, accept: boolean) => reviewListFeature(scope.listId, accept, { signal: scope.signal }),
    onSuccess: (fresh, _accept, scope) => applyLifecycleResult(fresh, scope),
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Traitement de la proposition impossible.')),
  });
  const restore = useScopedListMutation(operations, {
    mutationFn: (scope, _input: void) => restoreList(scope.listId, { signal: scope.signal }),
    onSuccess: (fresh, _input, scope) => { applyFresh(fresh, scope); },
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Restauration impossible.')),
  });
  const duplicate = useScopedListMutation(operations, {
    mutationFn: (scope, _input: void) => duplicateList(scope.listId, { signal: scope.signal }),
    onSuccess: (newId, _input, scope) => {
      void queryClient.invalidateQueries({ queryKey: listsQueryKeys.myLists(scope.orgId, scope.userId) });
      if (operations.isViewCurrent(scope)) router.push(`/listes/${newId}`);
    },
    onError: (e) => setErrorMessage(strictErrorMessage(e, 'Duplication impossible.')),
  });
  const remove = useScopedListMutation(operations, {
    mutationFn: (scope, target: { id: string; identity: string; scope: ListOperationScope }) => deleteList(target.id, { signal: scope.signal }),
    onSuccess: (_, target, scope) => {
      invalidateGrids(scope);
      if (isCurrentDeleteIdentity(target)) router.push('/listes');
    },
    onError: (e, target) => {
      if (isCurrentDeleteIdentity(target)) setErrorMessage(strictErrorMessage(e, 'Suppression impossible. Réessayez.'));
    },
  });

  function isCurrentDeleteIdentity(target: { id: string; identity: string; scope: ListOperationScope }) {
    const session = useSessionStore.getState();
    return operations.isViewCurrent(target.scope) && identityRef.current === target.identity &&
      `${target.id}:${session.userId ?? ''}:${session.orgId ?? ''}` === target.identity;
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target || operations.isActionLocked() || !isCurrentDeleteIdentity(target)) return;
    const lease = operations.acquireAction(target.scope);
    if (!lease) return;
    setDeleting(true);
    setDeleteError(null);
    const failuresBeforeWait = saveFailuresRef.current.get(target.identity) ?? 0;
    try {
      // Join the existing queue, without saving or discarding additional local drafts.
      await enqueueSave(async () => {
        if (!isCurrentDeleteIdentity(target)) return;
        const fresh = queryClient.getQueryData<ObjectListDetail>(listKey);
        if (fresh?.id !== target.id || !fresh.canEdit) {
          throw new Error('Cette liste ne peut plus être supprimée avec vos droits actuels.');
        }
        if ((saveFailuresRef.current.get(target.identity) ?? 0) !== failuresBeforeWait) {
          throw new Error('Une sauvegarde a échoué. Vos modifications sont conservées ici. Réessayez pour confirmer la suppression.');
        }
        await remove.mutateAsync(target, target.scope);
        if (isCurrentDeleteIdentity(target)) setDeleteTarget(null);
      }, target.scope);
    } catch (error) {
      if (isCurrentDeleteIdentity(target)) {
        setDeleteError(strictErrorMessage(error, 'Suppression impossible. Réessayez.'));
      }
    } finally {
      if (operations.isViewCurrent(target.scope)) setDeleting(false);
      operations.releaseAction(lease);
    }
  }

  // Palette « Ajouter un lieu » (listes statiques) — même recherche nom/commune que les pickers §15/§19.
  const objectSearch = useObjectSearch(addQuery, { enabled: detail?.kind === 'static' });

  // MET-04 — garde de sortie : couvre nom/destinataire/intro/modèle ET (pour une liste statique)
  // l'ordre/les notes des lieux. Calculé avant tout retour anticipé (règle des Hooks).
  const isDynamic = detail?.kind === 'dynamic';
  // N'active la garde qu'UNE FOIS cette liste hydratée : avant l'effet d'hydratation, les
  // champs locaux sont encore vides et divergeraient à tort de `detail`, activant brièvement
  // (et à tort) l'écouteur popstate/beforeunload — jusqu'à pousser une entrée d'historique
  // parasite dès l'arrivée des données.
  const hydrated = detail != null && hydratedIdentityKey.current === currentIdentityKey;
  const dirtyItems = detail
    ? listItemDraftSignature(items) !== listItemDraftSignature(detail.items)
    : false;
  const dirtyMeta = detail
    ? name !== currentListName(detail) ||
      recipient !== (detail.recipientLabel ?? '') ||
      intro !== currentListIntro(detail) ||
      template !== detail.template
    : false;
  // Une suppression réussie ne doit jamais laisser la garde bloquer le départ programmé.
  const deletedCurrentList = remove.isSuccess && remove.variables != null && isCurrentDeleteIdentity(remove.variables);
  const isDirty = hydrated && !deletedCurrentList && (dirtyMeta || (!isDynamic && dirtyItems));
  useUnsavedDraftGuard(isDirty, { message: LIST_UNSAVED_LEAVE_MESSAGE });

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-ink/50">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement de la liste…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink/60">
        <p>Liste introuvable ou inaccessible.</p>
        <Link href="/listes" className="font-semibold text-orange hover:underline">← Retour aux listes</Link>
      </div>
    );
  }

  // Droit d'UTILISATION (revue architecte) — distinct du droit de lecture qu'accorde déjà
  // `get_list` à un admin examinant une proposition non acceptée : cette lecture NE donne PAS le
  // droit d'imprimer/envoyer/partager/dupliquer tant que la liste n'est pas à la une (la base le
  // refuse). Dérivé du contrat, sans RPC supplémentaire : à la une (tout membre), créateur
  // (toujours), ou canEdit (couvre la reprise orpheline déjà reflétée par ce flag serveur).
  const canUse = Boolean(detail.isFeatured || detail.createdBy === userId || canEdit);
  // Ladder cycle de vie / à la une : priorité stricte pour ne JAMAIS appeler
  // `setListFeatured(true)` sur la liste d'un collègue — la base le refuse, seul
  // `reviewListFeature` accepte/refuse une proposition qui n'est pas la sienne.
  const isOwnList = detail.createdBy === userId;
  const featureAction: 'retire' | 'review' | 'promote' | 'propose' | 'proposed' | null = detail.isFeatured
    ? (detail.canManageFeature ? 'retire' : null)
    : detail.canManageFeature && !isOwnList && detail.featureRequestedAt
      ? 'review'
      : detail.canManageFeature && isOwnList
        ? 'promote'
        : detail.canProposeFeature
          ? (detail.featureRequestedAt ? 'proposed' : 'propose')
          : null;

  const shareExpired = detail.shareExpiresAt != null && new Date(detail.shareExpiresAt).getTime() <= Date.now();
  // `shareEnabled` seul ne suffit pas : un lien EXPIRÉ reste `shareEnabled:true` en base tant que
  // personne ne l'a explicitement désactivé. Et un examinateur (`canUse` faux) ne doit jamais voir
  // ni copier un lien, même si le payload porte encore un `shareToken` d'avant (revue architecte).
  const shareUrl =
    canUse && detail.shareEnabled && !shareExpired && detail.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/l/${detail.shareToken}`
      : null;

  /**
   * Le lien affiché (`shareUrl`) vient du CACHE : il peut avoir été révoqué ou expirer pendant
   * que le modal reste ouvert. « Copier » revérifie donc via `ensureListShareLink` (jamais
   * `shareList` — aucune réactivation automatique, éditeur compris) et ne copie QUE l'URL
   * fraîchement renvoyée, jamais l'ancienne fermeture. Un rejet d'`ensureShare` pose déjà son
   * message via son `onError` (affiché dans le modal) ; « Copié » ne s'affiche jamais après échec.
   */
  async function copyLink() {
    if (ensureShare.isPending) return;
    const scope = operations.capture();
    let info: Awaited<ReturnType<typeof ensureListShareLink>>;
    try {
      info = await ensureShare.mutateAsync(undefined, scope);
    } catch {
      return;
    }
    if (!operations.isViewCurrent(scope)) return;
    const freshUrl = info.shareToken && typeof window !== 'undefined' ? `${window.location.origin}/l/${info.shareToken}` : null;
    if (!freshUrl) return;
    try {
      await navigator.clipboard.writeText(freshUrl);
      if (!operations.isViewCurrent(scope)) return;
      setCopied(true);
      setTimeout(() => { if (operations.isViewCurrent(scope)) setCopied(false); }, 2000);
    } catch {
      if (operations.isViewCurrent(scope)) setErrorMessage('La copie du lien a échoué. Réessayez.');
    }
  }
  function removeItem(objectId: string) {
    setItems((prev) => prev.filter((it) => it.objectId !== objectId));
  }
  function setNote(objectId: string, value: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.objectId === objectId ? { ...it, ...(detail?.lang === 'en' ? { noteEn: value } : { noteFr: value }) } : it,
      ),
    );
  }
  function addFromSearch(r: ObjectSearchResult) {
    setAddQuery('');
    if (items.some((it) => it.objectId === r.id)) return;
    // Enrichi immédiatement depuis la carte Explorer déjà chargée par la recherche (image,
    // description, coords), et persisté dans la foulée — parité avec le flux « sélection
    // Explorer » ; le round-trip rapporte les contacts publics (phone/web, serveur-only).
    const next = [...items, listItemFromObjectCard(r.card, items.length)];
    setItems(next);
    queueBackgroundSave((scope) => saveItems.mutateAsync(next, scope));
  }
  function dropItem(to: number) {
    const from = drag.from;
    if (from !== null) setItems((prev) => moveListItem(prev, from, to));
    setDrag({ from: null, over: null });
  }
  /** A11Y-01 — alternative clavier/clic au drag : mêmes garanties (focus stable, borne
   *  désactivée, annonce polie) que ce que WCAG 2.5.7 exige en plus du glisser-déposer.
   *  Calcule `from`/`to`/l'annonce à partir de l'état actuel AVANT `setItems` : l'updater passé
   *  à `setItems` reste pur (StrictMode le rejoue) — aucun effet de bord (annonce, ref) dedans. */
  function moveItem(objectId: string, dir: 'up' | 'down') {
    const from = items.findIndex((it) => it.objectId === objectId);
    if (from === -1) return;
    const to = dir === 'up' ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return;
    const label = items[from].card?.name ?? 'Le lieu';
    lastMovedRef.current = { id: objectId, dir };
    setMoveAnnouncement(`${label} déplacé en position ${to + 1} sur ${items.length}.`);
    setItems((prev) => moveListItem(prev, from, to));
  }
  async function changeListLang(l: 'fr' | 'en') {
    if (operations.isActionLocked() || !detail || detail.lang === l) return;
    const scope = operations.capture();
    const lease = operations.acquireAction(scope);
    if (!lease) return;
    setLangSwitching(true);
    setErrorMessage(null);
    // Gèle la version à basculer MAINTENANT : les champs sont désactivés tant que
    // `langSwitching` est vrai (cf. rendu), donc rien ne peut les modifier pendant l'attente —
    // sans quoi la résolution écraserait une frappe plus récente avec cette valeur figée.
    const outgoing = detail;
    const snapshotName = name;
    const snapshotIntro = intro;
    const snapshotRecipient = recipient;
    const snapshotItems = items;
    const outgoingDirtyItems = dirtyItems;
    try {
      // Un seul thunk en file : il n'agit qu'une fois TOUTE écriture précédente (blur, ajout…)
      // réglée, et lit alors l'état serveur à jour pour composer un patch cohérent.
      const fresh = await enqueueSave(async (captured) => {
        if (!isDynamic && outgoingDirtyItems) await saveItems.mutateAsync(snapshotItems, captured);
        const patch = buildLanguageSwitchPatch(outgoing, l, snapshotName, snapshotIntro, snapshotRecipient);
        return updateMeta.mutateAsync(patch, captured);
      }, scope);
      if (!fresh || !operations.isViewCurrent(scope)) return;
      setPreviewLang(fresh.lang);
      setName(currentListName(fresh));
      setIntro(currentListIntro(fresh));
    } catch (e) {
      if (operations.isViewCurrent(scope)) setErrorMessage(strictErrorMessage(e, 'Échec du changement de langue. Réessayez.'));
    } finally {
      if (operations.isViewCurrent(scope)) setLangSwitching(false);
      operations.releaseAction(lease);
    }
  }
  function chooseTemplate(k: ListTemplate) {
    setTemplate(k);
    if (!detail || k === detail.template) return;
    // comme le mock : passer en Itinéraire active la carte récap si elle ne l'était pas
    const patch: Parameters<typeof updateList>[1] =
      k === 'itineraire' && !detail.showMap ? { template: k, show_map: true } : { template: k };
    queueBackgroundSave((scope) => updateMeta.mutateAsync(patch, scope));
  }
  /**
   * Sauvegarde toute frappe en attente dans la MÊME file que l'autosave, en revalidant `can_edit`
   * à L'EXÉCUTION (pas au clic figé) : entre le clic et son tour dans la file, un admin a pu
   * mettre la liste à la une (ou l'en retirer) et faire perdre l'édition à l'appelant en cours de
   * route. Dans ce cas on n'écrit JAMAIS (la base refuserait) — on renvoie juste si un écart local
   * existe, pour prévenir plutôt que d'échouer l'envoi/la duplication entière.
   */
  function flushPendingEdits(scope = operations.capture()): Promise<boolean> {
    const snapshotName = name;
    const snapshotRecipient = recipient;
    const snapshotIntro = intro;
    const snapshotItems = items;
    const snapshotTemplate = template;
    const fallbackDetail = detail as ObjectListDetail;
    return enqueueSave(async (captured) => {
      const targetKey = listsQueryKeys.detail(captured.listId, captured.userId, captured.orgId);
      const base = queryClient.getQueryData<ObjectListDetail>(targetKey) ?? fallbackDetail;
      const baseName = currentListName(base);
      const baseIntro = currentListIntro(base);
      if (!base.canEdit) {
        return (
          snapshotName !== baseName ||
          snapshotRecipient !== (base.recipientLabel ?? '') ||
          snapshotIntro !== baseIntro ||
          snapshotTemplate !== base.template ||
          (!isDynamic && itemsDiffer(snapshotItems, base.items))
        );
      }
      const metaPatch = buildDraftMetaPatch(base, baseName, baseIntro, snapshotName, snapshotRecipient, snapshotIntro, snapshotTemplate);
      if (Object.keys(metaPatch).length > 0) await updateMeta.mutateAsync(metaPatch, captured);
      const afterMeta = queryClient.getQueryData<ObjectListDetail>(targetKey) ?? base;
      if (!isDynamic && itemsDiffer(snapshotItems, afterMeta.items)) await saveItems.mutateAsync(snapshotItems, captured);
      return false;
    }, scope);
  }

  async function handleSend() {
    if (operations.isActionLocked() || !detail || !serviceAvailability.email) return;
    const operationScope = operations.capture();
    // Freeze the complete recipient counter map before the prompt or any await.
    // A gesture never obtains a newer generation automatically after waiting.
    const context = emailContext.data && { generations: { ...emailContext.data.generations } };
    if (!context) { setErrorMessage(LIST_EMAIL_PROTECTION_UNAVAILABLE_MESSAGE); return; }
    const email = window.prompt('Adresse e-mail du destinataire :', '')?.trim();
    if (!email) return;
    const previous = uncertainSendRef.current.get(email);
    const confirmedPreviousOperationIds = previous?.identity === currentIdentityKey ? [...previous.operationIds] : [];
    const confirmedPreviousOperationId = confirmedPreviousOperationIds.at(-1);
    const confirmResend = previous?.identity === currentIdentityKey;
    if (confirmResend && !window.confirm(LIST_EMAIL_RESEND_CONFIRMATION)) return;
    const lease = operations.acquireAction(operationScope);
    if (!lease) return;
    const scope = sendScopeRef.current;
    const generation = scope.generation;
    const controller = new AbortController();
    scope.controller = controller;
    const isCurrent = () => sendScopeRef.current.generation === generation
      && sendScopeRef.current.identity === currentIdentityKey && !controller.signal.aborted && operations.isSessionCurrent(operationScope);
    const operationId = crypto.randomUUID();
    setSending(true);
    setErrorMessage(null);
    setSendNotice(null);
    try {
      const abandonedLocalEdits = await flushPendingEdits(operationScope);
      if (!isCurrent()) return;
      const result = await sendListByEmail(listId, email, { operationId, context, confirmResend, confirmedPreviousOperationId, confirmedPreviousOperationIds, isCurrent, expectedUserId: userId, signal: controller.signal });
      if (!isCurrent()) return;
      uncertainSendRef.current.delete(email);
      invalidate();
      const sentTo = `E-mail envoyé à ${email}.`;
      // L'e-mail est parti dès que sendListByEmail résout (le relais SMTP l'a accepté) : on ne
      // propose JAMAIS de renvoi automatique ici. `trackingUpdated: false` demande juste une
      // vérification ; `abandonedLocalEdits` prévient que c'est la version SERVEUR qui est partie.
      setSendNotice(
        abandonedLocalEdits
          ? {
              // Ne JAMAIS promettre qu'une duplication récupère ces changements : elle reprend
              // elle aussi la version ENREGISTRÉE (point 3, revue finale) — l'ancienne formule
              // était une fausse promesse.
              tone: 'warning',
              message: `${sentTo} Vos modifications locales n'ont pas pu être enregistrées (droits d'édition perdus) — la version envoyée est celle du serveur.`,
            }
          : result.trackingUpdated
            ? { tone: 'success', message: sentTo }
            : {
                tone: 'warning',
                message: `${sentTo} Son suivi dans l'historique de la liste n'a pas pu être confirmé : vérifiez l'historique avant de renvoyer ce message.`,
              },
      );
    } catch (e) {
      if (!isCurrent()) return;
      if (e instanceof ListEmailUnknownError) {
        const pending = uncertainSendRef.current.get(email);
        uncertainSendRef.current.set(email, { identity: currentIdentityKey,
          operationIds: [...new Set([...(pending?.identity === currentIdentityKey ? pending.operationIds : []), ...e.operationIds])] });
      }
      // A certain refusal of B does not close an earlier A. Keep its chain until
      // an accepted, structured ACK of an intention that carries every predecessor.
      setErrorMessage(
        strictErrorMessage(e, "Échec de l'envoi. Vos modifications restent affichées ici ; réessayez."),
      );
    } finally {
      operations.releaseAction(lease);
      if (sendScopeRef.current.controller === controller) {
        sendScopeRef.current.controller = null;
        setSending(false);
        // Read-only refresh belongs to future gestures; never retry this one.
        void queryClient.invalidateQueries({ queryKey: emailContextKey });
      }
    }
  }

  /**
   * Copie le contenu EFFECTIVEMENT enregistré : une frappe en attente est d'abord sauvegardée
   * dans la même file que l'autosave, sinon la duplication figerait une version périmée.
   * `duplicating` verrouille les champs pendant TOUTE l'opération (flush inclus), pas seulement
   * `duplicate.isPending` — sans ça une frappe pendant le flush lent produirait une autosave
   * après le snapshot lu par `flushPendingEdits` (point 2, revue finale).
   */
  async function handleDuplicate() {
    if (operations.isActionLocked() || !detail || locked) return;
    const scope = operations.capture();
    const lease = operations.acquireAction(scope);
    if (!lease) return;
    setDuplicating(true);
    setErrorMessage(null);
    try {
      const abandonedLocalEdits = await flushPendingEdits(scope);
      if (abandonedLocalEdits) {
        if (!operations.isViewCurrent(scope)) return;
        // Choix produit (point 3) : jamais de sauvegarde inventée sur l'original dont les droits
        // sont perdus, jamais de réhydratation aveugle du brouillon — la copie reprend la
        // dernière version ENREGISTRÉE. Le dire explicitement avant de partir : une navigation
        // silencieuse perdrait le brouillon sans que l'utilisateur l'ait choisi.
        const confirmed = window.confirm(
          "Vos modifications locales n'ont pas pu être enregistrées (droits d'édition perdus) et ne seront PAS incluses dans la copie : la duplication reprend la dernière version enregistrée. Continuer ?",
        );
        if (!confirmed) return;
      }
      await duplicate.mutateAsync(undefined, scope);
    } catch {
      // Message déjà posé par l'onError de la mutation en cause (updateMeta/saveItems/duplicate).
    } finally {
      if (operations.isViewCurrent(scope)) setDuplicating(false);
      operations.releaseAction(lease);
    }
  }

  // Aperçu : nom + intro résolus dans la langue d'aperçu (peut différer de la langue de saisie).
  const previewName =
    previewLang === detail.lang ? name : previewLang === 'en' ? (detail.nameEn ?? detail.name) : detail.name;
  const previewIntro =
    previewLang === detail.lang ? intro : previewLang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? '');
  const previewWidth = channel === 'email' ? 'max-w-[640px]' : channel === 'pdf' ? 'max-w-[794px]' : 'max-w-[1000px]';
  // Verrouille les champs qui alimentent l'envoi/le changement de langue/la duplication pendant
  // leur snapshot : aucune frappe ne doit pouvoir arriver après la lecture figée par
  // `flushPendingEdits` (MET-02/A11Y-07 §changeListLang ; `duplicating` couvre le flush ET
  // `duplicateList`, point 2 revue finale — drag/drop et palette d'ajout en dépendent aussi).
  const locked = sending || langSwitching || duplicating || deleting;
  // can_edit obligatoire pour TOUTE écriture (nom, destinataire, intro, notes, ordre,
  // ajout/retrait, modèle, langue persistée, carte, couverture, suppression, réglages du lien) —
  // §listes 2026-09-07 « Interface attendue ». Les canaux d'aperçu/impression/envoi/copie de
  // lien/duplication restent disponibles à un lecteur : ils ne passent PAS par `readOnly`.
  const readOnly = !canEdit;

  const seg = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Barre d'action */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link ref={backLinkRef} href="/listes" className="grid h-9 w-9 place-items-center rounded-lg border text-ink/70 hover:bg-ink/5" aria-label="Retour aux listes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <label htmlFor="list-name" className="sr-only">Nom de la liste</label>
            <input
              id="list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name === currentListName(detail)) return;
                queueBackgroundSave((scope) => updateMeta.mutateAsync(detail.lang === 'en' ? { name_en: name } : { name }, scope));
              }}
              disabled={locked || readOnly}
              className="w-full truncate rounded-md bg-transparent text-[16px] font-extrabold text-ink outline-none focus:bg-ink/5 disabled:opacity-60"
              placeholder="Nom de la liste"
            />
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink/55">
              <span>
                {isDynamic ? 'Liste dynamique' : 'Liste statique'} · {items.length} {items.length > 1 ? 'lieux' : 'lieu'}
              </span>
              {detail.isFeatured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">
                  <Star className="h-3 w-3 fill-current" /> À la une
                </span>
              )}
              {detail.isArchived && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-2 py-0.5 text-[10.5px] font-bold text-ink/60">
                  Archivée
                </span>
              )}
              {readOnly && (
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-semibold text-ink/50">
                  Lecture seule
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Modèle + Canal + Langue */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
            <span className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/40">Modèle</span>
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.k}
                type="button"
                aria-pressed={template === tpl.k}
                disabled={locked || readOnly}
                onClick={() => chooseTemplate(tpl.k)}
                className={cn(seg, template === tpl.k ? 'bg-white text-orange shadow-sm' : 'text-ink/60 hover:text-ink')}
              >
                {tpl.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
            <button type="button" aria-pressed={channel === 'email'} onClick={() => setChannel('email')} className={cn(seg, channel === 'email' ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
              <Mail className="h-3.5 w-3.5" /> Email
            </button>
            <button type="button" aria-pressed={channel === 'pdf'} onClick={() => setChannel('pdf')} className={cn(seg, channel === 'pdf' ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
              <Printer className="h-3.5 w-3.5" /> PDF
            </button>
            <button type="button" aria-pressed={channel === 'web'} onClick={() => setChannel('web')} className={cn(seg, channel === 'web' ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
              <Globe className="h-3.5 w-3.5" /> Lien
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-ink/5 p-0.5">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={previewLang === l} aria-label={`Aperçu en ${l === 'fr' ? 'français' : 'anglais'}`} onClick={() => setPreviewLang(l)} className={cn(seg, previewLang === l ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canUse}
            onClick={() => window.print()}
            title={canUse ? undefined : PROPOSAL_REVIEW_ONLY_TITLE}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <ListComposeEmailsButton listId={detail.id} />
          {serviceAvailability.email ? (
            <button
              type="button"
              disabled={locked || !canUse}
              onClick={() => void handleSend()}
              title={canUse ? undefined : PROPOSAL_REVIEW_ONLY_TITLE}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-40"
            >
              <Mail className="h-4 w-4" /> {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={locked || !canUse || share.isPending || ensureShare.isPending || remove.isPending}
            onClick={() => {
              // Ouvre toujours le modal de partage ; l'activation/réactivation se fait au premier
              // clic, la désactivation est un choix explicite DANS le modal. `shareEnabled` seul
              // ne suffit pas : un lien EXPIRÉ doit repasser par ensure/share, jamais s'afficher
              // tel quel. Un lecteur (canManageSharing faux) réutilise le lien SANS pouvoir en
              // forcer la réactivation — ensure_list_share_link, jamais share_list (éditeur).
              if (!detail.shareEnabled || shareExpired) {
                if (canManageSharing) share.mutate(true);
                else ensureShare.mutate();
              }
              setShareOpen(true);
            }}
            title={!canUse ? PROPOSAL_REVIEW_ONLY_TITLE : shareUrl ? 'Voir et copier le lien public' : 'Activer et copier le lien public'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white transition disabled:opacity-40',
              shareUrl ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange hover:bg-orange/90',
            )}
          >
            <Link2 className="h-4 w-4" /> {shareUrl ? 'Lien actif' : 'Partager par lien'}
          </button>
          <button
            type="button"
            disabled={!canUse || locked || duplicate.isPending}
            onClick={() => void handleDuplicate()}
            title={canUse ? 'Dupliquer cette liste dans une nouvelle liste personnelle' : PROPOSAL_REVIEW_ONLY_TITLE}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-40"
          >
            {duplicate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyListIcon className="h-4 w-4" />} Dupliquer
          </button>
          {/* Cycle de vie / à la une — réservé à ceux qui en ont la capacité serveur. */}
          {featureAction === 'retire' && (
            <button
              type="button"
              disabled={toggleFeatured.isPending || locked}
              onClick={() => toggleFeatured.mutate(false)}
              title="Retirer cette liste de la une"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-60"
            >
              <Star className="h-4 w-4" /> Retirer de la une
            </button>
          )}
          {featureAction === 'promote' && (
            <button
              type="button"
              disabled={toggleFeatured.isPending || locked}
              onClick={() => toggleFeatured.mutate(true)}
              title="Mettre cette liste à la une de mon organisation"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-60"
            >
              <Star className="h-4 w-4" /> Mettre à la une
            </button>
          )}
          {featureAction === 'review' && (
            <>
              <button
                type="button"
                disabled={review.isPending || locked}
                onClick={() => review.mutate(true)}
                title="Accepter cette proposition et la mettre à la une"
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3 py-2 text-[12.5px] font-bold text-white hover:bg-orange/90 disabled:opacity-60"
              >
                <Star className="h-4 w-4" /> Accepter
              </button>
              <button
                type="button"
                disabled={review.isPending || locked}
                onClick={() => review.mutate(false)}
                title="Refuser cette proposition"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-60"
              >
                Refuser
              </button>
            </>
          )}
          {featureAction === 'propose' && (
            <button
              type="button"
              disabled={proposeFeature.isPending || locked}
              onClick={() => proposeFeature.mutate()}
              title="Proposer cette liste à la une de mon organisation"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-60"
            >
              <Star className="h-4 w-4" /> Proposer à la une
            </button>
          )}
          {featureAction === 'proposed' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink/5 px-3 py-2 text-[12.5px] font-semibold text-ink/50">
              <Star className="h-4 w-4" /> Proposition envoyée
            </span>
          )}
          {detail.isArchived && detail.canRestore && (
            <button
              type="button"
              disabled={restore.isPending || locked}
              onClick={() => restore.mutate()}
              title="Restaurer cette liste (réactivation explicite)"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3 py-2 text-[12.5px] font-bold text-white hover:bg-orange/90 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" /> Restaurer
            </button>
          )}
          <button
            type="button"
            disabled={locked || readOnly || remove.isPending}
            onClick={(event) => {
              if (operations.isActionLocked()) return;
              deleteOpenerRef.current = event.currentTarget;
              restoreDeleteFocusRef.current = true;
              setDeleteError(null);
              setDeleteTarget({ scope: operations.capture(), id: listId, identity: currentIdentityKey, name: name || detail.name });
            }}
            className="grid h-9 w-9 place-items-center rounded-lg border text-red-500 hover:bg-red-50 disabled:opacity-40"
            aria-label="Supprimer la liste"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Corps : éditeur | aperçu */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Éditeur */}
        <div className="overflow-y-auto border-r">
          <div className="space-y-6 p-5">
            {/* MET-03 — retour visible et persistant sur l'échec d'une sauvegarde/suppression/envoi ;
                la valeur locale reste affichée, sans laisser croire à une réussite. */}
            {errorMessage && (
              <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
                <span>{errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage(null)} className="shrink-0 font-semibold hover:underline">
                  Fermer
                </button>
              </div>
            )}
            {sendNotice && (
              <div
                role="status"
                className={cn(
                  'flex items-start justify-between gap-3 rounded-xl border p-3 text-[12.5px]',
                  sendNotice.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800',
                )}
              >
                <span>{sendNotice.message}</span>
                <button type="button" onClick={() => setSendNotice(null)} className="shrink-0 font-semibold hover:underline">
                  Fermer
                </button>
              </div>
            )}
            {/* A11Y-01 — annonce polie de la position après un déplacement clavier/clic. */}
            <div aria-live="polite" className="sr-only">{moveAnnouncement}</div>
            {!canUse && (
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                {PROPOSAL_REVIEW_ONLY_TITLE}
              </div>
            )}
            {/* canEdit peut retomber à faux PENDANT une frappe non enregistrée (mise à la une par
                un admin, retrait…) : le dire tout de suite plutôt que de laisser croire que le
                brouillon affiché est sauvegardé — il ne le sera plus jamais tel quel (point 3,
                revue finale). Jamais de réhydratation automatique ici : le brouillon reste visible. */}
            {readOnly && isDirty && (
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                Vos modifications locales ne peuvent plus être enregistrées (droits d'édition perdus) — elles ne seront pas incluses si vous envoyez ou dupliquez cette liste.
              </div>
            )}
            {shareUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <Link2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <code className="flex-1 truncate text-[12px] text-emerald-900">{shareUrl}</code>
                <button
                  type="button"
                  disabled={ensureShare.isPending}
                  onClick={() => void copyLink()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
            )}

            <section className="space-y-2">
              <label htmlFor="list-recipient" className="block text-[11px] font-bold uppercase tracking-wide text-ink/50">Destinataire</label>
              <input
                id="list-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                onBlur={() => {
                  if (recipient === (detail.recipientLabel ?? '')) return;
                  queueBackgroundSave((scope) => updateMeta.mutateAsync({ recipient_label: recipient }, scope));
                }}
                disabled={locked || readOnly}
                placeholder="ex. Camille & Yann"
                className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-orange disabled:opacity-60"
              />
              <label htmlFor="list-intro" className="block pt-1 text-[11px] font-bold uppercase tracking-wide text-ink/50">Mot d'introduction</label>
              <textarea
                id="list-intro"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                onBlur={() => {
                  const cur = currentListIntro(detail);
                  if (intro === cur) return;
                  queueBackgroundSave((scope) =>
                    updateMeta.mutateAsync(detail.lang === 'en' ? { intro_en: intro } : { intro_fr: intro }, scope),
                  );
                }}
                disabled={locked || readOnly}
                rows={3}
                placeholder="Un mot chaleureux pour le voyageur…"
                className="w-full resize-y rounded-xl border px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-orange disabled:opacity-60"
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wide text-ink/50">
                  Lieux <span className="text-ink/40">({items.length})</span>
                </label>
                {!isDynamic && dirtyItems && (
                  <button
                    type="button"
                    disabled={saveItems.isPending || locked || readOnly}
                    onClick={() => queueBackgroundSave((scope) => saveItems.mutateAsync(items, scope))}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange px-3 py-1.5 text-[12px] font-bold text-white hover:bg-orange/90 disabled:opacity-60"
                  >
                    {saveItems.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Enregistrer
                  </button>
                )}
              </div>

              {isDynamic && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
                  Liste <b>dynamique</b> : ces lieux proviennent des filtres et se mettent à jour automatiquement.
                </div>
              )}

              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-ink/50">
                  {isDynamic
                    ? 'Aucun lieu publié ne correspond aux filtres pour le moment.'
                    : 'Aucun lieu. Ajoutez-en ci-dessous, ou depuis l’explorateur (sélection → « Créer une liste »).'}
                </p>
              ) : (
                <ul className="space-y-2" ref={itemsListRef}>
                  {items.map((it, i) => (
                    <li
                      key={it.objectId}
                      draggable={!isDynamic && !readOnly && !locked}
                      onDragStart={() => setDrag({ from: i, over: i })}
                      onDragOver={(e) => {
                        if (drag.from === null) return;
                        e.preventDefault();
                        setDrag((d) => (d.over === i ? d : { ...d, over: i }));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        dropItem(i);
                      }}
                      onDragEnd={() => setDrag({ from: null, over: null })}
                      className={cn(
                        'flex gap-3 rounded-xl border bg-white p-2.5 transition',
                        drag.from === i && 'opacity-50',
                        drag.from !== null && drag.from !== i && drag.over === i && 'border-orange ring-1 ring-orange/40',
                      )}
                    >
                      {!isDynamic && !readOnly && (
                        <span
                          className="grid w-5 shrink-0 cursor-grab place-items-center self-center text-ink/30"
                          title="Glisser pour réordonner"
                          aria-hidden
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                      )}
                      {/* A11Y-01 — alternative clavier/clic au drag natif : bornes désactivées, nom
                          accessible explicite, focus stable géré par l'effet de réordonnancement. */}
                      {!isDynamic && !readOnly && (
                        <div className="flex shrink-0 flex-col gap-0.5 self-center">
                          <button
                            type="button"
                            data-move-item={it.objectId}
                            data-move-dir="up"
                            disabled={i === 0 || locked}
                            onClick={() => moveItem(it.objectId, 'up')}
                            aria-label={`Monter ${it.card?.name ?? 'ce lieu'} (position ${i + 1} sur ${items.length})`}
                            className="grid h-5 w-5 place-items-center rounded text-ink/40 hover:bg-ink/10 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            data-move-item={it.objectId}
                            data-move-dir="down"
                            disabled={i === items.length - 1 || locked}
                            onClick={() => moveItem(it.objectId, 'down')}
                            aria-label={`Descendre ${it.card?.name ?? 'ce lieu'} (position ${i + 1} sur ${items.length})`}
                            className="grid h-5 w-5 place-items-center rounded text-ink/40 hover:bg-ink/10 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <span
                        className="h-12 w-14 shrink-0 rounded-lg bg-ink/10 bg-cover bg-center"
                        style={{ backgroundImage: it.card?.image ? `url("${it.card.image}")` : undefined }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold tabular-nums text-ink/40">{String(i + 1).padStart(2, '0')}</span>
                          <span className="truncate text-[13px] font-bold text-ink">{it.card?.name ?? it.objectId}</span>
                          {it.card?.city && <span className="truncate text-[11.5px] text-ink/50">{it.card.city}</span>}
                        </div>
                        {!isDynamic && (
                          <input
                            value={(detail.lang === 'en' ? it.noteEn : it.noteFr) ?? ''}
                            onChange={(e) => setNote(it.objectId, e.target.value)}
                            disabled={locked || readOnly}
                            aria-label={`Note pour ${it.card?.name ?? 'ce lieu'}`}
                            placeholder="Note (coup de cœur)…"
                            className="mt-1.5 w-full rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12px] outline-none focus:bg-ink/10 disabled:opacity-60"
                          />
                        )}
                      </div>
                      {!isDynamic && !readOnly && (
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => removeItem(it.objectId)}
                          className="grid h-7 w-7 shrink-0 place-items-center self-start rounded-lg text-ink/40 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                          aria-label={`Retirer ${it.card?.name ?? 'ce lieu'}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Palette d'ajout (statique) — recherche nom/commune, clic = ajout en fin de liste */}
              {!isDynamic && !readOnly && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-xl border px-3 py-2 focus-within:border-orange">
                    <Search className="h-4 w-4 shrink-0 text-ink/40" />
                    <input
                      value={addQuery}
                      onChange={(e) => setAddQuery(e.target.value)}
                      disabled={locked}
                      placeholder="Ajouter un lieu (nom, commune…)"
                      className="w-full border-0 bg-transparent p-0 text-[13.5px] outline-none disabled:opacity-60"
                    />
                    {objectSearch.loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink/40" />}
                  </div>
                  {addQuery.trim().length >= 2 && (
                    <ul className="overflow-hidden rounded-xl border bg-white">
                      {(() => {
                        // Le picker global cherche published+draft (édition/relations en ont besoin),
                        // mais une liste ne peut retenir que des fiches PUBLIÉES : la base rejette
                        // désormais un brouillon ajouté (cf. mergeEnrichedListItems côté saveItems).
                        // Filtre LOCAL plutôt qu'une option sur useObjectSearch, pour ne rien changer
                        // à son usage par les autres pickers (§listes 2026-09-07, revue finale).
                        const candidates = objectSearch.results.filter(
                          (r) => r.status === 'published' && !items.some((it) => it.objectId === r.id),
                        );
                        if (candidates.length === 0) {
                          return (
                            <li className="px-3 py-2.5 text-[12.5px] text-ink/50">
                              {objectSearch.loading ? 'Recherche…' : 'Aucun résultat.'}
                            </li>
                          );
                        }
                        return candidates.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => addFromSearch(r)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-orange/5 disabled:opacity-60"
                            >
                              <Plus className="h-3.5 w-3.5 shrink-0 text-orange" />
                              <span className="truncate text-[13px] font-semibold text-ink">{r.name}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-ink/45">
                                {r.type}
                                {r.city ? ` · ${r.city}` : ''}
                              </span>
                            </button>
                          </li>
                        ));
                      })()}
                    </ul>
                  )}
                </div>
              )}
            </section>

            {/* Options du rendu — couverture, carte récap, accent, langue du message (persistés) */}
            <section className="space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-ink/50">Options du rendu</label>

              {/* Couverture — dérivée du premier lieu illustré par défaut ; sélection explicite
                  parmi les photos des lieux, ou retour au mode automatique. Jamais persistée
                  automatiquement : seul un choix explicite écrit `cover_url`. */}
              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-ink">
                    <Camera className="h-4 w-4 shrink-0 text-ink/50" />
                    <b className="font-bold">Couverture</b>
                  </span>
                  {!readOnly && detail.coverUrl && (
                    <button
                      type="button"
                      disabled={updateMeta.isPending || locked}
                      onClick={() => queueBackgroundSave((scope) => updateMeta.mutateAsync({ cover_url: null }, scope))}
                      className="text-[12px] font-semibold text-orange hover:underline disabled:opacity-60"
                    >
                      Automatique
                    </button>
                  )}
                </div>
                <div className="relative h-24 w-full overflow-hidden rounded-lg bg-ink/10" role="img" aria-label="Aperçu de la couverture">
                  <CoverImage src={detail.effectiveCoverUrl} className="absolute inset-0 h-full w-full" />
                </div>
                {!readOnly && (() => {
                  const candidates = items
                    .map((it) => it.card?.image)
                    .filter((img): img is string => Boolean(img))
                    .filter((img, idx, arr) => arr.indexOf(img) === idx);
                  if (candidates.length === 0) return null;
                  return (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {candidates.map((img) => (
                        <button
                          key={img}
                          type="button"
                          disabled={updateMeta.isPending || locked}
                          aria-label="Choisir cette photo comme couverture"
                          aria-pressed={detail.coverUrl === img}
                          onClick={() => queueBackgroundSave((scope) => updateMeta.mutateAsync({ cover_url: img }, scope))}
                          className={cn(
                            'relative h-12 w-16 shrink-0 overflow-hidden rounded-md ring-2 ring-offset-1 transition',
                            detail.coverUrl === img ? 'ring-orange' : 'ring-transparent hover:ring-ink/20',
                          )}
                        >
                          <CoverImage src={img} className="absolute inset-0 h-full w-full" />
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-ink">
                  <MapPin className="h-4 w-4 shrink-0 text-ink/50" />
                  <span className="min-w-0">
                    <b className="font-bold">Carte récap du parcours</b>
                    <small className="block text-[11.5px] text-ink/55">Situe les lieux sur une carte du Sud</small>
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={detail.showMap}
                  aria-label="Carte récap du parcours"
                  disabled={updateMeta.isPending || locked || readOnly}
                  onClick={() => queueBackgroundSave((scope) => updateMeta.mutateAsync({ show_map: !detail.showMap }, scope))}
                  className={cn('relative h-6 w-11 shrink-0 rounded-full transition', detail.showMap ? 'bg-orange' : 'bg-ink/20')}
                >
                  <span
                    className={cn(
                      'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                      detail.showMap ? 'translate-x-[20px]' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="min-w-0 text-[13px] text-ink">
                  <b className="font-bold">Couleur d'accent</b>
                  <small className="block text-[11.5px] text-ink/55">Teinte du rendu OTI (hero, boutons, notes)</small>
                </span>
                <div className="flex shrink-0 gap-1.5">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.k}
                      type="button"
                      title={a.label}
                      aria-label={`Accent ${a.label}`}
                      aria-pressed={detail.accent === a.k}
                      disabled={updateMeta.isPending || locked || readOnly}
                      onClick={() => queueBackgroundSave((scope) => updateMeta.mutateAsync({ accent: a.k }, scope))}
                      className={cn(
                        'h-6 w-6 rounded-full border-2 transition',
                        detail.accent === a.k ? 'scale-110 border-ink' : 'border-transparent hover:scale-105',
                      )}
                      style={{ backgroundColor: ACCENT_INK[a.k] }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="min-w-0 text-[13px] text-ink">
                  <b className="font-bold">Langue du message</b>
                  <small className="block text-[11.5px] text-ink/55">Langue d'édition (intro, notes) et du rendu par défaut</small>
                </span>
                <div className="flex shrink-0 gap-0.5 rounded-lg bg-ink/5 p-0.5">
                  {(['fr', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={detail.lang === l}
                      aria-label={`Éditer en ${l === 'fr' ? 'français' : 'anglais'}`}
                      disabled={updateMeta.isPending || locked || readOnly}
                      onClick={() => void changeListLang(l)}
                      className={cn(seg, detail.lang === l ? 'bg-white text-orange shadow-sm' : 'text-ink/60')}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Aperçu live */}
        <div className="relative hidden min-h-0 flex-col overflow-hidden bg-[#e8e2d6] lg:flex">
          <span className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1 text-[11px] font-bold text-white backdrop-blur">
            {channel === 'email' ? <Mail className="h-3 w-3" /> : channel === 'pdf' ? <Printer className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
            Aperçu {channel === 'email' ? 'email' : channel === 'pdf' ? 'PDF' : 'page web'} · {previewLang.toUpperCase()}
          </span>
          <div className="flex-1 overflow-auto p-6 pt-12">
            <div className={cn('mx-auto w-full', previewWidth)}>
              <ChannelFrame
                channel={channel}
                name={previewName}
                recipient={recipient || null}
                lang={previewLang}
                shareUrl={shareUrl}
              >
                <OtiTemplate
                  template={template}
                  lang={previewLang}
                  accent={detail.accent}
                  name={previewName}
                  recipient={recipient || null}
                  intro={previewIntro}
                  coverUrl={detail.effectiveCoverUrl}
                  items={itemsToOtiPois(items, previewLang)}
                  narrow={channel === 'email'}
                  showMap={detail.showMap}
                  onMapSnapshot={setMapShot}
                  advisorName={userName}
                  advisorEmail={userEmail}
                  advisorAvatarUrl={userAvatarUrl}
                />
              </ChannelFrame>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null && deleteTarget.identity === currentIdentityKey}
        title="Supprimer la liste ?"
        message={<>
          Supprimer définitivement la liste « {deleteTarget?.name} » ? Cette action est irréversible.
          {deleteError && <span className="block text-red-600" role="alert">{deleteError}</span>}
        </>}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        tone="danger"
        busy={deleting}
        onCancel={() => { if (!operations.isActionLocked()) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />

      {/* Modal de partage : lien public à copier + désactivation explicite. */}
      <Modal title="Partager par lien" open={shareOpen} onOpenChange={setShareOpen}>
        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-ink/70">
              Toute personne disposant de ce lien peut consulter la liste — établissements publiés uniquement,
              sans le nom du destinataire.
            </p>
            <div className="flex items-center gap-2 rounded-xl border bg-ink/5 px-3 py-2.5">
              <Link2 className="h-4 w-4 shrink-0 text-ink/50" />
              <code className="flex-1 truncate text-[12.5px] text-ink" title={shareUrl}>{shareUrl}</code>
              <button
                type="button"
                disabled={ensureShare.isPending}
                onClick={() => void copyLink()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
            {/* Le lien affiché vient du cache et reste visible même révoqué/expiré ailleurs — le
                dernier échec de « Copier » (revérifié via ensureShare) doit rester lisible ICI,
                pas seulement dans la bannière globale (point 1, revue finale). */}
            {ensureShare.isError && (
              <p className="text-[12.5px] text-red-600">
                {ensureShare.error instanceof Error ? ensureShare.error.message : 'La copie du lien a échoué. Réessayez.'}
              </p>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-orange hover:underline"
              >
                <Globe className="h-3.5 w-3.5" /> Ouvrir la page publique
              </a>
              {/* Un lecteur ne peut ni modifier ni révoquer les réglages de partage communs —
                  le bouton n'existe même pas hors capacité éditeur (§listes 2026-09-07). */}
              {canManageSharing && (
                <button
                  type="button"
                  disabled={share.isPending}
                  onClick={() => {
                    share.mutate(false);
                    setShareOpen(false);
                  }}
                  className="text-[12.5px] font-semibold text-red-600 hover:underline disabled:opacity-60"
                >
                  Désactiver le lien
                </button>
              )}
            </div>
          </div>
        ) : share.isError || ensureShare.isError ? (
          <p className="text-[13px] text-red-600">
            {ensureShare.error instanceof Error
              ? ensureShare.error.message
              : "Impossible d'activer le lien de partage. Fermez et réessayez."}
          </p>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Activation du lien de partage…
          </div>
        )}
      </Modal>

      {/* Portail d'impression : un OtiTemplate pleine largeur rendu sous <body>, révélé
          uniquement à l'impression (window.print) — cf. @media print dans oti-template.css. */}
      {mounted &&
        createPortal(
          <div className="oti-print-portal">
            <OtiTemplate
              template={template}
              lang={previewLang}
              accent={detail.accent}
              name={previewName}
              recipient={recipient || null}
              intro={previewIntro}
              coverUrl={detail.effectiveCoverUrl}
              items={itemsToOtiPois(items, previewLang)}
              showMap={detail.showMap}
              staticMap
              mapSnapshot={mapShot}
              advisorName={userName}
              advisorEmail={userEmail}
              advisorAvatarUrl={userAvatarUrl}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
