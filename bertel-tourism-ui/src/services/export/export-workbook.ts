import { xlsxCell } from '@/lib/safe-output';
import type { ParsedObjectDetail } from '../object-detail-parser';
import {
  EXPORT_GROUP_LABELS, getExportColumn, purposeRequired, requiredFieldsFor,
  type ExportCellValue, type ExportColumnDef, type ExportContext,
} from './export-columns';
import { fetchResourceBatches } from './export-fetch';
import { ACTOR_EXPORT_BATCH, exportActorContacts } from './export-actor-contacts';

/** R1 — cellule texte OU numérique. Une valeur null devient une cellule texte vide. */
export interface CellModel { value: string | number; type: StringConstructor | NumberConstructor; fontWeight?: 'bold' }
export interface WorkbookModel {
  sheets: [CellModel[][], CellModel[][]];
  sheetNames: ['Fiches', 'Lisez-moi'];
  columns: [Array<{ width: number }>, Array<{ width: number }>];
}

const header = (value: string): CellModel => ({ value: xlsxCell(value), type: String, fontWeight: 'bold' });
const text = (value: string): CellModel => ({ value: xlsxCell(value), type: String });

function toCell(value: ExportCellValue, col: ExportColumnDef): CellModel {
  if (col.cellType === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    return { value, type: Number };
  }
  return text(value == null ? '' : String(value));
}

/** R1 — aplatissement immédiat : une fiche → une ligne de valeurs finales. Appelé lot par lot ; le ParsedObjectDetail part au GC ensuite. */
export function projectRow(detail: ParsedObjectDetail, columns: ExportColumnDef[], ctx: ExportContext): ExportCellValue[] {
  return columns.map((c) => c.value(detail, ctx));
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function buildWorkbookModel(input: {
  rowsById: Map<string, ExportCellValue[]>;
  orderedIds: string[];
  columns: ExportColumnDef[];
  requestedCount: number;
  actorLogIds: string[];
  actorAuthorizedCount: number | null;
  actorDeniedCount: number | null;
}): WorkbookModel {
  const { columns } = input;

  // Une ligne par fiche LISIBLE, dans l'ordre de la sélection. Un id non lisible
  // est ABSENT (pas une ligne vide) — le décompte honnête vit dans Lisez-moi.
  const fiches: CellModel[][] = [columns.map((c) => header(c.label))];
  for (const id of input.orderedIds) {
    const row = input.rowsById.get(id);
    if (!row) continue;
    // Piloté par les COLONNES (pas par la ligne) : une ligne trop courte/longue
    // ne peut jamais désaligner le typage des cellules.
    fiches.push(columns.map((col, i) => toCell(row[i] ?? null, col)));
  }

  const widths = columns.map((_, colIndex) => {
    const max = fiches.reduce((acc, row) => Math.max(acc, String(row[colIndex]?.value ?? '').length), 0);
    return { width: Math.min(60, Math.max(10, max + 2)) };
  });

  const exported = fiches.length - 1;
  const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`;
  const lisezMoi: CellModel[][] = [
    [header('Export Bertel — sélection Exploreur')],
    [text('Généré le'), text(DATE_FMT.format(new Date()))],
    [text('Périmètre'), text(`${plural(exported, 'fiche exportée')} sur ${plural(input.requestedCount, 'sélectionnée')}`)],
    [text('')],
    [header('Colonne'), header('Contenu')],
    ...columns.map((c) => [text(c.label), text(`${EXPORT_GROUP_LABELS[c.group]} · ${c.requiresPurpose ? 'accès tracé (journal)' : 'standard'}`)]),
  ];
  if (input.actorLogIds.length > 0) {
    lisezMoi.push(
      [text('')],
      [text('Traçabilité'), text(
        `Ce fichier contient des coordonnées de personnes — export inscrit au journal, ${plural(input.actorLogIds.length, 'lot')} : ${input.actorLogIds.join(', ')}. Ne pas rediffuser hors de votre organisation.`,
      )],
      [text('Coordonnées — fiches autorisées'), text(input.actorAuthorizedCount == null ? '' : String(input.actorAuthorizedCount))],
      [text('Coordonnées — fiches refusées'), text(input.actorDeniedCount == null ? '' : String(input.actorDeniedCount))],
    );
  }

  return {
    sheets: [fiches, lisezMoi],
    sheetNames: ['Fiches', 'Lisez-moi'],
    columns: [widths, [{ width: 32 }, { width: 90 }]],
  };
}

/**
 * Orchestrateur complet (R1) :
 *  1. lots ACTEUR d'abord si une colonne à finalité est cochée (légers, set-based,
 *     journalisés — export_run_id partagé entre les lots) ;
 *  2. lots ressources en streaming (concurrence 2), chaque lot IMMÉDIATEMENT
 *     projeté en valeurs finales puis JSON libéré — jamais 10,5 Mo accumulés ;
 *  3. UN SEUL classeur, construit seulement si TOUS les lots ont réussi. Un lot
 *     en échec ⇒ aucun fichier ; les journaux acteur déjà écrits RESTENT (la
 *     donnée a réellement atteint le navigateur — le journal dit la vérité).
 * Écriture via write-excel-file en IMPORT DYNAMIQUE (précédent pdf-rasterize.ts) ;
 * CSP prod sans unsafe-eval : lib auditée, ne pas la remplacer sans refaire l'audit.
 *
 * ÉCART §208/E1 (v4.1.1, verrouillée par l'audit CSP/CVE — voir CLAUDE.md / task-1) :
 * le plan décrivait l'API 3.x (`writeXlsxFile([f, l], { sheets, columns, stickyRowsCount })`,
 * sortie par `filePath`/`fileName`). En 4.1.1 les options sont PAR FEUILLE (un tableau
 * d'objets `{ data, sheet, columns, stickyRowsCount }`), la sortie navigateur passe par
 * `.toFile(nom)` (déclenche « Enregistrer sous »), et le point d'entrée navigateur est le
 * sous-chemin `write-excel-file/browser` (le `exports` du package ne déclare pas la racine).
 */
export async function runSelectionXlsxExport(input: {
  ids: string[];
  columnIds: string[];
  langPrefs: string[];
  purpose: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ exported: number; requested: number }> {
  const columns = input.columnIds
    .map((id) => getExportColumn(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const orderedIds = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];

  // (1) Coordonnées d'acteur — AVANT les ressources : le ctx doit être complet
  // au moment de la projection immédiate des lots.
  let ctx: ExportContext = { actorContacts: null };
  let actorLogIds: string[] = [];
  let actorAuthorizedCount: number | null = null;
  let actorDeniedCount: number | null = null;
  if (purposeRequired(input.columnIds)) {
    const result = await exportActorContacts(orderedIds, input.purpose, {
      batchSize: ACTOR_EXPORT_BATCH,
      signal: input.signal,
    });
    ctx = { actorContacts: result.rows };
    actorLogIds = result.logIds;
    actorAuthorizedCount = result.authorizedObjectIds.length;
    actorDeniedCount = result.deniedObjectIds.length;
  }

  // (2) Ressources en streaming + projection immédiate (fusion par object_id).
  const rowsById = new Map<string, ExportCellValue[]>();
  await fetchResourceBatches(orderedIds, input.langPrefs, {
    fields: requiredFieldsFor(input.columnIds),
    signal: input.signal,
    onProgress: input.onProgress,
    onBatch: (entries) => {
      for (const [id, detail] of entries) {
        rowsById.set(id, projectRow(detail, columns, ctx));
      }
      // Les ParsedObjectDetail de ce lot ne sont référencés nulle part ailleurs :
      // ils partent au GC ici — c'est l'aplatissement immédiat R1.
    },
  });

  // (3) Un seul classeur, après la réussite de TOUS les lots.
  // Finding 1 (revue Tâche 8) : `orderedIds.length` (dédoublonné, ids vides écartés) est LE seul
  // décompte demandé — le même nombre nourrit le modèle (phrase Lisez-moi) ET le retour `requested`
  // (toast appelant). Les deux DOIVENT s'accorder : un id dupliqué ou blanc dans la sélection ne doit
  // jamais faire dire deux chiffres différents pour la même notion de « sélectionné ».
  const model = buildWorkbookModel({
    rowsById,
    orderedIds,
    columns,
    requestedCount: orderedIds.length,
    actorLogIds,
    actorAuthorizedCount,
    actorDeniedCount,
  });

  // §208/E1 — write-excel-file 4.1.1 : point d'entrée navigateur = sous-chemin
  // `/browser` (obligatoire, cf. `exports` du package) ; options PAR FEUILLE ;
  // sortie par `.toFile(nom)` (Web Worker interne — jamais exécuté en test, mocké).
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const today = new Date().toISOString().slice(0, 10);
  await writeXlsxFile([
    { data: model.sheets[0], sheet: model.sheetNames[0], columns: model.columns[0], stickyRowsCount: 1 },
    { data: model.sheets[1], sheet: model.sheetNames[1], columns: model.columns[1], stickyRowsCount: 1 },
  ]).toFile(`export_bertel_${today}.xlsx`);

  return { exported: model.sheets[0].length - 1, requested: orderedIds.length };
}
