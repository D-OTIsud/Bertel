'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { ExternalLink } from 'lucide-react';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { buildSearchParams } from '../../lib/explorer-search-params';
import type { ExplorerFilters } from '../../types/domain';
import { deriveExplorerFilterContext } from '../../lib/explorer-filter-context';
import { buildExplorerActiveChips } from '../explorer/explorer-active-chips';
import { useSessionStore } from '../../store/session-store';

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
  const descriptionId = useId();
  const canEditObjects = useSessionStore((s) => s.canEditObjects);

  const openInExplorer = () => {
    const snapshot = useDashboardExplorerStore.getState() as unknown as ExplorerFilters;
    const effective = deriveExplorerFilterContext(snapshot, { page: 'dashboard', canEditObjects }, buildExplorerActiveChips(snapshot));
    const params = buildSearchParams(effective.transferableFilters);
    const query = params.toString();
    router.push(query ? `/explorer?${query}` : '/explorer');
  };

  return (
    <>
    <span id={descriptionId} className="active-filter-strip__scope">Vers Explorer : critères appliqués supportés et statut effectif ; période et valeurs mémorisées non transmises.</span>
    <button
      type="button"
      className="ghost-button explorer-bridge"
      onClick={openInExplorer}
      title="Transférer les critères appliqués supportés et le statut effectif"
      aria-describedby={descriptionId}
    >
      <ExternalLink size={13} aria-hidden="true" />
      Ouvrir dans l’Explorateur
    </button>
    </>
  );
}
