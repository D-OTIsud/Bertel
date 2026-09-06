'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { buildSearchParams } from '../../lib/explorer-search-params';
import type { ExplorerFilters } from '../../types/domain';

/**
 * Rouvre le périmètre courant du dashboard dans l'Explorateur.
 *
 * Le transfert passe par l'URL et non par une écriture dans le store singleton :
 * l'Explorateur s'hydrate déjà depuis les paramètres de recherche (useExplorerUrlSync),
 * et c'est la même voie qu'emprunte « ★ Liste dynamique ». Écrire directement dans
 * l'autre instance créerait une seconde source de vérité pour le même état.
 *
 * La période du dashboard (updated_at) est volontairement perdue : elle n'existe pas
 * dans le vocabulaire de l'Explorateur, et la transposer serait un mensonge.
 */
export function ExplorerBridgeButton() {
  const router = useRouter();

  const openInExplorer = () => {
    const snapshot = useDashboardExplorerStore.getState() as unknown as ExplorerFilters;
    const params = buildSearchParams(snapshot);
    const query = params.toString();
    router.push(query ? `/explorer?${query}` : '/explorer');
  };

  return (
    <button
      type="button"
      className="ghost-button explorer-bridge"
      onClick={openInExplorer}
      title="Rouvrir ce périmètre dans l’Explorateur (la période n’est pas transmise)"
    >
      <ExternalLink size={13} aria-hidden="true" />
      Ouvrir dans l’Explorateur
    </button>
  );
}
