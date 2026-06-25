"use client";

import type { DashboardTypeBreakdown } from '../../types/dashboard';
import type { BackendObjectTypeCode } from '../../types/domain';
import type { ArchetypeCode } from '../../features/object-editor/archetypes';
import { useDashboardFilterStore } from '../../store/dashboard-filter-store';
import { resolveArchetype, archetypeLabel } from '../../utils/labels';

interface Props {
  data: DashboardTypeBreakdown;
}

interface ArchetypeSegment {
  archetype: ArchetypeCode;
  label: string;
  count: number;
  pct: number;
  /** DB type codes folded into this archetype — used for drill-down filtering. */
  types: BackendObjectTypeCode[];
}

/**
 * Replie les comptes par `object_type` (jusqu'à 18 codes) sur les 7 archétypes
 * canoniques (table unique `archetypes.ts`), pour une barre empilée lisible plutôt
 * qu'une longue liste. Source unique type→archétype : impossible de diverger de
 * l'Explorer / éditeur.
 */
function foldByArchetype(rows: DashboardTypeBreakdown['rows']): {
  segments: ArchetypeSegment[];
  total: number;
} {
  const byArchetype = new Map<ArchetypeCode, ArchetypeSegment>();
  let total = 0;

  for (const row of rows) {
    const archetype = resolveArchetype(row.type);
    if (!archetype) continue; // ORG (exclu côté serveur) — garde-fou
    total += row.count;
    const seg = byArchetype.get(archetype);
    if (seg) {
      seg.count += row.count;
      seg.types.push(row.type);
    } else {
      byArchetype.set(archetype, {
        archetype,
        label: archetypeLabel(archetype),
        count: row.count,
        pct: 0,
        types: [row.type],
      });
    }
  }

  const segments = Array.from(byArchetype.values())
    .map((seg) => ({ ...seg, pct: total > 0 ? Math.round((seg.count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);

  return { segments, total };
}

export function TypeBreakdown({ data }: Props) {
  const setFilters = useDashboardFilterStore((s) => s.setFilters);
  const activeTypes = useDashboardFilterStore((s) => s.filters.types) ?? [];

  const { segments, total } = foldByArchetype(data.rows);

  // Drill-down par archétype : (dé)sélectionne d'un coup tous les types DB de la famille.
  function toggleArchetype(seg: ArchetypeSegment) {
    const isActive = seg.types.some((t) => activeTypes.includes(t));
    const next = isActive
      ? activeTypes.filter((t) => !seg.types.includes(t))
      : [...activeTypes, ...seg.types.filter((t) => !activeTypes.includes(t))];
    setFilters({ types: next.length > 0 ? next : undefined });
  }

  const distributionLabel = segments
    .map((s) => `${s.label} ${s.count}`)
    .join(', ');

  return (
    <article className="kpi-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Répartition</span>
          <h2>Corpus par type</h2>
          <p>{total.toLocaleString('fr-FR')} fiches réparties par archétype</p>
        </div>
        <span className="kpi-panel__total">{segments.length} familles</span>
      </div>

      {/* Barre empilée — visuelle (role=img) ; le drill-down passe par la légende. */}
      <div className="corpus-stack" role="img" aria-label={`Répartition : ${distributionLabel}`}>
        {segments.map((seg) => (
          <div
            key={seg.archetype}
            className={`corpus-stack__seg acc-${seg.archetype.toLowerCase()}`}
            style={{ flexGrow: seg.count }}
            title={`${seg.label} : ${seg.count} (${seg.pct} %)`}
          >
            <span className="corpus-stack__seg-val">{seg.count.toLocaleString('fr-FR')}</span>
          </div>
        ))}
      </div>

      <div className="corpus-legend">
        {segments.map((seg) => {
          const isActive = seg.types.some((t) => activeTypes.includes(t));
          return (
            <button
              key={seg.archetype}
              type="button"
              className={`corpus-legend__item${isActive ? ' corpus-legend__item--active' : ''}`}
              onClick={() => toggleArchetype(seg)}
              aria-pressed={isActive}
              title={`Filtrer : ${seg.label}`}
            >
              <span className={`corpus-legend__dot acc-${seg.archetype.toLowerCase()}`} aria-hidden="true" />
              <span className="corpus-legend__label">{seg.label}</span>
              <span className="corpus-legend__count">{seg.count.toLocaleString('fr-FR')}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
