import { parseObjectDetail } from './object-detail-parser';

describe('parseObjectDetail', () => {
  it('normalizes the canonical backend surface into shared detail sections', () => {
    const raw = {
      id: 'LOIRUN000000000W',
      name: 'La Cite du Volcan',
      type: 'LOI',
      status: 'published',
      commercial_visibility: 'active',
      is_editing: false,
      region_code: 'RUN',
      created_at: '2026-03-22T03:00:41.810854+00:00',
      updated_at: '2026-03-24T06:55:08.889198+00:00',
      address: {
        address1: 'RN3',
        city: 'Le Tampon',
        postcode: '97418',
        lieu_dit: 'La Plaine des Cafres',
      },
      location: {
        geometry: {
          type: 'Point',
          coordinates: [55.5739, -21.203329],
        },
        latitude: -21.203329,
        longitude: 55.5739,
      },
      descriptions: [
        {
          id: 'desc-1',
          position: 0,
          description:
            "Cette muséographie d'immersion est obtenue par l'utilisation de nombreux dispositifs innovants.",
          description_chapo: 'Pôle d attraction touristique, pédagogique et scientifique.',
          description_adapted: 'Version adaptee du descriptif.',
          description_mobile: 'Version mobile du descriptif.',
          description_edition: 'Version editoriale du descriptif.',
        },
      ],
      private_note: 'Usage interne uniquement.',
      private_notes: [
        {
          id: 'private-1',
          description: 'Visite de groupe sur reservation.',
        },
      ],
      places: [
        {
          id: 'place-1',
          name: 'Belvedere',
          type: { name: 'Etape' },
          descriptions: [
            {
              description: 'Point de vue secondaire sur le massif.',
            },
          ],
          location: {
            address1: 'Sentier volcan',
            city: 'Le Tampon',
          },
        },
      ],
      contacts: [],
      actors: [
        {
          id: 'actor-1',
          display_name: 'Jean-Francois Sita',
          visibility: 'public',
          contacts: [
            {
              id: 'actor-contact-1',
              kind: { code: 'phone', name: 'Telephone' },
              value: '0262590026',
              is_primary: true,
            },
            {
              id: 'actor-contact-2',
              kind: { code: 'email', name: 'Email' },
              value: 'cdv.reservations@museesreunion.re',
            },
          ],
        },
        {
          id: 'actor-2',
          display_name: 'Contact interne',
          visibility: 'private',
          contacts: [
            {
              id: 'actor-contact-3',
              kind: { code: 'email', name: 'Email' },
              value: 'interne@museesreunion.re',
            },
          ],
        },
      ],
      organizations: [
        {
          id: 'org-1',
          name: 'Musees Reunion',
          link_type: 'Gestion',
          contacts: [
            {
              kind_code: 'email',
              value: 'public@museesreunion.re',
            },
          ],
        },
      ],
      parent_objects: [
        {
          id: 'parent-1',
          name: 'Destination Volcan',
          link_type: 'Reseau',
          contacts: [
            {
              kind_code: 'website',
              value: 'destination-volcan.re',
            },
          ],
        },
      ],
      media: [
        {
          id: 'media-secondary',
          url: 'https://example.com/secondary.jpg',
          title: 'Parcours interieur',
          position: 2,
          tags: [{ name: 'interieur' }],
        },
        {
          id: 'media-main',
          url: 'https://example.com/main.jpg',
          title: 'Facade',
          is_main: true,
          position: 5,
          credit: 'Photo DR',
          visibility: 'public',
          media_type: { code: 'image', name: 'Image' },
          media_tags: [{ tag: { name: 'volcan' } }],
        },
      ],
      tags: [{ id: 'tag-1', name: 'Musee' }],
      classifications: [
        { id: 'class-1', scheme: 'LBL_QUALITE_TOURISME', value: 'granted' },
        {
          id: 'class-2',
          scheme_name: 'Qualite Tourisme Ile de La Reunion',
          value_name: 'Obtenu',
        },
      ],
      sustainability_labels: [
        {
          value_id: 's-label-1',
          scheme_name: 'Qualite Tourisme',
          value_name: 'Titulaire',
        },
      ],
      sustainability_actions: [
        {
          object_action_id: 's-action-1',
          action: {
            name: 'Reduction plastique',
            category: { name: 'Dechets' },
          },
          status: 'En place',
        },
      ],
      sustainability_action_labels: [
        {
          object_action_id: 's-action-label-1',
          label: {
            value_name: 'Clef verte',
            scheme_name: 'Eco',
          },
          action: { name: 'Gestion eau' },
        },
      ],
      environment_tags: [{ id: 'env-1', name: 'Montagne' }],
      payment_methods: [{ id: 'pay-1', name: 'CB' }],
      languages: [{ id: 'lang-1', name: 'Francais' }],
      practices: [{ id: 'practice-1', name: 'Visite' }],
      amenities: [{ amenity: { name: 'Boutique' } }],
      equipment: [{ name: 'Parking' }],
      capacity: [{ code: { name: 'Visiteurs' }, value: 300 }],
      room_types: [
        {
          id: 'room-1',
          name: 'Salle immersive',
          capacity_adults: 40,
          quantity: 1,
        },
      ],
      meeting_rooms: [
        {
          id: 'meeting-1',
          name: 'Auditorium',
          capacity_theatre: 120,
          area_m2: 150,
        },
      ],
      prices: [
        {
          label: 'Plein tarif',
          amount: 15,
          currency: 'EUR',
        },
      ],
      opening_times: {
        periods_current: [
          {
            label: 'Periode courante',
            date_start: '2026-01-01',
            date_end: '2026-12-31',
            weekday_slots: {
              monday: [{ start: '09:30', end: '17:00' }],
              sunday: [{ start: '09:30', end: '17:00' }],
            },
          },
        ],
        periods_next_year: [
          {
            label: 'Annee suivante',
            date_start: '2027-01-01',
            date_end: '2027-12-31',
            weekday_slots: {
              monday: [{ start: '09:30', end: '17:00' }],
            },
          },
        ],
      },
      discounts: [{ id: 'discount-1', name: 'Enfant' }],
      group_policies: [{ id: 'group-1', name: 'Groupes sur reservation' }],
      pet_policy: {
        accepted: false,
        note: 'Animaux non autorises.',
      },
      outgoing_relations: [
        {
          id: 'relation-out-1',
          relation_type: { name: 'A proximite' },
          target: { id: 'poi-1', name: 'Belvedere du piton', type: 'PNA' },
        },
      ],
      incoming_relations: [
        {
          id: 'relation-in-1',
          relation_type: { name: 'Dessert' },
          source: { id: 'srv-1', name: 'Navette volcan', type: 'SRV' },
        },
      ],
      associated_objects: [
        {
          id: 'assoc-1',
          name: 'Tunnel de lave',
          type: 'LOI',
          relation_type: { name: 'Etape' },
        },
      ],
      memberships: [
        {
          id: 'membership-1',
          name: 'Club musees',
          tier: 'Gold',
          status: 'Active',
          invoice_status: 'Payee',
          visibility_impact: 'Boostee',
          expires_at: '2026-12-31',
        },
      ],
      itinerary: {
        distance_km: 1.2,
        track: 'gpx-track',
        track_format: 'gpx',
      },
      itinerary_details: {
        practices: [{ id: 'practice-2', name: 'Pedestre' }],
        sections: [{ id: 'section-1' }],
        stages: [{ id: 'stage-1' }],
        profiles: [{ id: 'profile-1' }],
        associated_objects: [
          {
            id: 'assoc-2',
            name: 'Aire de pause',
            type: 'SRV',
            relation_type: { name: 'Pause' },
          },
        ],
      },
      fma: [{ id: 'fma-1' }],
      fma_occurrences: [{ id: 'occ-1' }],
      external_ids: [
        {
          id: 'sync-1',
          source_system: 'berta_v2_csv_export',
          external_id: 'recmG8eVRN6kwvyRU',
          status: 'synced',
        },
      ],
      legal_records: [
        {
          label: 'Licence',
          status: 'Valide',
          document_id: 'doc-1',
        },
      ],
      origins: [
        {
          source_system: 'berta_v2_csv_export',
        },
      ],
      menus: [{ id: 'menu-1' }],
      cuisine_types: [{ id: 'cuisine-1', name: 'Locale' }],
      dietary_tags: [{ id: 'diet-1', name: 'Vegetarien' }],
      allergens: [{ id: 'allergen-1', name: 'Arachides' }],
      render: {
        description: 'Ce texte de rendu ne doit servir qu en fallback.',
      },
    } as Record<string, unknown>;

    const parsed = parseObjectDetail(raw);

    expect(parsed.identity).toMatchObject({
      id: 'LOIRUN000000000W',
      name: 'La Cite du Volcan',
      type: 'LOI',
      status: 'published',
      commercialVisibility: 'active',
    });

    expect(parsed.text.description).toBe(
      "Cette muséographie d'immersion est obtenue par l'utilisation de nombreux dispositifs innovants.",
    );
    expect(parsed.text.chapo).toBe('Pôle d attraction touristique, pédagogique et scientifique.');
    expect(parsed.text.adaptedDescription).toBe('Version adaptee du descriptif.');
    expect(parsed.text.places[0]).toMatchObject({
      name: 'Belvedere',
      locationLabel: 'Sentier volcan · Le Tampon',
    });

    expect(parsed.location).toMatchObject({
      address: 'RN3',
      city: 'Le Tampon',
      postcode: '97418',
      lieuDit: 'La Plaine des Cafres',
      latitude: -21.203329,
      longitude: 55.5739,
    });
    expect(parsed.location?.googleMapsUrl).toContain('google.com/maps/search');
    expect(parsed.location?.directionsUrl).toContain('google.com/maps/dir');

    expect(parsed.contacts.object).toHaveLength(0);
    expect(parsed.contacts.public).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: '0262590026', source: 'actor' }),
        expect.objectContaining({ value: 'cdv.reservations@museesreunion.re', source: 'actor' }),
        expect.objectContaining({ value: 'public@museesreunion.re', source: 'organization' }),
        expect.objectContaining({ value: 'destination-volcan.re', source: 'organization' }),
      ]),
    );
    expect(parsed.contacts.public).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'interne@museesreunion.re' })]),
    );

    expect(parsed.media.hero).toMatchObject({
      id: 'media-main',
      credit: 'Photo DR',
      visibility: 'public',
      typeCode: 'image',
      typeLabel: 'Image',
    });
    expect(parsed.media.gallery[0]).toMatchObject({ id: 'media-secondary' });
    expect(parsed.media.tagCloud).toEqual(expect.arrayContaining(['volcan', 'interieur']));

    expect(parsed.taxonomy.amenities).toEqual(expect.arrayContaining(['Boutique', 'Parking']));
    expect(parsed.taxonomy.groups.map((group) => group.key)).toEqual(
      expect.arrayContaining(['tags', 'classifications', 'sustainability', 'environment', 'payments', 'languages', 'practices']),
    );
    expect(parsed.taxonomy.groups.find((group) => group.key === 'classifications')?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Qualite Tourisme' }),
        expect.objectContaining({ label: 'Qualite Tourisme Ile de La Reunion · Obtenu' }),
      ]),
    );
    expect(parsed.taxonomy.sustainability.merged.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Qualite Tourisme · Titulaire', 'Reduction plastique', 'Clef verte']),
    );

    expect(parsed.operations.capacities).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Visiteurs', value: '300' })]),
    );
    expect(parsed.operations.openings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Periode courante',
          season: 'Annee en cours',
          weekdays: expect.arrayContaining(['Lundi', 'Dimanche']),
          slots: expect.arrayContaining(['09:30 -> 17:00']),
        }),
      ]),
    );
    expect(parsed.operations.discounts).toHaveLength(1);
    expect(parsed.operations.groupPolicies).toHaveLength(1);
    expect(parsed.operations.petPolicy).toMatchObject({
      accepted: false,
      label: 'Animaux non acceptes',
    });
    expect(parsed.operations.petPolicy?.details).toContain('Animaux non autorises.');

    expect(parsed.relations.incoming).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Navette volcan', direction: 'in' })]),
    );
    expect(parsed.relations.outgoing).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Belvedere du piton', direction: 'out' })]),
    );
    expect(parsed.relations.associated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Tunnel de lave', direction: 'associated' }),
        expect.objectContaining({ name: 'Aire de pause', direction: 'associated' }),
      ]),
    );

    expect(parsed.itinerary.summary).toMatchObject({
      distanceKm: '1.2',
      track: 'gpx-track',
      trackFormat: 'gpx',
      sectionsCount: 1,
      stagesCount: 1,
      profilesCount: 1,
    });
    expect(parsed.itinerary.summary?.practices).toEqual(expect.arrayContaining(['Pedestre', 'Visite']));

    expect(parsed.internal.legalRecords).toHaveLength(1);
    expect(parsed.internal.externalIds).toHaveLength(1);
    expect(parsed.internal.origins).toHaveLength(1);
    expect(parsed.internal.transparentBlocks).toMatchObject({
      menus: [{ id: 'menu-1' }],
      cuisine_types: [{ id: 'cuisine-1', name: 'Locale' }],
      dietary_tags: [{ id: 'diet-1', name: 'Vegetarien' }],
      allergens: [{ id: 'allergen-1', name: 'Arachides' }],
      discounts: [{ id: 'discount-1', name: 'Enfant' }],
      group_policies: [{ id: 'group-1', name: 'Groupes sur reservation' }],
      fma: [{ id: 'fma-1' }],
      fma_occurrences: [{ id: 'occ-1' }],
    });

    expect(parsed.coverage.recognizedKeys).toEqual(
      expect.arrayContaining(['opening_times', 'sustainability_labels', 'incoming_relations', 'outgoing_relations', 'render']),
    );
    expect(parsed.coverage.unhandledKeys).toEqual([]);
  });

  it('supports object-shaped description and location aliases while keeping render as a fallback only', () => {
    const raw = {
      id: 'HOT-2',
      name: 'Maison des Filaos',
      type: 'HOT',
      descriptions: {
        description: 'Maison de charme a deux pas du lagon.',
        description_adapted: 'Version adaptee.',
      },
      object_location: {
        address1: '3 rue des filaos',
        city: 'Etang-Sale',
        postcode: '97427',
        latitude: -21.2581,
        longitude: 55.3321,
      },
      render: {
        description: 'Texte de rendu secondaire.',
      },
    } as Record<string, unknown>;

    const parsed = parseObjectDetail(raw);

    expect(parsed.text.description).toBe('Maison de charme a deux pas du lagon.');
    expect(parsed.text.adaptedDescription).toBe('Version adaptee.');
    expect(parsed.location).toMatchObject({
      address: '3 rue des filaos',
      city: 'Etang-Sale',
      postcode: '97427',
      latitude: -21.2581,
      longitude: 55.3321,
    });
    expect(parsed.coverage.unhandledKeys).toEqual([]);
  });
});
