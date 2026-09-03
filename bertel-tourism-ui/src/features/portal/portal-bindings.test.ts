/**
 * Liaisons pures du portail partenaire (18a, D10) — TESTS DE SABOTAGE.
 *
 * Tous les writers de l'office sont « remplace tout » (DELETE inconditionnel puis
 * réinsertion, ou réconciliation par id). Une tranche reconstruite depuis ce que
 * l'écran affiche EFFACE donc, à l'approbation, tout ce que l'écran n'affichait pas.
 * Chaque updater est ici accompagné d'une assertion « ce qui n'est pas affiché
 * survit », vérifiée ROUGE en retirant le spread correspondant.
 */
import {
  PORTAL_DAY_READONLY_REASON,
  readPublicContact,
  readStartingPrice,
  readStayOpening,
  readWeekHours,
  setActivityBasics,
  setAmenities,
  setHeadlineCapacity,
  setPayments,
  setPetPolicy,
  setPresentation,
  setStartingPrice,
  setStayClosures,
  setStayOpening,
  setStayPolicy,
  setWeekHours,
  upsertPublicContact,
  type WeekHours,
} from './portal-bindings';
import type {
  ObjectWorkspaceActivityModule,
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceContactsModule,
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceOpeningsModule,
  ObjectWorkspacePricingModule,
} from '../../services/object-workspace-parser';

// ───────────────────────────── setPresentation ─────────────────────────────

describe('setPresentation', () => {
  const base = {
    localLanguage: 'fr',
    activeLanguage: 'fr',
    availableLanguages: ['fr', 'en'],
    places: [],
    orgOverlay: null,
    object: {
      recordId: 'r1',
      scope: 'object',
      placeId: null,
      label: '',
      visibility: 'public',
      chapo: { baseValue: 'Ancien', values: { fr: 'Ancien', en: 'Old' } },
      description: { baseValue: 'Texte', values: { fr: 'Texte' } },
      adaptedDescription: { baseValue: 'PMR', values: {} },
      mobileDescription: { baseValue: '', values: {} },
      editorialDescription: { baseValue: '', values: {} },
    },
  } as unknown as ObjectWorkspaceDescriptionsModule;

  it('écrit baseValue ET values.fr (values.fr masquerait sinon la saisie)', () => {
    const next = setPresentation(base, 'Nouveau', 'Texte');
    expect(next.object.chapo.baseValue).toBe('Nouveau');
    expect(next.object.chapo.values.fr).toBe('Nouveau');
    expect(next.object.chapo.values.en).toBe('Old'); // autre langue intacte
    // SABOTAGE : retirer `...d.object` ⇒ cette ligne tombe (adaptedDescription undefined).
    expect(next.object.adaptedDescription).toEqual(base.object.adaptedDescription);
    expect(next.object.mobileDescription).toBe(base.object.mobileDescription);
    expect(next.object.editorialDescription).toBe(base.object.editorialDescription);
    expect(next.object.recordId).toBe('r1');
  });

  it('ne touche pas la surcouche de l’organisation ni les langues disponibles', () => {
    const withOverlay = {
      ...base,
      orgOverlay: { ...base.object, recordId: 'o1', scope: 'object' },
    } as unknown as ObjectWorkspaceDescriptionsModule;
    const next = setPresentation(withOverlay, 'Nouveau', 'Neuf');
    // SABOTAGE : retirer `...d` ⇒ orgOverlay / availableLanguages disparaissent.
    expect(next.orgOverlay).toBe(withOverlay.orgOverlay);
    expect(next.availableLanguages).toBe(withOverlay.availableLanguages);
    expect(next.places).toBe(withOverlay.places);
  });

  it('force le français même quand le compte est en anglais (colonne FR sinon vide)', () => {
    const englishAccount = {
      ...base,
      localLanguage: 'en',
      activeLanguage: 'en',
    } as unknown as ObjectWorkspaceDescriptionsModule;
    const next = setPresentation(englishAccount, 'Accroche FR', 'Présentation FR');
    expect(next.object.chapo.values.fr).toBe('Accroche FR');
    expect(next.object.description.values.fr).toBe('Présentation FR');
  });

  it('n’altère pas le Markdown saisi (un texte simple EST du Markdown valide)', () => {
    const next = setPresentation(base, 'A **gras**', '# Titre\n\n- point');
    expect(next.object.description.values.fr).toBe('# Titre\n\n- point');
  });
});

// ─────────────────────────── upsertPublicContact ───────────────────────────

describe('upsertPublicContact', () => {
  const contacts = {
    kindOptions: [
      { id: 'k1', code: 'phone', label: 'Téléphone' },
      { id: 'k2', code: 'email', label: 'E-mail' },
      { id: 'k3', code: 'fax', label: 'Fax' },
      { id: 'k4', code: 'mobile', label: 'Mobile' },
    ],
    roleOptions: [],
    webKindOptions: [],
    relatedActorContactsCount: 0,
    relatedOrganizationContactsCount: 0,
    webItems: [{ id: 'w1' }],
    objectItems: [
      { id: 'c1', kindId: 'k1', kindCode: 'phone', kindLabel: 'Téléphone', roleId: '', roleCode: '', roleLabel: '', value: '0262 00 00 00', isPublic: true, isPrimary: true, position: '1' },
      { id: 'c3', kindId: 'k3', kindCode: 'fax', kindLabel: 'Fax', roleId: '', roleCode: '', roleLabel: '', value: '0262 11 11 11', isPublic: false, isPrimary: false, position: '2' },
    ],
  } as unknown as ObjectWorkspaceContactsModule;

  it('modifie EN PLACE la ligne publique existante et garde les autres lignes', () => {
    const next = upsertPublicContact(contacts, 'phone', '0692 00 00 00');
    expect(next.objectItems.find((i) => i.id === 'c1')?.value).toBe('0692 00 00 00');
    // SABOTAGE : reconstruire objectItems à partir de la seule ligne éditée ⇒ le fax interne disparaît.
    expect(next.objectItems.find((i) => i.id === 'c3')).toBe(contacts.objectItems[1]);
    expect(next.webItems).toBe(contacts.webItems);
    expect(next.kindOptions).toBe(contacts.kindOptions);
    // SABOTAGE : `{ value }` au lieu de `{ ...row, value }` ⇒ le rôle/position/primaire tombent.
    expect(next.objectItems.find((i) => i.id === 'c1')?.position).toBe('1');
    expect(next.objectItems.find((i) => i.id === 'c1')?.isPrimary).toBe(true);
  });

  it('crée une ligne publique du bon genre quand elle manque', () => {
    const next = upsertPublicContact(contacts, 'email', 'contact@villa.re');
    const row = next.objectItems.find((i) => i.kindCode === 'email');
    expect(row).toMatchObject({ kindId: 'k2', kindLabel: 'E-mail', isPublic: true, value: 'contact@villa.re' });
    expect(next.objectItems).toHaveLength(3);
    expect(next.objectItems[0]).toBe(contacts.objectItems[0]);
  });

  it('vider la valeur retire la ligne (le saver supprime les ids absents)', () => {
    const next = upsertPublicContact(contacts, 'phone', '');
    expect(next.objectItems.some((i) => i.id === 'c1')).toBe(false);
    expect(next.objectItems.some((i) => i.id === 'c3')).toBe(true);
  });

  it('ne rend PAS un genre absent du catalogue', () => {
    expect(() =>
      upsertPublicContact({ ...contacts, kindOptions: [] } as ObjectWorkspaceContactsModule, 'website', 'www.x.re'),
    ).toThrow(/catalogue/);
  });

  it('lecture et écriture partagent la MÊME résolution : un mobile seul est édité en place', () => {
    const mobileOnly = {
      ...contacts,
      objectItems: [
        { id: 'm1', kindId: 'k4', kindCode: 'mobile', kindLabel: 'Mobile', roleId: '', roleCode: '', roleLabel: '', value: '0692 11 11 11', isPublic: true, isPrimary: true, position: '1' },
      ],
    } as unknown as ObjectWorkspaceContactsModule;
    expect(readPublicContact(mobileOnly, 'phone')).toBe('0692 11 11 11');
    const next = upsertPublicContact(mobileOnly, 'phone', '0692 22 22 22');
    // Une création en 'phone' laisserait le mobile périmé à l'écran ET en base.
    expect(next.objectItems).toHaveLength(1);
    expect(next.objectItems[0]).toMatchObject({ id: 'm1', kindCode: 'mobile', value: '0692 22 22 22' });
  });

  it('ne rend jamais une coordonnée non publique', () => {
    expect(readPublicContact(contacts, 'phone')).toBe('0262 00 00 00');
    const privatePhone = {
      ...contacts,
      objectItems: [{ ...contacts.objectItems[0], isPublic: false }],
    } as unknown as ObjectWorkspaceContactsModule;
    expect(readPublicContact(privatePhone, 'phone')).toBe('');
  });
});

// ───────────────────────── readWeekHours / setWeekHours ─────────────────────

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const period = (over: Record<string, unknown> = {}) => ({
  recordId: 'p1',
  order: '1',
  bucket: 'current',
  label: '',
  seasonTypeCode: '',
  startDate: '',
  endDate: '',
  allYears: true,
  recurrence: 'always',
  isClosure: false,
  closedDays: [] as string[],
  weekdays: WEEK.map((code) => ({ code, label: code, slots: [] as { start: string; end: string }[] })),
  ...over,
});

const openings = (periods: unknown[]) =>
  ({ periods, periodTypeOptions: [], unavailableReason: null } as unknown as ObjectWorkspaceOpeningsModule);

const closure = period({ recordId: 'p9', isClosure: true, recurrence: 'fixed', startDate: '2026-12-24', endDate: '2026-12-26' });

describe('setWeekHours', () => {
  it('n’édite que la période ouverte unique et garde les fermetures', () => {
    const o = openings([period(), closure]);
    const next = setWeekHours(o, {
      monday: { open: true, fixedHours: true, slots: [{ start: '09:00', end: '12:00' }] },
      tuesday: { open: false, fixedHours: false, slots: [] },
    } as WeekHours);
    // SABOTAGE : reconstruire `periods` depuis la seule période ouverte ⇒ la fermeture de Noël disparaît.
    expect(next.periods[1]).toBe(o.periods[1]);
    expect(next.periods[0].weekdays.find((w) => w.code === 'monday')?.slots).toEqual([{ start: '09:00', end: '12:00' }]);
    expect(next.periods[0].closedDays).toContain('tuesday');
    // SABOTAGE : `{ weekdays }` au lieu de `{ ...period, weekdays }` ⇒ recordId/order/bucket tombent.
    expect(next.periods[0].recordId).toBe('p1');
    expect(next.periods[0].order).toBe('1');
    expect(next.periods[0].seasonTypeCode).toBe('');
  });

  it('laisse intacts, à la MÊME référence, les jours non affichés', () => {
    const withThursday = period({
      weekdays: WEEK.map((code) => ({
        code,
        label: code,
        slots: code === 'thursday' ? [{ start: '18:00', end: '23:00' }] : [],
      })),
    });
    const o = openings([withThursday]);
    const before = o.periods[0].weekdays.find((w) => w.code === 'thursday');
    const next = setWeekHours(o, { monday: { open: true, fixedHours: true, slots: [{ start: '09:00', end: '12:00' }] } } as WeekHours);
    // SABOTAGE : reconstruire `weekdays` à partir des seules clés de `hours` ⇒ jeudi soir effacé.
    expect(next.periods[0].weekdays.find((w) => w.code === 'thursday')).toBe(before);
  });

  it('crée une période « always » quand il n’y en a aucune', () => {
    const o = openings([]);
    expect(setWeekHours(o, {} as WeekHours).periods[0]).toMatchObject({
      recurrence: 'always',
      label: 'Horaires habituels',
      isClosure: false,
    });
  });

  it('est en LECTURE SEULE avec 2 périodes ouvertes (saisonnier : géré par l’office)', () => {
    const o = openings([period(), period({ recordId: 'p2', recurrence: 'cyclic', startDate: '2026-07-01', endDate: '2026-08-31' })]);
    expect(readWeekHours(o).readOnlyReason).toMatch(/saison/i);
    expect(setWeekHours(o, { monday: { open: true, fixedHours: true, slots: [{ start: '09:00', end: '12:00' }] } } as WeekHours)).toBe(o);
  });

  it('« ouvert sans horaires fixes » = sentinelle créneau vide, JAMAIS slots vides', () => {
    const o = openings([period()]);
    const next = setWeekHours(o, { monday: { open: true, fixedHours: false, slots: [] } } as WeekHours);
    // SABOTAGE : émettre `slots: []` ⇒ buildOpeningsPayload omet le jour et il se relit FERMÉ.
    expect(next.periods[0].weekdays.find((w) => w.code === 'monday')?.slots).toEqual([{ start: '', end: '' }]);
    expect(next.periods[0].closedDays).not.toContain('monday');
    expect(readWeekHours(next).hours.monday).toMatchObject({ open: true, fixedHours: false });
  });

  it('un créneau à moitié saisi tombe, mais le jour reste OUVERT (sentinelle)', () => {
    const o = openings([period()]);
    const next = setWeekHours(o, { monday: { open: true, fixedHours: true, slots: [{ start: '09:00', end: '' }] } } as WeekHours);
    // SABOTAGE : `filter(...)` sans repli sentinelle ⇒ slots: [] ⇒ lundi devient FERMÉ.
    expect(next.periods[0].weekdays.find((w) => w.code === 'monday')?.slots).toEqual([{ start: '', end: '' }]);
    expect(readWeekHours(next).hours.monday.open).toBe(true);
  });

  it('ne filtre JAMAIS un créneau STOCKÉ sur son contenu (26 % de la base est une sentinelle)', () => {
    const sentinel = period({
      weekdays: [{ code: 'monday', label: 'lundi', slots: [{ start: '', end: '' }] }],
    });
    const o = openings([sentinel]);
    // On ne touche QUE mardi : lundi doit ressortir identique, sentinelle comprise.
    const next = setWeekHours(o, { tuesday: { open: true, fixedHours: true, slots: [{ start: '10:00', end: '14:00' }] } } as WeekHours);
    expect(next.periods[0].weekdays.find((w) => w.code === 'monday')?.slots).toEqual([{ start: '', end: '' }]);
  });

  it('recocher un jour le retire de closedDays (sinon état contradictoire)', () => {
    const o = openings([period({ closedDays: ['tuesday'] })]);
    const next = setWeekHours(o, { tuesday: { open: true, fixedHours: false, slots: [] } } as WeekHours);
    expect(next.periods[0].closedDays).not.toContain('tuesday');
  });

  it('un jour ABSENT et non coché reste absent (pas de faux changement)', () => {
    const sparse = period({ weekdays: [{ code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }] }] });
    const o = openings([sparse]);
    const next = setWeekHours(o, { sunday: { open: false, fixedHours: false, slots: [] } } as WeekHours);
    expect(next).toBe(o);
  });

  it('un jour à 3 créneaux passe en lecture seule et ne peut pas être écrasé', () => {
    const busy = period({
      weekdays: [
        {
          code: 'monday',
          label: 'lundi',
          slots: [
            { start: '07:00', end: '09:00' },
            { start: '11:30', end: '14:30' },
            { start: '18:00', end: '22:00' },
          ],
        },
      ],
    });
    const o = openings([busy]);
    expect(readWeekHours(o).hours.monday.readOnly).toBe(true);
    expect(PORTAL_DAY_READONLY_REASON).toMatch(/office/i);
    // SABOTAGE : appliquer l'entrée telle quelle ⇒ deux services sur trois disparaissent.
    const next = setWeekHours(o, { monday: { open: true, fixedHours: true, slots: [{ start: '09:00', end: '12:00' }] } } as WeekHours);
    expect(next.periods[0].weekdays[0]).toBe(o.periods[0].weekdays[0]);
  });

  it('readWeekHours ne confond pas « absent » et « ouvert sans horaires »', () => {
    const mixed = period({
      weekdays: [
        { code: 'monday', label: 'lundi', slots: [{ start: '', end: '' }] },
        { code: 'tuesday', label: 'mardi', slots: [] },
      ],
    });
    const { hours } = readWeekHours(openings([mixed]));
    expect(hours.monday).toMatchObject({ open: true, fixedHours: false });
    expect(hours.tuesday).toMatchObject({ open: false, fixedHours: false });
    expect(hours.sunday).toMatchObject({ open: false, fixedHours: false });
  });
});

// ───────────── 8e écran HEB : ouverture à l'année + fermetures ──────────────

describe('readStayOpening / setStayOpening / setStayClosures (hébergements)', () => {
  it('sans période enregistrée, la question n’est pas encore répondue', () => {
    const { opening, closures, readOnlyReason } = readStayOpening(openings([]));
    expect(opening.openAllYear).toBeNull();
    expect(closures).toEqual([]);
    expect(readOnlyReason).toBeNull();
  });

  it('« ouvert toute l’année » crée une période always OUVERTE tous les jours (sentinelle)', () => {
    const next = setStayOpening(openings([]), { openAllYear: true, startDate: '', endDate: '' });
    const created = next.periods[0];
    expect(created).toMatchObject({ recurrence: 'always', isClosure: false });
    // SABOTAGE : garder les weekdays de createPeriodDraft (slots: []) ⇒ le gîte se relit
    // FERMÉ tous les jours alors que le partenaire vient de dire « ouvert toute l'année ».
    expect(created.weekdays).toHaveLength(7);
    for (const weekday of created.weekdays) {
      expect(weekday.slots).toEqual([{ start: '', end: '' }]);
    }
    expect(readStayOpening(next).opening.openAllYear).toBe(true);
  });

  it('« non » enregistre une saison qui se répète chaque année', () => {
    const next = setStayOpening(openings([]), { openAllYear: false, startDate: '2026-05-01', endDate: '2026-10-31' });
    expect(next.periods[0]).toMatchObject({ recurrence: 'cyclic', startDate: '2026-05-01', endDate: '2026-10-31' });
    expect(readStayOpening(next).opening).toMatchObject({ openAllYear: false, startDate: '2026-05-01' });
  });

  it('bascule sur une période existante SANS toucher aux jours déjà saisis', () => {
    const existing = period({
      recordId: 'p7',
      recurrence: 'cyclic',
      startDate: '2026-05-01',
      endDate: '2026-10-31',
      seasonTypeCode: 'high_season',
      weekdays: [{ code: 'monday', label: 'lundi', slots: [{ start: '15:00', end: '19:00' }] }],
    });
    const o = openings([existing]);
    const next = setStayOpening(o, { openAllYear: true, startDate: '', endDate: '' });
    // SABOTAGE : reconstruire la période ⇒ recordId/seasonTypeCode/weekdays effacés.
    expect(next.periods[0].recordId).toBe('p7');
    expect(next.periods[0].seasonTypeCode).toBe('high_season');
    expect(next.periods[0].weekdays).toBe(existing.weekdays);
    expect(next.periods[0]).toMatchObject({ recurrence: 'always', startDate: '', endDate: '' });
  });

  it('les fermetures gardent la période d’ouverture byte-à-byte', () => {
    const open = period({ recordId: 'p1' });
    const o = openings([open, closure]);
    const next = setStayClosures(o, [
      { key: 'p9', startDate: '2026-12-20', endDate: '2026-12-27', label: 'Fêtes' },
      { key: 'new-1', startDate: '2027-03-01', endDate: '2027-03-15', label: 'Travaux' },
    ]);
    // SABOTAGE : reconstruire `periods` depuis les seules fermetures ⇒ l'ouverture disparaît.
    expect(next.periods[0]).toBe(open);
    const edited = next.periods.find((p) => p.recordId === 'p9');
    expect(edited).toMatchObject({ startDate: '2026-12-20', endDate: '2026-12-27', label: 'Fêtes', isClosure: true });
    // SABOTAGE : `{ startDate, endDate }` au lieu de `{ ...existing, ... }` ⇒ recordId perdu ⇒ la
    // fermetures existante est SUPPRIMÉE puis recréée à l'approbation.
    expect(edited?.recordId).toBe('p9');
    expect(next.periods.some((p) => p.label === 'Travaux' && p.isClosure)).toBe(true);
  });

  it('retirer une fermeture ne retire qu’elle', () => {
    const o = openings([period({ recordId: 'p1' }), closure]);
    const next = setStayClosures(o, []);
    expect(next.periods).toHaveLength(1);
    expect(next.periods[0]).toBe(o.periods[0]);
  });

  it('lecture seule avec 2 périodes ouvertes', () => {
    const o = openings([period(), period({ recordId: 'p2', recurrence: 'cyclic' })]);
    expect(readStayOpening(o).readOnlyReason).toMatch(/saison/i);
    expect(setStayOpening(o, { openAllYear: true, startDate: '', endDate: '' })).toBe(o);
  });
});

// ─────────────────── setAmenities / setPayments / capacités ─────────────────

describe('setAmenities / setPayments', () => {
  const characteristics = {
    languageOptions: [],
    languageLevelOptions: [],
    selectedLanguages: [{ code: 'fr' }],
    paymentOptions: [
      { id: 'p1', code: 'especes', label: 'Espèces' },
      { id: 'p2', code: 'carte_bleue', label: 'Carte Bleue' },
    ],
    selectedPaymentCodes: ['especes', 'crypto'],
    environmentOptions: [],
    selectedEnvironmentCodes: ['calm'],
    amenityGroups: [],
    selectedAmenityCodes: ['acc_guide_dog_welcome', 'wifi'],
    unavailableReason: null,
  } as unknown as ObjectWorkspaceCharacteristicsModule;

  it('garde les codes non affichés (PMR) via mergeEstablishmentAmenitySelection', () => {
    const next = setAmenities(characteristics, ['parking'], new Set(['wifi', 'parking']));
    // SABOTAGE : `selectedAmenityCodes: checked` ⇒ l'accueil des chiens guides disparaît.
    expect([...next.selectedAmenityCodes].sort()).toEqual(['acc_guide_dog_welcome', 'parking']);
    expect(next.selectedLanguages).toBe(characteristics.selectedLanguages);
    expect(next.selectedEnvironmentCodes).toBe(characteristics.selectedEnvironmentCodes);
    expect(next.selectedPaymentCodes).toBe(characteristics.selectedPaymentCodes);
  });

  it('les moyens de paiement absents du catalogue chargé survivent', () => {
    const next = setPayments(characteristics, ['carte_bleue']);
    // SABOTAGE : `Array.from(new Set(codes))` seul ⇒ `crypto` (hors catalogue chargé) est effacé.
    expect([...next.selectedPaymentCodes].sort()).toEqual(['carte_bleue', 'crypto']);
    expect(next.selectedAmenityCodes).toBe(characteristics.selectedAmenityCodes);
  });

  it('déduplique les codes envoyés deux fois', () => {
    const next = setPayments(characteristics, ['especes', 'especes', 'carte_bleue']);
    expect(next.selectedPaymentCodes.filter((c) => c === 'especes')).toHaveLength(1);
  });
});

describe('setHeadlineCapacity / setPetPolicy / setStayPolicy', () => {
  const capacity = {
    metricOptions: [
      { id: 'm1', code: 'max_capacity', label: 'Capacité max.' },
      { id: 'm2', code: 'seats', label: 'Places assises' },
    ],
    capacityItems: [
      { recordId: 'ci1', metricId: 'm1', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '4', effectiveFrom: '', effectiveTo: '' },
      { recordId: 'ci2', metricId: 'm2', metricCode: 'seats', metricLabel: 'Places assises', unit: 'seat', value: '30', effectiveFrom: '2026-01-01', effectiveTo: '' },
    ],
    groupPolicy: { minSize: '2', maxSize: '', groupOnly: false, notes: 'Groupes bienvenus' },
    petPolicy: { accepted: true, conditions: 'Petits chiens' },
    stayPolicy: { checkInFrom: '16:00', checkInUntil: '20:00', checkOutUntil: '10:00', conditions: 'Caution 200 €' },
    unavailableReason: null,
  } as unknown as ObjectWorkspaceCapacityPoliciesModule;

  it('modifie la ligne de capacité en place et garde les autres mesures', () => {
    const next = setHeadlineCapacity(capacity, 'max_capacity', '6');
    expect(next.capacityItems.find((i) => i.metricCode === 'max_capacity')).toMatchObject({ recordId: 'ci1', value: '6' });
    // SABOTAGE : reconstruire capacityItems depuis la seule mesure affichée ⇒ « places assises » (et
    // sa fenêtre de validité) disparaît.
    expect(next.capacityItems.find((i) => i.metricCode === 'seats')).toBe(capacity.capacityItems[1]);
    expect(next.groupPolicy).toBe(capacity.groupPolicy);
    expect(next.petPolicy).toBe(capacity.petPolicy);
    expect(next.stayPolicy).toBe(capacity.stayPolicy);
  });

  it('crée la ligne manquante depuis le catalogue de mesures', () => {
    const empty = { ...capacity, capacityItems: [] } as unknown as ObjectWorkspaceCapacityPoliciesModule;
    const next = setHeadlineCapacity(empty, 'seats', '42');
    expect(next.capacityItems[0]).toMatchObject({ metricId: 'm2', metricCode: 'seats', metricLabel: 'Places assises', value: '42', recordId: null });
  });

  it('vider la valeur retire la ligne, et un code hors catalogue est refusé', () => {
    expect(setHeadlineCapacity(capacity, 'max_capacity', '').capacityItems.some((i) => i.metricCode === 'max_capacity')).toBe(false);
    expect(() => setHeadlineCapacity(capacity, 'seats' as 'seats', '1')).not.toThrow();
    const noCatalog = { ...capacity, capacityItems: [], metricOptions: [] } as unknown as ObjectWorkspaceCapacityPoliciesModule;
    expect(() => setHeadlineCapacity(noCatalog, 'seats', '10')).toThrow(/catalogue/);
  });

  it('animaux : « je préfère ne pas répondre » = null, jamais false', () => {
    const next = setPetPolicy(capacity, null, '');
    expect(next.petPolicy).toEqual({ accepted: null, conditions: '' });
    expect(next.capacityItems).toBe(capacity.capacityItems);
    expect(setPetPolicy(capacity, false, 'ignoré').petPolicy).toEqual({ accepted: false, conditions: '' });
    expect(setPetPolicy(capacity, true, 'Chiens tenus en laisse').petPolicy).toEqual({ accepted: true, conditions: 'Chiens tenus en laisse' });
  });

  it('arrivée / départ : les champs hors du patch survivent', () => {
    const next = setStayPolicy(capacity, { checkInFrom: '17:00' });
    // SABOTAGE : `stayPolicy: patch` ⇒ checkInUntil et la caution sont effacés.
    expect(next.stayPolicy).toEqual({ checkInFrom: '17:00', checkInUntil: '20:00', checkOutUntil: '10:00', conditions: 'Caution 200 €' });
    expect(next.groupPolicy).toBe(capacity.groupPolicy);
  });
});

// ────────────────────────────── setStartingPrice ────────────────────────────

describe('setStartingPrice / readStartingPrice', () => {
  const pricing = {
    priceKindOptions: [
      { id: 'pk1', code: 'adulte', label: 'Adulte' },
      { id: 'pk2', code: 'gratuit', label: 'Gratuit' },
      { id: 'pk3', code: 'enfant', label: 'Enfant' },
    ],
    priceTypeOptions: [{ id: 'pt1', code: 'principal', label: 'Tarif principal' }, { id: 'pt2', code: 'option', label: 'Option' }],
    priceSeasonOptions: [],
    priceUnitOptions: [
      { id: 'pu1', code: 'par_nuit', label: 'Par nuit' },
      { id: 'pu2', code: 'par_personne', label: 'Par personne' },
    ],
    prices: [
      { recordId: 'pr1', kindId: 'pk1', kindCode: 'adulte', kindLabel: 'Adulte', unitId: 'pu1', unitCode: 'par_nuit', unitLabel: 'Par nuit', amount: '90', amountMax: '', currency: 'EUR', seasonCode: 'haute', indicationCode: 'principal', ageMinEnfant: '', ageMaxEnfant: '', ageMinJunior: '', ageMaxJunior: '', validFrom: '', validTo: '', conditions: 'Deux nuits minimum', source: 'import', periods: [{ recordId: 'pp1', startDate: '2026-07-01', endDate: '2026-08-31', startTime: '', endTime: '', note: '' }] },
      { recordId: 'pr2', kindId: 'pk3', kindCode: 'enfant', kindLabel: 'Enfant', unitId: 'pu1', unitCode: 'par_nuit', unitLabel: 'Par nuit', amount: '45', amountMax: '', currency: 'EUR', seasonCode: '', indicationCode: 'option', ageMinEnfant: '', ageMaxEnfant: '', ageMinJunior: '', ageMaxJunior: '', validFrom: '', validTo: '', conditions: '', source: '', periods: [] },
    ],
    discounts: [{ recordId: 'd1' }],
    promotions: [{ promotionId: 'promo1' }],
    promotionsUnavailableReason: null,
    unavailableReason: null,
  } as unknown as ObjectWorkspacePricingModule;

  it('modifie le tarif principal en place et garde tout le reste', () => {
    const next = setStartingPrice(pricing, { free: false, amount: '110', amountMax: '', unitCode: 'par_nuit' });
    const main = next.prices.find((p) => p.recordId === 'pr1');
    expect(main).toMatchObject({ amount: '110', unitCode: 'par_nuit' });
    // SABOTAGE : `{ amount }` au lieu de `{ ...target, amount }` ⇒ saison, conditions et périodes effacées.
    expect(main?.conditions).toBe('Deux nuits minimum');
    expect(main?.seasonCode).toBe('haute');
    expect(main?.periods).toBe(pricing.prices[0].periods);
    // SABOTAGE : reconstruire `prices` depuis la seule ligne principale ⇒ le tarif enfant disparaît.
    expect(next.prices[1]).toBe(pricing.prices[1]);
    expect(next.discounts).toBe(pricing.discounts);
    expect(next.promotions).toBe(pricing.promotions);
  });

  it('normalise la virgule décimale', () => {
    expect(setStartingPrice(pricing, { free: false, amount: '12,50', amountMax: '', unitCode: 'par_nuit' }).prices[0].amount).toBe('12.50');
  });

  it('« gratuit » bascule le public sur gratuit et remet le montant à 0', () => {
    const next = setStartingPrice(pricing, { free: true, amount: '', amountMax: '', unitCode: 'par_nuit' });
    expect(next.prices[0]).toMatchObject({ kindCode: 'gratuit', kindId: 'pk2', amount: '0', amountMax: '' });
    expect(readStartingPrice(next).free).toBe(true);
  });

  it('crée une ligne principale « adulte » quand il n’y en a pas', () => {
    const empty = { ...pricing, prices: [] } as unknown as ObjectWorkspacePricingModule;
    const next = setStartingPrice(empty, { free: false, amount: '45', amountMax: '', unitCode: 'par_personne' });
    expect(next.prices[0]).toMatchObject({
      recordId: null, kindCode: 'adulte', indicationCode: 'principal', unitCode: 'par_personne', unitId: 'pu2', amount: '45', currency: 'EUR',
    });
  });

  it('ne crée aucune ligne vide', () => {
    const empty = { ...pricing, prices: [] } as unknown as ObjectWorkspacePricingModule;
    expect(setStartingPrice(empty, { free: false, amount: '', amountMax: '', unitCode: 'par_nuit' })).toBe(empty);
  });

  it('lit le tarif principal, jamais une option', () => {
    expect(readStartingPrice(pricing)).toEqual({ free: false, amount: '90', amountMax: '', unitCode: 'par_nuit' });
  });
});

// ───────────────────────────── setActivityBasics ────────────────────────────

describe('setActivityBasics', () => {
  const activity = {
    durationMin: '90',
    minParticipants: '2',
    maxParticipants: '8',
    difficultyLevel: '3',
    guideRequired: true,
    minAge: '6',
    equipmentProvided: true,
    equipmentProvidedDetails: 'Casque et baudrier',
    difficultyOptions: [{ id: 'd1', code: '3', label: 'Moyen' }],
    unavailableReason: null,
  } as unknown as ObjectWorkspaceActivityModule;

  it('n’écrase que les clés du patch', () => {
    const next = setActivityBasics(activity, { durationMin: '120', minAge: '8' });
    expect(next).toMatchObject({ durationMin: '120', minAge: '8' });
    // SABOTAGE : `return { ...patch } as ...` ⇒ le matériel fourni et la difficulté disparaissent.
    expect(next.equipmentProvidedDetails).toBe('Casque et baudrier');
    expect(next.difficultyLevel).toBe('3');
    expect(next.guideRequired).toBe(true);
    expect(next.difficultyOptions).toBe(activity.difficultyOptions);
  });

  it('un patch vide rend la tranche inchangée', () => {
    expect(setActivityBasics(activity, {})).toEqual(activity);
  });
});
