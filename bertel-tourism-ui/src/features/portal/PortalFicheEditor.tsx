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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { PortalFicheHub, type PortalRejection } from './PortalFicheHub';
import { PortalSendModal } from './PortalSendModal';
import { buildPortalRubrics, portalTypeLabel, PORTAL_RUBRICS } from './portal-rubrics';
import { readPortalSent, usePortalDraft, type PortalSentSnapshot } from './usePortalDraft';
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
}: PortalFicheEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);

  const editor = useObjectEditorState(objectId, resource.modules);
  const draft = usePortalDraft({ userId, objectId, serverModules: resource.modules, editor });

  const [sendOpen, setSendOpen] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [sentSnapshot, setSentSnapshot] = useState<PortalSentSnapshot | null>(() => null);

  const activeRubricId = searchParams.get('rubrique');
  const hubHref = `/espace/fiches/${objectId}`;

  useEffect(() => {
    setSentSnapshot(readPortalSent(userId, objectId));
  }, [userId, objectId]);

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

  const handleBackToHub = useCallback(() => {
    router.push(hubHref, { scroll: false });
  }, [router, hubHref]);

  const handleDiscard = useCallback(() => {
    for (const rubric of rubrics) {
      if (rubric.state === 'dirty') editor.resetModule(MODULE_KEY_MAP[rubric.module]);
    }
    draft.clear();
  }, [rubrics, editor, draft]);

  const handleSent = useCallback(
    ({ submissionId }: { submissionId: string }) => {
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
    [userId, objectId, draft, queryClient],
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
