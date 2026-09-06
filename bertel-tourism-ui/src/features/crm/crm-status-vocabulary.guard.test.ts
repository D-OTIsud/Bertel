import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { interactionStatusLabel, isOpenInteractionStatus } from './crm-status';

/* Volet 3 de la garde du cycle de vie CRM (manifeste 17g).
 *
 * POURQUOI CETTE GARDE. La base ne connaît plus « planned » : le type crm_status a été
 * RECRÉÉ aux six valeurs du cycle de vie. Une valeur restée dans le front n'échoue pourtant
 * pas — `api.save_crm_interaction` la TRADUIT (marqueur TOLERANCE-17g), et la traduction
 * disparaîtra le jour où elle sera retirée. Entre-temps, rien ne signale la dérive :
 * un fichier resté sur l'ancien vocabulaire décrit un état qui n'existe plus tout en
 * faisant passer ses tests. C'est exactement la panne muette que ce chantier ferme côté SQL
 * (volets 1 et 2, dans la migration) ; ceci en est le pendant côté dépôt.
 *
 * POURQUOI « planned » SEULEMENT, ET JAMAIS « done ». `done` appartient AUSSI au vocabulaire
 * des TÂCHES (crm_task_status : todo, in_progress, done, canceled, blocked), au contrat
 * EXTERNE de filtre de `list_crm_timeline` (p_status = 'active' | 'done', inchangé et
 * volontairement conservé), et aux TONS d'affichage du registre (tone: 'done'). Élargir la
 * garde à `done` la rendrait rouge sur des dizaines de sites parfaitement légitimes, ce qui
 * finirait par la faire désactiver — une garde qu'on éteint ne garde rien. `planned`, lui,
 * n'appartient à aucun autre vocabulaire : zéro tolérance possible, donc garde exacte.
 *
 * LES COMMENTAIRES SONT DÉLIBÉRÉMENT INCLUS dans le balayage — contrairement à la garde
 * `styles.guard.test.ts` qui blanchit les siens. Un commentaire qui décrit l'ancien
 * vocabulaire est faux, et un commentaire faux dure plus longtemps qu'un bug : il forme le
 * prochain lecteur à une réalité qui n'existe plus.
 *
 * ⚠ CETTE GARDE NE VOIT PAS TOUT, et c'est assumé. Elle cherche le mot ENTRE APOSTROPHES.
 * Un commentaire qui écrit `planned` entre accents graves, ou nu dans une phrase, lui
 * échappe. Ces cas-là ont été nettoyés à la main lors de la bascule ; la garde tient la
 * ligne pour la suite, elle ne prétend pas l'avoir tracée seule.
 */

// ⚠ RACINE = src/, PAS le dossier de ce fichier. Copier la ligne `join(__dirname)` de
// styles.guard.test.ts balaierait les seuls fichiers de features/crm/ — et laisserait passer
// data/mock.ts, types/domain.ts et services/, qui sont précisément là où le vocabulaire mort
// s'était logé.
const SRC_DIR = join(__dirname, '..', '..');

const FORBIDDEN = /['"]planned['"]/;

/* Les seuls fichiers autorisés à écrire l'ancien vocabulaire :
   - `crm-status.ts` porte les DEUX entrées legacy du registre, qui existent pour que le
     front reste bilingue tant que TOLERANCE-17g vit côté serveur ;
   - `crm-status.test.ts` les éprouve — les exclure de la garde sans exclure leur test
     reviendrait à supprimer la couverture des entrées legacy pour faire taire la garde ;
   - ce fichier-ci, qui doit citer le motif pour le chercher.
   Les trois se retireront ENSEMBLE avec la tolérance, par la migration dédiée. */
const ALLOWED = ['crm-status.ts', 'crm-status.test.ts', 'crm-status-vocabulary.guard.test.ts'];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return /\.tsx?$/.test(entry) ? [fullPath] : [];
  });
}

/* Comparaison par SEGMENT de chemin, jamais par une chaîne écrite en « / » : `relative()`
   rend « features\crm\… » sous Windows, où tourne ce dépôt. */
function isAllowed(fullPath: string): boolean {
  const segments = relative(SRC_DIR, fullPath).split(sep);
  return ALLOWED.includes(segments[segments.length - 1]);
}

describe('garde de vocabulaire — le cycle de vie CRM ne parle plus l’ancien statut', () => {
  test('aucun fichier de src/ n’écrit le statut mort, hors registre bilingue et sa garde', () => {
    const files = collectSourceFiles(SRC_DIR);

    // Non-vacuité : si l'énumération se cassait (mauvaise racine, filtre d'extension trop
    // étroit), la garde passerait au vert en ne balayant rien du tout.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((file) => file.endsWith(join('data', 'mock.ts')))).toBe(true);
    expect(files.some((file) => file.endsWith(join('types', 'domain.ts')))).toBe(true);

    const violations = files
      .filter((file) => !isAllowed(file))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            FORBIDDEN.test(line) ? [`${relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`] : [],
          ),
      );

    expect(violations).toEqual([]);
  });

  test('le registre bilingue LIT encore l’ancien vocabulaire — la garde ne l’a pas emporté', () => {
    // Contrepartie de l'exclusion : « faire taire la garde » en vidant crm-status.ts doit
    // échouer ICI, sinon le front cesserait de savoir lire une base qui parle encore
    // l'ancien vocabulaire pendant la fenêtre de déploiement.
    //
    // ⚠ L'assertion porte sur le COMPORTEMENT, pas sur le texte du fichier. Une version
    // antérieure de ce test cherchait `/['"]planned['"]/` dans la source : elle restait VERTE
    // quand on retirait l'entrée du registre, parce que le mot survit dans la déclaration de
    // type `LegacyCrmInteractionStatus`. Vérifié par sabotage — ne pas revenir à la lecture
    // de fichier.
    expect(interactionStatusLabel('planned')).toBeTruthy();
    expect(isOpenInteractionStatus('planned')).toBe(true);
    expect(interactionStatusLabel('done')).toBeTruthy();
    expect(isOpenInteractionStatus('done')).toBe(false);
  });
});
