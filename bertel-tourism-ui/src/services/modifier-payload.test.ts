import { buildModifierDraftFields, buildModifierPayload } from './modifier-payload';
import type { ObjectDetail } from '../types/domain';

describe('modifier payload', () => {
  it('normalizes the enriched modifier surfaces into left-menu friendly buckets', () => {
    const detail: ObjectDetail = {
      id: 'HOT-1',
      name: 'Hotel Basalte',
      type: 'HOT',
      raw: {
        business_timezone: 'Indian/Reunion',
        secondary_types: ['LOI'],
        current_version: 7,
        descriptions: [
          {
            description: 'Description longue',
            description_chapo: 'Chapo court',
            description_adapted: 'Version adaptee',
            description_mobile: 'Version mobile',
            description_edition: 'Version edition',
            sanitary_measures: 'Mesures sanitaires',
          },
        ],
        object_locations: [
          {
            id: 'loc-1',
            object_id: 'HOT-1',
            is_main_location: true,
            address1: '12 promenade',
            city: 'Saint-Pierre',
            postcode: '97410',
            latitude: -21.33,
            longitude: 55.47,
          },
        ],
        object_zones: [{ insee_commune: '97416' }],
        object_places: [
          {
            id: 'place-1',
            label: 'Rooftop',
            is_primary: true,
            location: {
              address1: 'Toit terrasse',
              city: 'Saint-Pierre',
              latitude: -21.331,
              longitude: 55.471,
            },
          },
        ],
        media: [
          {
            id: 'media-1',
            url: 'https://example.com/main.jpg',
            title: 'Facade',
            is_main: true,
            tags: ['facade'],
          },
        ],
        room_types: [
          {
            id: 'room-1',
            name: 'Suite ocean',
            capacity_adults: 4,
            media: [{ id: 'room-media-1', url: 'https://example.com/room.jpg', title: 'Suite' }],
          },
        ],
        prices: [{ label: 'Suite ocean', amount: 280, currency: 'EUR' }],
        opening_times: {
          periods_current: [
            {
              label: 'Toute l annee',
              date_start: '2026-01-01',
              date_end: '2026-12-31',
              weekday_slots: {
                monday: [{ start: '07:00', end: '22:00' }],
              },
            },
          ],
        },
        languages: [{ id: 'lang-1', name: 'Francais' }],
        payment_methods: [{ id: 'pay-1', name: 'CB' }],
        classifications: [{ id: 'class-1', scheme: 'hot_stars', value: '4' }],
        amenities: [{ amenity: { id: 'amenity-1', name: 'Piscine' } }],
        memberships: [{ id: 'membership-1', name: 'Club Premium', status: 'Active' }],
        reviews: [{ id: 'review-1', source: 'google', title: 'Top', rating: 4.8, rating_max: 5 }],
        review_summary: { avg_rating: 4.8, review_count: 12 },
        crm_interactions: [{ id: 'interaction-1', subject: 'Appel', interaction_type: 'call', status: 'done' }],
        crm_tasks: [{ id: 'task-1', title: 'Relancer', status: 'todo', priority: 'high' }],
        legal_records: [{ label: 'Classement', status: 'ok', document_id: 'doc-1' }],
        external_ids: [{ id: 'sync-1', source_system: 'APIDAE', external_id: 'api-1', status: 'Synced' }],
      },
    };

    const payload = buildModifierPayload(detail);
    const draftFields = buildModifierDraftFields(payload);

    expect(payload.identity.businessTimezone).toBe('Indian/Reunion');
    expect(payload.identity.secondaryTypes).toEqual(['LOI']);
    expect(payload.location.places[0]).toMatchObject({
      label: 'Rooftop',
      isPrimary: true,
    });
    expect(payload.media.assets.map((item) => item.context)).toEqual(expect.arrayContaining(['object', 'room']));
    expect(payload.offer.prices).toHaveLength(1);
    expect(payload.crm.reviews).toHaveLength(1);
    expect(payload.crm.tasks).toHaveLength(1);
    expect(payload.navCounts.media).toBeGreaterThanOrEqual(2);
    expect(draftFields['overview.shortDescription']).toBe('Chapo court');
    expect(draftFields['location.city']).toBe('Saint-Pierre');
  });
});
