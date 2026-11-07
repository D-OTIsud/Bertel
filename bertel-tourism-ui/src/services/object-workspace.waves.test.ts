import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GARDE D'ORDONNANCEMENT. La vague 2 etait awaitee apres la vague 1 alors
 * qu'aucun de ses 13 arguments n'en provenait : une latence reseau complete
 * (220-310 ms depuis La Reunion) payee pour rien.
 *
 * Le corps de `getObjectWorkspaceResource` ne doit contenir qu'UN SEUL
 * `await Promise.all`. En ajouter un second = reintroduire la serialisation.
 * Si un jour un second point de synchronisation est legitime (une dependance
 * reelle apparait), mettre a jour ce test EN MEME TEMPS, avec un commentaire
 * disant laquelle — ne jamais le supprimer.
 *
 * Garde STRUCTURELLE et non chronometree a dessein : une assertion du type
 * « plusieurs requetes ont demarre » est vraie en sequentiel aussi, donc elle
 * ne prouverait rien.
 */
describe('getObjectWorkspaceResource — ordonnancement', () => {
  test('ne contient qu un seul point de synchronisation', () => {
    const source = readFileSync(join(__dirname, 'object-workspace.ts'), 'utf8');
    const start = source.indexOf('export async function getObjectWorkspaceResource');
    expect(start).toBeGreaterThan(-1);

    // Fin du corps = debut de la declaration exportee suivante.
    const nextExport = source.indexOf('\nexport ', start + 1);
    expect(nextExport).toBeGreaterThan(start);
    const body = source.slice(start, nextExport);

    const syncPoints = body.match(/await Promise\.all\(/g) ?? [];
    expect(syncPoints).toHaveLength(1);
  });
});
