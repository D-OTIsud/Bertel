// INT-04 — the fallback URLs (no NEXT_PUBLIC_MAP_STYLE_* configured) are ordinary vector
// styles, not real satellite imagery / topo maps: labels must say so. A configured custom
// URL keeps the Satellite/Topo label.
const DEFAULT_MAP_STYLES = {
  classic: 'https://demotiles.maplibre.org/style.json',
  satellite: 'https://tiles.openfreemap.org/styles/liberty',
  topo: 'https://tiles.openfreemap.org/styles/bright',
} as const;

async function loadWithMapStyles(mapStyles: { classic: string; satellite: string; topo: string }) {
  jest.resetModules();
  jest.doMock('./env', () => ({
    env: { mapStyles, demoMode: false, supabaseUrl: undefined, supabaseAnonKey: undefined },
    DEFAULT_MAP_STYLES,
  }));
  return import('./map-style');
}

describe('map-style labels', () => {
  afterEach(() => {
    jest.dontMock('./env');
  });

  it('labels fallback satellite/topo styles honestly (not "Satellite"/"Topo")', async () => {
    const { MAP_LAYER_OPTIONS } = await loadWithMapStyles({ ...DEFAULT_MAP_STYLES });

    expect(MAP_LAYER_OPTIONS).toEqual([
      { mode: 'classic', label: 'Plan' },
      { mode: 'satellite', label: 'Plan détaillé' },
      { mode: 'topo', label: 'Plan clair' },
    ]);
  });

  it('keeps Satellite/Topo labels when a custom style is configured', async () => {
    const { MAP_LAYER_OPTIONS } = await loadWithMapStyles({
      classic: DEFAULT_MAP_STYLES.classic,
      satellite: 'https://tiles.example.com/custom-satellite/style.json',
      topo: 'https://tiles.example.com/custom-topo/style.json',
    });

    expect(MAP_LAYER_OPTIONS).toEqual([
      { mode: 'classic', label: 'Plan' },
      { mode: 'satellite', label: 'Satellite' },
      { mode: 'topo', label: 'Topo' },
    ]);
  });

  it('getAppMapStyle resolves the configured URL for each mode', async () => {
    const custom = {
      classic: DEFAULT_MAP_STYLES.classic,
      satellite: 'https://tiles.example.com/custom-satellite/style.json',
      topo: 'https://tiles.example.com/custom-topo/style.json',
    };
    const { getAppMapStyle } = await loadWithMapStyles(custom);

    expect(getAppMapStyle('satellite')).toBe(custom.satellite);
    expect(getAppMapStyle('topo')).toBe(custom.topo);
    expect(getAppMapStyle('classic')).toBe(custom.classic);
  });
});
