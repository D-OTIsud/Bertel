import { geocodeAddress } from './geocode-address';

function banResponse(features: unknown[]): Response {
  return { ok: true, json: async () => ({ features }) } as unknown as Response;
}

describe('geocodeAddress', () => {
  it('returns 6-decimal coordinate strings and the matched label', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(banResponse([
      {
        geometry: { coordinates: [55.46703, -21.27107] },
        properties: { label: '38 Chemin du Bel Air 97414 Entre-Deux' },
      },
    ]));

    const hit = await geocodeAddress(
      { address1: '38 Chemin du Bel Air', postcode: '97414', city: "L'Entre-Deux" },
      fetchImpl as unknown as typeof fetch,
    );

    expect(hit).toEqual({
      latitude: '-21.271070',
      longitude: '55.467030',
      label: '38 Chemin du Bel Air 97414 Entre-Deux',
    });
  });

  it('queries the BAN API with the full address and the postcode filter', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(banResponse([]));

    await geocodeAddress(
      { address1: '1 rue de la Gare', postcode: '97410', city: 'Saint-Pierre' },
      fetchImpl as unknown as typeof fetch,
    );

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('api-adresse.data.gouv.fr/search/');
    // URLSearchParams encodes spaces as '+' in the query string.
    expect(url).toContain('q=1+rue+de+la+Gare+97410+Saint-Pierre');
    expect(url).toContain('postcode=97410');
    expect(url).toContain('limit=1');
  });

  it('returns null when the BAN finds nothing', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(banResponse([]));
    const hit = await geocodeAddress(
      { address1: 'Nulle part', postcode: '', city: '' },
      fetchImpl as unknown as typeof fetch,
    );
    expect(hit).toBeNull();
  });

  it('throws when the BAN is unavailable (non-ok response)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response);
    await expect(geocodeAddress(
      { address1: '1 rue de la Gare', postcode: '', city: '' },
      fetchImpl as unknown as typeof fetch,
    )).rejects.toThrow();
  });
});
