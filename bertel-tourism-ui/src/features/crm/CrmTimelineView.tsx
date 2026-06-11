"use client";

// Timeline org-wide (§61) — EXTRACTION de l'implémentation §61 phase 1 de CrmPage :
// pagination keyset (before/before_id) via api.list_crm_timeline, « Charger plus »
// sans collapse (placeholderData), erreurs de page 2 inline près du bouton.
// Nouveauté acteur-centrée : objectName peut être NULL (interaction « générale »)
// → le tag de contexte affiche « Général » et le QUI (actorName) est porté par carte.

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listCrmTimeline } from '../../services/crm';
import type { CrmInteraction } from '../../types/domain';
import { CrmTimeline, type CrmTimelineCardItem } from './crm-primitives';

export function CrmTimelineView({ onOpenObject }: { onOpenObject: (objectId: string) => void }) {
  const [olderPages, setOlderPages] = useState<CrmInteraction[][]>([]);
  const [cursor, setCursor] = useState<{ before: string; beforeId: string } | null>(null);

  const timelineQuery = useQuery({
    queryKey: ['crm-timeline', cursor?.beforeId ?? null],
    queryFn: () => listCrmTimeline(cursor ? { before: cursor.before, beforeId: cursor.beforeId } : {}),
    // « Charger plus » change la queryKey : garder la page précédente affichée pendant le fetch.
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
      })),
    [timelineItems],
  );

  function loadMore() {
    const current = timelineQuery.data;
    if (!current?.hasMore) return;
    const last = current.items[current.items.length - 1];
    if (!last?.occurredAt) return;
    setOlderPages((previous) => [...previous, current.items]);
    setCursor({ before: last.occurredAt, beforeId: last.id });
  }

  // Garde plein-écran sur le chargement INITIAL uniquement : une page 2 (cursor non nul)
  // en chargement/erreur ne doit pas remplacer la liste (erreur inline près du bouton).
  if (timelineQuery.isLoading && cursor === null) {
    return <div className="crm-loading">Chargement de la timeline…</div>;
  }
  if (timelineQuery.isError && cursor === null) {
    return <div className="inline-alert">Échec du chargement : {(timelineQuery.error as Error).message}</div>;
  }

  return (
    <div className="crm-body">
      <div className="crm-panel tasks-wrap">
        <div className="crm-panel__head">
          <h3>Flux de relation — toute l&apos;organisation</h3>
        </div>
        <div className="crm-panel__body">
          <CrmTimeline items={cardItems} showActor onOpenObject={onOpenObject} emptyLabel="Aucune interaction enregistrée." />
          {timelineQuery.data?.hasMore && (
            <button type="button" className="crm-btn crm-load-more" onClick={loadMore}>
              Charger plus
            </button>
          )}
          {timelineQuery.isError && cursor !== null && (
            <div className="inline-alert">Échec du chargement : {(timelineQuery.error as Error).message}</div>
          )}
        </div>
      </div>
    </div>
  );
}
