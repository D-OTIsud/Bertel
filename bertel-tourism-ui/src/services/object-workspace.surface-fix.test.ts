import {
  buildPlacesRpcPayload,
  buildRoomsRpcPayload,
  mergeEstablishmentAmenitySelection,
  validateActivityModule,
} from './object-workspace';
import type { ObjectWorkspaceActivityModule, ObjectWorkspacePlacesModule, ObjectWorkspaceRoomsModule } from './object-workspace-parser';

describe('validateActivityModule', () => {
  const base: ObjectWorkspaceActivityModule = {
    durationMin: '60',
    minParticipants: '2',
    maxParticipants: '10',
    difficultyLevel: '3',
    guideRequired: true,
    minAge: '8',
    equipmentProvided: false,
    equipmentProvidedDetails: '',
    difficultyOptions: [],
    unavailableReason: null,
  };

  it('accepts difficulty 1 and 5', () => {
    expect(() => validateActivityModule({ ...base, difficultyLevel: '1' })).not.toThrow();
    expect(() => validateActivityModule({ ...base, difficultyLevel: '5' })).not.toThrow();
  });

  it('rejects invalid difficulty', () => {
    expect(() => validateActivityModule({ ...base, difficultyLevel: '0' })).toThrow(/1 et 5/);
    expect(() => validateActivityModule({ ...base, difficultyLevel: 'facile' })).toThrow(/1 et 5/);
  });

  it('rejects non-integer garbage instead of silently truncating (Number.parseInt trap)', () => {
    expect(() => validateActivityModule({ ...base, difficultyLevel: '3abc' })).toThrow(/1 et 5/);
    expect(() => validateActivityModule({ ...base, durationMin: '60abc' })).toThrow(/positive/);
    expect(() => validateActivityModule({ ...base, minParticipants: '2abc' })).toThrow(/participants/);
    expect(() => validateActivityModule({ ...base, maxParticipants: '10abc' })).toThrow(/entier valide/);
    expect(() => validateActivityModule({ ...base, minAge: '8abc' })).toThrow(/âge minimum/);
  });

  it('rejects decimal values instead of silently truncating', () => {
    expect(() => validateActivityModule({ ...base, difficultyLevel: '3.7' })).toThrow(/1 et 5/);
    expect(() => validateActivityModule({ ...base, durationMin: '60.5' })).toThrow(/positive/);
    expect(() => validateActivityModule({ ...base, minAge: '8.2' })).toThrow(/âge minimum/);
  });

  it('accepts well-formed integers, including negative-sign-free zero for age', () => {
    expect(() => validateActivityModule({ ...base, durationMin: '90', minParticipants: '1', maxParticipants: '20', minAge: '0' })).not.toThrow();
  });

  it('still enforces max >= min for well-formed integers', () => {
    expect(() => validateActivityModule({ ...base, minParticipants: '10', maxParticipants: '2' })).toThrow(/supérieur ou égal/);
  });
});

describe('buildPlacesRpcPayload', () => {
  it('maps secondary sites with visibility and paired coordinates', () => {
    const input: ObjectWorkspacePlacesModule = {
      unavailableReason: null,
      items: [{
        recordId: '11111111-1111-4111-8111-111111111111',
        label: 'Départ',
        position: 0,
        descriptionRecordId: null,
        description: { baseValue: 'RDV', values: {} },
        visibility: 'partners',
        location: {
          recordId: null,
          address1: '1 rue Test',
          address1Suite: '',
          address2: '',
          address3: '',
          postcode: '97400',
          city: 'Saint-Denis',
          codeInsee: '97411',
          lieuDit: '',
          direction: '',
          latitude: '-21.0',
          longitude: '55.5',
          zoneTouristique: '',
        },
      }],
    };
    const payload = buildPlacesRpcPayload(input) as { places: Record<string, unknown>[] };
    expect(payload.places).toHaveLength(1);
    expect(payload.places[0].visibility).toBeUndefined();
    expect((payload.places[0].descriptions as Record<string, unknown>[])[0].visibility).toBe('partners');
  });
});

describe('buildRoomsRpcPayload', () => {
  it('projects room reconcile shape for save_object_rooms', () => {
    const input: ObjectWorkspaceRoomsModule = {
      items: [{
        recordId: null,
        code: 'dbl',
        name: 'Double',
        nameTranslations: {},
        description: '',
        descriptionTranslations: {},
        capacityAdults: '',
        capacityChildren: '',
        capacityTotal: '2',
        sizeSqm: '',
        bedConfig: '',
        bedConfigTranslations: {},
        quantity: '3',
        floorLevel: '',
        viewTypeId: '',
        viewTypeCode: 'sea',
        viewTypeLabel: '',
        roomTypeId: '',
        roomTypeCode: 'double',
        roomTypeLabel: '',
        basePrice: '',
        currency: 'EUR',
        accessible: false,
        published: true,
        position: '1',
        amenityCodes: ['wifi'],
        mediaIds: [],
        beds: [{ bedTypeId: '', bedTypeCode: 'double', bedTypeLabel: '', quantity: '1' }],
      }],
      viewTypeOptions: [],
      roomTypeOptions: [],
      amenityOptions: [],
      amenityGroups: [],
      bedTypeOptions: [],
      mediaOptions: [],
      unavailableReason: null,
    };
    const payload = buildRoomsRpcPayload(input) as { rooms: Record<string, unknown>[] };
    expect(payload.rooms[0]).toMatchObject({
      code: 'dbl',
      room_type_code: 'double',
      view_type_code: 'sea',
      amenity_codes: ['wifi'],
    });
  });

  it('sends every RoomEditModal-editable field — none silently discarded (SURF3 full-column fix)', () => {
    const input: ObjectWorkspaceRoomsModule = {
      items: [{
        recordId: '11111111-1111-4111-8111-111111111111',
        code: 'dbl',
        name: 'Double',
        nameTranslations: { en: 'Double room' },
        description: 'Chambre double avec vue mer',
        descriptionTranslations: { en: 'Double room with sea view' },
        capacityAdults: '2',
        capacityChildren: '1',
        capacityTotal: '3',
        sizeSqm: '24.5',
        bedConfig: '1 lit double',
        bedConfigTranslations: { en: '1 double bed' },
        quantity: '3',
        floorLevel: '2',
        viewTypeId: '',
        viewTypeCode: 'sea',
        viewTypeLabel: '',
        roomTypeId: '',
        roomTypeCode: 'double',
        roomTypeLabel: '',
        basePrice: '89.9',
        currency: 'EUR',
        accessible: true,
        published: false,
        position: '1',
        amenityCodes: [],
        mediaIds: [],
        beds: [],
      }],
      viewTypeOptions: [],
      roomTypeOptions: [],
      amenityOptions: [],
      amenityGroups: [],
      bedTypeOptions: [],
      mediaOptions: [],
      unavailableReason: null,
    };
    const payload = buildRoomsRpcPayload(input) as { rooms: Record<string, unknown>[] };
    expect(payload.rooms[0]).toMatchObject({
      name_i18n: { en: 'Double room' },
      description: 'Chambre double avec vue mer',
      description_i18n: { en: 'Double room with sea view' },
      capacity_adults: 2,
      capacity_children: 1,
      size_sqm: 24.5,
      bed_config: '1 lit double',
      bed_config_i18n: { en: '1 double bed' },
      floor_level: 2,
      base_price: 89.9,
      currency: 'EUR',
      is_accessible: true,
      is_published: false,
    });
  });

  it('omits empty translation maps as null rather than empty objects', () => {
    const input: ObjectWorkspaceRoomsModule = {
      items: [{
        recordId: null,
        code: 'std',
        name: 'Standard',
        nameTranslations: {},
        description: '',
        descriptionTranslations: {},
        capacityAdults: '',
        capacityChildren: '',
        capacityTotal: '',
        sizeSqm: '',
        bedConfig: '',
        bedConfigTranslations: {},
        quantity: '1',
        floorLevel: '',
        viewTypeId: '',
        viewTypeCode: '',
        viewTypeLabel: '',
        roomTypeId: '',
        roomTypeCode: '',
        roomTypeLabel: '',
        basePrice: '',
        currency: '',
        accessible: false,
        published: true,
        position: '0',
        amenityCodes: [],
        mediaIds: [],
        beds: [],
      }],
      viewTypeOptions: [],
      roomTypeOptions: [],
      amenityOptions: [],
      amenityGroups: [],
      bedTypeOptions: [],
      mediaOptions: [],
      unavailableReason: null,
    };
    const payload = buildRoomsRpcPayload(input) as { rooms: Record<string, unknown>[] };
    expect(payload.rooms[0].name_i18n).toBeNull();
    expect(payload.rooms[0].description_i18n).toBeNull();
    expect(payload.rooms[0].bed_config_i18n).toBeNull();
    expect(payload.rooms[0].capacity_adults).toBeNull();
  });
});

describe('mergeEstablishmentAmenitySelection', () => {
  it('preserves hidden codes when updating visible establishment amenities', () => {
    const visible = new Set(['wifi', 'pool']);
    const merged = mergeEstablishmentAmenitySelection(['wifi', 'pmr_access'], ['pool'], visible);
    expect(merged).toEqual(expect.arrayContaining(['pool', 'pmr_access']));
    expect(merged).not.toContain('wifi');
  });
});
