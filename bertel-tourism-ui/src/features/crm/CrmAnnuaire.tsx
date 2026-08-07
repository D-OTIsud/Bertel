"use client";

// Annuaire des ACTEURS (§61, design v2 + rectifs PO points 6+7) — l'entité CRM
// principale. Les filtres UTILES (sujet normalisé / statut actif-traité / période)
// sont appliqués CÔTÉ SERVEUR par api.list_crm_directory : tous les agrégats
// (compteurs, dernière interaction, top sujets) reviennent filtrés, donc les KPI
// du bandeau se recalculent d'eux-mêmes. Les ex-chips « type d'objet » (jugées
// inutiles par le PO) sont supprimées.
//
// RECHERCHE (PO 2026-07-27) : elle vient du champ du HEADER (crm-search-store) — il n'y a
// plus de champ local ici, une seule surface possède la recherche. Elle est SERVEUR (p_search)
// car téléphone et e-mail vivent dans actor_channel et n'entrent pas dans le payload (PII).
//
// TROIS notions de filtre, volontairement distinctes — les confondre rend des libellés faux :
//   effectiveSearch        → le paramètre p_search (rien n'est envoyé sous 2 caractères)
//   hasServerFilters       → la clé React Query, le ratio « X / Y », le choix d'état vide
//   hasInteractionFilters  → « X sur la sélection » et la note « acteurs masqués ». La
//                            recherche restreint les ACTEURS, elle ne filtre pas leurs
//                            INTERACTIONS : elle ne doit donc pas allumer ces libellés.

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, CircleHelp, UserPlus } from 'lucide-react';
import { listCrmDirectory, listDemandTopics, type CrmDirectoryFilters } from '../../services/crm';
import { effectiveCrmSearch, useCrmSearchStore } from '../../store/crm-search-store';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
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
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonBlock } from '../../components/common/SkeletonBlock';
import { CRM_READ_ONLY_REASON, formatRelative, interactionTypeLabelOf, topicTintOf } from './crm-view-utils';

/** Pause avant d'interroger le serveur — la frappe reste fluide, le réseau ne suit pas lettre à lettre. */
const SEARCH_DEBOUNCE_MS = 250;

export function CrmAnnuaire({ canWrite, onOpenActor }: { canWrite: boolean; onOpenActor: (actorId: string) => void }) {
  const queryClient = useQueryClient();
  // La recherche est possédée par la TopBar (elle vit hors de l'arbre /crm) — ici on la lit.
  const rawSearch = useCrmSearchStore((state) => state.search);
  const debouncedSearch = useDebouncedValue(rawSearch, SEARCH_DEBOUNCE_MS);
  const effectiveSearch = effectiveCrmSearch(debouncedSearch);
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
  // Filtres d'INTERACTIONS : eux seuls restreignent les interactions comptées (et font donc
  // disparaître les acteurs « lien seul »). La recherche n'en fait PAS partie.
  const hasInteractionFilters = Boolean(topicCode) || status !== undefined || from !== undefined;
  // Tout ce qui part au serveur — pilote la clé de cache et les libellés de volumétrie.
  const hasServerFilters = hasInteractionFilters || effectiveSearch !== undefined;
  const filters = useMemo<CrmDirectoryFilters>(
    () => ({
      ...(topicCode ? { topicCode } : {}),
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
      ...(effectiveSearch ? { search: effectiveSearch } : {}),
    }),
    [topicCode, status, from, effectiveSearch],
  );

  // Sans filtre : MÊME clé que le shell (['crm-directory']) → cache réseau partagé.
  // Avec filtres : clé dédiée — les consommateurs partagés du shell (résolution de noms
  // de la vue établissement, datalists des tâches) restent sur la liste NON filtrée.
  const directoryQuery = useQuery({
    queryKey: hasServerFilters ? ['crm-directory', filters] : ['crm-directory'],
    queryFn: () => listCrmDirectory(hasServerFilters ? filters : undefined),
    // Changer un filtre garde la liste précédente affichée pendant le fetch (pas de collapse).
    placeholderData: keepPreviousData,
  });
  const entries = useMemo(() => directoryQuery.data ?? [], [directoryQuery.data]);

  // Amorçage du modal « Nouvel acteur » : la liste CRM non filtrée donne des suggestions
  // immédiates. Elle n'est PAS exhaustive (un établissement sans acteur n'y figure pas) :
  // CrmActorNewModal la complète à la frappe via la recherche objet Bertel.
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

  // Le filtrage est intégralement serveur — plus de tamis client (il ne verrait de toute
  // façon ni les téléphones ni les e-mails, absents du payload).
  const rows = entries;

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
  const followedActorsValue = hasServerFilters ? `${entries.length} / ${globalActorCount}` : String(globalActorCount);

  if (directoryQuery.isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label="Chargement de l'annuaire" className="crm-loading-skeleton">
        <div className="crm-loading-skeleton__row" aria-hidden="true">
          <SkeletonBlock className="h-16 flex-1 rounded-shellMd" />
          <SkeletonBlock className="h-16 flex-1 rounded-shellMd" />
          <SkeletonBlock className="h-16 flex-1 rounded-shellMd" />
        </div>
        <SkeletonBlock className="h-10 w-full rounded-shellMd" />
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonBlock key={index} className="h-10 w-full rounded-shellSm" />
        ))}
      </div>
    );
  }
  if (directoryQuery.isError) {
    return <div className="inline-alert">Échec du chargement de l&apos;annuaire : {(directoryQuery.error as Error).message}</div>;
  }

  return (
    <div className="crm-body">
      <div className="crm-kpis">
        {/* Peps PO point 1 : accents KPI distincts (teal / orange / bleu) — fini le tout-teal.
            Rectif PO v5 point 2 : « Acteurs suivis » = filtré / global sous filtre.
            Sans légende (rectif PO) : la valeur (« X / Y », chiffres) + la note « filtres appliqués »
            se suffisent ; les captions doublonnaient. */}
        <Kpi label="Acteurs suivis" value={followedActorsValue} accent="teal" />
        <Kpi label={interactionsKpiLabel} value={String(totalInteractions)} accent="orange" />
        <Kpi label="Établissements liés" value={String(totalObjects)} accent="blue" />
      </div>

      <div className="crm-toolbar">
        {/* Pas de champ de recherche ici : il vit dans la TopBar (une seule surface le possède). */}
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
      {/* Note réservée aux filtres d'INTERACTIONS : eux seuls masquent les acteurs sans
          interaction correspondante. Une recherche seule ne le fait pas — l'afficher alors
          annoncerait un comportement qui n'a pas lieu. */}
      {hasInteractionFilters && (
        <div className="crm-filter-note">
          Filtres appliqués aux compteurs — les acteurs sans interaction correspondante sont masqués.
        </div>
      )}
      {effectiveSearch && !hasInteractionFilters && (
        <div className="crm-filter-note">
          Recherche « {effectiveSearch} » — nom, prénom, établissement rattaché, téléphone et e-mail.
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
                {/* « sur la sélection » ne vaut que sous filtre d'INTERACTIONS : c'est lui qui
                    restreint le compte. Sous simple recherche, interactionCount reste le total. */}
                {hasInteractionFilters ? (
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
                {/* Teinte de sujet stable PAR CODE (parité fiche acteur) : top_topics est
                    `[{code, name}]` ⇒ libellé = name, teinte = topicTintOf(code). Le même sujet
                    porte donc la MÊME couleur ici et sur la fiche. */}
                {entry.topTopics.slice(0, 2).map((topic) => (
                  <span key={topic.code || topic.name} className={`topic-chip topic-pill topic--${topicTintOf(topic.code)}`}>
                    {topic.name}
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
          // Phase 5.2 — états vides qui enseignent : « aucune donnée » (annuaire vide, CTA
          // « Ajouter un acteur » si droit d'écriture) distinct de l'état « filtré » (pas de CTA).
          entries.length === 0 && !hasServerFilters ? (
            <EmptyState
              mode="no-data"
              title="Aucun acteur"
              description="Cet annuaire CRM se remplit à mesure que vous rattachez des prestataires aux fiches ou enregistrez des interactions."
              action={
                canWrite
                  ? { label: 'Ajouter un acteur', onClick: () => setNewActorOpen(true), icon: <UserPlus size={15} aria-hidden /> }
                  : undefined
              }
            />
          ) : (
            <EmptyState
              mode="filtered"
              title={effectiveSearch ? `Aucun acteur pour « ${effectiveSearch} »` : 'Aucun acteur pour ces filtres'}
              description={
                effectiveSearch
                  ? 'La recherche couvre le nom, le prénom, l’établissement rattaché, le téléphone et l’e-mail. Vérifiez l’orthographe ou raccourcissez le terme.'
                  : 'Aucun acteur ne correspond à ces filtres. Élargissez la recherche ou changez les critères.'
              }
            />
          )
        )}
      </div>

      <div className="crm-foot-hint">
        <CircleHelp size={13} aria-hidden />
        Un acteur (personne ou organisation) peut être lié à plusieurs établissements avec des rôles différents — les
        interactions le suivent à travers tous ses contextes.
      </div>

      {/* Bouton flottant « Nouvel acteur » (rectif PO : action proéminente, toujours à portée).
          N'apparaît qu'avec la permission (le bouton toolbar reste, désactivé-avec-raison sinon). */}
      {canWrite && (
        <button type="button" className="crm-fab" onClick={() => setNewActorOpen(true)} aria-label="Nouvel acteur">
          <UserPlus size={18} aria-hidden />
          <span className="crm-fab__label">Nouvel acteur</span>
        </button>
      )}

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
