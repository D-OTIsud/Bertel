import {
  serializeObjectJson,
  serializeObjectCsv,
  parseImportedObjectJson,
  stripCatalogOptions,
  restoreCatalogOptions,
  type ObjectExportEnvelope,
} from './object-io-serialize';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

/** Minimal-but-typed draft: only the fields the serializers touch carry values; the
 *  rest are filled by an `as` cast so the test stays focused on IO behaviour. */
function makeDraft(): ObjectWorkspaceModules {
  return {
    generalInfo: {
      name: 'Hôtel du Volcan',
      nameTranslations: { en: 'Volcano Hotel' },
      businessTimezone: 'Indian/Reunion',
      commercialVisibility: 'public',
      regionCode: 'RUN',
      status: 'published',
      publishedAt: '2026-01-02T00:00:00Z',
      isEditing: false,
      secondaryTypes: [],
    },
    location: {
      main: {
        recordId: 'loc-1',
        address1: '12 rue des Cimes',
        address1Suite: '',
        address2: '',
        address3: '',
        postcode: '97400',
        city: 'Saint-Denis',
        codeInsee: '97411',
        lieuDit: '',
        direction: '',
        latitude: '-20.88',
        longitude: '55.45',
        zoneTouristique: '',
      },
      places: [],
      zoneCodes: [],
      zoneOptions: [],
      zonesUnavailableReason: null,
    },
    contacts: {
      kindOptions: [],
      roleOptions: [],
      objectItems: [
        { id: 'c1', kindId: '', kindCode: 'email', kindLabel: 'E-mail', roleId: '', roleCode: '', roleLabel: '', value: 'contact@volcan.re', isPublic: true, isPrimary: true, position: '0' },
        { id: 'c2', kindId: '', kindCode: 'phone', kindLabel: 'Téléphone', roleId: '', roleCode: '', roleLabel: '', value: '+262 262 00 00 00', isPublic: true, isPrimary: false, position: '1' },
      ],
      webItems: [],
      webKindOptions: [],
      relatedActorContactsCount: 0,
      relatedOrganizationContactsCount: 0,
    },
  } as unknown as ObjectWorkspaceModules;
}

const META = { objectId: 'HOTRUN000000000A', type: 'HOT', name: 'Hôtel du Volcan' };

describe('serializeObjectJson', () => {
  it('produces a versioned envelope carrying objectId, type and the modules', () => {
    const env = JSON.parse(serializeObjectJson(makeDraft(), META)) as ObjectExportEnvelope;
    expect(env.format).toBe('bertel-object');
    expect(env.version).toBe(2);
    expect(env.objectId).toBe('HOTRUN000000000A');
    expect(env.type).toBe('HOT');
    expect(typeof env.exportedAt).toBe('string');
    expect(env.modules.generalInfo.name).toBe('Hôtel du Volcan');
    expect(env.modules.location.main.city).toBe('Saint-Denis');
  });

  it('is pretty-printed (multi-line) for human-readable export', () => {
    expect(serializeObjectJson(makeDraft(), META)).toContain('\n');
  });
});

describe('serializeObjectCsv', () => {
  it('emits a header row then one flat data row with the 9 frozen columns', () => {
    const lines = serializeObjectCsv(makeDraft(), META).split('\n');
    expect(lines[0]).toBe('id,name,type,status,address,postcode,city,phone,email');
    expect(lines).toHaveLength(2);
  });

  it('fills identity, localisation and key contacts; phone/email picked by kindCode', () => {
    const row = serializeObjectCsv(makeDraft(), META).split('\n')[1];
    expect(row).toContain('"HOTRUN000000000A"');
    expect(row).toContain('"Hôtel du Volcan"');
    expect(row).toContain('"HOT"');
    expect(row).toContain('"published"');
    expect(row).toContain('"12 rue des Cimes"');
    expect(row).toContain('"97400"');
    expect(row).toContain('"Saint-Denis"');
    expect(row).toContain('"+262 262 00 00 00"');
    expect(row).toContain('"contact@volcan.re"');
  });

  it('escapes embedded quotes and strips newlines (CSV-safe)', () => {
    const draft = makeDraft();
    draft.generalInfo.name = 'Le "Grand"\nHôtel';
    const row = serializeObjectCsv(draft, META).split('\n')[1];
    expect(row).toContain('"Le ""Grand"" Hôtel"');
  });

  it('leaves phone/email empty when no matching contact exists', () => {
    const draft = makeDraft();
    draft.contacts.objectItems = [];
    const row = serializeObjectCsv(draft, META).split('\n')[1];
    expect(row.endsWith('"",""')).toBe(true);
  });
});

describe('parseImportedObjectJson', () => {
  it('round-trips: parse(serialize(draft)) reproduces the modules exactly', () => {
    const draft = makeDraft();
    const result = parseImportedObjectJson(serializeObjectJson(draft, META));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modules.generalInfo).toEqual(draft.generalInfo);
      expect(result.modules.location).toEqual(draft.location);
      expect(result.modules.contacts).toEqual(draft.contacts);
    }
  });

  it('rejects syntactically invalid JSON', () => {
    const result = parseImportedObjectJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/json/i);
  });

  it('rejects a non-object payload', () => {
    const result = parseImportedObjectJson('42');
    expect(result.ok).toBe(false);
  });

  it('rejects an envelope without a modules object', () => {
    const result = parseImportedObjectJson(JSON.stringify({ format: 'bertel-object', version: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/module/i);
  });

  it('drops unknown module keys (never propagates them into the draft)', () => {
    const env = {
      format: 'bertel-object',
      version: 1,
      objectId: 'x',
      type: 'HOT',
      exportedAt: '2026-01-01T00:00:00Z',
      modules: { generalInfo: makeDraft().generalInfo, bogusModule: { hacked: true } },
    };
    const result = parseImportedObjectJson(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('generalInfo' in result.modules).toBe(true);
      expect('bogusModule' in result.modules).toBe(false);
    }
  });

  it('keeps only object-typed module values (rejects a primitive in a known key)', () => {
    const env = {
      format: 'bertel-object',
      version: 1,
      objectId: 'x',
      type: 'HOT',
      exportedAt: '2026-01-01T00:00:00Z',
      modules: { generalInfo: 'not-an-object', location: makeDraft().location },
    };
    const result = parseImportedObjectJson(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('generalInfo' in result.modules).toBe(false);
      expect('location' in result.modules).toBe(true);
    }
  });
});

describe('stripCatalogOptions', () => {
  it('empties *Options arrays but keeps object data', () => {
    const modules = {
      menus: {
        categoryOptions: [{ id: 'a', code: 'drinks', label: 'Boissons' }],
        allergenOptions: [{ id: 'b', code: 'gluten', label: 'Gluten' }],
        items: [{ id: 'm1', name: 'Menu midi' }],
        unavailableReason: 'Module non applicable au type HLO.',
      },
      characteristics: {
        languageOptions: [{ id: 'l', code: 'fr', label: 'Français' }],
        selectedAmenityCodes: ['wifi', 'parking'],
      },
    } as unknown as ObjectWorkspaceModules;

    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.menus.categoryOptions).toEqual([]);
    expect(stripped.menus.allergenOptions).toEqual([]);
    expect(stripped.menus.items).toEqual([{ id: 'm1', name: 'Menu midi' }]);
    expect(stripped.menus.unavailableReason).toBe('Module non applicable au type HLO.');
    expect(stripped.characteristics.languageOptions).toEqual([]);
    expect(stripped.characteristics.selectedAmenityCodes).toEqual(['wifi', 'parking']);
  });

  it('empties taxonomy domains[].nodes but keeps the assignment', () => {
    const modules = {
      taxonomy: {
        domains: [
          {
            domain: 'taxonomy_hlo',
            nodes: [{ id: 'n1', code: 'auberge' }, { id: 'n2', code: 'studio' }],
            assignment: { recordId: 'r1', nodeId: 'n1', code: 'auberge' },
          },
        ],
        unavailableReason: null,
      },
    } as unknown as ObjectWorkspaceModules;

    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.taxonomy.domains[0].nodes).toEqual([]);
    expect(stripped.taxonomy.domains[0].assignment).toEqual({ recordId: 'r1', nodeId: 'n1', code: 'auberge' });
    expect(stripped.taxonomy.domains[0].domain).toBe('taxonomy_hlo');
  });

  it('does not mutate the input', () => {
    const modules = {
      menus: { categoryOptions: [{ id: 'a' }], items: [] },
    } as unknown as ObjectWorkspaceModules;
    stripCatalogOptions(modules);
    expect((modules as unknown as Record<string, any>).menus.categoryOptions).toHaveLength(1);
  });
});

describe('restoreCatalogOptions', () => {
  it('refills an empty *Options from the draft, keeps file data', () => {
    const incoming = { categoryOptions: [], items: [{ id: 'm1' }] };
    const draft = { categoryOptions: [{ id: 'a', code: 'drinks' }], items: [{ id: 'OLD' }] };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.categoryOptions).toEqual([{ id: 'a', code: 'drinks' }]);
    expect(merged.items).toEqual([{ id: 'm1' }]); // file data wins
  });

  it('keeps a non-empty imported *Options (v1 file with catalogs)', () => {
    const incoming = { categoryOptions: [{ id: 'fromFile' }], items: [] };
    const draft = { categoryOptions: [{ id: 'fromDraft' }], items: [] };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.categoryOptions).toEqual([{ id: 'fromFile' }]);
  });

  it('restores taxonomy domains[].nodes per domain, keeps the file assignment', () => {
    const incoming = { domains: [{ domain: 'taxonomy_hlo', nodes: [], assignment: { nodeId: 'NEW' } }] };
    const draft = {
      domains: [{ domain: 'taxonomy_hlo', nodes: [{ id: 'n1' }, { id: 'n2' }], assignment: { nodeId: 'OLD' } }],
    };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.domains[0].nodes).toEqual([{ id: 'n1' }, { id: 'n2' }]);
    expect(merged.domains[0].assignment).toEqual({ nodeId: 'NEW' }); // file wins
  });

  it('round-trips strip→restore back to the populated draft catalogs', () => {
    const draftModule = {
      categoryOptions: [{ id: 'a' }, { id: 'b' }],
      items: [{ id: 'm1' }],
    };
    const stripped = (stripCatalogOptions({ menus: draftModule } as any) as any).menus;
    const restored = restoreCatalogOptions(stripped, draftModule) as Record<string, any>;
    expect(restored.categoryOptions).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(restored.items).toEqual([{ id: 'm1' }]);
  });

  it('passes through a non-object value unchanged', () => {
    expect(restoreCatalogOptions('x' as unknown, {})).toBe('x');
  });
});

describe('non-convention catalogs (Task 7)', () => {
  it('strips characteristics.amenityGroups (pure catalog), keeps selectedAmenityCodes', () => {
    const modules = {
      characteristics: {
        amenityGroups: [{ familyCode: 'climate', options: [{ id: 'a', code: 'heating' }] }],
        selectedAmenityCodes: ['heating'],
        languageOptions: [{ id: 'l', code: 'fr' }],
      },
    } as unknown as ObjectWorkspaceModules;
    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.characteristics.amenityGroups).toEqual([]);
    expect(stripped.characteristics.languageOptions).toEqual([]);
    expect(stripped.characteristics.selectedAmenityCodes).toEqual(['heating']);
  });

  it('restores amenityGroups from the draft (file selection wins)', () => {
    const incoming = { amenityGroups: [], selectedAmenityCodes: ['heating'] };
    const draft = { amenityGroups: [{ familyCode: 'climate', options: [{ id: 'a' }] }], selectedAmenityCodes: ['OLD'] };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.amenityGroups).toEqual([{ familyCode: 'climate', options: [{ id: 'a' }] }]);
    expect(merged.selectedAmenityCodes).toEqual(['heating']);
  });

  it('projects sustainability to actions carrying data, drops empty categories', () => {
    const modules = {
      sustainability: {
        categories: [
          { code: 'CAT_A', actions: [
            { code: 'MA_1', selected: true, note: '', documentId: '' },
            { code: 'MA_2', selected: false, note: '', documentId: '' },
          ] },
          { code: 'CAT_B', actions: [
            { code: 'MA_3', selected: false, note: '', documentId: '' },
          ] },
        ],
      },
    } as unknown as ObjectWorkspaceModules;
    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.sustainability.categories).toHaveLength(1);
    expect(stripped.sustainability.categories[0].code).toBe('CAT_A');
    expect(stripped.sustainability.categories[0].actions.map((a: any) => a.code)).toEqual(['MA_1']);
  });

  it('keeps a sustainability action that has only a note (no selected)', () => {
    const modules = {
      sustainability: { categories: [{ code: 'CAT_A', actions: [{ code: 'MA_1', selected: false, note: 'x', documentId: '' }] }] },
    } as unknown as ObjectWorkspaceModules;
    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.sustainability.categories[0].actions).toHaveLength(1);
  });

  it('re-merges the full sustainability vocabulary from the draft, file selection wins', () => {
    const incoming = { categories: [{ code: 'CAT_A', actions: [{ code: 'MA_1', selected: true, note: 'kept', documentId: '' }] }] };
    const draft = {
      categories: [{ code: 'CAT_A', actions: [
        { code: 'MA_1', selected: false, note: '', documentId: '', label: 'Action 1' },
        { code: 'MA_2', selected: true, note: 'stale', documentId: '', label: 'Action 2' },
      ] }],
    };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    const actions = merged.categories[0].actions;
    expect(actions).toHaveLength(2); // full vocabulary restored
    expect(actions[0]).toMatchObject({ code: 'MA_1', selected: true, note: 'kept', label: 'Action 1' });
    // MA_2 not in the file ⇒ reset to unselected (file wins fully)
    expect(actions[1]).toMatchObject({ code: 'MA_2', selected: false, note: '', label: 'Action 2' });
  });

  it('keeps the file sustainability as-is when the draft has no vocabulary', () => {
    const incoming = { categories: [{ code: 'CAT_A', actions: [{ code: 'MA_1', selected: true }] }] };
    const merged = restoreCatalogOptions(incoming, { categories: null }) as Record<string, any>;
    expect(merged.categories[0].actions[0].code).toBe('MA_1');
  });
});
