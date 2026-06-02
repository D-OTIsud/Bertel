import { resolveWebPlatform } from './web-platform';

describe('resolveWebPlatform', () => {
  it('resolves a known platform and strips "www." from the hostname', () => {
    expect(resolveWebPlatform('https://www.booking.com/hotel/re/x?aid=1')).toEqual({
      hostname: 'booking.com',
      displayName: 'Booking.com',
      faviconUrl: 'https://icons.duckduckgo.com/ip3/booking.com.ico',
    });
  });

  it('matches a domain key on a sub-domain', () => {
    const platform = resolveWebPlatform('https://secure.booking.com/foo');
    expect(platform?.displayName).toBe('Booking.com');
    expect(platform?.hostname).toBe('secure.booking.com');
    expect(platform?.faviconUrl).toBe('https://icons.duckduckgo.com/ip3/secure.booking.com.ico');
  });

  it('accepts a scheme-less value', () => {
    const platform = resolveWebPlatform('www.booking.com/hotel/re/x');
    expect(platform?.displayName).toBe('Booking.com');
    expect(platform?.hostname).toBe('booking.com');
  });

  it('matches a brand key across multiple TLDs', () => {
    expect(resolveWebPlatform('airbnb.fr/rooms/123')?.displayName).toBe('Airbnb');
    expect(resolveWebPlatform('https://airbnb.co.uk/rooms/123')?.displayName).toBe('Airbnb');
  });

  it('does NOT match a brand key as a substring (label-bounded only)', () => {
    const platform = resolveWebPlatform('https://notairbnb.fr');
    expect(platform?.displayName).toBe('notairbnb.fr');
  });

  it('falls back to the hostname for an unknown domain', () => {
    const platform = resolveWebPlatform('https://maplateforme.re/reserver');
    expect(platform?.displayName).toBe('maplateforme.re');
    expect(platform?.faviconUrl).toBe('https://icons.duckduckgo.com/ip3/maplateforme.re.ico');
  });

  it.each([
    ['an email', 'contact@booking.com'],
    ['a phone number', '+262 692 00 00 00'],
    ['an empty string', ''],
    ['a bare handle', 'skypeuser'],
    ['a host without a dot', 'localhost:3000'],
  ])('returns null for %s', (_label, value) => {
    expect(resolveWebPlatform(value)).toBeNull();
  });
});
