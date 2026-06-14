"use client";

// Page /crm (§61, design v2 acteur-centré 2026-06-11) — shell du module CRM.
// Modèle : l'ACTEUR (personne/organisation) est l'entité CRM principale ; l'objet
// (établissement) n'est que le CONTEXTE. Le même acteur peut être lié à plusieurs
// objets avec des rôles différents — les interactions le suivent à travers tous
// ses contextes, et l'UI porte les deux sens de navigation (acteur ⇄ objet).
//
// 3 onglets (Acteurs / Tâches & relances / Timeline) + 2 drill-ins (fiche acteur,
// vue établissement). État de navigation persisté dans localStorage
// `bertel-crm-nav-v2`. Toutes les vues sont sur données réelles (RPCs api.*) via
// src/services/crm. Gating page-wide write_crm_notes : aucune écriture rendue
// active sans permission (no-write-trap), raison affichée.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePresenceRoom } from '../hooks/usePresenceRoom';
import { listCrmDirectory, listCrmTasks, userCanWriteCrmNotes } from '../services/crm';
import { CrmAnnuaire } from '../features/crm/CrmAnnuaire';
import { CrmActorFiche } from '../features/crm/CrmActorFiche';
import { CrmObjectView } from '../features/crm/CrmObjectView';
import { CrmTaches } from '../features/crm/CrmTaches';
import { CrmTimelineView } from '../features/crm/CrmTimelineView';
import { CRM_READ_ONLY_REASON } from '../features/crm/crm-view-utils';

const NAV_KEY = 'bertel-crm-nav-v2';

type CrmView = 'annuaire' | 'taches' | 'timeline';

interface CrmNav {
  view: CrmView;
  actorId?: string;
  objectId?: string;
  /** Acteur d'origine d'une vue établissement — le retour y revient. */
  originActorId?: string;
}

const DEFAULT_NAV: CrmNav = { view: 'annuaire' };

// Libellé du retour de la vue établissement quand on n'arrive PAS d'une fiche
// acteur : il nomme l'onglet d'origine (le retour, lui, y revient déjà — backFromObject).
const TAB_BACK_LABELS: Record<CrmView, string> = {
  annuaire: 'Annuaire des acteurs',
  taches: 'Tâches & relances',
  timeline: 'Timeline',
};

function loadNav(): CrmNav {
  try {
    const raw = localStorage.getItem(NAV_KEY);
    if (!raw) return DEFAULT_NAV;
    const parsed = JSON.parse(raw) as Partial<CrmNav> | null;
    if (!parsed || (parsed.view !== 'annuaire' && parsed.view !== 'taches' && parsed.view !== 'timeline')) {
      return DEFAULT_NAV;
    }
    return {
      view: parsed.view,
      actorId: typeof parsed.actorId === 'string' ? parsed.actorId : undefined,
      objectId: typeof parsed.objectId === 'string' ? parsed.objectId : undefined,
      originActorId: typeof parsed.originActorId === 'string' ? parsed.originActorId : undefined,
    };
  } catch {
    return DEFAULT_NAV;
  }
}

export default function CrmPage() {
  // Hydratation différée du nav : l'état initial est stable côté SSR, puis le nav
  // persisté est restauré au mount (pas de mismatch d'hydratation).
  const [nav, setNav] = useState<CrmNav>(DEFAULT_NAV);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setNav(loadNav());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify(nav));
    } catch {
      /* stockage indisponible : la navigation reste fonctionnelle, juste non persistée */
    }
  }, [nav, hydrated]);

  // Requêtes partagées (mêmes clés que les vues → une seule charge réseau) :
  // compteurs d'onglets + résolution du libellé de retour de la vue établissement.
  const directoryQuery = useQuery({ queryKey: ['crm-directory'], queryFn: () => listCrmDirectory() });
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks });
  const canWriteQuery = useQuery({ queryKey: ['crm-can-write'], queryFn: userCanWriteCrmNotes });
  // syncGlobalStatus: true alimente le badge « X live » du header (présence) ; on garde le hook
  // pour cet effet + typingUsers, mais on n'affiche plus « X collaborateur(s) en ligne » sous le
  // titre (doublon du badge header — rectif PO).
  const { typingUsers } = usePresenceRoom('crm:tasks', { syncGlobalStatus: true });

  const canWrite = canWriteQuery.data === true;
  // Tant que la sonde de permission charge, ne pas afficher « Lecture seule » (flash pour les éditeurs).
  const canWriteKnown = !canWriteQuery.isLoading;

  const actorCount = directoryQuery.data?.length ?? null;
  const activeTasks = (tasksQuery.data ?? []).filter((task) => task.status === 'todo' || task.status === 'in_progress').length;

  const originActorName = useMemo(() => {
    if (!nav.originActorId) return null;
    return directoryQuery.data?.find((entry) => entry.actorId === nav.originActorId)?.displayName ?? null;
  }, [directoryQuery.data, nav.originActorId]);

  const goTab = (view: CrmView) => setNav({ view });
  const openActor = (actorId: string) => setNav((current) => ({ view: current.view, actorId }));
  const openObject = (objectId: string) =>
    setNav((current) => ({ ...current, objectId, originActorId: current.actorId ?? current.originActorId }));
  const backFromActor = () => setNav({ view: 'annuaire' });
  const backFromObject = () =>
    setNav((current) =>
      current.originActorId ? { view: current.view, actorId: current.originActorId } : { view: current.view },
    );

  const tabs: Array<{ key: CrmView; label: string; count: number | null }> = [
    { key: 'annuaire', label: 'Acteurs', count: actorCount },
    { key: 'taches', label: 'Tâches & relances', count: tasksQuery.data ? activeTasks : null },
    { key: 'timeline', label: 'Timeline', count: null },
  ];

  let body;
  if (nav.objectId) {
    body = (
      <CrmObjectView
        objectId={nav.objectId}
        backLabel={originActorName ?? (nav.originActorId ? 'Fiche acteur' : TAB_BACK_LABELS[nav.view])}
        canWrite={canWrite}
        onBack={backFromObject}
        onOpenActor={openActor}
      />
    );
  } else if (nav.actorId) {
    body = <CrmActorFiche actorId={nav.actorId} canWrite={canWrite} onBack={backFromActor} onOpenObject={openObject} />;
  } else if (nav.view === 'taches') {
    body = <CrmTaches canWrite={canWrite} onOpenObject={openObject} onOpenActor={openActor} />;
  } else if (nav.view === 'timeline') {
    body = <CrmTimelineView canWrite={canWrite} onOpenObject={openObject} onOpenActor={openActor} />;
  } else {
    body = <CrmAnnuaire canWrite={canWrite} onOpenActor={openActor} />;
  }

  return (
    <section className="crm-app">
      <div className="crm-sub">
        <div className="crm-sub__title">
          Relation acteurs
        </div>
        <div className="crm-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={nav.view === tab.key && !nav.actorId && !nav.objectId ? 'is-on' : ''}
              onClick={() => goTab(tab.key)}
            >
              {tab.label}
              {tab.count !== null && <span className="n">{tab.count}</span>}
            </button>
          ))}
        </div>
        <div className="crm-sub__actions">
          {typingUsers.length > 0 && <span className="pill-mini">{typingUsers.join(' · ')}</span>}
          {canWriteKnown && !canWrite && <span className="pill-mini crm-readonly-pill">{CRM_READ_ONLY_REASON}</span>}
        </div>
      </div>

      {body}
    </section>
  );
}

export { CrmPage };
