'use client';

// Carte récap RÉELLE du template OTI — même socle MapLibre que l'Explorer / l'éditeur
// (react-map-gl/maplibre + DEFAULT_APP_MAP_STYLE), pins numérotés alignés sur la
// numérotation des cartes. Remplace le décor du mockup (dégradé + positions factices).
//
// Impression : un canvas WebGL ne se rend ni dans le portail print (display:none) ni au
// Ctrl+P — à chaque idle on fige un cliché JPEG du canvas + les pins re-projetés en % du
// conteneur (les markers DOM ne font pas partie du canvas). Le bloc .oti-map__printshot
// est révélé par le @media print d'oti-template.css ; onSnapshot remonte le même cliché
// vers le portail d'impression de la compose.
import { useRef, useState } from 'react';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import type { MapLibreEvent } from 'maplibre-gl';
import { DEFAULT_APP_MAP_STYLE } from '../../lib/map-style';
import { bboxOf, locatedPois, projectPins, type OtiMapSnapshot } from './oti-map-utils';
import type { OtiPoi } from './OtiTemplate';

export interface OtiMapRecapProps {
  pois: OtiPoi[];
  lang: 'fr' | 'en';
  onSnapshot?: (shot: OtiMapSnapshot) => void;
}

export default function OtiMapRecap({ pois, lang, onSnapshot }: OtiMapRecapProps) {
  const located = locatedPois(pois);
  const [shot, setShot] = useState<OtiMapSnapshot | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const bb = bboxOf(located);
  if (located.length === 0 || !bb) {
    return null; // le parent (MapRecap) garde le bloc décoratif de repli
  }

  function handleLoad(e: MapLibreEvent) {
    if (!bb) return;
    e.target.fitBounds(
      [
        [bb[0], bb[1]],
        [bb[2], bb[3]],
      ],
      { padding: 42, maxZoom: 13, duration: 0 },
    );
  }

  function handleIdle(e: MapLibreEvent) {
    try {
      const map = e.target;
      const url = map.getCanvas().toDataURL('image/jpeg', 0.82);
      if (url === lastUrlRef.current) return;
      const rect = map.getContainer().getBoundingClientRect();
      const pins = projectPins(located, (lngLat) => map.project(lngLat), rect.width, rect.height);
      lastUrlRef.current = url;
      const next: OtiMapSnapshot = { url, pins };
      setShot(next);
      onSnapshot?.(next);
    } catch {
      // Canvas illisible (perte de contexte WebGL…) : pas de cliché print, la carte live reste.
    }
  }

  return (
    <div className="oti-map oti-map--live">
      <div className="oti-map__canvas">
        <Map
          mapStyle={DEFAULT_APP_MAP_STYLE}
          initialViewState={{
            longitude: (bb[0] + bb[2]) / 2,
            latitude: (bb[1] + bb[3]) / 2,
            zoom: 9,
          }}
          attributionControl={false}
          dragRotate={false}
          scrollZoom={false}
          canvasContextAttributes={{ preserveDrawingBuffer: true }}
          style={{ width: '100%', height: '100%' }}
          onLoad={handleLoad}
          onIdle={handleIdle}
        >
          {located.map(({ poi, n, lat, lon }) => (
            <Marker key={poi.id} longitude={lon} latitude={lat} anchor="center">
              <span className="oti-map__pin oti-map__pin--live" title={poi.name}>
                {n}
              </span>
            </Marker>
          ))}
          <NavigationControl position="top-right" showCompass={false} visualizePitch={false} />
        </Map>
      </div>
      {shot ? (
        <div className="oti-map__printshot" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="" />
          {shot.pins.map((p) => (
            <span key={p.n} className="oti-map__pin" style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}>
              {p.n}
            </span>
          ))}
        </div>
      ) : null}
      {/* Légende dupliquée du repli de MapRecap (pas d'import runtime depuis OtiTemplate : code-split). */}
      <div className="oti-map__cap">
        <div className="s oti-script">{lang === 'en' ? 'Your route' : 'Votre parcours'}</div>
        <div className="t">{lang === 'en' ? 'across the South' : 'dans le Sud'}</div>
      </div>
      <span className="oti-map__attrib">© OpenStreetMap</span>
    </div>
  );
}
