'use client';

// Module Listes — composition d'une liste (éditeur à gauche + aperçu brandé live à droite).
// Lecture/écriture via les RPC DEFINER. L'aperçu utilise OtiTemplate (le MÊME rendu que la
// page publique), dans le canal choisi (email étroit / PDF A4 / lien web) et la langue choisie.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Globe, GripVertical, Link2, Loader2, Mail, MapPin, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import OtiTemplate, { itemsToOtiPois } from '@/features/lists/OtiTemplate';
import type { OtiMapSnapshot } from '@/features/lists/oti-map-utils';
import ChannelFrame from '@/features/lists/ChannelFrame';
import { Modal } from '@/components/common/Modal';
import { CopyEmailsModal } from '@/components/explorer/CopyEmailsModal';
import { ACCENT_INK } from '@/features/lists/type-meta';
import { useObjectSearch, type ObjectSearchResult } from '@/features/object-editor/useObjectSearch';
import { useUnsavedDraftGuard } from '@/features/object-editor/useUnsavedDraftGuard';
import { useSessionStore } from '@/store/session-store';
import {
  deleteList,
  getList,
  listItemFromObjectCard,
  mergeEnrichedListItems,
  moveListItem,
  sendListByEmail,
  setListItems,
  shareList,
  updateList,
  type ListAccent,
  type ListPatch,
  type ListTemplate,
  type ObjectListDetail,
  type ObjectListItem,
} from '@/services/lists';
import { cn } from '@/lib/utils';

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

/** Editable name/intro for the list's CURRENT composition language (A11Y-07 — name_en support). */
function currentListName(detail: ObjectListDetail): string {
  return detail.lang === 'en' ? (detail.nameEn ?? '') : detail.name;
}
function currentListIntro(detail: ObjectListDetail): string {
  return detail.lang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? '');
}

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

  const detailQuery = useQuery({ queryKey: ['list', listId], queryFn: () => getList(listId) });
  const detail = detailQuery.data ?? null;

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
  const [drag, setDrag] = useState<{ from: number | null; over: number | null }>({ from: null, over: null });
  const [addQuery, setAddQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<{ tone: 'success' | 'warning'; message: string } | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const hydratedListId = useRef<string | null>(null);
  // File RÉELLE (pas un simple pointeur) : un thunk ne démarre — donc n'appelle le réseau —
  // qu'une fois le précédent réglé. Un pointeur écrasé par l'appel suivant (ancienne version)
  // laisse une sauvegarde lente répondre APRÈS une plus récente et écraser du contenu approuvé
  // (MET-02). Cette file couvre TOUTES les écritures méta/lieux : blur, ajout, bouton
  // Enregistrer, modèle, langue, autres bascules.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Verrou synchrone (pas un state) : bloque la ré-entrance même dans le même tick, avant que
  // React n'ait eu la chance de committer `sending`/`langSwitching`.
  const actionLockRef = useRef(false);
  const lastMovedRef = useRef<{ id: string; dir: 'up' | 'down' } | null>(null);
  const itemsListRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Hydrate l'état d'édition à l'arrivée de la liste (ou au changement de liste) UNIQUEMENT :
  // re-hydrater à chaque refetch clobberait les notes/l'ordre non enregistrés (write-trap).
  useEffect(() => {
    if (!detail || hydratedListId.current === detail.id) return;
    hydratedListId.current = detail.id;
    setName(currentListName(detail));
    setRecipient(detail.recipientLabel ?? '');
    setIntro(currentListIntro(detail));
    setItems(detail.items);
    setTemplate(detail.template);
    setPreviewLang(detail.lang);
  }, [detail]);

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
  function enqueueSave<T>(run: () => Promise<T>): Promise<T> {
    const started = saveQueueRef.current.then(run);
    saveQueueRef.current = started.then(
      () => undefined,
      () => undefined,
    );
    return started;
  }
  /** Autosave fond perdu (blur, ajout, modèle, bascules) : mise en file réelle, mais l'appelant
   *  ne l'attend pas — l'erreur reste visible via le `onError` de la mutation (bannière), jamais
   *  une rejection non gérée. */
  function queueBackgroundSave<T>(run: () => Promise<T>): void {
    enqueueSave(run).catch(() => {});
  }

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['list', listId] });
    void queryClient.invalidateQueries({ queryKey: ['my-lists'] });
  };
  // Rafraîchit le cache depuis le détail renvoyé par la mutation (pas de refetch, pas de
  // ré-hydratation des champs en cours d'édition).
  const applyFresh = (fresh: ObjectListDetail | null) => {
    if (fresh) queryClient.setQueryData(['list', listId], fresh);
    else void queryClient.invalidateQueries({ queryKey: ['list', listId] });
    void queryClient.invalidateQueries({ queryKey: ['my-lists'] });
  };
  const updateMeta = useMutation({
    mutationFn: (patch: Parameters<typeof updateList>[1]) => updateList(listId, patch),
    onSuccess: applyFresh,
    // MET-03 — un refus réseau/autorisation doit rester visible : la valeur locale reste
    // affichée (write-trap sinon), mais l'utilisateur doit savoir qu'elle n'est PAS enregistrée.
    onError: (e) =>
      setErrorMessage(e instanceof Error ? e.message : "Échec de l'enregistrement. Vos modifications sont conservées ici ; réessayez."),
  });
  const saveItems = useMutation({
    // La liste à persister est passée en argument (pas lue de la closure) : l'auto-save
    // d'un ajout fireant juste après setItems ne doit pas envoyer l'état précédent.
    mutationFn: (list: ObjectListItem[]) =>
      setListItems(
        listId,
        list.map((it, i) => ({ object_id: it.objectId, position: i, note_fr: it.noteFr, note_en: it.noteEn })),
      ),
    onSuccess: (fresh) => {
      applyFresh(fresh);
      // adopte l'enrichissement serveur (carte i18n + contacts publics) SANS écraser
      // l'édition locale en vol (note en cours de frappe, second ajout pendant le round-trip)
      if (fresh) setItems((prev) => mergeEnrichedListItems(prev, fresh.items));
    },
    onError: (e) =>
      setErrorMessage(e instanceof Error ? e.message : 'Enregistrement des lieux impossible. Réessayez.'),
  });
  // Active/désactive le lien public. La réponse porte déjà le token : patch synchrone du
  // cache pour que le modal affiche le lien sans attendre un refetch.
  const share = useMutation({
    mutationFn: (enable: boolean) => shareList(listId, enable),
    onSuccess: (info) => {
      queryClient.setQueryData<ObjectListDetail>(['list', listId], (old) =>
        old
          ? { ...old, shareToken: info.shareToken, shareEnabled: info.shareEnabled, shareExpiresAt: info.shareExpiresAt }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['my-lists'] });
    },
    onError: (e) => setErrorMessage(e instanceof Error ? e.message : 'Partage impossible. Réessayez.'),
  });
  const remove = useMutation({
    mutationFn: () => deleteList(listId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-lists'] });
      router.push('/listes');
    },
    onError: (e) => setErrorMessage(e instanceof Error ? e.message : 'Suppression impossible. Réessayez.'),
  });

  // Palette « Ajouter un lieu » (listes statiques) — même recherche nom/commune que les pickers §15/§19.
  const objectSearch = useObjectSearch(addQuery, { enabled: detail?.kind === 'static' });

  // MET-04 — garde de sortie : couvre nom/destinataire/intro/modèle ET (pour une liste statique)
  // l'ordre/les notes des lieux. Calculé avant tout retour anticipé (règle des Hooks).
  const isDynamic = detail?.kind === 'dynamic';
  // N'active la garde qu'UNE FOIS cette liste hydratée : avant l'effet d'hydratation, les
  // champs locaux sont encore vides et divergeraient à tort de `detail`, activant brièvement
  // (et à tort) l'écouteur popstate/beforeunload — jusqu'à pousser une entrée d'historique
  // parasite dès l'arrivée des données.
  const hydrated = detail != null && hydratedListId.current === detail.id;
  const dirtyItems = detail
    ? JSON.stringify(items.map((i) => [i.objectId, i.noteFr, i.noteEn])) !==
      JSON.stringify(detail.items.map((i) => [i.objectId, i.noteFr, i.noteEn]))
    : false;
  const dirtyMeta = detail
    ? name !== currentListName(detail) ||
      recipient !== (detail.recipientLabel ?? '') ||
      intro !== currentListIntro(detail) ||
      template !== detail.template
    : false;
  // Une suppression réussie ne doit jamais laisser la garde bloquer le départ programmé.
  const isDirty = hydrated && !remove.isSuccess && (dirtyMeta || (!isDynamic && dirtyItems));
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

  const shareUrl =
    detail.shareEnabled && detail.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/l/${detail.shareToken}`
      : null;

  function copyLink() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
    queueBackgroundSave(() => saveItems.mutateAsync(next));
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
    if (actionLockRef.current || !detail || detail.lang === l) return;
    actionLockRef.current = true;
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
      const fresh = await enqueueSave(async () => {
        if (!isDynamic && outgoingDirtyItems) {
          await saveItems.mutateAsync(snapshotItems);
        }
        const patch: ListPatch = { lang: l };
        const outgoingName = currentListName(outgoing);
        const outgoingIntro = currentListIntro(outgoing);
        if (snapshotName !== outgoingName) patch[outgoing.lang === 'en' ? 'name_en' : 'name'] = snapshotName;
        if (snapshotIntro !== outgoingIntro) patch[outgoing.lang === 'en' ? 'intro_en' : 'intro_fr'] = snapshotIntro;
        if (snapshotRecipient !== (outgoing.recipientLabel ?? '')) patch.recipient_label = snapshotRecipient;
        return updateMeta.mutateAsync(patch);
      });
      if (!fresh) return;
      setPreviewLang(fresh.lang);
      setName(currentListName(fresh));
      setIntro(currentListIntro(fresh));
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Échec du changement de langue. Réessayez.');
    } finally {
      setLangSwitching(false);
      actionLockRef.current = false;
    }
  }
  function chooseTemplate(k: ListTemplate) {
    setTemplate(k);
    if (!detail || k === detail.template) return;
    // comme le mock : passer en Itinéraire active la carte récap si elle ne l'était pas
    const patch: Parameters<typeof updateList>[1] =
      k === 'itineraire' && !detail.showMap ? { template: k, show_map: true } : { template: k };
    queueBackgroundSave(() => updateMeta.mutateAsync(patch));
  }
  async function handleSend() {
    if (actionLockRef.current || !detail) return;
    const email = window.prompt('Adresse e-mail du destinataire :', '')?.trim();
    if (!email) return;
    actionLockRef.current = true;
    setSending(true);
    setErrorMessage(null);
    setSendNotice(null);
    // Gèle le cliché à envoyer : les champs concernés sont désactivés tant que `sending` est
    // vrai (cf. rendu), donc ces valeurs ne peuvent plus changer sous nos pieds pendant l'attente.
    const snapshotName = name;
    const snapshotRecipient = recipient;
    const snapshotIntro = intro;
    const snapshotItems = items;
    const snapshotTemplate = template;
    // Capture explicite : `detail` est non-nul ici (garde ci-dessus), mais TS ne reporte pas ce
    // rétrécissement dans la fermeture async ci-dessous — capturer évite tout `?? detail`
    // potentiellement `null` (et tout `any`/assertion) plus bas.
    const fallbackDetail: ObjectListDetail = detail;
    try {
      // MET-02 — un seul thunk en file : il n'agit qu'une fois TOUTE écriture précédente (blur,
      // ajout, modèle, langue…) réglée — succès ou échec — jamais avant. Il relit alors l'état
      // serveur à jour pour ne persister que ce qui diffère encore, puis c'est CETTE version
      // confirmée qui est envoyée. Un échec ici propage et annule l'envoi (rejet plus bas).
      await enqueueSave(async () => {
        const base = queryClient.getQueryData<ObjectListDetail>(['list', listId]) ?? fallbackDetail;
        const metaPatch: ListPatch = {};
        const baseName = currentListName(base);
        const baseIntro = currentListIntro(base);
        if (snapshotName !== baseName) metaPatch[base.lang === 'en' ? 'name_en' : 'name'] = snapshotName;
        if (snapshotRecipient !== (base.recipientLabel ?? '')) metaPatch.recipient_label = snapshotRecipient;
        if (snapshotIntro !== baseIntro) metaPatch[base.lang === 'en' ? 'intro_en' : 'intro_fr'] = snapshotIntro;
        if (snapshotTemplate !== base.template) metaPatch.template = snapshotTemplate;
        if (Object.keys(metaPatch).length > 0) {
          await updateMeta.mutateAsync(metaPatch);
        }
        const afterMeta = queryClient.getQueryData<ObjectListDetail>(['list', listId]) ?? base;
        const stillDirtyItems =
          JSON.stringify(snapshotItems.map((i) => [i.objectId, i.noteFr, i.noteEn])) !==
          JSON.stringify(afterMeta.items.map((i) => [i.objectId, i.noteFr, i.noteEn]));
        if (!isDynamic && stillDirtyItems) {
          await saveItems.mutateAsync(snapshotItems);
        }
      });
      const result = await sendListByEmail(listId, email);
      invalidate();
      // L'e-mail est parti dès que sendListByEmail résout (le relais SMTP l'a accepté) : on ne
      // propose JAMAIS de renvoi automatique ici, même si le marquage « envoyée » a échoué —
      // renvoyer produirait un doublon. `trackingUpdated: false` demande juste une vérification.
      setSendNotice(
        result.trackingUpdated
          ? { tone: 'success', message: `E-mail envoyé à ${email}.` }
          : {
              tone: 'warning',
              message: `E-mail envoyé à ${email}. Son suivi dans l'historique de la liste n'a pas pu être confirmé : vérifiez l'historique avant de renvoyer ce message.`,
            },
      );
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : "Échec de l'envoi. Vos modifications restent affichées ici ; réessayez.",
      );
    } finally {
      setSending(false);
      actionLockRef.current = false;
    }
  }

  // Aperçu : nom + intro résolus dans la langue d'aperçu (peut différer de la langue de saisie).
  const previewName =
    previewLang === detail.lang ? name : previewLang === 'en' ? (detail.nameEn ?? detail.name) : detail.name;
  const previewIntro =
    previewLang === detail.lang ? intro : previewLang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? '');
  const previewWidth = channel === 'email' ? 'max-w-[640px]' : channel === 'pdf' ? 'max-w-[794px]' : 'max-w-[1000px]';
  // Verrouille les champs qui alimentent l'envoi/le changement de langue pendant leur snapshot :
  // aucune frappe ne doit pouvoir arriver après la lecture figée (MET-02/A11Y-07 §changeListLang).
  const locked = sending || langSwitching;

  const seg = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Barre d'action */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/listes" className="grid h-9 w-9 place-items-center rounded-lg border text-ink/70 hover:bg-ink/5" aria-label="Retour aux listes">
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
                queueBackgroundSave(() => updateMeta.mutateAsync(detail.lang === 'en' ? { name_en: name } : { name }));
              }}
              disabled={locked}
              className="w-full truncate rounded-md bg-transparent text-[16px] font-extrabold text-ink outline-none focus:bg-ink/5 disabled:opacity-60"
              placeholder="Nom de la liste"
            />
            <div className="text-[12px] text-ink/55">
              {isDynamic ? 'Liste dynamique' : 'Liste statique'} · {items.length} {items.length > 1 ? 'lieux' : 'lieu'}
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
                disabled={locked}
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

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <ListComposeEmailsButton listId={detail.id} />
          <button
            type="button"
            disabled={locked}
            onClick={() => void handleSend()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold text-ink/80 hover:bg-ink/5 disabled:opacity-60"
          >
            <Mail className="h-4 w-4" /> {sending ? 'Envoi…' : 'Envoyer'}
          </button>
          <button
            type="button"
            disabled={locked || share.isPending || remove.isPending}
            onClick={() => {
              // Ouvre toujours le modal de partage ; l'activation se fait au premier clic,
              // la désactivation est un choix explicite DANS le modal (plus de toggle surprise).
              if (!detail.shareEnabled) share.mutate(true);
              setShareOpen(true);
            }}
            title={detail.shareEnabled ? 'Voir et copier le lien public' : 'Activer et copier le lien public'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white transition disabled:opacity-60',
              detail.shareEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange hover:bg-orange/90',
            )}
          >
            <Link2 className="h-4 w-4" /> {detail.shareEnabled ? 'Lien actif' : 'Partager par lien'}
          </button>
          <button
            type="button"
            disabled={locked || remove.isPending}
            onClick={() => window.confirm('Supprimer définitivement cette liste ?') && remove.mutate()}
            className="grid h-9 w-9 place-items-center rounded-lg border text-red-500 hover:bg-red-50"
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
            {shareUrl && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <Link2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <code className="flex-1 truncate text-[12px] text-emerald-900">{shareUrl}</code>
                <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700">
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
                  queueBackgroundSave(() => updateMeta.mutateAsync({ recipient_label: recipient }));
                }}
                disabled={locked}
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
                  queueBackgroundSave(() =>
                    updateMeta.mutateAsync(detail.lang === 'en' ? { intro_en: intro } : { intro_fr: intro }),
                  );
                }}
                disabled={locked}
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
                    disabled={saveItems.isPending || locked}
                    onClick={() => queueBackgroundSave(() => saveItems.mutateAsync(items))}
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
                      draggable={!isDynamic}
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
                      {!isDynamic && (
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
                      {!isDynamic && (
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
                            disabled={locked}
                            aria-label={`Note pour ${it.card?.name ?? 'ce lieu'}`}
                            placeholder="Note (coup de cœur)…"
                            className="mt-1.5 w-full rounded-lg bg-ink/5 px-2.5 py-1.5 text-[12px] outline-none focus:bg-ink/10 disabled:opacity-60"
                          />
                        )}
                      </div>
                      {!isDynamic && (
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
              {!isDynamic && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-xl border px-3 py-2 focus-within:border-orange">
                    <Search className="h-4 w-4 shrink-0 text-ink/40" />
                    <input
                      value={addQuery}
                      onChange={(e) => setAddQuery(e.target.value)}
                      placeholder="Ajouter un lieu (nom, commune…)"
                      className="w-full border-0 bg-transparent p-0 text-[13.5px] outline-none"
                    />
                    {objectSearch.loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink/40" />}
                  </div>
                  {addQuery.trim().length >= 2 && (
                    <ul className="overflow-hidden rounded-xl border bg-white">
                      {(() => {
                        const candidates = objectSearch.results.filter((r) => !items.some((it) => it.objectId === r.id));
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
                              onClick={() => addFromSearch(r)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-orange/5"
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

            {/* Options du rendu — carte récap, accent, langue du message (persistés) */}
            <section className="space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-ink/50">Options du rendu</label>
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
                  disabled={updateMeta.isPending || locked}
                  onClick={() => queueBackgroundSave(() => updateMeta.mutateAsync({ show_map: !detail.showMap }))}
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
                      disabled={updateMeta.isPending || locked}
                      onClick={() => queueBackgroundSave(() => updateMeta.mutateAsync({ accent: a.k }))}
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
                      disabled={updateMeta.isPending || locked}
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
                  coverUrl={detail.coverUrl}
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
                onClick={copyLink}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-orange hover:underline"
              >
                <Globe className="h-3.5 w-3.5" /> Ouvrir la page publique
              </a>
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
            </div>
          </div>
        ) : share.isError ? (
          <p className="text-[13px] text-red-600">Impossible d'activer le lien de partage. Fermez et réessayez.</p>
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
              coverUrl={detail.coverUrl}
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
