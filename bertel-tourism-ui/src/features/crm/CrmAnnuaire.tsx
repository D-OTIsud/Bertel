"use client";

// Annuaire des ACTEURS (§61, design v2) — l'entité CRM principale. Les
// établissements n'apparaissent que comme contextes liés à chaque acteur.
// Données réelles : api.list_crm_directory via services/crm (cache partagé
// sur la clé 'crm-directory' avec le shell et les autres vues).

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CircleHelp, Search } from 'lucide-react';
import { listCrmDirectory, type CrmDirectoryEntry } from '../../services/crm';
import { Kpi, Pav } from './crm-primitives';
import { formatRelative, interactionTypeLabelOf } from './crm-view-utils';

function matchesSearch(entry: CrmDirectoryEntry, query: string): boolean {
  const haystack = [entry.displayName, ...entry.objects.map((object) => `${object.objectName} ${object.roleName ?? ''}`)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function CrmAnnuaire({ onOpenActor }: { onOpenActor: (actorId: string) => void }) {
  const [search, setSearch] = useState('');
  const [typeFilters, setTypeFilters] = useState<string[]>([]);

  const directoryQuery = useQuery({ queryKey: ['crm-directory'], queryFn: () => listCrmDirectory() });
  const entries = useMemo(() => directoryQuery.data ?? [], [directoryQuery.data]);

  // Chips de filtre = types d'objets réellement présents dans l'annuaire.
  const objectTypes = useMemo(() => {
    const types = new Set<string>();
    for (const entry of entries) {
      for (const object of entry.objects) {
        if (object.objectType) types.add(object.objectType);
      }
    }
    return [...types].sort();
  }, [entries]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (query && !matchesSearch(entry, query)) return false;
      if (typeFilters.length > 0 && !entry.objects.some((object) => typeFilters.includes(object.objectType))) return false;
      return true;
    });
  }, [entries, search, typeFilters]);

  const totalInteractions12m = entries.reduce((sum, entry) => sum + entry.interactions12m, 0);
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
        <Kpi label="Acteurs suivis" value={String(entries.length)} hint="personnes & organisations" />
        <Kpi label="Interactions · 12 mois" value={String(totalInteractions12m)} hint="appels, e-mails, visites terrain, notes" />
        <Kpi label="Établissements liés" value={String(totalObjects)} hint="contextes de la relation" />
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
        {objectTypes.length > 0 && <span className="crm-toolbar__sep" aria-hidden></span>}
        <div className="chip-row">
          {objectTypes.map((type) => {
            const active = typeFilters.includes(type);
            return (
              <button
                key={type}
                type="button"
                className={'crm-chip' + (active ? ' is-on' : '')}
                aria-pressed={active}
                onClick={() =>
                  setTypeFilters((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]))
                }
              >
                {type}
              </button>
            );
          })}
        </div>
        <div className="crm-toolbar__right">
          <span>
            {rows.length} acteur{rows.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

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
                {entry.interactions12m} · 12 mois
                <small>{entry.interactionCount} au total</small>
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
            {entries.length === 0 ? 'Aucun acteur dans l’annuaire CRM.' : 'Aucun acteur ne correspond à ces filtres.'}
          </div>
        )}
      </div>

      <div className="crm-foot-hint">
        <CircleHelp size={13} aria-hidden />
        Un acteur (personne ou organisation) peut être lié à plusieurs établissements avec des rôles différents — les
        interactions le suivent à travers tous ses contextes.
      </div>
    </div>
  );
}
