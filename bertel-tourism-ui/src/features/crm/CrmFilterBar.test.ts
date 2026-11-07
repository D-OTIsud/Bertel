import {
  PERIOD_DEFAULT,
  STATUS_DEFAULT,
  periodFromOf,
  statusValueOf,
} from './CrmFilterBar';

// PO points 6+7 — la barre partagée et son fix de défaut. Les helpers sont purs : testés en
// isolation (les composants consomment statusValueOf/periodFromOf, jamais de mapping dupliqué).
describe('CrmFilterBar — helpers de filtre (fix défaut PO point 7)', () => {
  it('défauts : statut = Toutes (→ undefined) et période = Tout (→ from undefined, SANS borne)', () => {
    expect(STATUS_DEFAULT).toBe('Toutes');
    expect(PERIOD_DEFAULT).toBe('Tout');
    // Toutes + Tout = aucun filtre serveur ⇒ ensemble complet (le bug « 2 mois » disparaît).
    expect(statusValueOf(STATUS_DEFAULT)).toBeUndefined();
    expect(periodFromOf(PERIOD_DEFAULT)).toBeUndefined();
  });

  it('statusValueOf : Actives → active, Traitées → done, Toutes → undefined', () => {
    expect(statusValueOf('Actives')).toBe('active');
    expect(statusValueOf('Traitées')).toBe('done');
    expect(statusValueOf('Toutes')).toBeUndefined();
  });

  it('periodFromOf : 30 j / 90 j / 12 mois bornent from (ISO minuit) ; Tout = undefined', () => {
    const now = Date.parse('2026-06-12T15:30:00Z');
    // 30 j en arrière, ramené à minuit local (précision jour pour une queryKey stable).
    const from30 = periodFromOf('30 j', now);
    expect(from30).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(from30 as string)).toBeLessThan(now);
    expect(periodFromOf('90 j', now)).toBeDefined();
    expect(periodFromOf('12 mois', now)).toBeDefined();
    // « Tout » ne pose AUCUNE borne (cœur du fix point 7).
    expect(periodFromOf('Tout', now)).toBeUndefined();
  });
});
