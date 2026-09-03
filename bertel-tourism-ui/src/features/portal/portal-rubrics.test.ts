/**
 * Registre des rubriques du portail (18a, D10).
 *
 * Le registre est une ALLOWLIST fail-CLOSED : un module absent d'ici n'est jamais rendu
 * ni envoyé, quelle que soit la matrice de visibilité, et un type sans rubrique n'ouvre
 * aucun écran. Les liaisons d'indisponibilité sont PURES et EXPLICITES : `contacts` et
 * `descriptions` ne portent AUCUN motif racine (vérifié dans object-workspace-parser.ts),
 * un accès générique `resource.modules[x].unavailableReason` rendrait donc ces deux
 * rubriques éditables sur une donnée éventuellement morte.
 */
import {
  PORTAL_AMENITY_CODES,
  PORTAL_HEADLINE_METRIC,
  PORTAL_PAYMENT_CODES,
  PORTAL_PRICE_UNIT,
  PORTAL_RUBRICS,
  PORTAL_UNAVAILABLE_REASON,
  buildPortalRubrics,
  isPortalSupportedArchetype,
  portalTypeLabel,
  resolvePortalArchetype,
} from './portal-rubrics';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../services/object-workspace';
import { TYPE_LABEL, type ArchetypeCode } from '../object-editor/archetypes';

const floor = ['legal', 'provider-follow-up', 'publication', 'sync-identifiers', 'distribution', 'provider', 'relationships', 'places', 'media'];

const draft = (over: Record<string, unknown> = {}) =>
  ({
    contacts: { objectItems: [], webItems: [], kindOptions: [] },
    descriptions: { localLanguage: 'fr', object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } } },
    openings: { periods: [], periodTypeOptions: [], unavailableReason: null },
    characteristics: { selectedAmenityCodes: [], selectedPaymentCodes: [], amenityGroups: [], paymentOptions: [], unavailableReason: null },
    capacityPolicies: {
      capacityItems: [],
      metricOptions: [{ code: 'max_capacity', id: 'm1', label: 'Capacité max.' }],
      petPolicy: { accepted: null, conditions: '' },
      groupPolicy: {},
      stayPolicy: {},
      unavailableReason: null,
    },
    pricing: { prices: [], priceKindOptions: [], priceUnitOptions: [], priceTypeOptions: [], discounts: [], promotions: [], unavailableReason: null },
    activity: { durationMin: '', minParticipants: '', maxParticipants: '', minAge: '', unavailableReason: null },
    ...over,
  }) as unknown as ObjectWorkspaceModules;

const build = (over: Partial<Parameters<typeof buildPortalRubrics>[0]> = {}) =>
  buildPortalRubrics({
    archetype: 'RES',
    draft: draft(),
    dirty: {},
    masked: [],
    floor,
    pendingModules: new Set(),
    rejectedModules: new Set(),
    ...over,
  });

describe('buildPortalRubrics — composition par type', () => {
  it('HEB : huitième écran « ouverture / fermetures », pas les horaires du restaurant', () => {
    const ids = build({ archetype: 'HEB', draft: draft() }).map((r) => r.id);
    expect(ids).toEqual(['contacts', 'presentation', 'season', 'amenities', 'welcome', 'pricing']);
    expect(ids).not.toContain('hours');
  });

  it('RES : horaires oui, ouverture saisonnière non', () => {
    const ids = build({ archetype: 'RES' }).map((r) => r.id);
    expect(ids).toEqual(['contacts', 'presentation', 'hours', 'amenities', 'welcome', 'pricing']);
  });

  it('ASC : la rubrique activité, pas la capacité', () => {
    const ids = build({ archetype: 'ASC' }).map((r) => r.id);
    expect(ids).toEqual(['contacts', 'presentation', 'hours', 'amenities', 'pricing', 'activity']);
  });

  it('les deux rubriques d’ouverture portent le MÊME module (une enveloppe par module)', () => {
    const hours = PORTAL_RUBRICS.find((r) => r.id === 'hours');
    const season = PORTAL_RUBRICS.find((r) => r.id === 'season');
    expect(hours?.module).toBe('openings');
    expect(season?.module).toBe('openings');
    // …et JAMAIS ensemble pour un même type : deux enveloppes du même module se
    // marcheraient dessus dans un seul envoi.
    for (const archetype of ['HEB', 'RES', 'ASC', 'VIS', 'SRV', 'ITI', 'FMA'] as ArchetypeCode[]) {
      const modules = build({ archetype }).map((r) => r.module);
      expect(new Set(modules).size).toBe(modules.length);
    }
  });

  it('fail-CLOSED : un type sans rubrique n’ouvre aucun écran', () => {
    expect(build({ archetype: 'ITI' })).toEqual([]);
    expect(build({ archetype: 'FMA' })).toEqual([]);
    expect(isPortalSupportedArchetype('ITI')).toBe(false);
    expect(isPortalSupportedArchetype('HEB')).toBe(true);
  });

  it('resolvePortalArchetype est fail-CLOSED sur les types inconnus, ORG et non couverts', () => {
    expect(resolvePortalArchetype('HLO')).toBe('HEB');
    expect(resolvePortalArchetype('RES')).toBe('RES');
    expect(resolvePortalArchetype('ACT')).toBe('ASC');
    expect(resolvePortalArchetype('ORG')).toBeNull();
    expect(resolvePortalArchetype('ITI')).toBeNull(); // archétype connu, mais AUCUNE rubrique
    expect(resolvePortalArchetype('ZZZ')).toBeNull();
    expect(resolvePortalArchetype(null)).toBeNull();
    expect(resolvePortalArchetype('')).toBeNull();
  });
});

describe('buildPortalRubrics — visibilité et états', () => {
  it('un module masqué par l’office retire sa rubrique ; un module dégradé la rend « unavailable »', () => {
    const rubrics = build({
      draft: draft({ pricing: { prices: [], unavailableReason: 'x' } }),
      masked: ['descriptions'],
    });
    expect(rubrics.some((r) => r.id === 'presentation')).toBe(false);
    const pricing = rubrics.find((r) => r.id === 'pricing');
    expect(pricing?.state).toBe('unavailable');
    // Le motif BRUT est du jargon back-office : il ne doit jamais atteindre l'écran.
    expect(pricing?.readOnlyReason).toBe(PORTAL_UNAVAILABLE_REASON);
    expect(pricing?.readOnlyReason).not.toContain('x');
  });

  it('le plancher serveur retire aussi la rubrique', () => {
    expect(build({ floor: [...floor, 'contacts'] }).some((r) => r.id === 'contacts')).toBe(false);
  });

  it('priorité des états : pending PRIME sur rejected (corrigé puis renvoyé)', () => {
    const r = build({ dirty: { contacts: true }, pendingModules: new Set(['contacts']), rejectedModules: new Set(['contacts']) });
    expect(r.find((x) => x.id === 'contacts')?.state).toBe('pending');
  });

  it('refusé et NON renvoyé reste « à reprendre »', () => {
    expect(build({ rejectedModules: new Set(['contacts']) }).find((x) => x.id === 'contacts')?.state).toBe('rejected');
  });

  it('dirty prime sur filled, filled prime sur todo', () => {
    const filledDraft = draft({
      contacts: { kindOptions: [], webItems: [], objectItems: [{ id: 'c1', kindCode: 'phone', value: '0262 00', isPublic: true }] },
    });
    expect(build({ draft: filledDraft }).find((r) => r.id === 'contacts')?.state).toBe('filled');
    expect(build({ draft: filledDraft, dirty: { contacts: true } }).find((r) => r.id === 'contacts')?.state).toBe('dirty');
    expect(build().find((r) => r.id === 'contacts')?.state).toBe('todo');
  });

  it('unavailable prime sur tout le reste (jamais soumis, même modifié)', () => {
    const r = build({
      draft: draft({ characteristics: { selectedAmenityCodes: [], selectedPaymentCodes: [], amenityGroups: [], paymentOptions: [], unavailableReason: 'catalogue indisponible' } }),
      dirty: { characteristics: true },
      pendingModules: new Set(['characteristics']),
    });
    expect(r.find((x) => x.id === 'amenities')?.state).toBe('unavailable');
  });

  it('un refus de DROITS (disabledReason) ferme la rubrique comme une donnée absente', () => {
    const permissions = {
      contacts: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Vos droits actuels ne permettent pas…' },
    } as unknown as ObjectWorkspacePermissions;
    const r = build({ permissions });
    expect(r.find((x) => x.id === 'contacts')?.state).toBe('unavailable');
    // Le champ est OPPOSÉ à unavailableReason : sans le chaînage en OU, la rubrique resterait
    // éditable et l'envoi serait refusé côté serveur, sans explication à l'écran.
    expect(r.find((x) => x.id === 'presentation')?.state).not.toBe('unavailable');
  });

  it('les horaires saisonniers restent visibles mais en lecture seule', () => {
    const twoPeriods = draft({
      openings: {
        periods: [
          { recordId: 'p1', isClosure: false, recurrence: 'always', closedDays: [], weekdays: [{ code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }] }], startDate: '', endDate: '' },
          { recordId: 'p2', isClosure: false, recurrence: 'cyclic', closedDays: [], weekdays: [], startDate: '2026-07-01', endDate: '2026-08-31' },
        ],
        periodTypeOptions: [],
        unavailableReason: null,
      },
    });
    const hours = build({ draft: twoPeriods }).find((r) => r.id === 'hours');
    expect(hours?.state).toBe('filled');
    expect(hours?.readOnlyReason).toMatch(/saison/i);
  });
});

describe('liaisons PURES vers le motif d’indisponibilité', () => {
  it('contacts et descriptions n’ont AUCUN motif racine — la liaison rend null, pas undefined', () => {
    const withGarbage = draft({
      contacts: { objectItems: [], webItems: [], kindOptions: [], unavailableReason: 'ne devrait pas être lu' },
      descriptions: { localLanguage: 'fr', object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } }, unavailableReason: 'ne devrait pas être lu' },
    });
    const contacts = PORTAL_RUBRICS.find((r) => r.id === 'contacts');
    const presentation = PORTAL_RUBRICS.find((r) => r.id === 'presentation');
    expect(contacts?.readUnavailableReason(withGarbage)).toBeNull();
    expect(presentation?.readUnavailableReason(withGarbage)).toBeNull();
  });

  it('chaque autre rubrique lit le chemin EXACT de sa tranche', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['hours', { openings: { periods: [], periodTypeOptions: [], unavailableReason: 'motif-openings' } }],
      ['season', { openings: { periods: [], periodTypeOptions: [], unavailableReason: 'motif-openings' } }],
      ['amenities', { characteristics: { selectedAmenityCodes: [], selectedPaymentCodes: [], amenityGroups: [], paymentOptions: [], unavailableReason: 'motif-characteristics' } }],
      ['welcome', { capacityPolicies: { capacityItems: [], metricOptions: [], petPolicy: { accepted: null, conditions: '' }, groupPolicy: {}, stayPolicy: {}, unavailableReason: 'motif-capacity' } }],
      ['pricing', { pricing: { prices: [], priceKindOptions: [], priceUnitOptions: [], priceTypeOptions: [], discounts: [], promotions: [], unavailableReason: 'motif-pricing' } }],
      ['activity', { activity: { durationMin: '', minParticipants: '', maxParticipants: '', minAge: '', unavailableReason: 'motif-activity' } }],
    ];
    for (const [id, over] of cases) {
      const rubric = PORTAL_RUBRICS.find((r) => r.id === id);
      expect(rubric).toBeDefined();
      expect(rubric?.readUnavailableReason(draft(over))).toMatch(/^motif-/);
      expect(rubric?.readUnavailableReason(draft())).toBeNull();
    }
  });

  it('la panne des promotions ne ferme PAS les tarifs (cousin, autre concept)', () => {
    const pricing = PORTAL_RUBRICS.find((r) => r.id === 'pricing');
    const withPromoOutage = draft({
      pricing: { prices: [], priceKindOptions: [], priceUnitOptions: [], priceTypeOptions: [], discounts: [], promotions: [], promotionsUnavailableReason: 'promo down', unavailableReason: null },
    });
    expect(pricing?.readUnavailableReason(withPromoOutage)).toBeNull();
  });
});

const BANNED = /\b(canonique|mod[ée]ration|soumission|module|section|workspace|contributeur|pending|diff|rpc|json|prestataire|HEB|RES|OTI|HLO|PSV)\b/i;

describe('vocabulaire et intégrité du registre', () => {

  it('chaque rubrique porte un module hors plancher et un titre sans jargon', () => {
    for (const rubric of PORTAL_RUBRICS) {
      expect(floor).not.toContain(rubric.module);
      expect(rubric.title).not.toMatch(BANNED);
      expect(rubric.title.length).toBeGreaterThan(3);
    }
  });

  it('les résumés et les motifs affichés restent en français courant', () => {
    for (const rubric of build({ archetype: 'HEB', draft: draft() })) {
      expect(rubric.summary(draft(), 'HEB')).not.toMatch(BANNED);
    }
    expect(PORTAL_UNAVAILABLE_REASON).not.toMatch(BANNED);
    expect(PORTAL_UNAVAILABLE_REASON).toMatch(/office/i);
  });

  it('les identifiants de rubrique sont uniques', () => {
    const ids = PORTAL_RUBRICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exception locale : le portail ne dit jamais « prestataire »', () => {
    // TYPE_LABEL.PSV vaut littéralement « Prestataire » et vient de la taxonomie PARTAGÉE
    // (Explorer, CRM, éditeur) : on ne la touche pas, on la surcharge ICI.
    expect(portalTypeLabel('PSV')).not.toMatch(/prestataire/i);
    expect(portalTypeLabel('HLO')).toBe('Gîtes, meublés & chambres d’hôtes');
    // La garde balaie la taxonomie ENTIÈRE, pas une liste recopiée : un libellé proscrit
    // ajouté demain doit faire rougir ce test tout seul.
    for (const code of Object.keys(TYPE_LABEL)) {
      expect(portalTypeLabel(code)).not.toMatch(BANNED);
    }
  });

  it('un code de type inconnu ne rend RIEN — jamais le code lui-même', () => {
    // Sans ça, seule la garde de l'appelant empêche « ZZZ » d'atteindre l'écran d'un
    // partenaire ; la fonction doit être fail-closed par elle-même.
    expect(portalTypeLabel('ZZZ')).toBe('');
    expect(portalTypeLabel(null)).toBe('');
    expect(portalTypeLabel('')).toBe('');
  });

  it('les catalogues et les listes de types sont GELÉS (un consommateur ne peut pas les muter)', () => {
    expect(Object.isFrozen(PORTAL_AMENITY_CODES)).toBe(true);
    for (const codes of Object.values(PORTAL_AMENITY_CODES)) expect(Object.isFrozen(codes)).toBe(true);
    expect(Object.isFrozen(PORTAL_PAYMENT_CODES)).toBe(true);
    expect(Object.isFrozen(PORTAL_RUBRICS)).toBe(true);
    for (const rubric of PORTAL_RUBRICS) expect(Object.isFrozen(rubric.archetypes)).toBe(true);
  });
});

describe('catalogues curés', () => {
  it('PORTAL_AMENITY_CODES : ≤ 12 codes par type, uniques, sans famille accessibilité', () => {
    for (const archetype of Object.keys(PORTAL_AMENITY_CODES) as ArchetypeCode[]) {
      const codes = PORTAL_AMENITY_CODES[archetype];
      expect(codes.length).toBeLessThanOrEqual(12);
      expect(new Set(codes).size).toBe(codes.length);
      for (const code of codes) {
        expect(code).toMatch(/^[a-z0-9_]+$/);
        // Les codes acc_* relèvent de la famille `accessibility` : le partenaire ne les
        // saisit pas ici, et setAmenities les préserve précisément parce qu'ils sont cachés.
        expect(code.startsWith('acc_')).toBe(false);
      }
    }
    expect(PORTAL_AMENITY_CODES.ITI).toEqual([]);
    expect(PORTAL_AMENITY_CODES.FMA).toEqual([]);
    // 18b a seedé les trois modes de visite : VIS peut enfin s'appuyer dessus.
    expect(PORTAL_AMENITY_CODES.VIS).toEqual(expect.arrayContaining(['visite_libre', 'visite_guidee', 'audioguide']));
  });

  it('PORTAL_PRICE_UNIT : « par personne », jamais « par couvert » (vocabulaire métier)', () => {
    expect(PORTAL_PRICE_UNIT).toEqual({ HEB: 'par_nuit', RES: 'par_personne', VIS: 'par_personne', ASC: 'par_personne' });
  });

  it('PORTAL_HEADLINE_METRIC et PORTAL_PAYMENT_CODES', () => {
    expect(PORTAL_HEADLINE_METRIC).toEqual({ HEB: 'max_capacity', RES: 'seats' });
    expect(PORTAL_PAYMENT_CODES.length).toBeGreaterThan(0);
    expect(new Set(PORTAL_PAYMENT_CODES).size).toBe(PORTAL_PAYMENT_CODES.length);
  });

  it('toute rubrique « welcome » d’un type a sa mesure phare, et toute rubrique tarif son unité', () => {
    for (const archetype of ['HEB', 'RES', 'ASC', 'VIS', 'SRV'] as ArchetypeCode[]) {
      const ids = build({ archetype }).map((r) => r.id);
      if (ids.includes('welcome')) expect(PORTAL_HEADLINE_METRIC[archetype]).toBeTruthy();
      if (ids.includes('pricing')) expect(PORTAL_PRICE_UNIT[archetype]).toBeTruthy();
    }
  });
});

describe('isFilled / summary', () => {
  it('coordonnées : une ligne publique avec une valeur suffit', () => {
    const contacts = PORTAL_RUBRICS.find((r) => r.id === 'contacts');
    const filled = draft({ contacts: { kindOptions: [], webItems: [], objectItems: [{ id: 'c1', kindCode: 'email', value: 'a@b.re', isPublic: true }] } });
    expect(contacts?.isFilled(draft(), 'RES')).toBe(false);
    expect(contacts?.isFilled(filled, 'RES')).toBe(true);
    expect(contacts?.summary(filled, 'RES')).toContain('a@b.re');
  });

  it('présentation : accroche ET texte requis', () => {
    const presentation = PORTAL_RUBRICS.find((r) => r.id === 'presentation');
    const half = draft({ descriptions: { localLanguage: 'fr', object: { chapo: { baseValue: 'Accroche', values: { fr: 'Accroche' } }, description: { baseValue: '', values: {} } } } });
    const full = draft({ descriptions: { localLanguage: 'fr', object: { chapo: { baseValue: 'Accroche', values: { fr: 'Accroche' } }, description: { baseValue: 'Texte', values: { fr: 'Texte' } } } } });
    expect(presentation?.isFilled(half, 'RES')).toBe(false);
    expect(presentation?.isFilled(full, 'RES')).toBe(true);
    expect(presentation?.summary(full, 'RES')).toBe('Accroche');
  });

  it('accueil : le tri-état animaux « non renseigné » ne compte pas comme rempli', () => {
    const welcome = PORTAL_RUBRICS.find((r) => r.id === 'welcome');
    expect(welcome?.isFilled(draft(), 'HEB')).toBe(false);
    const answered = draft({
      capacityPolicies: {
        capacityItems: [{ recordId: 'c', metricId: 'm1', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '4', effectiveFrom: '', effectiveTo: '' }],
        metricOptions: [{ code: 'max_capacity', id: 'm1', label: 'Capacité max.' }],
        petPolicy: { accepted: false, conditions: '' },
        groupPolicy: {},
        stayPolicy: {},
        unavailableReason: null,
      },
    });
    expect(welcome?.isFilled(answered, 'HEB')).toBe(true);
  });
});
