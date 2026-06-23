'use client';

import type { ComponentType } from 'react';
import { Activity, Bed, CalendarDays, Mountain, Route, Store, Utensils } from 'lucide-react';
import type { ObjectTypeCode } from '../../types/domain';
import { defaultMarkerStyles } from '../../config/map-markers';

/**
 * Légende des marqueurs (impl. 3.3) — décode les 7 familles d'archétype.
 * Les pastilles reprennent EXACTEMENT la couleur des marqueurs (defaultMarkerStyles),
 * source unique côté carte ; les libellés sont les noms de famille. Ancrée
 * bas-gauche sur la carte par `.map-legend`.
 */
interface LegendEntry {
  bucket: ObjectTypeCode;
  label: string;
  Icon: ComponentType<{ 'aria-hidden'?: boolean }>;
}

const LEGEND: LegendEntry[] = [
  { bucket: 'HOT', label: 'Hébergement', Icon: Bed },
  { bucket: 'RES', label: 'Restauration', Icon: Utensils },
  { bucket: 'ACT', label: 'Activité', Icon: Activity },
  { bucket: 'ITI', label: 'Itinéraire', Icon: Route },
  { bucket: 'VIS', label: 'Site & visite', Icon: Mountain },
  { bucket: 'SRV', label: 'Service', Icon: Store },
  { bucket: 'EVT', label: 'Événement', Icon: CalendarDays },
];

export function MapLegend() {
  return (
    <div className="panel map-legend" role="group" aria-label="Légende des types">
      <div className="map-legend__title">Légende des types</div>
      {LEGEND.map(({ bucket, label, Icon }) => (
        <div key={bucket} className="map-legend__row">
          <span className="map-legend__dot" style={{ background: defaultMarkerStyles[bucket]?.color }}>
            <Icon aria-hidden />
          </span>
          {label}
        </div>
      ))}
    </div>
  );
}
