'use client';

/**
 * Le plombier de la fiche : état d'édition, brouillon local, navigation par `?rubrique=`,
 * et l'envoi. Tout le rendu vit dans `PortalFicheHub`.
 *
 * ⚠ MONTÉ SOUS `key={objectId}`. `useObjectEditorState` est INIT-ONCE : elle prend un
 * instantané des modules au premier rendu et ne se resynchronise jamais. Changer de fiche
 * sans changer de clé garderait le brouillon de la précédente.
 *
 * La page ne se démonte JAMAIS entre deux rubriques : `?rubrique=` est lu par
 * `useSearchParams`, et la navigation passe par `router.push` / `<Link>` (navigation DOUCE).
 * Un `<a href>` nu serait une navigation complète dans l'App Router : la page remonterait,
 * l'état d'édition repartirait de zéro et le brouillon en mémoire serait perdu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { PortalFicheHub, type PortalRejection } from './PortalFicheHub';
import { PortalSendModal } from './PortalSendModal';
import { buildPortalRubrics, portalTypeLabel, PORTAL_RUBRICS } from './portal-rubrics';
import {
  clearPortalSent,
  readPortalSent,
  usePortalDraft,
  usePortalFormCache,
  type PortalSentSnapshot,
} from './usePortalDraft';
import { readPublicContact } from './portal-bindings';
import { MODULE_KEY_MAP } from '../object-editor/editor-state';
import { useObjectEditorState } from '../object-editor/useObjectEditorState';
import { useSessionStore } from '../../store/session-store';
import type { ArchetypeCode } from '../object-editor/archetypes';
import type { MySubmission, PortalFiche, PortalVisibility } from '../../services/portal';
import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceContactsModule, ObjectWorkspaceMediaModule } from '../../services/object-workspace-parser';

export interface PortalFicheEditorProps {
  objectId: string;
  archetype: ArchetypeCode;
  resource: ObjectWorkspaceResource;
  visibility: PortalVisibility;
  submissions: MySubmission[];
  fiche: PortalFiche | null;
  ficheCount: number;
  /** La fiche vient du cache et le rafraîchissement a échoué. */
  refreshFailed?: boolean;
}

/** L'envoi OUVERT de cette fiche, et le dernier RÉSOLU — deux lectures distinctes. */
function splitSubmissions(submissions: MySubmission[], openId: string | null) {
  const open =
    submissions.find((entry) => (openId ? entry.id === openId : entry.status === 'pending' && !entry.resolvedAt)) ?? null;
  const resolved = submissions.find((entry) => entry.resolvedAt !== null) ?? null;
  return { open, resolved };
}

export function PortalFicheEditor({
  objectId,
  archetype,
  resource,
  visibility,
  submissions,
  fiche,
  ficheCount,
  refreshFailed = false,
}: PortalFicheEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);

  /**
   * L'appareil ne peut plus rien retenir (mémoire pleine, stockage refusé). L'écriture
   * échouait EN SILENCE : la saisie redevenait volatile sans que rien ne le dise — le
   * problème d'origine, en pire, parce qu'invisible.
   */
  const [storageFailed, setStorageFailed] = useState(false);
  const reportStorageFailure = useCallback(() => setStorageFailed(true), []);

  const editor = useObjectEditorState(objectId, resource.modules);
  const draft = usePortalDraft({
    userId,
    objectId,
    serverModules: resource.modules,
    editor,
    onStorageFailure: reportStorageFailure,
  });

  const [sendOpen, setSendOpen] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [sentSnapshot, setSentSnapshot] = useState<PortalSentSnapshot | null>(() => null);

  const activeRubricId = searchParams.get('rubrique');
  const hubHref = `/espace/fiches/${objectId}`;

  const resolvedAt = fiche?.lastResolved?.resolvedAt ?? null;
  const openSubmissionId = fiche?.openSubmission?.id ?? null;

  /**
   * La saisie EN COURS d'une rubrique — PERSISTÉE, pas seulement gardée en mémoire.
   *
   * Le brouillon n'est écrit que depuis `editor.dirtySections`, qui ne bouge qu'au clic sur
   * « Valider ». Une `Map` en mémoire survivait au changement d'écran, mais pas à un
   * rechargement, ni à un onglet tué par le système, ni à un appel entrant — le scénario
   * le plus probable des quatre sur un téléphone.
   */
  const formCache = usePortalFormCache({
    userId,
    objectId,
    serverModules: resource.modules,
    onStorageFailure: reportStorageFailure,
  });

  useEffect(() => {
    // Le remerciement appartient au geste qui vient d'avoir lieu : ouvrir une rubrique
    // tourne la page.
    if (activeRubricId) setJustSent(false);
  }, [activeRubricId]);

  const { open, resolved } = useMemo(
    () => splitSubmissions(submissions, fiche?.openSubmission?.id ?? null),
    [submissions, fiche?.openSubmission?.id],
  );

  const pendingModules = useMemo(() => {
    const set = new Set<WorkspaceModuleId>();
    for (const change of open?.changes ?? []) {
      if (change.status === 'pending' && change.section) set.add(change.section as WorkspaceModuleId);
    }
    return set;
  }, [open]);

  const rejectedModules = useMemo(() => {
    const set = new Set<WorkspaceModuleId>();
    for (const change of resolved?.changes ?? []) {
      // Une correction RENVOYÉE n'est plus « à reprendre » : elle est repartie en
      // vérification, et le verrou « une seule vérification ouverte » interdirait
      // précisément le geste que « À reprendre » invite à faire.
      if (change.status === 'rejected' && change.section && !pendingModules.has(change.section as WorkspaceModuleId)) {
        set.add(change.section as WorkspaceModuleId);
      }
    }
    return set;
  }, [resolved, pendingModules]);

  /**
   * Acceptés par l'office mais pas encore RECOPIÉS sur la fiche. C'est la forme dominante
   * (5 rubriques sur 7 sont reportées à la main) et elle n'a aucun état au registre : sans
   * ce signal, la rubrique retombe sur la donnée publiée — l'ANCIENNE valeur — avec le
   * badge « Rempli », et le partenaire ressaisit.
   */
  const approvedModules = useMemo(() => {
    const set = new Set<string>();
    for (const change of resolved?.changes ?? []) {
      // `applied` = la machine a déjà réécrit la fiche : il n'y a rien à annoncer.
      if (change.status === 'approved' && change.section && !pendingModules.has(change.section as WorkspaceModuleId)) {
        set.add(change.section);
      }
    }
    return set;
  }, [resolved, pendingModules]);

  useEffect(() => {
    const snapshot = readPortalSent(userId, objectId);
    if (!snapshot) {
      setSentSnapshot(null);
      return;
    }
    // L'office a tranché après cet envoi et rien n'est plus en vérification : l'instantané
    // décrit un passé révolu, et le garder ferait afficher « Vous aviez indiqué… » avec une
    // date périmée. MAIS il reste nécessaire tant qu'une modification ACCEPTÉE n'a pas été
    // recopiée : la notice de ce cas — le plus fréquent — s'appuie précisément dessus.
    // Purger sans cette réserve annulait la correction de l'IMPORTANT 7 : la notice
    // s'affichait sans date et sans le contenu concret qui empêche la ressaisie.
    const settled = !openSubmissionId && resolvedAt && resolvedAt > snapshot.submittedAt;
    if (settled && approvedModules.size === 0) {
      clearPortalSent(userId, objectId);
      setSentSnapshot(null);
      return;
    }
    setSentSnapshot(snapshot);
  }, [userId, objectId, resolvedAt, openSubmissionId, approvedModules]);

  const rubrics = useMemo(
    () =>
      buildPortalRubrics({
        archetype,
        draft: editor.draft,
        dirty: editor.dirtySections,
        masked: visibility.maskedModules,
        floor: visibility.floorModules,
        pendingModules,
        rejectedModules,
        permissions: resource.permissions,
      }),
    [archetype, editor.draft, editor.dirtySections, visibility, pendingModules, rejectedModules, resource.permissions],
  );

  const rejections = useMemo<PortalRejection[]>(() => {
    const seen = new Set<string>();
    const list: PortalRejection[] = [];
    for (const change of resolved?.changes ?? []) {
      if (change.status !== 'rejected' || !change.section || seen.has(change.section)) continue;
      // Une correction DÉJÀ renvoyée n'est plus un retour à traiter : la laisser ici avec
      // son lien « Corriger » enverrait le partenaire refaire un geste que le verrou
      // « une seule vérification ouverte » refuse (PT409).
      if (pendingModules.has(change.section as WorkspaceModuleId)) continue;
      seen.add(change.section);
      const rubric =
        PORTAL_RUBRICS.find((entry) => entry.module === change.section && entry.archetypes.includes(archetype)) ?? null;
      list.push({
        module: change.section,
        rubricId: rubric?.id ?? null,
        // Le libellé du registre d'abord : `field` porte désormais la projection lisible
        // du portail, mais un envoi ANCIEN peut encore porter le libellé de l'éditeur.
        title: rubric?.title ?? change.field,
        note: change.reviewNote,
      });
    }
    return list;
  }, [resolved, archetype, pendingModules]);

  /**
   * Combien d'entrées d'historique CETTE page a poussées (0 ou 1, jamais plus).
   *
   * Enchaîner deux rubriques par la liste collante poussait une SECONDE entrée : « Retour à
   * la fiche » et le retour automatique après « Valider » ramenaient alors sur la rubrique
   * précédente, et il fallait appuyer deux fois. Une rubrique ouverte depuis une autre
   * REMPLACE donc l'entrée au lieu d'en ajouter une : l'historique tient au plus
   * `hub → rubrique`, et un seul `back()` revient toujours à la fiche.
   */
  const depthRef = useRef(0);

  /** Les rubriques dont le brouillon n'a pas été repris — nommées, pas tues. */
  const discardedRubrics = useMemo(
    () =>
      draft.discardedModules
        .map(
          (module) =>
            PORTAL_RUBRICS.find((entry) => entry.module === module && entry.archetypes.includes(archetype))?.title ??
            null,
        )
        .filter((title): title is string => Boolean(title)),
    [draft.discardedModules, archetype],
  );

  const handleBackToHub = useCallback(() => {
    // `back()` défait l'unique entrée poussée par cette page. Sans elle — arrivée directe
    // sur `?rubrique=` par un lien partagé ou un signet — `back()` ferait SORTIR du site.
    if (depthRef.current > 0) {
      depthRef.current = 0;
      router.back();
      return;
    }
    router.push(hubHref, { scroll: false });
  }, [router, hubHref]);

  /**
   * Ouvrir une destination depuis la fiche. Le hub délègue ici pour que l'historique reste
   * la propriété d'un seul endroit.
   */
  const handleNavigate = useCallback(
    (href: string) => {
      if (href === hubHref) {
        handleBackToHub();
        return;
      }
      if (activeRubricId) {
        // Rubrique → rubrique : on REMPLACE, l'historique n'enfle pas.
        router.replace(href, { scroll: false });
        return;
      }
      router.push(href, { scroll: false });
      depthRef.current = 1;
    },
    [router, hubHref, activeRubricId, handleBackToHub],
  );

  const handleDiscard = useCallback(() => {
    for (const rubric of rubrics) {
      if (rubric.state === 'dirty') editor.resetModule(MODULE_KEY_MAP[rubric.module]);
    }
    draft.clear();
  }, [rubrics, editor, draft]);

  const handleSent = useCallback(
    ({ submissionId }: { submissionId: string }) => {
      // Sous 1024 px, l'en-tête de fiche — donc la carte « Merci ! » — est masqué en vue
      // rubrique : envoyer depuis un écran de rubrique ne changeait RIEN à l'écran, et le
      // focus tombait dans le vide sur un élément `display:none`. On revient à la fiche.
      if (activeRubricId) router.push(hubHref, { scroll: false });
      setJustSent(true);
      setSentSnapshot(readPortalSent(userId, objectId));
      draft.clear();
      // L'accueil doit refléter tout de suite « Envoyé — en vérification », sans attendre
      // le rafraîchissement : le partenaire y revient souvent dans la seconde.
      queryClient.setQueryData<PortalFiche[]>(['portal-fiches'], (old) =>
        (old ?? []).map((entry) =>
          entry.id === objectId
            ? { ...entry, openSubmission: { id: submissionId, submittedAt: new Date().toISOString() } }
            : entry,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: ['portal-fiches'] });
      // Par PRÉFIXE : la clé porte l'id de la fiche, l'invalidation couvre toutes les fiches.
      void queryClient.invalidateQueries({ queryKey: ['portal-submissions'] });
    },
    [userId, objectId, draft, queryClient, activeRubricId, router, hubHref],
  );

  const location = (resource.modules as unknown as { location?: { main?: Record<string, string> } }).location?.main ?? {};
  const address = [location.address1, [location.postcode, location.city].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim())
    .join(', ');

  return (
    <>
      <PortalFicheHub
        fiche={{
          id: objectId,
          name: resource.name,
          typeLabel: portalTypeLabel(resource.type),
          locality: location.city ?? '',
          address,
          // Le téléphone PUBLIÉ, lu sur les modules du serveur : le brouillon local porte
          // ce qui n'est pas encore vérifié, et cette carte parle de ce qui est en ligne.
          publicPhone: readPublicContact(resource.modules.contacts as ObjectWorkspaceContactsModule, 'phone'),
          officeEmail: fiche?.officeEmail ?? null,
          officePhone: fiche?.officePhone ?? null,
          count: ficheCount,
          openSubmission: fiche?.openSubmission ?? (open ? { id: open.id, submittedAt: open.submittedAt } : null),
        }}
        archetype={archetype}
        rubrics={rubrics}
        activeRubricId={activeRubricId}
        editor={editor}
        rejections={rejections}
        approvedModules={approvedModules}
        discardedRubrics={discardedRubrics}
        refreshFailed={refreshFailed}
        storageFailed={storageFailed}
        formCache={formCache}
        media={resource.modules.media as ObjectWorkspaceMediaModule}
        note={draft.note}
        onNoteChange={draft.setNote}
        savedAt={draft.savedAt}
        draftDiscarded={draft.discarded}
        sentSnapshot={sentSnapshot}
        justSent={justSent}
        onSend={() => setSendOpen(true)}
        onDiscard={handleDiscard}
        onBackToHub={handleBackToHub}
        onNavigate={handleNavigate}
      />
      <PortalSendModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        objectId={objectId}
        userId={userId}
        archetype={archetype}
        editor={editor}
        rubrics={rubrics}
        note={draft.note}
        onNoteChange={draft.setNote}
        onSent={handleSent}
      />
    </>
  );
}
