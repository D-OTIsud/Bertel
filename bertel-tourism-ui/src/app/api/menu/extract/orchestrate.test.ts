import { orchestrateExtraction, type OrchestrateDeps } from './orchestrate';
import { ProviderError } from './provider';
import type { AllowedOption } from './extraction';

const SECTIONS: AllowedOption[] = [{ id: 's2', code: 'main', label: 'Plats' }];
const DIETARY: AllowedOption[] = [{ id: 'd1', code: 'vegetarian', label: 'Végétarien' }];
const IMAGES = [{ mime: 'image/jpeg', base64: 'AAAA' }];

const baseInput = { menuTitle: 'Carte', allowedSections: SECTIONS, allowedDietary: DIETARY, images: IMAGES };
const provider = { config: { apiKind: 'openai_compatible' as const, baseUrl: 'u', model: 'm', maxOutputTokens: 1024 }, apiKey: 'sk' };

function deps(over: Partial<OrchestrateDeps>): OrchestrateDeps {
  return {
    getActiveProvider: async () => provider,
    callProvider: (async () => ({ text: '{"title":"X","dishes":[{"name":"Cari","section":"Plats"}]}' })) as OrchestrateDeps['callProvider'],
    ...over,
  };
}

describe('orchestrateExtraction', () => {
  it('returns no_images when there are no images', async () => {
    const res = await orchestrateExtraction({ ...baseInput, images: [] }, deps({}));
    expect(res).toMatchObject({ ok: false, code: 'no_images' });
  });

  it('returns not_configured when no provider is active', async () => {
    const res = await orchestrateExtraction(baseInput, deps({ getActiveProvider: async () => null }));
    expect(res).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('maps a good extraction into a menu', async () => {
    const res = await orchestrateExtraction(baseInput, deps({}));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.menu.items).toHaveLength(1);
      expect(res.menu.items[0].name).toBe('Cari');
      expect(res.menu.items[0].sectionCode).toBe('main');
    }
  });

  it('surfaces provider_error when the provider throws', async () => {
    const res = await orchestrateExtraction(
      baseInput,
      deps({ callProvider: (async () => { throw new ProviderError('boom', 502); }) as OrchestrateDeps['callProvider'] }),
    );
    expect(res).toMatchObject({ ok: false, code: 'provider_error' });
  });

  it('retries once on unparseable output, then succeeds', async () => {
    let n = 0;
    const res = await orchestrateExtraction(
      baseInput,
      deps({
        callProvider: (async () => {
          n += 1;
          return { text: n === 1 ? 'désolé pas de json' : '{"dishes":[{"name":"Boucané"}]}' };
        }) as OrchestrateDeps['callProvider'],
      }),
    );
    expect(n).toBe(2);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.menu.items[0].name).toBe('Boucané');
  });

  it('returns unparseable when both attempts fail to parse', async () => {
    let n = 0;
    const res = await orchestrateExtraction(
      baseInput,
      deps({ callProvider: (async () => { n += 1; return { text: 'nope' }; }) as OrchestrateDeps['callProvider'] }),
    );
    expect(n).toBe(2);
    expect(res).toMatchObject({ ok: false, code: 'unparseable' });
  });
});
