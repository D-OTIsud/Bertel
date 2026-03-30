import { parseObjectWorkspace } from './object-workspace-parser';
import type { ObjectDetail } from '../types/domain';

describe('parseObjectWorkspace', () => {
  it('keeps object and sub-place descriptions separated and preserves language maps', () => {
    const detail: ObjectDetail = {
      id: 'HOTRUN0000000001',
      name: 'Hotel Basalte',
      type: 'HOT',
      raw: {
        name_i18n: {
          fr: 'Hotel Basalte',
          en: 'Basalt Hotel',
        },
        business_timezone: 'Indian/Reunion',
        commercial_visibility: 'active',
        region_code: 'RUN',
        status: 'draft',
        published_at: '2026-03-27T08:00:00Z',
        is_editing: true,
        classifications: [
          {
            scheme: 'OFFICIAL_CLASSIFICATION',
            scheme_name: 'Classement officiel',
            value: '3_ETOILES',
            value_name: '3 etoiles',
            status: 'granted',
            awarded_at: '2026-01-10',
            valid_until: '2031-01-09',
          },
        ],
        object_location: {
          id: 'location-1',
          address1: '12 promenade du lagon',
          postcode: '97410',
          city: 'Saint-Pierre',
          latitude: '-21.3391',
          longitude: '55.4781',
        },
        object_description: {
          id: 'description-1',
          visibility: 'public',
          description: 'Description principale FR',
          description_i18n: {
            fr: 'Description principale FR',
            en: 'Main description EN',
          },
          description_chapo: 'Chapo FR',
          description_chapo_i18n: {
            fr: 'Chapo FR',
            en: 'Lead EN',
          },
        },
        media: [
          {
            id: 'media-1',
            url: 'https://example.com/facade.jpg',
            title: 'Facade',
            type_code: 'photo',
            visibility: 'public',
            position: 1,
            is_main: true,
            tags: ['hero', 'facade'],
          },
        ],
        contacts: [
          {
            id: 'contact-1',
            kind_code: 'phone',
            kind_name: 'Telephone',
            role: 'accueil',
            value: '+262 262 00 00 00',
            is_public: true,
            is_primary: true,
            position: 0,
          },
        ],
        languages: [
          { code: 'fr', name: 'Francais' },
          { code: 'en', name: 'Anglais' },
        ],
        payment_methods: [
          { code: 'cb', name: 'Carte bancaire' },
        ],
        environment_tags: [
          { code: 'lagoon', name: 'Lagon' },
        ],
        amenities: [
          {
            code: 'pool',
            name: 'Piscine',
            family: {
              code: 'comfort',
              name: 'Confort',
            },
          },
        ],
        capacity: [
          {
            metric_code: 'ROOM_COUNT',
            metric_name: 'Nombre de chambres',
            value: 24,
            unit: 'unites',
          },
        ],
        group_policies: [
          {
            min_size: 8,
            max_size: 40,
            group_only: false,
            notes: 'Sur reservation',
          },
        ],
        pet_policy: {
          accepted: true,
          conditions: 'Supplement menage',
        },
        prices: [
          {
            id: 'price-1',
            kind: { id: 'kind-room', code: 'ROOM', name: 'Chambre' },
            unit: { id: 'unit-night', code: 'NIGHT', name: 'Nuit' },
            amount: 120,
            amount_max: 160,
            currency: 'EUR',
            valid_from: '2026-06-01',
            valid_to: '2026-09-30',
            conditions: 'Petit-dejeuner inclus',
            periods: [
              {
                id: 'period-1',
                start_date: '2026-07-01',
                end_date: '2026-08-31',
                note: 'Haute saison',
              },
            ],
          },
        ],
        discounts: [
          {
            id: 'discount-1',
            conditions: 'A partir de 10 personnes',
            discount_percent: 12,
            min_group_size: 10,
            valid_from: '2026-05-01',
            valid_to: '2026-10-31',
          },
        ],
        opening_times: {
          periods_current: [
            {
              id: 'opening-period-current-1',
              order: 1,
              label: 'Saison courante',
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
              id: 'opening-period-next-1',
              order: 1,
              label: 'Annee suivante',
              date_start: '2027-01-01',
              date_end: '2027-12-31',
              weekday_slots: {
                monday: [{ start: '10:00', end: '16:00' }],
              },
            },
          ],
        },
        current_membership: {
          id: 'membership-current-1',
          org_object_id: 'ORG0001',
          object_id: 'HOTRUN0000000001',
          campaign_id: 'campaign-1',
          campaign_code: '2026',
          campaign_name: 'Campagne 2026',
          tier_id: 'tier-1',
          tier_code: 'PREMIUM',
          tier_name: 'Premium',
          status: 'paid',
          starts_at: '2026-01-01',
          ends_at: '2026-12-31',
          payment_date: '2026-01-10',
          metadata: {
            invoice: 'INV-2026-01',
          },
          visibility_impact: 'Visibilite active',
        },
        private_notes: [
          {
            id: 'follow-up-note-1',
            body: 'Prestataire relance pour finaliser la convention 2026.',
            audience: 'private',
            category: 'followup',
            is_pinned: true,
            is_archived: false,
            can_edit: true,
            can_delete: true,
            language: 'fr',
            created_at: '2026-03-25T08:00:00Z',
            updated_at: '2026-03-26T09:30:00Z',
            created_by: {
              id: 'user-1',
              display_name: 'Equipe RUN',
              avatar_url: null,
            },
          },
        ],
        organizations: [
          {
            id: 'ORG0001',
            type: 'ORG',
            name: 'Office de tourisme',
            status: 'published',
            role: {
              id: 'org-role-1',
              code: 'publisher',
              name: 'Diffuseur',
            },
            note: 'Structure porteuse',
            contacts: [
              {
                id: 'org-contact-1',
                kind: {
                  code: 'phone',
                  name: 'Telephone',
                },
                role: {
                  code: 'accueil',
                  name: 'Accueil',
                },
                value: '0262 00 00 00',
                is_primary: true,
                is_public: true,
                position: 1,
              },
            ],
          },
        ],
        org_links: [
          {
            id: 'ORG0002',
            type: 'ORG',
            name: 'Reseau hotelier',
            status: 'draft',
            role: {
              id: 'org-role-2',
              code: 'network',
              name: 'Reseau',
            },
            note: 'Rattachement secondaire',
            contacts: [],
          },
        ],
        actors: [
          {
            id: 'actor-1',
            display_name: 'Claire Martin',
            first_name: 'Claire',
            last_name: 'Martin',
            gender: 'f',
            role: {
              id: 'actor-role-1',
              code: 'manager',
              name: 'Gestionnaire',
            },
            is_primary: true,
            valid_from: '2026-01-01',
            visibility: 'extended',
            note: 'Interlocutrice principale',
            contacts: [
              {
                id: 'actor-contact-1',
                kind: {
                  code: 'email',
                  name: 'Email',
                },
                role: {
                  code: 'direct',
                  name: 'Direct',
                },
                value: 'claire@example.com',
                is_primary: true,
                is_public: false,
                position: 1,
              },
            ],
          },
        ],
        parent_objects: [
          {
            id: 'PCU0001',
            type: 'PCU',
            name: 'Belvedere des hauts',
            status: 'published',
            relation_type: {
              id: 'relation-type-1',
              name: 'Etape',
            },
            note: 'Etape recommandee',
            distance_m: 2400,
          },
        ],
        outgoing_relations: [
          {
            id: 'relation-out-1',
            target: {
              id: 'SRV0001',
              type: 'SRV',
              name: 'Navette port',
              status: 'published',
            },
            relation_type: {
              id: 'relation-type-2',
              code: 'ACCESS',
              name: 'Acces',
            },
            note: 'Navette sur reservation',
            distance_m: 800,
          },
        ],
        incoming_relations: [
          {
            id: 'relation-in-1',
            source: {
              id: 'ACT0001',
              type: 'ACT',
              name: 'Guide local',
              status: 'published',
            },
            relation_type: {
              id: 'relation-type-3',
              code: 'ANIMATE',
              name: 'Anime',
            },
            note: 'Anime les visites privees',
            distance_m: 0,
          },
        ],
        legal_records: [
          {
            id: 'legal-1',
            type: {
              id: 'legal-type-1',
              code: 'safety_certificate',
              name: 'Certificat de securite',
              category: 'accommodation',
              is_public: true,
              is_required: true,
            },
            value: {
              issuer: 'Prefecture',
              reference: 'SAFE-2026',
            },
            document_id: '11111111-1111-4111-8111-111111111111',
            valid_from: '2026-01-01',
            valid_to: '2026-12-31',
            validity_mode: 'fixed_end_date',
            status: 'active',
            document_requested_at: '2026-01-03T09:00:00Z',
            document_delivered_at: '2026-01-10T09:00:00Z',
            note: 'Controle annuel OK',
            days_until_expiry: 200,
          },
        ],
        places: [
          {
            id: 'place-1',
            name: 'Spa lagon',
            is_primary: true,
            position: 0,
            location: {
              address1: 'Niveau 1',
              city: 'Saint-Pierre',
            },
            descriptions: [
              {
                id: 'place-description-1',
                visibility: 'public',
                description: 'Texte spa FR',
                description_i18n: {
                  fr: 'Texte spa FR',
                  en: 'Spa text EN',
                },
              },
            ],
          },
        ],
      },
    };

    const parsed = parseObjectWorkspace(detail, ['fr', 'en']);

    expect(parsed.generalInfo.name).toBe('Hotel Basalte');
    expect(parsed.generalInfo.nameTranslations).toEqual({
      fr: 'Hotel Basalte',
      en: 'Basalt Hotel',
    });
    expect(parsed.publication).toMatchObject({
      status: 'draft',
      publishedAt: '2026-03-27T08:00:00Z',
      isEditing: true,
    });
    expect(parsed.taxonomy.schemes).toHaveLength(1);
    expect(parsed.taxonomy.schemes[0]).toMatchObject({
      code: 'OFFICIAL_CLASSIFICATION',
      label: 'Classement officiel',
      selectionMode: 'single',
    });
    expect(parsed.taxonomy.schemes[0].items[0]).toMatchObject({
      valueCode: '3_ETOILES',
      valueLabel: '3 etoiles',
      status: 'granted',
      awardedAt: '2026-01-10',
      validUntil: '2031-01-09',
    });

    expect(parsed.location.main).toMatchObject({
      address1: '12 promenade du lagon',
      city: 'Saint-Pierre',
      postcode: '97410',
      latitude: '-21.3391',
      longitude: '55.4781',
    });

    expect(parsed.descriptions.localLanguage).toBe('fr');
    expect(parsed.descriptions.availableLanguages).toEqual(expect.arrayContaining(['fr', 'en']));
    expect(parsed.descriptions.object.scope).toBe('object');
    expect(parsed.descriptions.object.description.baseValue).toBe('Description principale FR');
    expect(parsed.descriptions.object.description.values.en).toBe('Main description EN');

    expect(parsed.descriptions.places).toHaveLength(1);
    expect(parsed.descriptions.places[0]).toMatchObject({
      scope: 'place',
      placeId: 'place-1',
      label: 'Spa lagon',
    });
    expect(parsed.descriptions.places[0].description.baseValue).toBe('Texte spa FR');
    expect(parsed.descriptions.places[0].description.values.en).toBe('Spa text EN');
    expect(parsed.media.objectItems[0]).toMatchObject({
      title: 'Facade',
      typeCode: 'photo',
      visibility: 'public',
      isMain: true,
      tags: ['hero', 'facade'],
    });
    expect(parsed.contacts.objectItems[0]).toMatchObject({
      kindCode: 'phone',
      roleCode: 'accueil',
      value: '+262 262 00 00 00',
      isPublic: true,
      isPrimary: true,
    });
    expect(parsed.characteristics.selectedLanguages.map((item) => item.code)).toEqual(expect.arrayContaining(['fr', 'en']));
    expect(parsed.characteristics.selectedPaymentCodes).toEqual(['cb']);
    expect(parsed.characteristics.selectedEnvironmentCodes).toEqual(['lagoon']);
    expect(parsed.characteristics.selectedAmenityCodes).toEqual(['pool']);
    expect(parsed.distinctions).toEqual({
      distinctionGroups: [],
      accessibilityLabels: [],
      accessibilityAmenityCoverage: [],
      unavailableReason: null,
    });
    expect(parsed.pricing.prices[0]).toMatchObject({
      kindCode: 'ROOM',
      unitCode: 'NIGHT',
      amount: '120',
      amountMax: '160',
      currency: 'EUR',
      validFrom: '2026-06-01',
      validTo: '2026-09-30',
      conditions: 'Petit-dejeuner inclus',
    });
    expect(parsed.pricing.prices[0].periods[0]).toMatchObject({
      startDate: '2026-07-01',
      endDate: '2026-08-31',
      note: 'Haute saison',
    });
    expect(parsed.pricing.discounts[0]).toMatchObject({
      discountPercent: '12',
      minGroupSize: '10',
      validFrom: '2026-05-01',
      validTo: '2026-10-31',
    });
    expect(parsed.openings.periods).toHaveLength(2);
    expect(parsed.openings.periods[0]).toMatchObject({
      recordId: 'opening-period-current-1',
      bucket: 'current',
      label: 'Saison courante',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(parsed.openings.periods[0].weekdays[0]).toMatchObject({
      code: 'monday',
      label: 'Lundi',
    });
    expect(parsed.openings.periods[0].weekdays[0].slots[0]).toMatchObject({
      start: '09:30',
      end: '17:00',
    });
    expect(parsed.openings.periods[1]).toMatchObject({
      bucket: 'next-year',
      label: 'Annee suivante',
    });
    expect(parsed.providerFollowUp.notes).toHaveLength(1);
    expect(parsed.providerFollowUp.notes[0]).toMatchObject({
      category: 'followup',
      isPinned: true,
      createdByName: 'Equipe RUN',
    });
    expect(parsed.providerFollowUp.notes[0].body).toContain('convention 2026');
    expect(parsed.relationships.organizationLinks).toHaveLength(2);
    expect(parsed.relationships.organizationLinks[0]).toMatchObject({
      name: 'Office de tourisme',
      roleCode: 'publisher',
    });
    expect(parsed.relationships.actors[0]).toMatchObject({
      displayName: 'Claire Martin',
      roleCode: 'manager',
      visibility: 'extended',
    });
    expect(parsed.relationships.actors[0].contacts[0]).toMatchObject({
      kindCode: 'email',
      value: 'claire@example.com',
      isPublic: false,
    });
    expect(parsed.relationships.relatedObjects).toHaveLength(3);
    expect(parsed.relationships.relatedObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Belvedere des hauts', direction: 'associated', relationTypeLabel: 'Etape' }),
      expect.objectContaining({ name: 'Navette port', direction: 'out', relationTypeCode: 'ACCESS' }),
      expect.objectContaining({ name: 'Guide local', direction: 'in', relationTypeCode: 'ANIMATE' }),
    ]));
    expect(parsed.memberships.items).toHaveLength(1);
    expect(parsed.memberships.items[0]).toMatchObject({
      scope: 'object',
      orgObjectId: 'ORG0001',
      campaignCode: '2026',
      tierCode: 'PREMIUM',
      status: 'paid',
      visibilityImpact: 'Visibilite active',
    });
    expect(parsed.memberships.items[0].metadataJson).toContain('INV-2026-01');
    expect(parsed.legal.records[0]).toMatchObject({
      typeCode: 'safety_certificate',
      typeLabel: 'Certificat de securite',
      category: 'accommodation',
      isPublic: true,
      isRequired: true,
      documentId: '11111111-1111-4111-8111-111111111111',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      validityMode: 'fixed_end_date',
      status: 'active',
      note: 'Controle annuel OK',
      daysUntilExpiry: '200',
    });
    expect(parsed.legal.records[0].valueJson).toContain('SAFE-2026');
    expect(parsed.capacityPolicies.capacityItems[0]).toMatchObject({
      metricCode: 'ROOM_COUNT',
      metricLabel: 'Nombre de chambres',
      value: '24',
      unit: 'unites',
    });
    expect(parsed.capacityPolicies.groupPolicy).toMatchObject({
      minSize: '8',
      maxSize: '40',
      groupOnly: false,
      notes: 'Sur reservation',
    });
    expect(parsed.capacityPolicies.petPolicy).toMatchObject({
      hasPolicy: true,
      accepted: true,
      conditions: 'Supplement menage',
    });
  });
});
