"use client";

// Timeline org-wide (§61 + rectifs PO points 6+7) — pagination keyset (before/before_id) via
// api.list_crm_timeline, « Charger plus » sans collapse (placeholderData), erreurs de page 2
// inline près du bouton. Nouveauté acteur-centrée : objectName peut être NULL (interaction
// « générale ») → le tag de contexte affiche « Général » et le QUI (actorName) est porté par carte.
//
// Filtres (PO point 6) : la MÊME barre que l'onglet Acteurs (CrmFilterBar) — sujet / statut /
// période. Défaut Toutes + Tout (PO point 7) = la timeline org COMPLÈTE, sans borne de période.
// Changer un filtre réinitialise le curseur keyset (on repart de la page la plus récente).

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteCrmInteraction, listCrmTimeline, listDemandTopics, saveCrmInteraction } from '../../services/crm';
import type { CrmInteraction } from '../../types/domain';
import { CrmTimeline, type CrmTimelineCardItem } from './crm-primitives';
import { SkeletonBlock } from '../../components/common/SkeletonBlock';
import { CRM_READ_ONLY_REASON } from './crm-view-utils';
import {
  CrmFilterBar,
  PERIOD_DEFAULT,
  STATUS_DEFAULT,
  periodFromOf,
  statusValueOf,
  type PeriodItem,
  type StatusItem,
} from './CrmFilterBar';

export function CrmTimelineView({
  canWrite,
  onOpenObject,
  onOpenActor,
}: {
  /** Gating page-wide write_crm_notes (no-write-trap) : répondre/résoudre désactivés sans permission. */
  canWrite: boolean;
  onOpenObject: (objectId: string) => void;
  /** Rectif PO v5 point 5 : clic sur une carte → fiche de l'acteur de l'interaction. */
  onOpenActor: (actorId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [olderPages, setOlderPages] = useState<CrmInteraction[][]>([]);
  const [cursor, setCursor] = useState<{ before: string; beforeId: string } | null>(null);
  // Filtres partagés (PO points 6+7) — défaut Toutes + Tout = timeline complète (fix point 7).
  const [topicCode, setTopicCode] = useState('');
  const [statusItem, setStatusItem] = useState<StatusItem>(STATUS_DEFAULT);
  const [periodItem, setPeriodItem] = useState<PeriodItem>(PERIOD_DEFAULT);

  const topicsQuery = useQuery({ queryKey: ['crm-demand-topics'], queryFn: listDemandTopics });

  const status = statusValueOf(statusItem);
  const from = useMemo(() => periodFromOf(periodItem), [periodItem]);

  // Filtres serveur (hors curseur) — sérialisés dans la queryKey pour partitionner le cache.
  const serverFilters = useMemo(
    () => ({
      ...(topicCode ? { topicCode } : {}),
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
    }),
    [topicCode, status, from],
  );
  const filtersKey = JSON.stringify(serverFilters);

  const timelineQuery = useQuery({
    queryKey: ['crm-timeline', filtersKey, cursor?.beforeId ?? null],
    queryFn: () =>
      listCrmTimeline({ ...serverFilters, ...(cursor ? { before: cursor.before, beforeId: cursor.beforeId } : {}) }),
    // « Charger plus »/changer un filtre change la queryKey : garder la page précédente
    // affichée pendant le fetch (pas de collapse — assertion verrouillée par revue).
    placeholderData: keepPreviousData,
  });

  // Pages déjà chargées + page courante, dédupliquées (le keyset garantit l'ordre).
  const timelineItems = useMemo(() => {
    const seen = new Set<string>();
    const merged: CrmInteraction[] = [];
    for (const item of [...olderPages.flat(), ...(timelineQuery.data?.items ?? [])]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  }, [olderPages, timelineQuery.data]);

  const cardItems = useMemo<CrmTimelineCardItem[]>(
    () =>
      timelineItems.map((item) => ({
        id: item.id,
        interactionType: item.interactionType,
        subject: item.subject,
        body: item.body,
        occurredAt: item.occurredAt,
        topicName: item.topicName,
        sentimentCode: item.sentimentCode,
        sentimentName: item.sentimentName,
        objectId: item.objectId,
        objectName: item.objectName,
        ownerName: item.ownerName,
        actorName: item.actorName,
        actorId: item.actorId,
        // §65/§66 — fil de discussion + fix « par Système » + statut de la demande.
        interlocutorEmail: item.interlocutorEmail,
        source: item.source,
        status: item.status,
        resolvedAt: item.resolvedAt,
        replies: item.replies,
      })),
    [timelineItems],
  );

  // Changer un filtre : repartir du haut (vider les pages accumulées + le curseur) pour ne pas
  // mélanger des items de deux jeux de filtres. keepPreviousData garde l'affichage le temps du fetch.
  function applyFilters(next: { topicCode: string; status: StatusItem; period: PeriodItem }) {
    setTopicCode(next.topicCode);
    setStatusItem(next.status);
    setPeriodItem(next.period);
    setOlderPages([]);
    setCursor(null);
  }

  function loadMore() {
    const current = timelineQuery.data;
    if (!current?.hasMore) return;
    const last = current.items[current.items.length - 1];
    if (!last?.occurredAt) return;
    setOlderPages((previous) => [...previous, current.items]);
    setCursor({ before: last.occurredAt, beforeId: last.id });
  }

  // Fil de discussion (§65/§66) : répondre + basculer le statut depuis la timeline org-wide.
  // Une réponse hérite le contexte de la racine ; le toggle pose/efface resolved_at. On
  // invalide TOUTES les pages de timeline (préfixe ['crm-timeline'] : filtres + curseur) ;
  // les pages accumulées localement se reconstruisent au refetch.
  const refetchTimeline = () => queryClient.invalidateQueries({ queryKey: ['crm-timeline'] });
  const handleReply = async (rootId: string, body: string, sentimentCode?: string) => {
    await saveCrmInteraction({ parentInteractionId: rootId, body, ...(sentimentCode ? { sentimentCode } : {}) });
    await refetchTimeline();
  };
  const handleResolve = async (rootId: string, done: boolean) => {
    await saveCrmInteraction({ id: rootId, status: done ? 'done' : 'planned' });
    await refetchTimeline();
  };
  // Édition / suppression d'un commentaire (§66) — racine OU réponse. L'édition est PARTIELLE
  // (UPDATE arm : seules body/sentiment_code sont écrites). Supprimer une racine cascade ses
  // réponses (FK ON DELETE CASCADE) — la confirmation le signale dans la carte.
  const handleEditInteraction = async (id: string, body: string, sentimentCode: string | null) => {
    await saveCrmInteraction({ id, body, sentimentCode });
    await refetchTimeline();
  };
  const handleDeleteInteraction = async (id: string) => {
    await deleteCrmInteraction(id);
    await refetchTimeline();
  };

  return (
    <div className="crm-body">
      <div className="crm-toolbar">
        <CrmFilterBar
          topicCode={topicCode}
          status={statusItem}
          period={periodItem}
          topics={topicsQuery.data ?? []}
          onChange={applyFilters}
        />
      </div>

      <div className="crm-panel tasks-wrap">
        <div className="crm-panel__head">
          <h3>Flux de relation — toute l&apos;organisation</h3>
        </div>
        <div className="crm-panel__body">
          {/* Garde plein-écran sur le chargement INITIAL uniquement : une page 2 (cursor non
              nul) en chargement/erreur ne remplace pas la liste (erreur inline près du bouton). */}
          {timelineQuery.isLoading && cursor === null ? (
            <div role="status" aria-busy="true" aria-label="Chargement de la timeline" className="crm-loading-skeleton">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonBlock key={index} className="h-20 w-full rounded-shellMd" />
              ))}
            </div>
          ) : timelineQuery.isError && cursor === null ? (
            <div className="inline-alert">Échec du chargement : {(timelineQuery.error as Error).message}</div>
          ) : (
            <>
              <CrmTimeline
                items={cardItems}
                showActor
                onOpenObject={onOpenObject}
                onOpenActor={onOpenActor}
                emptyLabel="Aucune interaction enregistrée."
                canWrite={canWrite}
                readOnlyReason={CRM_READ_ONLY_REASON}
                onReply={handleReply}
                onResolve={handleResolve}
                onEditInteraction={handleEditInteraction}
                onDeleteInteraction={handleDeleteInteraction}
              />
              {timelineQuery.data?.hasMore && (
                <button type="button" className="crm-btn crm-load-more" onClick={loadMore}>
                  Charger plus
                </button>
              )}
              {timelineQuery.isError && cursor !== null && (
                <div className="inline-alert">Échec du chargement : {(timelineQuery.error as Error).message}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
