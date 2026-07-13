import { TYPE_ARCHETYPES } from '../object-editor/archetypes';
import { NAV_ITEMS } from '../../config/nav-items';
import { isDemoOnlyModule } from '../../utils/features';
import { ALL_FAQ_ENTRIES } from './content';
import { FAQ_RUBRIQUES } from './content/types';
import { BERTEL_PARTNER_GUIDE_URL, BERTEL_SUPPORT_URL } from './content/links';

function entryById(id: string) {
  const entry = ALL_FAQ_ENTRIES.find((e) => e.id === id);
  if (!entry) throw new Error(`missing FAQ entry: ${id}`);
  return entry;
}

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

  test('routes déclarées commencent par /', () => {
    for (const e of ALL_FAQ_ENTRIES) {
      for (const route of e.routes ?? []) {
        expect(route.startsWith('/')).toBe(true);
      }
    }
  });

  test('chaque module navigable (hors démo et /aide) a au moins une entrée routes', () => {
    const coveredRoutes = new Set(ALL_FAQ_ENTRIES.flatMap((e) => e.routes ?? []));
    const requiredRoutes = NAV_ITEMS.map((item) => item.to).filter(
      (path) => path !== '/aide' && !isDemoOnlyModule(path),
    );
    for (const path of requiredRoutes) {
      expect(coveredRoutes).toContain(path);
    }
  });

  test('aide-contact pointe vers la destination de support approuvée', () => {
    const answer = entryById('aide-contact').answer;
    expect(answer).toContain(BERTEL_SUPPORT_URL);
    expect(BERTEL_SUPPORT_URL).toMatch(/^(mailto:|https:\/\/)/);
    expect(BERTEL_SUPPORT_URL).not.toMatch(/^https:\/\/(www\.)?otisud\.re\/?$/);
  });

  test('aide-partenaires pointe vers l\'URL canonique du guide partenaires', () => {
    const answer = entryById('aide-partenaires').answer;
    expect(answer).toContain(BERTEL_PARTNER_GUIDE_URL);
    expect(BERTEL_PARTNER_GUIDE_URL).toMatch(/^https:\/\//);
    const guideUrl = new URL(BERTEL_PARTNER_GUIDE_URL);
    expect(guideUrl.pathname).not.toBe('/');
  });
});
