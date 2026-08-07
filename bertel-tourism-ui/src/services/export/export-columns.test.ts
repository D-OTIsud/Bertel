import {
  SEP, joinParts, dateFr, openingToText, namedList, EXPORT_COLUMNS, getExportColumn,
  availableColumns, clearanceLevels, presetColumnIds, purposeRequired, requiredFieldsFor,
} from './export-columns';
import { buildFixtureDetail, EMPTY_CTX, ctxWithActorContacts, FIXTURE_RAW } from './export-fixture.test-utils';

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

const SESSION_PUBLIC = { orgId: null, canEditObjects: false, role: null };
const SESSION_ORG = { orgId: 'ORGRUN000000000A', canEditObjects: false, role: 'tourism_agent' };
const SESSION_SUPER = { orgId: 'ORGRUN000000000A', canEditObjects: true, role: 'super_admin' };

describe('registre — acteur/organisation/légal/liens + clearance + préréglages (§208)', () => {
  it('acteur — nom/rôle publics depuis la fiche ; coordonnées UNIQUEMENT depuis le contexte journalisé', () => {
    expect(val('actor_names')).toBe('Jean Payet');
    expect(val('actor_roles')).toBe('Exploitant');
    // Sans contexte (pas d'appel journalisé) : les colonnes gardées rendent '' —
    // même si le payload batch portait des contacts, on ne les lit JAMAIS ici.
    expect(val('actor_mobile')).toBe('');
    expect(val('actor_summary')).toBe('');
    const ctx = ctxWithActorContacts();
    expect(getExportColumn('actor_mobile')!.value(d, ctx)).toBe('0692 11 22 33');
    expect(getExportColumn('actor_email')!.value(d, ctx)).toBe('jean.payet@exemple.re');
    expect(getExportColumn('actor_address')!.value(d, ctx)).toBe('');
    expect(getExportColumn('actor_summary')!.value(d, ctx)).toContain('Jean Payet (Exploitant)');
  });
  it('organisation & légal — SIRET public assumé (arbitrage PO), le légal non-public reste org', () => {
    expect(val('publisher')).toBe('OTI du Sud');
    expect(val('siret')).toBe('12345678900011');
    expect(val('legal_records')).toContain('SIRET');
    expect(val('legal_records')).not.toContain('Assurance');
    expect(val('legal_records_all')).toContain('Assurance');
  });
  it('liens & références', () => {
    expect(val('relations_out')).toContain('Site du Volcan');
    expect(val('external_ids')).toBe('berta : B-1234');
  });
  it("AUCUNE colonne ne lit les notes d'équipe (décision PO — garde par sabotage de source)", () => {
    const spy = buildFixtureDetail({ private_note: { id: 'n1', body: 'NOTE-INTERNE-SENTINELLE' }, private_notes: [{ id: 'n1', body: 'NOTE-INTERNE-SENTINELLE' }] });
    for (const col of EXPORT_COLUMNS) {
      expect(col.value(spy, EMPTY_CTX)).not.toContain('NOTE-INTERNE-SENTINELLE');
    }
  });
  it('clearance FILTRE la liste (§205) — sans capacités serveur, AUCUNE colonne acteur (R1)', () => {
    const ids = availableColumns(SESSION_PUBLIC).map((c) => c.id); // caps par défaut = fermé
    expect(ids).toContain('name');
    expect(ids).not.toContain('contacts_object');
    expect(ids).not.toContain('actor_names');   // R1 : identité acteur = droit de consultation, pas « public »
    expect(ids).not.toContain('actor_primary');
    expect(ids).not.toContain('actor_mobile');
    expect(ids).not.toContain('unhandled_keys');
    expect(clearanceLevels(SESSION_SUPER).has('superuser')).toBe(true);
  });
  it('R2.1 — les capacités acteur viennent du SERVEUR, pas de la session : un lecteur SANS ORG peut les recevoir', () => {
    // Persona I3 du test SQL : lien acteur `public` ⇒ identité accessible sans membership.
    const ids = availableColumns(SESSION_PUBLIC, { actorIdentityAvailable: true, actorContactsAvailable: false }).map((c) => c.id);
    expect(ids).toContain('actor_names');
    expect(ids).toContain('actor_primary');
    expect(ids).not.toContain('actor_mobile');   // coordonnées refusées par le serveur
    expect(ids).not.toContain('contacts_object'); // le niveau `org` reste, lui, session-dérivé
  });
  it("R2.1 — symétrique : membre d'ORG mais serveur fermé ⇒ aucune colonne acteur", () => {
    const ids = availableColumns(SESSION_ORG).map((c) => c.id);
    expect(ids).toContain('contacts_object');
    expect(ids).not.toContain('actor_names');
    expect(ids).not.toContain('actor_mobile');
    // clearanceLevels n'émet PLUS les capacités acteur : elles ne sont pas session-dérivées.
    expect(clearanceLevels(SESSION_ORG).has('actor_identity' as never)).toBe(false);
  });
  it('R1 — plusieurs acteurs principaux sont TOUS rendus, joints par « | »', () => {
    const multi = buildFixtureDetail({
      actors: [
        { id: 'a1', display_name: 'Jean Payet', role: { code: 'operator', name: 'Exploitant' }, is_primary: true, visibility: 'partners', contacts: [] },
        { id: 'a2', display_name: 'Marie Hoarau', role: { code: 'guide', name: 'Guide' }, is_primary: true, visibility: 'partners', contacts: [] },
      ],
    });
    expect(getExportColumn('actor_primary')!.value(multi, EMPTY_CTX)).toBe('Jean Payet | Marie Hoarau');
  });
  it('préréglage Diffusion partenaire : STRICTEMENT public, sans le groupe acteur — recalculé du code', () => {
    // Même avec les capacités acteur grandes ouvertes, Diffusion n'en prend aucune.
    const ids = presetColumnIds('diffusion', SESSION_SUPER, { actorIdentityAvailable: true, actorContactsAvailable: true });
    for (const id of ids) {
      const col = getExportColumn(id)!;
      expect(col.clearance).toBe('public');
      expect(col.group).not.toBe('acteur');
    }
  });
  it('préréglage Complet : tout ce que la session permet, HORS groupe acteur (spec §4.6)', () => {
    const ids = presetColumnIds('complet', SESSION_ORG);
    expect(ids).toContain('contacts_object');
    expect(ids.some((id) => getExportColumn(id)!.group === 'acteur')).toBe(false);
  });
  it('purposeRequired : vrai ssi une colonne requiresPurpose est cochée', () => {
    expect(purposeRequired(['name', 'actor_names'])).toBe(false);
    expect(purposeRequired(['name', 'actor_mobile'])).toBe(true);
  });
  it('R1 — projection : requiredFieldsFor unionne, et une colonne sans fields désactive tout', () => {
    expect(requiredFieldsFor(['name', 'postcode'])).toEqual([]); // identité/adresse : rien à demander
    const withActors = requiredFieldsFor(['name', 'actor_names']);
    expect(withActors).toContain('actors');
    // au moins une colonne du registre déclare fields ⇒ le préréglage Essentiel est projeté
    expect(requiredFieldsFor(presetColumnIds('essentiel', SESSION_ORG))).not.toBeUndefined();
  });
  // Garde non vacante (matrice §208, point 8) : les ~16 colonnes qui lisent raw.* DIRECTEMENT
  // (hors parser typé) tombent silencieusement à '' si le nom de clé change côté serveur — cette
  // fiche témoin fournit une valeur RÉELLE pour chacune, donc un typo dans une des colonnes
  // (ex. rawStr(d, 'stay_policy', 'checkin_form')) ferait échouer l'assertion correspondante au
  // lieu de passer silencieusement (contrairement à un simple test « ne jette pas »).
  it('R1 — présence de clé : les colonnes à lecture raw.* directe retombent à \'\' si leur clé disparaît (garde non vacante)', () => {
    const withRawKeys = buildFixtureDetail({
      address: { ...(FIXTURE_RAW.address as Record<string, unknown>), code_insee: '97418001' },
      object_zone: [{ code: 'zone_a', name: 'Zone A' }],
      description_offre_hors_zone: 'Offre valable hors zone Sud',
      sanitary_measures: 'Gel hydroalcoolique disponible',
      accessibility_labels: [{ scheme_name: 'Tourisme & Handicap', disability_types_covered: ['motor'] }],
      cuisine_types: [{ name: 'Créole' }],
      dietary_tags: [{ name: 'Sans gluten' }],
      allergens: [{ name: 'Arachides' }],
      stay_policy: { checkin_from: '14:00', checkin_to: '20:00', checkout_until: '11:00' },
      promotions: [{ name: 'Offre été' }],
      itinerary: { open_status: 'ouvert' },
    });
    const check = (id: string) => getExportColumn(id)!.value(withRawKeys, EMPTY_CTX);
    expect(check('code_insee')).toBe('97418001');
    expect(check('altitude_m')).toBe('1600'); // déjà réel dans la fiche témoin par défaut
    expect(check('zones')).toBe('Zone A');
    expect(check('web_channels')).toContain('Facebook'); // déjà réel dans la fiche témoin par défaut
    expect(check('description_hors_zone')).toBe('Offre valable hors zone Sud');
    expect(check('sanitary_measures')).toBe('Gel hydroalcoolique disponible');
    expect(check('accessibility_labels')).toBe('Tourisme & Handicap');
    expect(check('disability_types')).toBe('Moteur');
    expect(check('cuisine_types')).toBe('Créole');
    expect(check('dietary_tags')).toBe('Sans gluten');
    expect(check('allergens')).toBe('Arachides');
    expect(check('checkin')).toBe('14:00 – 20:00');
    expect(check('checkout')).toBe('11:00');
    expect(check('promotions')).toBe('Offre été');
    expect(check('siret')).toBe('12345678900011'); // déjà réel dans la fiche témoin par défaut
    expect(check('iti_open_status')).toBe('ouvert');
  });
});
