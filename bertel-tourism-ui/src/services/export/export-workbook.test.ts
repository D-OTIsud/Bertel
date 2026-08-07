import { buildWorkbookModel, projectRow, runSelectionXlsxExport } from './export-workbook';
import { getExportColumn } from './export-columns';
import { buildFixtureDetail, EMPTY_CTX } from './export-fixture.test-utils';
import { fetchResourceBatches } from './export-fetch';
import writeXlsxFileDefault from 'write-excel-file/browser';
import type { ParsedObjectDetail } from '../object-detail-parser';

// Revue Tâche 8, finding 2 — `write-excel-file/browser` spawne un Web Worker en navigateur réel :
// jamais l'exécuter en test. `./export-fetch` est mocké pour piloter la réussite/l'échec des lots
// SANS toucher au vrai RPC réseau (déjà couvert par export-fetch.test.ts).
jest.mock('./export-fetch', () => ({ fetchResourceBatches: jest.fn() }));
jest.mock('write-excel-file/browser', () => ({ __esModule: true, default: jest.fn() }));

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
    // Finding 3 (revue Tâche 8) : le dictionnaire résout le GROUPE via EXPORT_GROUP_LABELS —
    // jamais le slug brut (« identite ») qui fuitait avant correction.
    expect(flat).toContain('Identité');
    expect(flat).not.toContain('identite ·');
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

/**
 * §208/Tâche 8, revue findings 1+2 — l'ORCHESTRATEUR n'avait aucune couverture : ses deux garanties
 * porteuses (atomicité — un lot en échec ne produit AUCUN fichier ; décompte honnête — `requested`
 * dans le retour = `requested` dans la feuille Lisez-moi) n'étaient vérifiées qu'en LISANT le code.
 * `write-excel-file/browser` est mocké : son vrai chemin navigateur ouvre un Web Worker interne —
 * jamais l'exécuter en Jest (accroche ou échec bruyant).
 */
describe('runSelectionXlsxExport (§208/Tâche 8) — orchestrateur complet', () => {
  const mockFetch = fetchResourceBatches as jest.Mock;
  const mockWriteXlsxFile = writeXlsxFileDefault as jest.Mock;
  let mockToFile: jest.Mock;

  beforeEach(() => {
    mockFetch.mockReset();
    mockWriteXlsxFile.mockReset();
    mockToFile = jest.fn(async () => undefined);
    mockWriteXlsxFile.mockReturnValue({ toFile: mockToFile });
  });

  /** Fait tenir fetchResourceBatches en livrant UN lot avec la fiche témoin, comme le vrai RPC. */
  function mockFetchSucceeds(entries: Array<[string, ParsedObjectDetail]>) {
    mockFetch.mockImplementation(async (
      _ids: string[],
      _langPrefs: string[],
      opts: { onBatch: (e: Array<[string, ParsedObjectDetail]>) => void },
    ) => {
      opts.onBatch(entries);
    });
  }

  it('chemin nominal : le writer est appelé UNE fois, forme par-feuille { data, sheet, columns, stickyRowsCount }, puis .toFile', async () => {
    mockFetchSucceeds([['HOTRUN0000000TST', buildFixtureDetail()]]);
    const result = await runSelectionXlsxExport({
      ids: ['HOTRUN0000000TST'], columnIds: ['id', 'name'], langPrefs: ['fr'], purpose: '',
    });
    expect(result).toEqual({ exported: 1, requested: 1 });

    expect(mockWriteXlsxFile).toHaveBeenCalledTimes(1);
    const [sheets] = mockWriteXlsxFile.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(sheets).toHaveLength(2);
    for (const s of sheets) {
      expect(s).toEqual(expect.objectContaining({
        data: expect.any(Array),
        sheet: expect.any(String),
        columns: expect.any(Array),
        stickyRowsCount: 1,
      }));
    }
    expect(mockToFile).toHaveBeenCalledTimes(1);
    expect(mockToFile).toHaveBeenCalledWith(expect.stringMatching(/^export_bertel_\d{4}-\d{2}-\d{2}\.xlsx$/));
  });

  it('R1-3 atomicité : un lot en échec REJETTE avant toute écriture — le writer mocké n’est JAMAIS appelé (tombe si le fetch est avalé dans un try/catch)', async () => {
    const boom = new Error('boom réseau');
    mockFetch.mockRejectedValue(boom);

    await expect(runSelectionXlsxExport({
      ids: ['HOTRUN0000000TST'], columnIds: ['id', 'name'], langPrefs: ['fr'], purpose: '',
    })).rejects.toBe(boom);

    expect(mockWriteXlsxFile).not.toHaveBeenCalled();
    expect(mockToFile).not.toHaveBeenCalled();
  });

  it('Finding 1 — requested = ids DISTINCTS non vides (dédoublonnés) : MÊME chiffre dans le retour ET dans la feuille Lisez-moi', async () => {
    mockFetchSucceeds([['HOTRUN0000000TST', buildFixtureDetail()]]);
    const result = await runSelectionXlsxExport({
      ids: ['HOTRUN0000000TST', 'HOTRUN0000000TST', '  ', ''], // doublon + blanc + vide
      columnIds: ['id', 'name'], langPrefs: ['fr'], purpose: '',
    });
    expect(result.requested).toBe(1); // 1 seul id distinct non vide, pas 4

    const [sheets] = mockWriteXlsxFile.mock.calls[0] as [Array<{ data: unknown }>];
    const lisezMoi = sheets[1].data as Array<Array<{ value: string | number }>>;
    const flat = lisezMoi.map((r) => r.map((c) => String(c.value)).join(' ')).join('\n');
    expect(flat).toContain('1 fiche exportée sur 1 sélectionnée'); // même chiffre que `result.requested`
  });
});
