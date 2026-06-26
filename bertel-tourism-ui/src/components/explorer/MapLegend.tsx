'use client';

import type { ObjectTypeCode } from '../../types/domain';
import { defaultMarkerStyles, markerIconCatalog } from '../../config/map-markers';

/**
 * Légende des marqueurs (impl. 3.3) — décode les 7 familles d'archétype.
 *
 * SOURCE UNIQUE : chaque pastille reprend EXACTEMENT la couleur ET le glyphe du
 * marqueur, lus dans `defaultMarkerStyles` — la même table qui génère les PNG de
 * `public/markers/` (cf. `scripts/generate-marker-pngs.ts`). Le glyphe vient de
 * `markerIconCatalog[icon].glyph`, donc la légende ne peut pas diverger des pins.
 * (Décision §126 : les défauts reprennent les icônes lucide du modal « Créer une
 * fiche » — HEB=lit double, RES=couverts croisés, ACT=montagne, VIS=monument,
 * EVT=cotillons — pour aligner légende, pins et cartes sur le sélecteur de type.)
 * Ancrée bas-gauche par `.map-legend`.
 */
interface LegendEntry {
  bucket: ObjectTypeCode;
  label: string;
}

const LEGEND: LegendEntry[] = [
  { bucket: 'HOT', label: 'Hébergement' },
  { bucket: 'RES', label: 'Restauration' },
  { bucket: 'ACT', label: 'Activité' },
  { bucket: 'ITI', label: 'Itinéraire' },
  { bucket: 'VIS', label: 'Site & visite' },
  { bucket: 'SRV', label: 'Service' },
  { bucket: 'EVT', label: 'Événement' },
];

export function MapLegend() {
  return (
    <div className="panel map-legend" role="group" aria-label="Légende des types">
      <div className="map-legend__title">Légende des types</div>
      {LEGEND.map(({ bucket, label }) => {
        const style = defaultMarkerStyles[bucket];
        const glyph = markerIconCatalog[style.icon].glyph;
        return (
          <div key={bucket} className="map-legend__row">
            <span className="map-legend__dot" data-marker-icon={style.icon} style={{ background: style.color }}>
              {/*
                Glyphe SVG du catalogue interne (constante de confiance, jamais
                d'entrée utilisateur) — même tracé que les PNG des marqueurs. Le
                stroke `currentColor` reprend la couleur blanche de la pastille,
                comme le glyphe sombre des pins.
              */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: glyph }}
              />
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}
