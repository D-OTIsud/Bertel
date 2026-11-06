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
  it('makes one paid attempt when repair is disabled for a durable operation', async () => {
    const callProvider = jest.fn(async () => ({ text: 'not json' }));
    const res = await orchestrateExtraction(baseInput, deps({ callProvider, repairInvalidJson: false }));
    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: false, code: 'unparseable' });
  });
  it('preserves a priced formula as a warning without inventing a dish or dish price', async () => {
    const callProvider=jest.fn(async()=>({text:JSON.stringify({title:'Carte',dishes:[{name:'Cari',price:''}],unsupported_offers:[{label:'Entrée + plat',price:'18 €',reason:'formula_price_not_modelled'}]})}));
    const result=await orchestrateExtraction({...baseInput,reportUnsupportedOffers:true},deps({callProvider,repairInvalidJson:false}));
    expect(callProvider).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.anything(),expect.objectContaining({system:expect.stringContaining('Ne crée pas de faux plat')}),expect.anything());
    expect(result.ok).toBe(true);
    if(result.ok){expect(result.menu.items).toHaveLength(1);expect(result.menu.items[0].price).toBe('');expect(result.warnings?.[0].offers).toEqual([{label:'Entrée + plat',price:'18 €',reason:'formula_price_not_modelled'}]);}
  });
  it('keeps valid dishes when E formula metadata is null, overlong or over the warning bound',async()=>{
    const offers=Array.from({length:61},(_,i)=>({label:i?'Formule':'x'.repeat(300),price:null}));
    const callProvider=jest.fn(async()=>({text:JSON.stringify({dishes:[{name:'Cari',price:'12 €'}],unsupported_offers:offers})}));
    const res=await orchestrateExtraction({...baseInput,reportUnsupportedOffers:true},deps({callProvider,repairInvalidJson:false}));
    expect(res.ok).toBe(true);expect(callProvider).toHaveBeenCalledTimes(1);
    if(res.ok){expect(res.menu.items[0].price).toBe('12 €');expect(res.warnings?.[0]).toMatchObject({omittedOffers:11,adjustedOffers:1});expect(res.warnings?.[0].offers).toHaveLength(50);expect(res.warnings?.[0].offers[0].label).toHaveLength(240);expect(res.warnings?.[0].offers[0].price).toBe('');}
  });
  it('does not relax invalid dishes in E and leaves default office parsing unchanged',async()=>{
    const office=await orchestrateExtraction(baseInput,deps({callProvider:async()=>({text:'{"dishes":[{"name":"Cari"}],"unsupported_offers":[{"label":null,"price":null}]}'})}));
    expect(office.ok).toBe(true);if(office.ok)expect(office.warnings).toBeUndefined();
    const invalid=await orchestrateExtraction({...baseInput,reportUnsupportedOffers:true},deps({repairInvalidJson:false,callProvider:async()=>({text:'{"dishes":[{"name":null}],"unsupported_offers":null}'})}));
    expect(invalid).toMatchObject({ok:false,code:'unparseable'});
  });
});
