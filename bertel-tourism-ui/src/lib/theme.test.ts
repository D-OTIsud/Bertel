import { applyThemeToDocument, coerceThemeSettings, defaultThemeSettings, sanitizeHexColor } from './theme';

describe('theme helpers', () => {
  it('sanitizes invalid hex colors with fallback', () => {
    expect(sanitizeHexColor('  #00aa11 ', '#112233')).toBe('#00AA11');
    expect(sanitizeHexColor('teal', '#112233')).toBe('#112233');
  });

  it('coerces partial persisted theme payloads safely', () => {
    expect(
      coerceThemeSettings({
        brandName: '  Mon Office  ',
        logoUrl: 'https://example.com/logo.svg',
        primaryColor: '#123456',
        accentColor: 'oops',
      }),
    ).toEqual({
      brandName: 'Mon Office',
      logoUrl: 'https://example.com/logo.svg',
      primaryColor: '#123456',
      accentColor: defaultThemeSettings.accentColor,
      textColor: defaultThemeSettings.textColor,
      backgroundColor: defaultThemeSettings.backgroundColor,
      surfaceColor: defaultThemeSettings.surfaceColor,
      // Attribution institutionnelle absente du payload ⇒ null (§171, white-label-safe).
      operatorName: null,
      territory: null,
      islandTagline: null,
    });
  });

  it('coerces institutional operator attribution (trim, null when blank)', () => {
    const theme = coerceThemeSettings({
      brandName: 'Bertel',
      operatorName: '  Office de Tourisme Intercommunal du Sud  ',
      territory: 'Sud de La Réunion',
      islandTagline: '   ',
    });

    expect(theme.operatorName).toBe('Office de Tourisme Intercommunal du Sud');
    expect(theme.territory).toBe('Sud de La Réunion');
    expect(theme.islandTagline).toBeNull();
  });

  it('applies CSS variables to the document root', () => {
    applyThemeToDocument({
      ...defaultThemeSettings,
      primaryColor: '#2255AA',
      accentColor: '#EE7744',
      textColor: '#111111',
      backgroundColor: '#FAF7F0',
      surfaceColor: '#FFFFFF',
    });

    const rootStyle = document.documentElement.style;
    expect(rootStyle.getPropertyValue('--theme-primary')).toBe('#2255AA');
    expect(rootStyle.getPropertyValue('--theme-accent')).toBe('#EE7744');
    expect(rootStyle.getPropertyValue('--theme-text')).toBe('#111111');
    expect(rootStyle.getPropertyValue('--theme-bg')).toBe('#FAF7F0');
    expect(rootStyle.getPropertyValue('--theme-surface')).toBe('#FFFFFF');
    expect(rootStyle.getPropertyValue('--background')).toBe('#FAF7F0');
  });
});

