import { env } from './env';

// Product rule: every in-app map should default to satellite imagery unless a
// very explicit product requirement says otherwise.
export const DEFAULT_APP_MAP_STYLE = env.mapStyles.satellite;
