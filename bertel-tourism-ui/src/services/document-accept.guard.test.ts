/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CRM_DOCUMENT_ACCEPT } from './document-accept';
import { ALLOWED_MIME_TYPES } from '../app/api/media/upload/process-image';

/* Garde de l'attribut `accept` des documents privés CRM.
 *
 * POURQUOI. Les deux surfaces de dépôt — pièces jointes de tâche (CrmTaskModal) et
 * bibliothèque d'acteur (CrmActorDocuments) — postent vers deux routes qui passent par le
 * MÊME `processActorDocumentBuffer`. Elles annonçaient pourtant deux listes différentes :
 * `image/*` d'un côté, l'énumération exacte de l'autre. Un GIF ou un HEIC choisi dans le
 * modal de tâche traversait le sélecteur puis se faisait refuser par un 415 que le clone
 * acteur empêchait en amont — un même pipeline, deux expériences.
 *
 * DEUX VOLETS, délibérément :
 *  1. le COMPORTEMENT : la constante décrit exactement ce que le serveur accepte. C'est le
 *     volet qui compte — il rougit si le pipeline gagne (ou perd) un format sans que le
 *     sélecteur suive, dans un sens comme dans l'autre.
 *  2. la SOURCE : aucune des deux surfaces ne réécrit la liste à la main. Sans lui, le
 *     volet 1 resterait vert pendant qu'une des deux surfaces redivergerait en silence.
 *
 * ⚠ Volontairement borné aux DEUX fichiers de ce pipeline. Une garde « aucun accept
 * littéral dans src/ » serait rouge sur huit sélecteurs parfaitement légitimes (avatars,
 * logos, GPX, JSON…) et finirait désactivée — une garde qu'on éteint ne garde rien.
 */

const SRC_DIR = join(__dirname, '..');

/** Les deux — et les seules deux — surfaces de dépôt du pipeline documents CRM. */
const SURFACES = [
  join('features', 'crm', 'CrmTaskModal.tsx'),
  join('features', 'crm', 'CrmActorDocuments.tsx'),
];

describe('garde accept — un pipeline de documents CRM, une seule liste de formats', () => {
  test('la constante décrit EXACTEMENT ce que le serveur accepte', () => {
    // `processActorDocumentBuffer` accepte le PDF, puis délègue à `processImage`, dont
    // ALLOWED_MIME_TYPES est la liste faisant foi. Annoncer moins ferait refuser au
    // sélecteur un fichier que le serveur aurait pris ; annoncer plus rendrait le 415.
    expect(CRM_DOCUMENT_ACCEPT).toBe(['application/pdf', ...ALLOWED_MIME_TYPES].join(','));
  });

  test('les deux surfaces consomment la constante, aucune ne réécrit la liste', () => {
    for (const surface of SURFACES) {
      const source = readFileSync(join(SRC_DIR, surface), 'utf8');

      // Non-vacuité : sans ça, un fichier renommé ou un input retiré ferait passer la
      // garde au vert en ne vérifiant rien du tout.
      expect(source).toContain('type="file"');
      expect(source).toMatch(/accept=/);

      expect(source).toContain('accept={CRM_DOCUMENT_ACCEPT}');
      // Aucun `accept="…"` littéral : c'est la forme exacte de la divergence fermée ici.
      expect(source).not.toMatch(/accept="/);
    }
  });
});
