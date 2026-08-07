import { SEP, joinParts, dateFr, openingToText, namedList } from './export-columns';

describe('helpers du registre (§208)', () => {
  it('joinParts joint par « | » et écarte vide/null', () => {
    expect(joinParts(['a', '', null, 'b'])).toBe('a | b');
    expect(SEP).toBe(' | ');
  });
  it('dateFr rend jj/mm/aaaa et \'\' sur invalide/absent (tri-état §133)', () => {
    expect(dateFr('2026-07-31T04:00:00Z')).toBe('31/07/2026');
    expect(dateFr('')).toBe('');
    expect(dateFr('pas-une-date')).toBe('');
  });
  it("openingToText compose libellé — période — jours (weekdaySlots, JAMAIS slots seuls — §151)", () => {
    expect(
      openingToText({
        label: 'Haute saison', slots: ['09:00–12:00'], weekdays: ['Lundi'],
        weekdaySlots: [{ weekday: 'Lun–Ven', slots: ['09:00–12:00', '14:00–18:00'] }, { weekday: 'Sam', slots: ['09:00–12:00'] }],
        details: ['Fermé jours fériés'], season: '', allYears: false, startDate: '2026-06-01', endDate: '2026-09-30',
      }),
    ).toBe('Haute saison — 01/06/2026 → 30/09/2026 — Lun–Ven 09:00–12:00, 14:00–18:00 · Sam 09:00–12:00 — Fermé jours fériés');
  });
  it('namedList résout name→label→code (readNamedValue) et joint', () => {
    expect(namedList([{ name: 'Wi-Fi' }, { label: 'Piscine' }, { code: 'raw_code' }])).toBe('Wi-Fi | Piscine | raw_code');
  });
});
