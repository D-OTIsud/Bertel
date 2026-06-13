"use client";

// Annuaire des ACTEURS (§61, design v2 + rectifs PO points 6+7) — l'entité CRM
// principale. Les filtres UTILES (sujet normalisé / statut actif-traité / période)
// sont appliqués CÔTÉ SERVEUR par api.list_crm_directory : tous les agrégats
// (compteurs, dernière interaction, top sujets) reviennent filtrés, donc les KPI
// du bandeau se recalculent d'eux-mêmes. Les ex-chips « type d'objet » (jugées
// inutiles par le PO) sont supprimées. La recherche par nom reste client-side.

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, CircleHelp, Search, UserPlus } from 'lucide-react';
import { listCrmDirectory, listDemandTopics, type CrmDirectoryEntry, type CrmDirectoryFilters } from '../../services/crm';
import { Kpi, Pav } from './crm-primitives';
import {
  CrmFilterBar,
  PERIOD_DEFAULT,
  STATUS_DEFAULT,
  periodFromOf,
  statusValueOf,
  type PeriodItem,
  type StatusItem,
} from './CrmFilterBar';
import { CrmActorNewModal } from './CrmActorModals';
import { CRM_READ_ONLY_REASON, formatRelative, interactionTypeLabelOf, topicTintOf } from './crm-view-utils';

function matchesSearch(entry: CrmDirectoryEntry, query: string): boolean {
  const haystack = [entry.displayName, ...entry.objects.map((object) => `${object.objectName} ${object.roleName ?? ''}`)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function CrmAnnuaire({ canWrite, onOpenActor }: { canWrite: boolean; onOpenActor: (actorId: string) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  // Filtres partagés (PO points 6+7) — défaut Toutes + Tout = ensemble complet (fix point 7).
  const [topicCode, setTopicCode] = useState('');
  const [statusItem, setStatusItem] = useState<StatusItem>(STATUS_DEFAULT);
  const [periodItem, setPeriodItem] = useState<PeriodItem>(PERIOD_DEFAULT);
  const [newActorOpen, setNewActorOpen] = useState(false);

  const topicsQuery = useQuery({ queryKey: ['crm-demand-topics'], queryFn: listDemandTopics });

  // Borne `from` STABLE par sélection (minuit local, précision jour) : un Date.now() brut
  // par render changerait la queryKey en boucle et relancerait la requête. « Tout » = undefined.
  const from = useMemo(() => periodFromOf(periodItem), [periodItem]);

  const status = statusValueOf(statusItem);
  const hasFilters = Boolean(topicCode) || status !== undefined || from !== undefined;
  const filters = useMemo<CrmDirectoryFilters>(
    () => ({
      ...(topicCode ? { topicCode } : {}),
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
    }),
    [topicCode, status, from],
  );

  // Sans filtre : MÊME clé que le shell (['crm-directory']) → cache réseau partagé.
  // Avec filtres : clé dédiée — les consommateurs partagés du shell (résolution de noms
  // de la vue établissement, datalists des tâches) restent sur la liste NON filtrée.
  const directoryQuery = useQuery({
    queryKey: hasFilters ? ['crm-directory', filters] : ['crm-directory'],
    queryFn: () => listCrmDirectory(hasFilters ? filters : undefined),
    // Changer un filtre garde la liste précédente affichée pendant le fetch (pas de collapse).
    placeholderData: keepPreviousData,
  });
  const entries = useMemo(() => directoryQuery.data ?? [], [directoryQuery.data]);

  // Datalist du modal « Nouvel acteur » : toujours la liste NON filtrée (clé partagée
  // avec le shell → déjà en cache ; sans filtre actif c'est la même query que ci-dessus).
  const baseDirectoryQuery = useQuery({ queryKey: ['crm-directory'], queryFn: () => listCrmDirectory() });
  const newActorObjects = useMemo(() => {
    const byId = new Map<string, { objectId: string; objectName: string }>();
    for (const entry of baseDirectoryQuery.data ?? []) {
      for (const object of entry.objects) {
        if (!byId.has(object.objectId)) byId.set(object.objectId, { objectId: object.objectId, objectName: object.objectName });
      }
    }
    return [...byId.values()].sort((a, b) => a.objectName.localeCompare(b.objectName));
  }, [baseDirectoryQuery.data]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => !query || matchesSearch(entry, query));
  }, [entries, search]);

  // KPI Interactions réactif (PO point 7) : le SERVEUR filtre tous les agrégats (sujet/statut/
  // période appliqués à interaction_count). Quand une période est bornée (`from`), le KPI lit
  // ce total filtré (« Interactions (période) »). Sinon — période = Tout, défaut — on lit le
  // total all-time `interaction_count` (« Interactions (toutes) ») : c'est le fix du bug
  // « Toutes + Tout n'affichait que 2 mois » (l'ancien KPI montrait la fenêtre 12 mois).
  const totalInteractions = entries.reduce((sum, entry) => sum + entry.interactionCount, 0);
  const interactionsKpiLabel = from ? 'Interactions (période)' : 'Interactions (toutes)';
  const totalObjects = entries.reduce((sum, entry) => sum + entry.objectCount, 0);

  // KPI « Acteurs suivis » = filtré / global (rectif PO v5 point 2). Le global = la longueur
  // de l'annuaire NON filtré (la query partagée ['crm-directory'] du shell, déjà en cache) ;
  // le filtré = l'annuaire courant (entries). Sous filtre on affiche « X / Y » + un sous-libellé ;
  // sans filtre, juste le global (pas de fraction redondante Y / Y).
  const globalActorCount = baseDirectoryQuery.data?.length ?? entries.length;
  const followedActorsValue = hasFilters ? `${entries.length} / ${globalActorCount}` : String(globalActorCount);
  const followedActorsHint = hasFilters ? 'pour le filtre sélectionné' : 'personnes & organisations';

  if (directoryQuery.isLoading) {
    return <div className="crm-loading">Chargement de l&apos;annuaire…</div>;
  }
  if (directoryQuery.isError) {
    return <div className="inline-alert">Échec du chargement de l&apos;annuaire : {(directoryQuery.error as Error).message}</div>;
  }

  return (
    <div className="crm-body">
      <div className="crm-kpis">
        {/* Peps PO point 1 : accents KPI distincts (teal / orange / bleu) — fini le tout-teal.
            Rectif PO v5 point 2 : « Acteurs suivis » = filtré / global sous filtre. */}
        <Kpi label="Acteurs suivis" value={followedActorsValue} hint={followedActorsHint} accent="teal" />
        <Kpi label={interactionsKpiLabel} value={String(totalInteractions)} hint="appels, e-mails, visites terrain, notes" accent="orange" />
        <Kpi label="Établissements liés" value={String(totalObjects)} hint="contextes de la relation" accent="blue" />
      </div>

      <div className="crm-toolbar">
        <label className="crm-search">
          <Search size={14} aria-hidden />
          <input
            placeholder="Filtrer par nom, établissement, rôle…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <CrmFilterBar
          topicCode={topicCode}
          status={statusItem}
          period={periodItem}
          topics={topicsQuery.data ?? []}
          onChange={(next) => {
            setTopicCode(next.topicCode);
            setStatusItem(next.status);
            setPeriodItem(next.period);
          }}
        />
        <div className="crm-toolbar__right">
          <span>
            {rows.length} acteur{rows.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            className="crm-btn primary"
            disabled={!canWrite}
            title={canWrite ? undefined : CRM_READ_ONLY_REASON}
            onClick={() => setNewActorOpen(true)}
          >
            <UserPlus size={13} aria-hidden /> Nouvel acteur
          </button>
        </div>
      </div>
      {hasFilters && (
        <div className="crm-filter-note">
          Filtres appliqués aux compteurs — les acteurs sans interaction correspondante sont masqués.
        </div>
      )}

      <div className="crm-list">
        <div className="crm-list__head">
          <span>Acteur</span>
          <span>Établissements</span>
          <span className="col-last">Dernière interaction</span>
          <span>Interactions</span>
          <span className="col-topics">Sujets</span>
          <span></span>
        </div>
        {rows.map((entry) => {
          const first = entry.objects[0];
          const extraCount = entry.objects.length - 1;
          return (
            <button key={entry.actorId} type="button" className="crm-row" onClick={() => onOpenActor(entry.actorId)}>
              <span className="crm-row__id">
                <Pav name={entry.displayName} tintKey={entry.actorId} photoUrl={entry.photoUrl} />
                <span className="crm-row__name">
                  <strong>{entry.displayName}</strong>
                </span>
              </span>
              <span className="ctx-stack">
                {first ? (
                  <span className="crm-cell">
                    {first.objectName}
                    <small>{first.roleName ?? '—'}</small>
                  </span>
                ) : (
                  <span className="more-n">—</span>
                )}
                {extraCount > 0 && <span className="more-n">+{extraCount}</span>}
              </span>
              <span className="crm-cell col-last">
                {entry.lastInteractionType ? interactionTypeLabelOf(entry.lastInteractionType) : '—'}
                <small>
                  {formatRelative(entry.lastInteractionAt)}
                  {entry.lastInteractionObjectName ? ` · ${entry.lastInteractionObjectName}` : ''}
                </small>
              </span>
              <span className="crm-cell">
                {hasFilters ? (
                  <>
                    {entry.interactionCount} sur la sélection
                    <small>dernière : {formatRelative(entry.lastInteractionAt)}</small>
                  </>
                ) : (
                  <>
                    {entry.interactions12m} · 12 mois
                    <small>{entry.interactionCount} au total</small>
                  </>
                )}
              </span>
              <span className="chip-row col-topics">
                {/* Rectif PO v5 point 1 : teinte de sujet stable (top_topics = noms ⇒ clé = nom). */}
                {entry.topTopics.slice(0, 2).map((topic) => (
                  <span key={topic} className={`topic-chip topic-pill topic--${topicTintOf(topic)}`}>
                    {topic}
                  </span>
                ))}
              </span>
              <span className="crm-row__go" aria-hidden>
                <ChevronRight size={14} />
              </span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="crm-list__empty">
            {entries.length === 0 && !hasFilters && !search.trim()
              ? 'Aucun acteur dans l’annuaire CRM.'
              : 'Aucun acteur ne correspond à ces filtres.'}
          </div>
        )}
      </div>

      <div className="crm-foot-hint">
        <CircleHelp size={13} aria-hidden />
        Un acteur (personne ou organisation) peut être lié à plusieurs établissements avec des rôles différents — les
        interactions le suivent à travers tous ses contextes.
      </div>

      {newActorOpen && canWrite && (
        <CrmActorNewModal
          objectOptions={newActorObjects}
          onClose={() => setNewActorOpen(false)}
          onCreated={(actorId) => {
            setNewActorOpen(false);
            // Préfixe ['crm-directory'] : couvre la clé de base ET les clés filtrées.
            void queryClient.invalidateQueries({ queryKey: ['crm-directory'] });
            onOpenActor(actorId);
          }}
        />
      )}
    </div>
  );
}
