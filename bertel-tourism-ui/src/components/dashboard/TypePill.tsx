"use client";

import { BedDouble, Bike, Landmark, PartyPopper, Route, Store, Tag, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ArchetypeCode } from '../../features/object-editor/archetypes';
import { resolveArchetype, resolveTypeLabel } from '../../utils/labels';

/** Picto lucide par archétype — couleur portée par la classe `acc-*` (token --acc-*). */
const ARCHETYPE_ICON: Record<ArchetypeCode, LucideIcon> = {
  HEB: BedDouble,
  RES: Utensils,
  ASC: Bike,
  ITI: Route,
  VIS: Landmark,
  SRV: Store,
  FMA: PartyPopper,
};

interface Props {
  type: string | null | undefined;
}

/**
 * Pastille de type : picto + libellé FR, teintée par l'archétype (source unique
 * `--acc-*`). Réutilise la primitive `.type-pill` de la Phase 1 (cartes Explorer,
 * carte géo, drawer) — même langage visuel sur toutes les surfaces.
 */
export function TypePill({ type }: Props) {
  const archetype = resolveArchetype(type);
  const Icon = archetype ? ARCHETYPE_ICON[archetype] : Tag;
  const accent = archetype ? `acc-${archetype.toLowerCase()}` : '';
  return (
    <span className={`type-pill ${accent}`.trim()}>
      <Icon aria-hidden="true" />
      {resolveTypeLabel(type)}
    </span>
  );
}
