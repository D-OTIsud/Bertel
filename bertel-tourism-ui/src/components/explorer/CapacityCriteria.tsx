'use client';

import { Plus, X } from 'lucide-react';
import type {
  BackendObjectTypeCode,
  CapacityBoundsByMetric,
  CapacityFilter,
  ExplorerReferenceOption,
} from '../../types/domain';
import { filterOptionsByObjectTypes, resolveCapacityBounds } from '../../utils/facets';
import { RangeSlider } from '@/components/ui/range-slider';

/**
 * « Capacités détaillées » — on AJOUTE un critère, au lieu d'empiler une paire Min/Max
 * par métrique du catalogue.
 *
 * Deux défauts corrigés d'un coup (signalement PO 2026-07-27) :
 *  1. la liste était calculée pour le BUCKET (HOT = HOT∪HLO∪HPA∪CAMP∪RVA), donc
 *     « Emplacements », « Camping-cars » et « Tentes » s'affichaient en cherchant un
 *     hôtel. Elle suit maintenant les SOUS-TYPES cochés ;
 *  2. sept paires de champs vides occupaient la colonne en permanence. Le tiroir ne
 *     montre que les critères réellement demandés.
 *
 * Le critère ACTIF reste rendu même si son type sort de la sélection : il agit toujours
 * sur la requête, il doit rester retirable (même règle que le scheme de distinction
 * sélectionné, 16n).
 */
interface CapacityCriteriaProps {
  metrics: ExplorerReferenceOption[];
  filters: CapacityFilter[];
  selectedTypes: readonly BackendObjectTypeCode[];
  bounds: CapacityBoundsByMetric | undefined;
  onChange: (code: string, min: number | undefined, max: number | undefined) => void;
  /** Unité par métrique, quand elle éclaire la valeur (« pers. », « m² »). */
  unitByMetric?: Record<string, string>;
}

export function CapacityCriteria({
  metrics,
  filters,
  selectedTypes,
  bounds,
  onChange,
  unitByMetric = {},
}: CapacityCriteriaProps) {
  const activeCodes = filters.map((filter) => filter.code);
  const applicable = filterOptionsByObjectTypes(metrics, selectedTypes);
  // Un critère actif dont la métrique n'est plus applicable reste éditable : on le
  // rattache depuis le catalogue complet plutôt que de le faire disparaître.
  const rows = filters
    .map((filter) => ({
      filter,
      metric: metrics.find((metric) => metric.code === filter.code),
    }))
    .filter((row): row is { filter: CapacityFilter; metric: ExplorerReferenceOption } => Boolean(row.metric));
  const addable = applicable.filter((metric) => !activeCodes.includes(metric.code));

  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {rows.map(({ filter, metric }) => (
        <div key={metric.code} className="rounded-[8px] border border-line px-2.5 py-2">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <RangeSlider
                label={metric.name}
                min={filter.min}
                max={filter.max}
                unit={unitByMetric[metric.code]}
                bounds={resolveCapacityBounds(bounds, metric.code, selectedTypes)}
                onChange={(min, max) => onChange(metric.code, min, max)}
              />
            </div>
            <button
              type="button"
              className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 transition hover:bg-surface2 hover:text-ink"
              aria-label={`Retirer le critère ${metric.name}`}
              onClick={() => onChange(metric.code, undefined, undefined)}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      {addable.length > 0 ? (
        <label className="flex items-center gap-2 rounded-[8px] border border-dashed border-lineStrong px-2.5 py-1.5 text-[12px] text-ink-2 transition focus-within:border-teal hover:border-teal">
          <Plus className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="sr-only">Ajouter un critère de capacité</span>
          <select
            className="w-full cursor-pointer border-0 bg-transparent p-0 text-[12px] text-ink-2 focus:outline-none"
            value=""
            onChange={(event) => {
              const code = event.target.value;
              if (!code) return;
              // Le critère naît avec un minimum : une ligne sans borne ne serait pas
              // stockée (`normalizeCapacityFilters` écarte min et max tous deux nuls)
              // et disparaîtrait au rendu suivant. On amorce sur la borne basse
              // observée — la valeur la moins excluante qui garde la ligne vivante.
              //
              // À NOTER, ce n'est pas neutre pour autant : l'arme serveur exige une
              // ligne `object_capacity` pour la métrique, donc ajouter un critère
              // écarte toute fiche qui ne renseigne pas cette capacité. C'est le sens
              // attendu de « filtrer sur les chambres », et c'est ce que dit le
              // libellé « observé sur N fiches ».
              const scoped = resolveCapacityBounds(bounds, code, selectedTypes);
              onChange(code, scoped ? scoped.min : 1, undefined);
            }}
          >
            <option value="">Ajouter un critère…</option>
            {addable.map((metric) => (
              <option key={metric.code} value={metric.code}>
                {metric.name}
              </option>
            ))}
          </select>
        </label>
      ) : rows.length === 0 ? (
        <p className="text-[12px] leading-snug text-ink-3">
          Aucun critère de capacité pour les types sélectionnés.
        </p>
      ) : null}
    </div>
  );
}
