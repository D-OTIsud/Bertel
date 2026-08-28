import {
  cleanSustainabilityNote,
  contactComparisonKey,
  normalizeUrlValue,
  parseObjectDetail,
} from './object-detail-parser';

describe('contactComparisonKey (chantier 3a — dédup inter-sources)', () => {
  it('replie les trois écritures réunionnaises du MÊME fixe sur une seule clé', () => {
    const national = contactComparisonKey('phone', '0262 49 64 59');
    expect(contactComparisonKey('mobile', '+262 262 49 64 59')).toBe(national);
    expect(contactComparisonKey('phone', '00262262496459')).toBe(national);
    expect(contactComparisonKey('phone', '0262.49.64.59')).toBe(national);
    expect(national).toBe('tel:0262496459');
  });

  it('replie aussi un MOBILE saisi en national et en international', () => {
    expect(contactComparisonKey('mobile', '+262 692 12 34 56')).toBe(contactComparisonKey('phone', '0692 12 34 56'));
  });

  it('compare la VALEUR seule, jamais le couple (kind, valeur) — le même numéro est saisi phone ici et mobile là', () => {
    expect(contactComparisonKey('phone', '0262 49 64 59')).toBe(contactComparisonKey('mobile', '0262 49 64 59'));
  });

  it('ignore la casse des e-mails', () => {
    expect(contactComparisonKey('email', 'Contact@Example.COM')).toBe(contactComparisonKey('mail', 'contact@example.com'));
    expect(contactComparisonKey('email', 'contact@example.com')).toBe('mail:contact@example.com');
  });

  it('ne prend PAS une valeur riche en chiffres pour un téléphone', () => {
    // Un SIRET a 14 chiffres : sans la seconde condition il deviendrait « tel: ».
    expect(contactComparisonKey('siret', 'SIRET 123 456 789 01234')).not.toMatch(/^tel:/);
    // Un e-mail dont la partie locale est un numéro reste un e-mail.
    expect(contactComparisonKey('email', '0262496459@sms.example')).toBe('mail:0262496459@sms.example');
  });

  it('distingue deux valeurs différentes et rend une clé vide sur une saisie vide', () => {
    expect(contactComparisonKey('phone', '0262 49 64 59')).not.toBe(contactComparisonKey('phone', '0262 49 64 58'));
    expect(contactComparisonKey('phone', '   ')).toBe('');
    // Une clé vide ne doit jamais entrer dans un Set de dédup : elle collapserait tout.
    expect(contactComparisonKey('email', '')).toBe('');
  });

  it('reste distinct par kind pour les valeurs qui ne sont ni téléphone ni e-mail', () => {
    expect(contactComparisonKey('website', 'https://exemple.re')).toBe('website:https://exemple.re');
    expect(contactComparisonKey('booking', 'https://exemple.re')).not.toBe(contactComparisonKey('website', 'https://exemple.re'));
  });
});

describe('normalizeUrlValue (SEC-7 — only http/https may reach an <a href>)', () => {
  it('keeps http/https and defaults a bare host to https', () => {
    expect(normalizeUrlValue('http://example.com')).toBe('http://example.com');
    expect(normalizeUrlValue('https://example.com/x')).toBe('https://example.com/x');
    expect(normalizeUrlValue('example.com')).toBe('https://example.com');
    expect(normalizeUrlValue('   ')).toBe('');
  });

  it('NEUTRALISES dangerous schemes (stored one-click XSS) to an empty href', () => {
    // the exact SEC-7 payload: a scheme with // that does NOT start with http
    expect(normalizeUrlValue('javascript://x%0aalert(document.cookie)')).toBe('');
    expect(normalizeUrlValue('javascript:alert(1)')).toBe('');
    expect(normalizeUrlValue('JavaScript://X')).toBe('');
    expect(normalizeUrlValue('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(normalizeUrlValue('vbscript:msgbox(1)')).toBe('');
  });
});

describe('cleanSustainabilityNote', () => {
  it('strips Old_data provenance and review_required markers, keeping real commitments', () => {
    expect(
      cleanSustainabilityNote("Old_data D_Durable | L'hôtel limite la consommation. | review_required"),
    ).toEqual(["L'hôtel limite la consommation."]);
  });

  it('splits multiple pipe-separated commitments', () => {
    expect(
      cleanSustainabilityNote('Old_data D_Durable | Panneaux solaires | Récupération eau de pluie | review_required'),
    ).toEqual(['Panneaux solaires', 'Récupération eau de pluie']);
  });

  it('returns an empty array when only markers are present', () => {
    expect(cleanSustainabilityNote('Old_data D_Durable | review_required')).toEqual([]);
    expect(cleanSustainabilityNote('')).toEqual([]);
  });
});

describe('parseObjectDetail', () => {
  it('keeps sustainability action meta short and moves cleaned prose to description', () => {
    const parsed = parseObjectDetail({
      id: 'obj-sustainability',
      name: 'Eco Lodge',
      sustainability_actions: [
        {
          object_action_id: 's-action-clean',
          action: { name: 'Relevé eau', category: { name: 'Eau & assainissement' } },
          note: "Old_data D_Durable | L'hôtel limite la consommation. | review_required",
        },
      ],
    });

    const action = parsed.taxonomy.sustainability.actions[0];
    expect(action.label).toBe('Relevé eau');
    expect(action.meta).toBe('Eau & assainissement');
    expect(action.meta).not.toMatch(/old_data|review_required/i);
    expect(action.description).toBe("L'hôtel limite la consommation.");
  });

  it('derives a platform display name and favicon for object URL contacts', () => {
    const parsed = parseObjectDetail({
      id: 'obj-platform',
      name: 'Le Lagon Bleu',
      contacts: [
        {
          id: 'oc-book',
          kind_code: 'booking_engine',
          value: 'https://www.booking.com/hotel/re/lagon.html?aid=1',
          is_public: true,
          position: 1,
        },
        {
          id: 'oc-tel',
          kind_code: 'phone',
          value: '+262 262 00 00 00',
          is_public: true,
          position: 2,
        },
      ],
    } as Record<string, unknown>);

    const booking = parsed.contacts.object.find((contact) => contact.id === 'oc-book');
    const phone = parsed.contacts.object.find((contact) => contact.id === 'oc-tel');

    // URL contact: platform name shown, favicon derived, full URL kept for link/copy.
    expect(booking).toMatchObject({
      displayValue: 'Booking.com',
      iconUrl: 'https://icons.duckduckgo.com/ip3/booking.com.ico',
      value: 'https://www.booking.com/hotel/re/lagon.html?aid=1',
    });
    // Non-URL contact: unchanged.
    expect(phone).toMatchObject({ displayValue: '+262 262 00 00 00', iconUrl: '' });
  });

  it('exposes raw Markdown *_md siblings from the resource payload', () => {
    const parsed = parseObjectDetail({
      id: 'X',
      type: 'HLO',
      description: 'Plain.',
      description_md: '## H\n**b**',
      description_adapted: 'A',
      description_adapted_md: '*a*',
    } as Record<string, unknown>);
    expect(parsed.text.descriptionMd).toBe('## H\n**b**');
    expect(parsed.text.adaptedDescriptionMd).toBe('*a*');
    // absent *_md → empty string, not undefined
    expect(parsed.text.chapoMd).toBe('');
  });

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
      private_note: {
        id: 'private-primary',
        body: 'Usage interne uniquement.',
        audience: 'private',
        category: 'important',
        is_pinned: true,
        is_archived: false,
        can_edit: true,
        can_delete: true,
        created_at: '2026-03-24T08:00:00.000Z',
        created_by: {
          id: 'usr-1',
          display_name: 'Marie Equipe',
          avatar_url: null,
          email: 'marie.equipe@oti.re',
        },
      },
      private_notes: [
        {
          id: 'private-1',
          body: 'Visite de groupe sur reservation.',
          audience: 'private',
          category: 'followup',
          is_archived: true,
          can_edit: false,
          can_delete: false,
          created_at: '2026-03-25T09:30:00.000Z',
          created_by: {
            id: 'usr-2',
            display_name: 'Paul Terrain',
            avatar_url: 'https://example.com/avatar.png',
          },
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
      amenities: [{ amenity: { id: 'amenity-1', name: 'Boutique', icon_url: 'https://example.com/icons/shop.svg' } }],
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
        profiles: [{ id: 'profile-1', position_m: 0, elevation_m: 120 }],
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
    expect(parsed.text.privateNote).toMatchObject({
      body: 'Usage interne uniquement.',
      category: 'important',
      isPinned: true,
      isArchived: false,
      canEdit: true,
      canDelete: true,
      createdByName: 'Marie Equipe',
      createdByEmail: 'marie.equipe@oti.re',
    });
    expect(parsed.text.privateNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: 'Usage interne uniquement.',
          audience: 'private',
          category: 'important',
          canEdit: true,
          canDelete: true,
        }),
        expect.objectContaining({
          body: 'Visite de groupe sur reservation.',
          audience: 'private',
          category: 'followup',
          isArchived: true,
          createdByName: 'Paul Terrain',
        }),
      ]),
    );
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
    expect(parsed.taxonomy.amenityItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Boutique', iconUrl: 'https://example.com/icons/shop.svg' }),
        expect.objectContaining({ label: 'Parking', iconUrl: '' }),
      ]),
    );
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
    expect(parsed.taxonomy.groups.find((group) => group.key === 'sustainability')?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Qualite Tourisme · Titulaire' }),
        expect.objectContaining({ label: 'Reduction plastique' }),
        expect.objectContaining({ label: 'Clef verte' }),
      ]),
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
          slots: expect.arrayContaining(['09:30–17:00']),
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
    expect(parsed.internal.privateNotes).toHaveLength(2);
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

// ---------------------------------------------------------------------------------------
// Chantier 3b (2026-08-28) — dédup INTER-SOURCES des vues dérivées `public` / `all`.
// L'ancienne clé de dédup contenait la PROVENANCE (`source`-`sourceName`-…), donc elle était
// STRUCTURELLEMENT incapable de collapser la même coordonnée portée par la fiche ET par son
// exploitant — et `ContactCard` ne rend aucun marqueur de provenance : le lecteur voyait deux
// lignes visuellement identiques, dont l'une consommait un des 6 emplacements affichés.
//
// Impact mesuré en production avant d'écrire : 2 lignes, sur 2 fiches (Villa Les Margosiers et
// Au Fil de la Broderie), dans les deux cas un e-mail identique au caractère près.
// ---------------------------------------------------------------------------------------
describe('contacts.public — dédup inter-sources (chantier 3b)', () => {
  /** Payload minimal : une fiche, ses contacts, et un acteur lié en visibilité `public`
   *  (seule visibilité qui fait entrer un canal d'acteur dans `contacts.public`). */
  function parseWithActor(objectContacts: unknown[], actorContacts: unknown[]) {
    return parseObjectDetail({
      id: 'HOT1',
      name: 'Hôtel Témoin',
      contacts: objectContacts,
      actors: [{ id: 'a1', display_name: 'M. Exploitant', visibility: 'public', contacts: actorContacts }],
    });
  }

  it('le même numéro porté par la fiche ET par l’acteur ne sort qu’UNE fois — la FICHE gagne', () => {
    const parsed = parseWithActor(
      [{ id: 'o1', kind_code: 'phone', value: '0262 12 34 56' }],
      [{ id: 'a1c1', kind_code: 'mobile', value: '+262 262 12 34 56' }],
    );
    const phones = parsed.contacts.public.filter((c) => c.value.replace(/\D/g, '').length >= 8);
    expect(phones).toHaveLength(1);
    // L'ordre de concaténation (objet → acteurs → orgs) décide du gagnant : la coordonnée de
    // l'établissement fait foi.
    expect(phones[0].source).toBe('object');
    expect(phones[0].value).toBe('0262 12 34 56');
  });

  it('les e-mails ne diffèrent que par la casse ⇒ une seule entrée', () => {
    const parsed = parseWithActor(
      [{ id: 'o1', kind_code: 'email', value: 'Contact@Hotel.RE' }],
      [{ id: 'a1c1', kind_code: 'email', value: 'contact@hotel.re' }],
    );
    expect(parsed.contacts.public.filter((c) => c.kindCode === 'email')).toHaveLength(1);
  });

  it('une valeur portée par le SEUL acteur reste présente — on dédoublonne, on ne censure pas', () => {
    const parsed = parseWithActor(
      [{ id: 'o1', kind_code: 'phone', value: '0262 12 34 56' }],
      [{ id: 'a1c1', kind_code: 'email', value: 'exploitant@hotel.re' }],
    );
    expect(parsed.contacts.public.map((c) => c.value)).toEqual(
      expect.arrayContaining(['0262 12 34 56', 'exploitant@hotel.re']),
    );
  });

  it('les LEGS par provenance restent INTACTS — ce sont les inventaires, pas des vues', () => {
    // C'est ce qui garantit que l'éditeur et les colonnes d'export par clearance
    // (`contacts_object`, `contacts_orgs`) continuent de voir la totalité.
    const parsed = parseWithActor(
      [{ id: 'o1', kind_code: 'phone', value: '0262 12 34 56' }],
      [{ id: 'a1c1', kind_code: 'mobile', value: '+262 262 12 34 56' }],
    );
    expect(parsed.contacts.object).toHaveLength(1);
    expect(parsed.contacts.actors).toHaveLength(1);
    expect(parsed.contacts.actors[0].value).toBe('+262 262 12 34 56');
  });

  it('deux numéros DIFFÉRENTS ne sont jamais collapsés', () => {
    const parsed = parseWithActor(
      [{ id: 'o1', kind_code: 'phone', value: '0262 12 34 56' }],
      [{ id: 'a1c1', kind_code: 'mobile', value: '0692 99 88 77' }],
    );
    expect(parsed.contacts.public).toHaveLength(2);
  });

  it('un canal NON PUBLIC de l’acteur ne pouvait de toute façon pas entrer : la fiche seule sort', () => {
    // `mapOwnerContacts` : ownerVisibility !== 'public' ⇒ isPublic false. C'est le cas de
    // 783 des 785 liens acteurs en production — le doublon visible y est celui de 3a.
    const parsed = parseObjectDetail({
      id: 'HOT1',
      name: 'Hôtel Témoin',
      contacts: [{ id: 'o1', kind_code: 'phone', value: '0262 12 34 56' }],
      actors: [{ id: 'a1', display_name: 'M. Exploitant', visibility: 'partners', contacts: [{ id: 'a1c1', kind_code: 'mobile', value: '+262 262 12 34 56' }] }],
    });
    expect(parsed.contacts.public).toHaveLength(1);
    // Le leg acteur, lui, conserve la ligne (elle alimente §19 et l'export par clearance).
    expect(parsed.contacts.actors).toHaveLength(1);
  });
});
