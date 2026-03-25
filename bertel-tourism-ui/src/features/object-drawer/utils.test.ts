import { mockObjectDetails } from '../../data/mock';
import {
  parseActors,
  parseCapacities,
  parseContacts,
  parseExternalSyncs,
  parseItinerarySummary,
  parseMedia,
  parseMemberships,
  parseOpenings,
  parsePetPolicy,
  parsePrices,
  parseRelatedObjects,
  parseTaxonomyGroups,
} from './utils';

describe('object drawer utils', () => {
  it('parses memberships from structured object payloads', () => {
    const raw = (mockObjectDetails.HOTRUN0000000001.raw ?? {}) as Record<string, unknown>;
    const memberships = parseMemberships(raw);

    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      name: 'Club Hebergement Premium',
      tier: 'Gold',
      status: 'Active',
    });
  });

  it('parses external sync references from structured object payloads', () => {
    const raw = (mockObjectDetails.HOTRUN0000000001.raw ?? {}) as Record<string, unknown>;
    const syncItems = parseExternalSyncs(raw);

    expect(syncItems).toHaveLength(2);
    expect(syncItems[0]).toMatchObject({
      source: 'APIDAE',
      externalId: 'api-974-HOT-1001',
      status: 'Synced',
    });
  });

  it('parses deep-data actors and nested contacts', () => {
    const raw = {
      actors: [
        {
          id: 'actor-1',
          display_name: 'Jean Dupont',
          role: { code: 'manager', name: 'Gestionnaire' },
          contacts: [
            {
              id: 'contact-1',
              kind: { code: 'email', name: 'Email' },
              role: { code: 'work', name: 'Professionnel' },
              value: 'jean@example.com',
            },
          ],
        },
      ],
    } as Record<string, unknown>;

    const actors = parseActors(raw);

    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({
      name: 'Jean Dupont',
      role: 'Gestionnaire',
    });
    expect(actors[0].contacts).toContain('Professionnel: jean@example.com');
  });

  it('flattens nested price periods and opening schedules from backend payloads', () => {
    const raw = {
      object_prices: [
        {
          kind: { name: 'Chambre double' },
          currency_code: 'EUR',
          object_price_periods: [
            {
              amount: 180,
              start_date: '2026-07-01',
              end_date: '2026-08-31',
              conditions: 'Haute saison',
            },
          ],
        },
      ],
      opening_periods: [
        {
          label: 'Vacances',
          date_start: '2026-07-01',
          date_end: '2026-08-31',
          opening_schedules: [
            {
              schedule_type: { name: 'Hebdomadaire' },
              opening_time_periods: [
                {
                  opening_time_period_weekdays: [
                    { weekday: { code: 'mon', name: 'Lundi' } },
                    { weekday: { code: 'tue', name: 'Mardi' } },
                  ],
                  opening_time_frames: [
                    { start_time: '09:00', end_time: '18:00' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as Record<string, unknown>;

    const prices = parsePrices(raw);
    const openings = parseOpenings(raw);

    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({
      label: 'Chambre double',
      amount: '180',
      currency: 'EUR',
    });
    expect(prices[0].details).toContain('Haute saison');

    expect(openings).toHaveLength(1);
    expect(openings[0].slots).toContain('09:00 -> 18:00');
    expect(openings[0].weekdays).toContain('Lundi');
  });

  it('parses taxonomy groups, media metadata and capacity arrays', () => {
    const raw = {
      media: [
        {
          id: 'media-main',
          url: 'https://example.com/main.jpg',
          title: 'Facade ocean',
          is_main: true,
          credit: 'Studio Rivage',
          visibility: 'public',
          position: 2,
          tags: [{ name: 'facade' }, 'premium'],
        },
        {
          id: 'media-secondary',
          url: 'https://example.com/secondary.jpg',
          title: 'Piscine',
          position: 1,
        },
      ],
      capacity: [
        { code: { name: 'Personnes' }, value: 120 },
        { label: 'Chambres', count: 28 },
      ],
      tags: [{ id: 'tag-1', name: 'Vue mer' }],
      classifications: [{ id: 'class-1', scheme: { name: 'Etoiles' }, value: { name: '4 etoiles' } }],
      sustainability_action_labels: [
        { label: { value_name: 'Clef verte', scheme_name: 'Eco' }, action: { name: 'Gestion eau' } },
      ],
      environment_tags: [{ id: 'env-1', name: 'Littoral' }],
      payment_methods: [{ id: 'pay-1', name: 'CB' }],
      languages: [{ id: 'lang-1', name: 'Francais' }],
      practices: [{ id: 'prac-1', name: 'Bien-etre' }],
      pet_policy: { accepted: true, note: 'Supplement menage' },
    } as Record<string, unknown>;

    const media = parseMedia(raw);
    const capacities = parseCapacities(raw);
    const groups = parseTaxonomyGroups(raw);
    const petPolicy = parsePetPolicy(raw);

    expect(media[0]).toMatchObject({
      id: 'media-main',
      isMain: true,
      credit: 'Studio Rivage',
      visibility: 'public',
      position: '2',
    });
    expect(media[0].tags).toEqual(['facade', 'premium']);

    expect(capacities).toEqual([
      { id: 'capacity-Personnes', label: 'Personnes', value: '120' },
      { id: 'capacity-Chambres', label: 'Chambres', value: '28' },
    ]);

    expect(groups.map((group) => group.key)).toEqual(
      expect.arrayContaining(['tags', 'classifications', 'sustainability', 'environment', 'payments', 'languages', 'practices']),
    );
    expect(groups.find((group) => group.key === 'tags')?.items[0].label).toBe('Vue mer');
    expect(petPolicy).toMatchObject({
      accepted: true,
      label: 'Animaux acceptes',
    });
    expect(petPolicy?.details).toContain('Supplement menage');
  });

  it('keeps public contacts only and builds usable href metadata', () => {
    const raw = {
      contacts: [
        {
          id: 'contact-1',
          label: 'Accueil',
          kind_code: 'phone',
          kind_name: 'Telephone',
          value: '+262 262 00 00 00',
          is_primary: true,
          is_public: true,
          position: 2,
        },
        {
          id: 'contact-2',
          label: 'Site',
          kind_code: 'website',
          value: 'hotel-example.re',
          is_public: true,
          position: 3,
        },
        {
          id: 'contact-3',
          label: 'Interne',
          kind_code: 'email',
          value: 'private@example.com',
          is_public: false,
        },
      ],
    } as Record<string, unknown>;

    const contacts = parseContacts(raw);

    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({
      id: 'contact-1',
      kindCode: 'phone',
      href: 'tel:+262262000000',
      isPrimary: true,
    });
    expect(contacts[1]).toMatchObject({
      id: 'contact-2',
      kindCode: 'website',
      href: 'https://hotel-example.re',
    });
  });

  it('parses itinerary summaries and related objects from nested payloads', () => {
    const raw = {
      itinerary: {
        distance_km: 12.5,
        duration_hours: 4.2,
        difficulty_level: 'Intermediaire',
        elevation_gain: 540,
        is_loop: true,
        track: 'track-data',
        track_format: 'gpx',
      },
      itinerary_details: {
        practices: [{ id: 'practice-1', name: 'Randonnee' }],
        info: { summary: 'Depart tres tot conseille' },
        sections: [{ id: 'section-1' }, { id: 'section-2' }],
        stages: [{ id: 'stage-1' }],
        profiles: [{ id: 'profile-1' }],
        associated_objects: [
          {
            id: 'poi-1',
            name: 'Belvedere des hauts',
            type: 'POI',
            relation_type: { name: 'Etape' },
          },
        ],
      },
      relations: {
        out: [
          {
            relation_type: { name: 'Acces' },
            target: { id: 'srv-1', name: 'Parking forestier', type: 'SRV' },
          },
        ],
        in: [
          {
            relation_type: { name: 'Anime' },
            source: { id: 'actor-1', name: 'Guide local', type: 'ACT' },
          },
        ],
      },
    } as Record<string, unknown>;

    const itinerary = parseItinerarySummary(raw);
    const related = parseRelatedObjects(raw);

    expect(itinerary).toMatchObject({
      distanceKm: '12.5',
      durationHours: '4.2',
      difficulty: 'Intermediaire',
      elevationGain: '540',
      isLoop: true,
      track: 'track-data',
      trackFormat: 'gpx',
      sectionsCount: 2,
      stagesCount: 1,
      profilesCount: 1,
    });
    expect(itinerary?.practices).toContain('Randonnee');
    expect(itinerary?.info).toContain('Depart tres tot conseille');

    expect(related).toHaveLength(3);
    expect(related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Belvedere des hauts', direction: 'associated', relationship: 'Etape' }),
        expect.objectContaining({ name: 'Parking forestier', direction: 'out', relationship: 'Acces' }),
        expect.objectContaining({ name: 'Guide local', direction: 'in', relationship: 'Anime' }),
      ]),
    );
  });
});
