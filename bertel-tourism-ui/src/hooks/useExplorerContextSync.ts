'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useUiStore } from '@/store/ui-store';

/** Clé URL du drawer (D25) — préservée par useExplorerUrlSync lors des écritures filtres. */
export const DRAWER_URL_PARAM = 'fiche';

/**
 * D25 — préservation du contexte : la fiche ouverte dans le drawer vit dans
 * l'URL (`?fiche=<id>`) → deep-link, partage, ouvrir-dans-un-nouvel-onglet,
 * rechargement et Précédent/Suivant restaurent la même fiche.
 * Écritures via history.replaceState natif (intégré au routeur depuis Next 14.1,
 * pas de re-render de page) ; lectures via useSearchParams (couvre popstate).
 */
export function useExplorerContextSync() {
  const searchParams = useSearchParams();
  const urlFiche = searchParams?.get(DRAWER_URL_PARAM) ?? null;
  // Dernière valeur APPLIQUÉE (dans un sens ou l'autre) — coupe les boucles
  // URL→store→URL sans bloquer les vrais changements.
  const lastAppliedRef = useRef<string | null>(null);

  // URL → store (chargement initial, deep-link, Précédent/Suivant).
  useEffect(() => {
    if (urlFiche === lastAppliedRef.current) return;
    lastAppliedRef.current = urlFiche;
    const { drawerObjectId, openDrawer, closeDrawer } = useUiStore.getState();
    if (urlFiche && urlFiche !== drawerObjectId) {
      openDrawer(urlFiche);
    } else if (!urlFiche && drawerObjectId) {
      closeDrawer();
    }
  }, [urlFiche]);

  // Store → URL : abonnement direct au store (même pattern que useExplorerUrlSync).
  useEffect(() => {
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      if (state.drawerObjectId === previous.drawerObjectId) return;
      const next = state.drawerObjectId;
      if (next === lastAppliedRef.current) return;
      lastAppliedRef.current = next;
      const params = new URLSearchParams(window.location.search);
      if (next) {
        params.set(DRAWER_URL_PARAM, next);
      } else {
        params.delete(DRAWER_URL_PARAM);
      }
      const query = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    });
    return unsubscribe;
  }, []);
}
