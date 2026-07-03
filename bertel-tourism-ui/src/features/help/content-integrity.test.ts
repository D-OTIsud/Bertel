/**
 * Invariant du centre d'aide : un 19e type d'objet ne peut PAS arriver sans sa fiche
 * d'aide (couverture TYPE_ARCHETYPES), un id ne peut pas être dupliqué, un renvoi
 * `related` ne peut pas pointer dans le vide, une réponse ne peut pas embarquer de HTML.
 */
import { TYPE_ARCHETYPES } from '../object-editor/archetypes';
import { ALL_FAQ_ENTRIES } from './content';
import { FAQ_RUBRIQUES } from './content/types';

describe('intégrité du contenu FAQ', () => {
  const ids = ALL_FAQ_ENTRIES.map((e) => e.id);

  test('au moins 19 entrées (corpus création)', () => {
    expect(ALL_FAQ_ENTRIES.length).toBeGreaterThanOrEqual(19);
  });

  test('ids uniques et slug-safe', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  test('rubrique valide, question/réponse non vides, ≥3 keywords', () => {
    const valid = new Set<string>(FAQ_RUBRIQUES.map((r) => r.id));
    for (const e of ALL_FAQ_ENTRIES) {
      expect(valid.has(e.rubrique)).toBe(true);
      expect(e.question.trim().length).toBeGreaterThan(0);
      expect(e.answer.trim().length).toBeGreaterThan(0);
      expect(e.keywords.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('chaque type de TYPE_ARCHETYPES est couvert par au moins une entrée', () => {
    const covered = new Set(ALL_FAQ_ENTRIES.flatMap((e) => e.types ?? []));
    for (const code of Object.keys(TYPE_ARCHETYPES)) expect(covered).toContain(code);
  });

  test('les types déclarés sont des codes connus', () => {
    const known = new Set(Object.keys(TYPE_ARCHETYPES));
    for (const e of ALL_FAQ_ENTRIES) {
      for (const t of e.types ?? []) expect(known.has(t)).toBe(true);
    }
  });

  test('related pointe vers des entrées existantes, jamais soi-même', () => {
    const all = new Set(ids);
    for (const e of ALL_FAQ_ENTRIES) {
      for (const r of e.related ?? []) {
        expect(all.has(r)).toBe(true);
        expect(r).not.toBe(e.id);
      }
    }
  });

  test('pas de HTML brut ni de titres Markdown dans les réponses', () => {
    for (const e of ALL_FAQ_ENTRIES) {
      expect(e.answer).not.toMatch(/<[a-z][^>]*>/i);
      expect(e.answer).not.toMatch(/^#{1,6} /m);
    }
  });
});
