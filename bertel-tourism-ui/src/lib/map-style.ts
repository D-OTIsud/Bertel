import type { MapLayerMode } from '../types/domain';
import { DEFAULT_MAP_STYLES, env } from './env';

// Product rule: the app's default map style follows whichever fond de carte is currently
// selected/configured for `satellite` — it is NOT guaranteed to be satellite imagery: when no
// custom URL is configured, `satellite` falls back to an ordinary vector basemap (OpenFreeMap
// "liberty"), same as `topo` falls back to "bright".
export const DEFAULT_APP_MAP_STYLE = env.mapStyles.satellite;

/** D19 : URL de style par fond de carte (ui-store.mapLayer) — repli satellite. */
export function getAppMapStyle(mode: MapLayerMode): string {
  return env.mapStyles[mode] ?? DEFAULT_APP_MAP_STYLE;
}

// The fallback URLs (no NEXT_PUBLIC_MAP_STYLE_* configured) are ordinary vector styles, not
// satellite imagery or a real topo map — label them honestly. A configured custom style keeps
// the "Satellite"/"Topo" label, since it's then whatever the org actually set up.
const SATELLITE_LABEL = env.mapStyles.satellite === DEFAULT_MAP_STYLES.satellite ? 'Plan détaillé' : 'Satellite';
const TOPO_LABEL = env.mapStyles.topo === DEFAULT_MAP_STYLES.topo ? 'Plan clair' : 'Topo';

export const MAP_LAYER_OPTIONS: Array<{ mode: MapLayerMode; label: string }> = [
  { mode: 'classic', label: 'Plan' },
  { mode: 'satellite', label: SATELLITE_LABEL },
  { mode: 'topo', label: TOPO_LABEL },
];
