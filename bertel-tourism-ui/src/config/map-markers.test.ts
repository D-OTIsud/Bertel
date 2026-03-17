import { buildMarkerSvg, coerceMarkerStyles, defaultMarkerStyles, normalizeMarkerIcon, sanitizeCustomMarkerSvg, sanitizeMarkerColor } from './map-markers';

describe('map marker config', () => {
  it('normalizes icons and colors defensively', () => {
    expect(normalizeMarkerIcon('bed', 'spark')).toBe('bed');
    expect(normalizeMarkerIcon('unknown', 'spark')).toBe('spark');
    expect(sanitizeMarkerColor('#123ABC', '#000000')).toBe('#123ABC');
    expect(sanitizeMarkerColor('orange', '#000000')).toBe('#000000');
  });

  it('sanitizes custom svg icons before use', () => {
    const sanitized = sanitizeCustomMarkerSvg('<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4Z"/></svg>');
    const rejected = sanitizeCustomMarkerSvg('<svg><script>alert(1)</script></svg>');

    expect(sanitized).toContain('viewBox="0 0 24 24"');
    expect(sanitized).toContain('<path');
    expect(rejected).toBeNull();
  });

  it('builds an svg marker using the configured icon or custom svg', () => {
    const presetSvg = buildMarkerSvg(defaultMarkerStyles.HOT);
    const customSvg = buildMarkerSvg({
      ...defaultMarkerStyles.HOT,
      mode: 'custom',
      customSvg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
    });

    expect(presetSvg).toContain(defaultMarkerStyles.HOT.color);
    expect(presetSvg).toContain('<title>Lit</title>');
    expect(customSvg).toContain('SVG personnalise');
    expect(customSvg).toContain('<circle cx="12" cy="12" r="8"/>');
  });

  it('coerces persisted marker styles while keeping defaults intact', () => {
    const styles = coerceMarkerStyles({
      HOT: {
        color: '#112233',
        icon: 'building',
        mode: 'custom',
        customSvg: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14"/></svg>',
      },
      RES: { color: 'invalid', icon: 'invalid', mode: 'custom', customSvg: '<svg><script /></svg>' },
    });

    expect(styles.HOT).toMatchObject({ color: '#112233', icon: 'building', mode: 'custom' });
    expect(styles.HOT.customSvg).toContain('<rect');
    expect(styles.RES).toEqual(defaultMarkerStyles.RES);
    expect(styles.ITI).toEqual(defaultMarkerStyles.ITI);
  });
});
