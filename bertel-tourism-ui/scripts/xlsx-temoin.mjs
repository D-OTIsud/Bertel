// Fichier témoin §208 — valide EMPIRIQUEMENT, avant d'écrire le reste :
// 1. qu'un code postal '01234' écrit en type String garde son zéro dans Excel ;
// 2. qu'une valeur '=1+1' n'est PAS évaluée comme formule (cellule typée texte) ;
// 3. l'API multi-feuilles + stickyRowsCount + columns de write-excel-file.
// Usage : node scripts/xlsx-temoin.mjs  → écrit temoin.xlsx à la racine du repo front.
import writeXlsxFile from 'write-excel-file/node';

const header = (label) => ({ value: label, type: String, fontWeight: 'bold' });
const cell = (value) => ({ value, type: String });

const fiches = [
  [header('Code postal'), header('Identifiant'), header('Latitude'), header('Piège formule')],
  [cell('97418'), cell('HOTRUN00000000ZW'), cell('-21.2783'), cell('=1+1')],
  [cell('01234'), cell('TESTMETROPOLE001'), cell('45.1'), cell('+33 692 12 34 56')],
];
const lisezMoi = [
  [header('Clé'), header('Valeur')],
  [cell('Généré le'), cell(new Date().toISOString())],
  [cell('But'), cell('Témoin §208 — zéros initiaux, formules neutralisées, multi-feuilles')],
];

// API 4.x : multi-feuilles = un tableau d'objets {data, sheet, columns, stickyRowsCount} + .toFile() (le plan décrivait l'API 3.x).
await writeXlsxFile([
  {
    data: fiches,
    sheet: 'Fiches',
    columns: [{ width: 14 }, { width: 22 }, { width: 12 }, { width: 20 }],
    stickyRowsCount: 1,
  },
  {
    data: lisezMoi,
    sheet: 'Lisez-moi',
    columns: [{ width: 14 }, { width: 60 }],
    stickyRowsCount: 1,
  },
]).toFile('temoin.xlsx');
console.log('OK — ouvrir temoin.xlsx dans Excel et vérifier : 01234 garde son zéro, =1+1 reste littéral, 2 feuilles, 1re ligne figée.');
