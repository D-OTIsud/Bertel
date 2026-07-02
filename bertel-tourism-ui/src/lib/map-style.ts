import type { MapLayerMode } from '../types/domain';
import { env } from './env';

// Product rule: every in-app map should default to satellite imagery unless a
// very explicit product requirement says otherwise.
export const DEFAULT_APP_MAP_STYLE = env.mapStyles.satellite;

/** D19 : URL de style par fond de carte (ui-store.mapLayer) — repli satellite. */
export function getAppMapStyle(mode: MapLayerMode): string {
  return env.mapStyles[mode] ?? DEFAULT_APP_MAP_STYLE;
}

export const MAP_LAYER_OPTIONS: Array<{ mode: MapLayerMode; label: string }> = [
  { mode: 'classic', label: 'Plan' },
  { mode: 'satellite', label: 'Satellite' },
  { mode: 'topo', label: 'Topo' },
];
