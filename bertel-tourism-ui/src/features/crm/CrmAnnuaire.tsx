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
import { Kpi, Pav, Seg } from './crm-primitives';
import { CrmActorNewModal } from './CrmActorModals';
import { CRM_READ_ONLY_REASON, formatRelative, interactionTypeLabelOf } from './crm-view-utils';

function matchesSearch(entry: CrmDirectoryEntry, query: string): boolean {
  const haystack = [entry.displayName, ...entry.objects.map((object) => `${object.objectName} ${object.roleName ?? ''}`)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

// Seg statut — vocabulaire PO : Actives = interactions `planned` (à traiter),
// Traitées = `done`, Toutes = pas de filtre.
const STATUS_ITEMS = ['Actives', 'Traitées', 'Toutes'];
const STATUS_VALUES: Record<string, 'active' | 'done' | undefined> = {
  Actives: 'active',
  Traitées: 'done',
  Toutes: undefined,
};

// Seg période — borne basse `from` calculée en jours glissants (Tout = sans borne).
const PERIOD_ITEMS = ['30 j', '90 j', '12 mois', 'Tout'];
const PERIOD_DAYS: Record<string, number | null> = { '30 j': 30, '90 j': 90, '12 mois': 365, Tout: null };

const DAY_MS = 86_400_000;

export function CrmAnnuaire({ canWrite, onOpenActor }: { canWrite: boolean; onOpenActor: (actorId: string) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [topicCode, setTopicCode] = useState('');
  const [statusItem, setStatusItem] = useState('Toutes');
  const [periodItem, setPeriodItem] = useState('Tout');
  const [newActorOpen, setNewActorOpen] = useState(false);

  const topicsQuery = useQuery({ queryKey: ['crm-demand-topics'], queryFn: listDemandTopics });

  // Borne `from` STABLE par sélection (minuit local, précision jour) : un Date.now() brut
  // par render changerait la queryKey en boucle et relancerait la requête.
  const from = useMemo(() => {
    const days = PERIOD_DAYS[periodItem];
    if (!days) return undefined;
    const date = new Date(Date.now() - days * DAY_MS);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }, [periodItem]);

  const status = STATUS_VALUES[statusItem];
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

  // KPI réactifs : sous filtre, interaction_count = total FILTRÉ par le serveur (sujet/
  // statut/période appliqués à tous les agrégats) — interactions_12m resterait la fenêtre
  // 12 mois intersectée et mentirait sur « 30 j ». Sans filtre, on garde la lecture
  // « activité récente » (12 mois) du design d'origine.
  const totalInteractions = hasFilters
    ? entries.reduce((sum, entry) => sum + entry.interactionCount, 0)
    : entries.reduce((sum, entry) => sum + entry.interactions12m, 0);
  const interactionsKpiLabel = from ? 'Interactions (période)' : hasFilters ? 'Interactions (filtrées)' : 'Interactions · 12 mois';
  const totalObjects = entries.reduce((sum, entry) => sum + entry.objectCount, 0);

  if (directoryQuery.isLoading) {
    return <div className="crm-loading">Chargement de l&apos;annuaire…</div>;
  }
  if (directoryQuery.isError) {
    return <div className="inline-alert">Échec du chargement de l&apos;annuaire : {(directoryQuery.error as Error).message}</div>;
  }

  return (
    <div className="crm-body">
      <div className="crm-kpis">
        {/* Peps PO point 1 : accents KPI distincts (teal / orange / bleu) — fini le tout-teal. */}
        <Kpi label="Acteurs suivis" value={String(entries.length)} hint="personnes & organisations" accent="teal" />
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
        <select
          className="crm-select"
          aria-label="Sujet"
          value={topicCode}
          onChange={(event) => setTopicCode(event.target.value)}
        >
          <option value="">Tous les sujets</option>
          {(topicsQuery.data ?? []).map((topic) => (
            <option key={topic.code} value={topic.code}>
              {topic.name}
            </option>
          ))}
        </select>
        <Seg items={STATUS_ITEMS} value={statusItem} onChange={setStatusItem} />
        <Seg items={PERIOD_ITEMS} value={periodItem} onChange={setPeriodItem} />
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
                <Pav name={entry.displayName} tintKey={entry.actorId} />
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
                {entry.topTopics.slice(0, 2).map((topic) => (
                  <span key={topic} className="topic-chip">
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
