// Recherche acteurs du CRM (demande PO 2026-07-27) — état PARTAGÉ entre la TopBar (qui possède
// le champ) et l'annuaire (qui consomme le terme). Il faut un store parce que la TopBar vit hors
// de l'arbre de /crm.
//
// DÉLIBÉRÉMENT SÉPARÉ de l'explorer-store : écrire la recherche CRM dans `common.search`
// polluerait la recherche Explorer, qui est justement conservée au retour sur l'Explorer.
// Non persisté : une recherche est un état de session, pas une préférence.
import { create } from 'zustand';

interface CrmSearchState {
  search: string;
  setSearch: (value: string) => void;
}

export const useCrmSearchStore = create<CrmSearchState>()((set) => ({
  search: '',
  setSearch: (search) => set({ search }),
}));

/**
 * Seuil du contrat serveur : sous 2 caractères utiles, `api.list_crm_directory` traite
 * `p_search` comme absent. On ne l'envoie donc pas — inutile de faire un aller-retour pour
 * un résultat identique à l'annuaire complet.
 */
export const CRM_SEARCH_MIN_LENGTH = 2;

/** Terme réellement envoyé au serveur — `undefined` tant que le seuil n'est pas atteint. */
export function effectiveCrmSearch(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length >= CRM_SEARCH_MIN_LENGTH ? trimmed : undefined;
}
