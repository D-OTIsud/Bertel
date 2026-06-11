import { mockObjectDetails } from '../../data/mock';
import {
  formatOpeningTime,
  getOpeningYearTimelineSegment,
  isOpeningPeriodAllYears,
  parseActors,
  parseCapacities,
  parseContacts,
  parseExternalSyncs,
  parseGroupPolicy,
  parseItinerarySummary,
  parseMedia,
  parseMemberships,
  parseOpenings,
  parsePetPolicy,
  parsePrices,
  parseMeetingRooms,
  parseRelatedObjects,
  parseRoomTypes,
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
    expect(openings[0].slots).toContain('09:00–18:00');
    expect(openings[0].weekdays).toContain('Lundi');
  });

  it('formats opening times without seconds and treats all-year periods as full-year coverage', () => {
    expect(formatOpeningTime('11:00:00')).toBe('11:00');
    expect(formatOpeningTime('11:00')).toBe('11:00');
    expect(formatOpeningTime(null)).toBe('');

    const raw = {
      opening_times: {
        periods_current: [
          {
            all_years: true,
            date_start: null,
            date_end: null,
            weekday_slots: {
              monday: [
                { start: '11:00:00', end: '13:00:00' },
                { start: '18:00:00', end: '22:00:00' },
              ],
            },
          },
        ],
      },
    } as Record<string, unknown>;

    const period = (raw.opening_times as { periods_current: Record<string, unknown>[] }).periods_current[0];
    const openings = parseOpenings(raw);

    expect(isOpeningPeriodAllYears(period)).toBe(true);
    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({
      allYears: true,
      startDate: '',
      endDate: '',
      label: 'Toute l\'annee',
    });
    expect(openings[0].weekdaySlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          weekday: 'Lundi',
          slots: ['11:00–13:00', '18:00–22:00'],
        }),
      ]),
    );
    expect(getOpeningYearTimelineSegment(openings[0])).toEqual({ left: 0, width: 100 });
    expect(openings[0].slots.join(' ')).not.toMatch(/:\d{2}:\d{2}/);
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
      classifications: [{ id: 'class-1', scheme: 'gites_epics', value: '3' }],
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
    expect(groups.find((group) => group.key === 'classifications')?.items[0].label).toBe('Gites de France · 3 epis');
    expect(petPolicy).toMatchObject({
      accepted: true,
      label: 'Animaux acceptes',
    });
    expect(petPolicy?.details).toContain('Supplement menage');
  });

  it('parses live capacity rows with their real metric name and unit (not the generic « Capacite »)', () => {
    // Live get_object_resource shape: metric_code/metric_name/value/unit — the old
    // parser read pre-live keys (code/metric/label) and rendered every row « Capacite ».
    const capacities = parseCapacities({
      capacity: [
        { metric_code: 'max_capacity', metric_name: 'Capacité max.', value: 12, unit: 'pax' },
        { metric_code: 'seats', metric_name: 'Places assises', value: 12, unit: 'seat' },
      ],
    } as Record<string, unknown>);
    expect(capacities).toHaveLength(2);
    expect(capacities[0].label).toBe('Capacité max.');
    expect(capacities[0].value).toBe('12 pax');
    // Equal values across DIFFERENT metrics must not collapse (dedupe by metric, not value).
    expect(capacities[1].label).toBe('Places assises');
  });

  it('parses the group policy (min/max/groupOnly/notes) — the table was write-and-forget', () => {
    const policy = parseGroupPolicy({
      group_policies: [{ min_size: 8, max_size: 40, group_only: true, notes: 'Sur réservation' }],
    } as Record<string, unknown>);
    expect(policy).toEqual({ minSize: '8', maxSize: '40', groupOnly: true, notes: 'Sur réservation' });
    expect(parseGroupPolicy({} as Record<string, unknown>)).toBeNull();
  });

  it('parses the media description (texte alternatif) for the gallery alt', () => {
    const media = parseMedia({
      media: [{ id: 'm1', url: 'https://x/a.jpg', title: 'Facade', description: 'Vue de la facade cote ocean' }],
    } as Record<string, unknown>);
    expect(media[0].description).toBe('Vue de la facade cote ocean');
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

  it('derives a platform display name and favicon for URL-valued contacts', () => {
    const raw = {
      name: 'Le Lagon Bleu',
      contacts: [
        {
          id: 'c-book',
          kind_code: 'booking_engine',
          value: 'https://www.booking.com/hotel/re/lagon.html?aid=1',
          is_public: true,
          position: 1,
        },
        {
          id: 'c-tel',
          kind_code: 'phone',
          value: '+262 262 00 00 00',
          is_public: true,
          position: 2,
        },
      ],
    } as Record<string, unknown>;

    const contacts = parseContacts(raw);
    const booking = contacts.find((contact) => contact.id === 'c-book');
    const phone = contacts.find((contact) => contact.id === 'c-tel');

    // URL contact: name is the platform, favicon derived, full URL kept for the link/copy.
    expect(booking).toMatchObject({
      displayValue: 'Booking.com',
      iconUrl: 'https://icons.duckduckgo.com/ip3/booking.com.ico',
      value: 'https://www.booking.com/hotel/re/lagon.html?aid=1',
    });
    // Non-URL contact: unchanged — raw value shown, no favicon.
    expect(phone).toMatchObject({
      displayValue: '+262 262 00 00 00',
      iconUrl: '',
    });
  });

  it('parses itinerary summaries and related objects from nested payloads', () => {
    const raw = {
      itinerary: {
        distance_km: 12.5,
        duration_min: 252,
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

  it('parses meeting rooms from the live resource shape (to_jsonb cap_* columns)', () => {
    const raw = {
      meeting_rooms: [
        {
          id: 'mr-1',
          name: 'Salle Bras-Long',
          area_m2: 78,
          cap_theatre: 60,
          cap_u: 24,
          cap_classroom: 32,
          cap_boardroom: 20,
          equipment: [{ code: 'projector', name: 'Vidéoprojecteur' }],
        },
      ],
    } as Record<string, unknown>;

    const rooms = parseMeetingRooms(raw);

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      name: 'Salle Bras-Long',
      areaM2: '78',
      capacityTheatre: '60',
      capacityU: '24',
      capacityClassroom: '32',
      capacityBoardroom: '20',
    });
    expect(rooms[0].equipment).toContain('Vidéoprojecteur');
  });

  it('parses room types from the live resource shape (to_jsonb object_room_type columns)', () => {
    const raw = {
      room_types: [
        {
          id: 'rt-1',
          name: 'Chambre standard',
          capacity_adults: 2,
          bed_config: '1 lit double',
          total_rooms: 12,
          amenities: [{ code: 'wifi', name: 'Wi-Fi' }],
        },
      ],
    } as Record<string, unknown>;

    const rooms = parseRoomTypes(raw);

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      name: 'Chambre standard',
      capacityAdults: '2',
      beds: '1 lit double',
      quantity: '12',
    });
    expect(rooms[0].amenities).toContain('Wi-Fi');
  });
});
