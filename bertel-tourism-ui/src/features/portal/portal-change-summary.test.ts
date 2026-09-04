/**
 * D12 — projection LISIBLE d'une modification.
 *
 * L'enveloppe contributeur met dans metadata.field/before/after le JSON.stringify de la
 * tranche ENTIÈRE (catalogues compris), capé à 4000 caractères : illisible pour l'agent
 * d'office qui valide. Le portail SURCHARGE ces trois clés présentationnelles — et rien
 * d'autre : section, rpc, manual_apply et payload restent byte-identiques, ce sont les
 * seules que le serveur valide.
 */
import { describePortalChange } from './portal-change-summary';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

const modules = (over: Record<string, unknown>) => over as unknown as ObjectWorkspaceModules;

describe('describePortalChange', () => {
  it('contacts : une ligne par coordonnée changée, en clair', () => {
    const base = modules({ contacts: { objectItems: [{ id: 'c1', kindCode: 'phone', value: '0262 00', isPublic: true }] } });
    const next = modules({
      contacts: {
        objectItems: [
          { id: 'c1', kindCode: 'phone', value: '0692 00', isPublic: true },
          { id: 'c2', kindCode: 'email', value: 'a@b.re', isPublic: true },
        ],
      },
    });
    expect(describePortalChange('contacts', base, next, 'RES')).toEqual({
      field: 'Vos coordonnées',
      before: 'Téléphone : 0262 00',
      after: 'Téléphone : 0692 00\nE-mail : a@b.re',
    });
  });

  it('contacts : une ligne interne n’apparaît jamais dans le message à l’office', () => {
    const base = modules({ contacts: { objectItems: [] } });
    const next = modules({
      contacts: {
        objectItems: [
          { id: 'c1', kindCode: 'fax', value: '0262 11', isPublic: false },
          { id: 'c2', kindCode: 'phone', value: '0692 00', isPublic: true },
        ],
      },
    });
    expect(describePortalChange('contacts', base, next, 'RES').after).toBe('Téléphone : 0692 00');
  });

  it('borne les textes longs à 4000 caractères comme l’enveloppe d’origine', () => {
    const long = 'x'.repeat(5000);
    const base = modules({ descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } } } });
    const next = modules({ descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: long, values: { fr: long } } } } });
    expect(describePortalChange('descriptions', base, next, 'RES').after.length).toBeLessThanOrEqual(4000);
  });

  it('descriptions : accroche et présentation nommées en clair', () => {
    const base = modules({ descriptions: { object: { chapo: { baseValue: 'A', values: { fr: 'A' } }, description: { baseValue: 'B', values: { fr: 'B' } } } } });
    const next = modules({ descriptions: { object: { chapo: { baseValue: 'A2', values: { fr: 'A2' } }, description: { baseValue: 'B', values: { fr: 'B' } } } } });
    const change = describePortalChange('descriptions', base, next, 'RES');
    expect(change.field).toBe('Présentez votre établissement');
    expect(change.before).toBe('Accroche : A\nPrésentation : B');
    expect(change.after).toBe('Accroche : A2\nPrésentation : B');
  });

  it('horaires : un jour par ligne, la sentinelle dite en toutes lettres', () => {
    const period = (weekdays: unknown[]) => ({
      periods: [{ recordId: 'p1', isClosure: false, recurrence: 'always', startDate: '', endDate: '', closedDays: [], weekdays }],
    });
    const base = modules({ openings: period([{ code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }] }]) });
    const next = modules({
      openings: period([
        { code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        { code: 'tuesday', label: 'mardi', slots: [{ start: '', end: '' }] },
      ]),
    });
    const change = describePortalChange('openings', base, next, 'RES');
    expect(change.field).toBe('Vos horaires');
    expect(change.before).toBe('Lundi : 09:00–12:00');
    expect(change.after).toBe('Lundi : 09:00–12:00, 14:00–18:00\nMardi : ouvert, sans horaires fixes');
  });

  it('hébergement : la même tranche se lit « ouvert toute l’année » et « fermé du … au … »', () => {
    const base = modules({ openings: { periods: [] } });
    const next = modules({
      openings: {
        periods: [
          { recordId: 'p1', isClosure: false, recurrence: 'always', startDate: '', endDate: '', closedDays: [], weekdays: [] },
          { recordId: 'p9', isClosure: true, recurrence: 'fixed', startDate: '2026-12-24', endDate: '2026-12-26', label: 'Fêtes', closedDays: [], weekdays: [] },
        ],
      },
    });
    const change = describePortalChange('openings', base, next, 'HEB');
    expect(change.field).toBe('Ouverture et fermetures');
    expect(change.before).toBe('Ouvert toute l’année : non renseigné');
    expect(change.after).toBe('Ouvert toute l’année : oui\nFermé du 24/12/2026 au 26/12/2026 (Fêtes)');
  });

  it('équipements et paiements : les libellés, jamais les codes', () => {
    const shape = (amenities: string[], payments: string[]) => ({
      characteristics: {
        selectedAmenityCodes: amenities,
        selectedPaymentCodes: payments,
        amenityGroups: [{ familyCode: 'general', familyLabel: 'Général', options: [{ id: 'a1', code: 'wifi', label: 'Wi-Fi' }, { id: 'a2', code: 'parking', label: 'Parking' }] }],
        paymentOptions: [{ id: 'p1', code: 'carte_bleue', label: 'Carte Bleue' }],
      },
    });
    const change = describePortalChange('characteristics', modules(shape(['wifi'], [])), modules(shape(['wifi', 'parking'], ['carte_bleue'])), 'RES');
    expect(change.field).toBe('Équipements et moyens de paiement');
    expect(change.before).toBe('Équipements : Wi-Fi');
    expect(change.after).toBe('Équipements : Wi-Fi, Parking\nPaiement : Carte Bleue');
  });

  it('accueil : capacité, animaux en tri-état, arrivée et départ', () => {
    const shape = (over: Record<string, unknown>) => ({
      capacityPolicies: {
        metricOptions: [{ id: 'm1', code: 'max_capacity', label: 'Capacité max.' }],
        capacityItems: [],
        petPolicy: { accepted: null, conditions: '' },
        stayPolicy: { checkInFrom: '', checkInUntil: '', checkOutUntil: '', conditions: '' },
        groupPolicy: {},
        ...over,
      },
    });
    const before = modules(shape({}));
    const after = modules(
      shape({
        capacityItems: [{ recordId: 'c', metricId: 'm1', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '4', effectiveFrom: '', effectiveTo: '' }],
        petPolicy: { accepted: true, conditions: 'petits chiens' },
        stayPolicy: { checkInFrom: '16:00', checkInUntil: '', checkOutUntil: '10:00', conditions: '' },
      }),
    );
    const change = describePortalChange('capacity-policies', before, after, 'HEB');
    expect(change.before).toBe('Animaux : non renseigné');
    expect(change.after).toBe('Capacité max. : 4\nAnimaux : oui (petits chiens)\nArrivée : à partir de 16:00 · Départ : avant 10:00');
  });

  it('tarifs : « à partir de », avec l’unité en toutes lettres', () => {
    const shape = (prices: unknown[]) => ({
      pricing: {
        prices,
        priceUnitOptions: [{ id: 'u1', code: 'par_nuit', label: 'Par nuit' }],
        priceKindOptions: [],
        priceTypeOptions: [],
        discounts: [],
        promotions: [],
      },
    });
    const before = modules(shape([]));
    const after = modules(shape([{ recordId: 'p1', kindCode: 'adulte', indicationCode: 'principal', unitCode: 'par_nuit', unitLabel: 'Par nuit', amount: '45', amountMax: '', currency: 'EUR' }]));
    const change = describePortalChange('pricing', before, after, 'HEB');
    expect(change.field).toBe('Vos tarifs');
    expect(change.before).toBe('Aucun tarif indiqué');
    expect(change.after).toBe('À partir de 45 € par nuit');
  });

  it('tarifs : « gratuit » se dit gratuit', () => {
    const shape = (prices: unknown[]) => ({ pricing: { prices, priceUnitOptions: [], priceKindOptions: [], priceTypeOptions: [], discounts: [], promotions: [] } });
    const after = modules(shape([{ recordId: 'p1', kindCode: 'gratuit', indicationCode: 'principal', unitCode: '', unitLabel: '', amount: '0', amountMax: '', currency: 'EUR' }]));
    expect(describePortalChange('pricing', modules(shape([])), after, 'VIS').after).toBe('Gratuit');
  });

  it('activité : durée, participants et âge sur une ligne', () => {
    const before = modules({ activity: { durationMin: '', minParticipants: '', maxParticipants: '', minAge: '' } });
    const after = modules({ activity: { durationMin: '120', minParticipants: '2', maxParticipants: '8', minAge: '6' } });
    const change = describePortalChange('activity', before, after, 'ASC');
    expect(change.field).toBe('Votre activité');
    expect(change.after).toBe('Durée : 120 min · 2 à 8 personnes · dès 6 ans');
  });

  it('ne jette pas sur une tranche absente ou abîmée', () => {
    const empty = modules({});
    expect(() => describePortalChange('contacts', empty, empty, 'RES')).not.toThrow();
    expect(describePortalChange('contacts', empty, empty, 'RES')).toEqual({ field: 'Vos coordonnées', before: '', after: '' });
  });

  it('le type est OBLIGATOIRE : deux rubriques partagent le module `openings`', () => {
    // Un défaut « restaurant » ferait lire « Lundi : … » à l'office pour un hébergement,
    // sur le texte même dont il dépend pour accepter ou refuser. Le paramètre est requis :
    // le typecheck refuse l'appel à trois arguments (garde à la compilation).
    const stay = modules({ openings: { periods: [{ recordId: 'p1', isClosure: false, recurrence: 'always', startDate: '', endDate: '', closedDays: [], weekdays: [] }] } });
    expect(describePortalChange('openings', stay, stay, 'HEB').field).toBe('Ouverture et fermetures');
    expect(describePortalChange('openings', stay, stay, 'RES').field).toBe('Vos horaires');
  });

  it('un module hors registre garde son identifiant comme libellé', () => {
    const empty = modules({});
    expect(describePortalChange('tags', empty, empty, 'RES').field).toBe('tags');
  });
});
