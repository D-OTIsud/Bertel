import { SEP, joinParts, dateFr, openingToText, namedList, EXPORT_COLUMNS, getExportColumn } from './export-columns';
import { buildFixtureDetail, EMPTY_CTX } from './export-fixture.test-utils';

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

const d = buildFixtureDetail();
const val = (id: string) => {
  const col = getExportColumn(id);
  if (!col) throw new Error(`colonne absente du registre: ${id}`);
  return col.value(d, EMPTY_CTX);
};

describe('registre — identité/localisation/contacts/descriptions (§208)', () => {
  it('identité', () => {
    expect(val('id')).toBe('HOTRUN0000000TST');
    expect(val('name')).toBe('Hôtel Témoin');
    expect(val('type_code')).toBe('HOT');
    expect(val('type')).not.toBe('HOT'); // libellé FR résolu, jamais le code nu
    expect(val('status')).toBe('Publiée');
    expect(val('updated_at')).toBe('30/07/2026');
  });
  it('localisation — postcode reste une chaîne, code_insee vide rend \'\', lat/lon NUMÉRIQUES (R1)', () => {
    expect(val('postcode')).toBe('97418');
    expect(val('city')).toBe('Le Tampon');
    expect(val('code_insee')).toBe('');
    expect(val('latitude')).toBe(-21.2783);
    expect(getExportColumn('latitude')!.cellType).toBe('number');
    expect(getExportColumn('longitude')!.cellType).toBe('number');
    expect(val('altitude_m')).toBe('1600');
  });
  it('contacts — value, jamais displayValue/href ; le non-public reste hors de la colonne publique', () => {
    expect(val('phone')).toBe('0262 27 00 00');
    expect(val('email')).toBe('contact@temoin.re');
    expect(val('website')).toBe('https://temoin.re');
    expect(val('contacts_public')).not.toContain('0692 00 00 00');
    expect(val('web_channels')).toContain('Facebook');
  });
  it('descriptions', () => {
    expect(val('description')).toBe('Description propre sans Markdown.');
    expect(val('chapo')).toBe('Accroche témoin.');
    expect(val('descriptions_langs')).toBe('');
  });
  it('toutes les colonnes rendent string | number | null sans jeter, même sur une fiche quasi vide (R1)', () => {
    const minimal = buildFixtureDetail({
      contacts: [], languages: [], amenities: [], payment_methods: [], environment_tags: [], tags: [],
      taxonomy: [], classifications: [], sustainability_labels: [], capacities: [], prices: [],
      media: [], legal_records: [], actors: [], org_links: [], external_ids: [], outgoing_relations: [],
      web_channels: [], pet_policy: null, group_policies: [],
    });
    for (const col of EXPORT_COLUMNS) {
      const out = col.value(minimal, EMPTY_CTX);
      expect(out === null || typeof out === 'string' || typeof out === 'number').toBe(true);
      if (col.cellType !== 'number') expect(typeof out).toBe('string');
    }
  });
});

describe('registre — labels/équipements/capacité/tarifs/horaires/médias (§208)', () => {
  it('labels & classements', () => {
    expect(val('classifications')).toContain('3 étoiles');
    expect(val('sustainability_labels')).toContain('Clef Verte');
  });
  it('équipements et politiques', () => {
    expect(val('amenities')).toBe('Wi-Fi | Piscine');
    expect(val('payment_methods')).toBe('Carte bancaire');
    expect(val('pets_accepted')).toBe('Oui');
    expect(val('pets_conditions')).toContain('Petits chiens');
  });
  it('tri-état animaux : null ⇒ cellule vide, jamais « Non » (§133)', () => {
    const noPet = buildFixtureDetail({ pet_policy: null });
    expect(getExportColumn('pets_accepted')!.value(noPet, EMPTY_CTX)).toBe('');
  });
  it('capacité', () => {
    expect(val('capacity_max')).toContain('40');
    expect(val('capacity')).toContain('Chambres');
    expect(val('group_min')).toBe('10');
  });
  it('capacity_max : AUCUN repli (arbitrage PO, matrice §208 #3) — une fiche sans métrique « capacité » rend une cellule VIDE, jamais une autre métrique (ex. chambres)', () => {
    const noCapacityMetric = buildFixtureDetail({
      capacities: [{ metric_code: 'bedrooms', metric_name: 'Chambres', value: 18 }],
    });
    expect(getExportColumn('capacity_max')!.value(noCapacityMetric, EMPTY_CTX)).toBe('');
  });
  it("tarifs — 'n/a' n'entre jamais dans un min (piège maison)", () => {
    expect(val('price_min')).toBe('90');
    expect(val('prices')).toContain('Chambre double');
    expect(val('prices')).not.toContain('n/a');
  });
  it('médias — la privée est comptée à part, la couverture est la principale', () => {
    expect(val('photo_main')).toBe('https://cdn/img1.jpg');
    expect(val('photo_main_credit')).toBe('OTI Sud');
    expect(val('media_count')).toBe('2');
    expect(val('media_private_count')).toBe('1');
  });
});
