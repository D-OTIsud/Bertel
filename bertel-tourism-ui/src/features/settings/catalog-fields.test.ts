import {
  buildCatalogFieldSpec, computeAddBlocked, buildRowKey, rowKeyString, formatRowLabel,
  type CatalogColumn,
} from './catalog-fields';

const col = (over: Partial<CatalogColumn> = {}): CatalogColumn => ({
  name: 'name', type: 'text', isRequired: false, hasDefault: false, enumValues: null, ...over,
});

describe('buildCatalogFieldSpec', () => {
  it('rend un champ texte pour text et varchar', () => {
    expect(buildCatalogFieldSpec([col({ name: 'label', type: 'character varying(50)' })], [], ['id'], 'edit')[0])
      .toMatchObject({ name: 'label', kind: 'text' });
  });

  it('rend un interrupteur, un nombre, une date', () => {
    const spec = buildCatalogFieldSpec([
      col({ name: 'is_public', type: 'boolean' }),
      col({ name: 'days', type: 'integer' }),
      col({ name: 'valid_to', type: 'date' }),
    ], [], ['id'], 'edit');
    expect(spec.map((f) => f.kind)).toEqual(['boolean', 'number', 'date']);
  });

  it('rend une liste deroulante pour un enumere', () => {
    expect(buildCatalogFieldSpec(
      [col({ name: 'kind', type: 'object_type', enumValues: ['HLO', 'RES'] })], [], ['id'], 'edit')[0])
      .toMatchObject({ kind: 'select', options: ['HLO', 'RES'] });
  });

  it('rend une reference pour une colonne portant une cle etrangere', () => {
    expect(buildCatalogFieldSpec(
      [col({ name: 'family_id', type: 'uuid' })],
      [{ column: 'family_id', target: 'ref_code:amenity_family' }], ['id'], 'edit')[0])
      .toMatchObject({ kind: 'reference', target: 'ref_code:amenity_family' });
  });

  it('associe un champ texte a son i18n frere et masque le jsonb', () => {
    const spec = buildCatalogFieldSpec(
      [col({ name: 'name' }), col({ name: 'name_i18n', type: 'jsonb' })], [], ['id'], 'edit');
    expect(spec).toHaveLength(1);
    expect(spec[0].kind).toBe('i18n-text');
  });

  it('masque jsonb libre, tableaux et geometrie', () => {
    expect(buildCatalogFieldSpec([
      col({ name: 'metadata', type: 'jsonb' }),
      col({ name: 'tags', type: 'text[]' }),
      col({ name: 'geom', type: 'geometry' }),
    ], [], ['id'], 'edit')).toHaveLength(0);
  });

  it('masque une cle primaire QUI A une valeur par defaut', () => {
    expect(buildCatalogFieldSpec(
      [col({ name: 'id', type: 'uuid', isRequired: true, hasDefault: true })], [], ['id'], 'create'))
      .toHaveLength(0);
  });

  it('rend une cle primaire SANS defaut a la creation, et la verrouille en edition', () => {
    const columns = [col({ name: 'insee_code', type: 'character varying(5)', isRequired: true })];
    expect(buildCatalogFieldSpec(columns, [], ['insee_code'], 'create')[0])
      .toMatchObject({ name: 'insee_code', locked: false });
    expect(buildCatalogFieldSpec(columns, [], ['insee_code'], 'edit')[0])
      .toMatchObject({ name: 'insee_code', locked: true });
  });

  it('rend une cle composite entierement saisissable a la creation', () => {
    const columns = [
      col({ name: 'metric_id', type: 'uuid', isRequired: true }),
      col({ name: 'object_type', type: 'object_type', isRequired: true, enumValues: ['HLO', 'PRD'] }),
    ];
    const spec = buildCatalogFieldSpec(columns, [{ column: 'metric_id', target: 'ref_capacity_metric' }],
      ['metric_id', 'object_type'], 'create');
    expect(spec.map((f) => f.name)).toEqual(['metric_id', 'object_type']);
  });

  it('verrouille le code en edition, pas a la creation', () => {
    const columns = [col({ name: 'code', isRequired: true })];
    expect(buildCatalogFieldSpec(columns, [], ['id'], 'create')[0].locked).toBe(false);
    expect(buildCatalogFieldSpec(columns, [], ['id'], 'edit')[0].locked).toBe(true);
  });

  it('masque toujours created_at et updated_at', () => {
    expect(buildCatalogFieldSpec([
      col({ name: 'created_at', type: 'timestamp with time zone' }),
      col({ name: 'updated_at', type: 'timestamp with time zone' }),
    ], [], ['id'], 'edit')).toHaveLength(0);
  });
});

describe('computeAddBlocked', () => {
  const spec = (columns: CatalogColumn[], pk: string[]) =>
    buildCatalogFieldSpec(columns, [], pk, 'create');

  it('rend null quand toute colonne obligatoire est rendable', () => {
    const columns = [col({ name: 'code', isRequired: true }), col({ name: 'name', isRequired: true })];
    expect(computeAddBlocked(columns, spec(columns, ['id']), ['id'])).toBeNull();
  });

  it('rend null pour une cle primaire naturelle, desormais saisissable', () => {
    const columns = [col({ name: 'insee_code', type: 'character varying(5)', isRequired: true }),
                     col({ name: 'name', isRequired: true })];
    expect(computeAddBlocked(columns, spec(columns, ['insee_code']), ['insee_code'])).toBeNull();
  });

  it('nomme la colonne obligatoire non rendable qui bloque la creation', () => {
    const columns = [col({ name: 'name', isRequired: true }),
                     col({ name: 'metadata', type: 'jsonb', isRequired: true })];
    expect(computeAddBlocked(columns, spec(columns, ['id']), ['id'])).toBe('metadata');
  });

  it('ignore une colonne obligatoire qui a une valeur par defaut', () => {
    const columns = [col({ name: 'name', isRequired: true }),
                     col({ name: 'metadata', type: 'jsonb', isRequired: true, hasDefault: true })];
    expect(computeAddBlocked(columns, spec(columns, ['id']), ['id'])).toBeNull();
  });
});

describe('identite de ligne', () => {
  it('buildRowKey extrait exactement les colonnes de cle primaire', () => {
    expect(buildRowKey({ metric_id: 'm1', object_type: 'HLO', label: 'X' }, ['metric_id', 'object_type']))
      .toEqual({ metric_id: 'm1', object_type: 'HLO' });
  });

  it('rowKeyString joint les valeurs dans l ordre de la cle, par le separateur d unite', () => {
    expect(rowKeyString({ metric_id: 'm1', object_type: 'HLO' }, ['metric_id', 'object_type']))
      .toBe('m1HLO');
  });

  it('rowKeyString ne depend pas de l ordre des cles de l objet', () => {
    const a = rowKeyString({ object_type: 'HLO', metric_id: 'm1' }, ['metric_id', 'object_type']);
    const b = rowKeyString({ metric_id: 'm1', object_type: 'HLO' }, ['metric_id', 'object_type']);
    expect(a).toBe(b);
  });
});

describe('formatRowLabel', () => {
  it('utilise la colonne de libelle quand elle existe', () => {
    expect(formatRowLabel({ name: 'Extrait KBIS', code: 'kbis' }, 'name', ['id'])).toBe('Extrait KBIS');
  });

  it('compose depuis la cle primaire quand aucune colonne de libelle n existe', () => {
    expect(formatRowLabel({ metric_id: 'm1', object_type: 'HLO' }, null, ['metric_id', 'object_type']))
      .toBe('m1 · HLO');
  });

  it('retombe sur la cle quand la colonne de libelle est vide', () => {
    expect(formatRowLabel({ name: '', insee_code: '97401' }, 'name', ['insee_code'])).toBe('97401');
  });
});
