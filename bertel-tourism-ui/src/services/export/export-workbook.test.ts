import { buildWorkbookModel, projectRow } from './export-workbook';
import { getExportColumn } from './export-columns';
import { buildFixtureDetail, EMPTY_CTX } from './export-fixture.test-utils';

const cols = (ids: string[]) => ids.map((id) => getExportColumn(id)!);

describe('buildWorkbookModel (§208/R1) — le test RELIT les cellules (garde non vacante)', () => {
  const detail = buildFixtureDetail();
  const columns = cols(['id', 'name', 'postcode', 'latitude', 'amenities']);
  const rowsById = new Map([['HOTRUN0000000TST', projectRow(detail, columns, EMPTY_CTX)]]);
  const model = buildWorkbookModel({
    rowsById,
    orderedIds: ['HOTRUN0000000TST', 'ID-NON-LISIBLE'],
    columns,
    requestedCount: 2,
    actorLogIds: [],
    actorAuthorizedCount: null,
    actorDeniedCount: null,
  });

  it('feuille Fiches : en-têtes FR en gras, une ligne par fiche lisible, ordre de sélection', () => {
    const [fiches] = model.sheets;
    expect(fiches[0].map((c) => c.value)).toEqual(['Identifiant', 'Nom', 'Code postal', 'Latitude', 'Équipements']);
    expect(fiches[0].every((c) => c.fontWeight === 'bold')).toBe(true);
    expect(fiches).toHaveLength(2); // 1 en-tête + 1 fiche (la non-lisible est absente, pas une ligne vide)
    expect(fiches[1].map((c) => c.value)).toEqual(['HOTRUN0000000TST', 'Hôtel Témoin', '97418', -21.2783, 'Wi-Fi | Piscine']);
  });
  it('R1 — typage par colonne : postcode String (zéro initial), latitude Number', () => {
    const [fiches] = model.sheets;
    expect(fiches[1][2].type).toBe(String);   // postcode
    expect(fiches[1][3].type).toBe(Number);   // latitude
    expect(typeof fiches[1][3].value).toBe('number');
  });
  it('une latitude absente rend une cellule TEXTE vide, pas un zéro', () => {
    const noLoc = buildFixtureDetail({ location: {} });
    const row = projectRow(noLoc, columns, EMPTY_CTX);
    const m = buildWorkbookModel({ rowsById: new Map([['X', row]]), orderedIds: ['X'], columns, requestedCount: 1, actorLogIds: [], actorAuthorizedCount: null, actorDeniedCount: null });
    expect(m.sheets[0][1][3].type).toBe(String);
    expect(m.sheets[0][1][3].value).toBe('');
  });
  it('Lisez-moi : périmètre honnête (1 fiche sur 2) + dictionnaire des colonnes retenues', () => {
    const flat = model.sheets[1].map((r) => r.map((c) => String(c.value)).join(' ')).join('\n');
    expect(flat).toContain('1 fiche exportée sur 2 sélectionnées');
    expect(flat).toContain('Identifiant');
    expect(flat).not.toContain('journal'); // pas de colonnes acteur ⇒ pas de mention de traçabilité
  });
  it('R1 — traçabilité multi-lots : TOUS les logId + comptes autorisées/refusées', () => {
    const actorColumns = cols(['id', 'actor_mobile']);
    const withActor = buildWorkbookModel({
      rowsById: new Map([['HOTRUN0000000TST', projectRow(detail, actorColumns, EMPTY_CTX)]]),
      orderedIds: ['HOTRUN0000000TST'],
      columns: actorColumns, requestedCount: 1,
      actorLogIds: ['journal-lot-1', 'journal-lot-2'],
      actorAuthorizedCount: 700, actorDeniedCount: 140,
    });
    const flat = withActor.sheets[1].map((r) => r.map((c) => String(c.value)).join(' ')).join('\n');
    expect(flat).toContain('journal-lot-1');
    expect(flat).toContain('journal-lot-2');
    expect(flat).toContain('700');    // autorisées
    expect(flat).toContain('140');    // refusées
  });
  it('largeur de colonne bornée [10, 60] selon le contenu', () => {
    for (const col of model.columns[0]) {
      expect(col.width).toBeGreaterThanOrEqual(10);
      expect(col.width).toBeLessThanOrEqual(60);
    }
  });
});
