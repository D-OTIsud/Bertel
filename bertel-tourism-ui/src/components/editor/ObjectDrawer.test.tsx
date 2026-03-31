import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ObjectDrawer } from './ObjectDrawer';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';

const mockUseObjectWorkspaceQuery = jest.fn();
const mockSaveWorkspaceMutateAsync = jest.fn();
const mockPublishWorkspaceMutateAsync = jest.fn();

jest.mock('react-map-gl/maplibre', () => ({
  Map: ({
    children,
    mapStyle,
  }: {
    children?: ReactNode;
    mapStyle?: string;
  }) => <div data-testid="workspace-location-map" data-map-style={mapStyle}>{children}</div>,
  Marker: ({
    children,
    onDragEnd,
    latitude,
    longitude,
  }: {
    children?: ReactNode;
    onDragEnd?: (event: { lngLat: { lng: number; lat: number } }) => void;
    latitude?: number;
    longitude?: number;
  }) => (
    <div
      data-testid="workspace-location-marker"
      data-latitude={latitude}
      data-longitude={longitude}
      onClick={() => onDragEnd?.({ lngLat: { lng: 55.501234, lat: -21.123456 } })}
    >
      {children}
    </div>
  ),
  NavigationControl: () => <div data-testid="workspace-location-map-zoom" />,
}));

function buildWorkspaceResource(params: {
  id: string;
  name: string;
  type?: string;
  description?: string;
  address1?: string;
  address1Suite?: string;
  address2?: string;
  address3?: string;
  postcode?: string;
  city?: string;
  lieuDit?: string;
  direction?: string;
  latitude?: string;
  longitude?: string;
}) {
  return {
    id: params.id,
    name: params.name,
    type: params.type ?? 'HOT',
    detail: {
      id: params.id,
      name: params.name,
      type: params.type ?? 'HOT',
      raw: {
        description: params.description ?? '',
      },
    },
    modules: {
      generalInfo: {
        name: params.name,
        nameTranslations: {},
        businessTimezone: 'Indian/Reunion',
        commercialVisibility: 'active',
        regionCode: 'RUN',
        status: 'draft',
        publishedAt: '',
        isEditing: false,
      },
      taxonomy: {
        schemes: [
          {
            id: 'scheme-1',
            code: 'OFFICIAL_CLASSIFICATION',
            label: 'Classement officiel',
            description: '',
            selectionMode: 'single',
            displayGroup: '',
            valueOptions: [
              { id: 'value-1', code: '3_ETOILES', label: '3 etoiles' },
              { id: 'value-2', code: '4_ETOILES', label: '4 etoiles' },
            ],
            items: [],
          },
        ],
        unavailableReason: null,
      },
      publication: {
        status: 'draft',
        publishedAt: '',
        isEditing: false,
        moderation: {
          availability: 'available',
          pendingCount: 0,
          unavailableReason: null,
          items: [],
        },
        printPublications: {
          availability: 'available',
          selectionCount: 0,
          unavailableReason: null,
          items: [],
        },
      },
      syncIdentifiers: {
        objectCreatedAt: '2026-01-01T09:00:00Z',
        objectUpdatedAt: '2026-03-20T12:00:00Z',
        objectUpdatedAtSource: 'Apidae',
        externalIdentifiers: [
          {
            id: 'sync-ext-1',
            organizationObjectId: 'ORG0001',
            sourceSystem: 'Apidae',
            externalId: 'APIDAE-12345',
            lastSyncedAt: '2026-03-20T12:00:00Z',
            createdAt: '2026-01-01T09:00:00Z',
            updatedAt: '2026-03-20T12:00:00Z',
          },
        ],
        origins: [
          {
            sourceSystem: 'Apidae',
            sourceObjectId: 'OBJ-12345',
            importBatchId: 'IMPORT-2026-03',
            firstImportedAt: '2026-01-01T09:00:00Z',
            createdAt: '2026-01-01T09:00:00Z',
            updatedAt: '2026-03-20T12:00:00Z',
          },
        ],
        externalIdentifiersVisibilityNote: null,
        originsVisibilityNote: null,
      },
      location: {
        main: {
          recordId: null,
          address1: params.address1 ?? '',
          address1Suite: params.address1Suite ?? '',
          address2: params.address2 ?? '',
          address3: params.address3 ?? '',
          postcode: params.postcode ?? '',
          city: params.city ?? '',
          codeInsee: '',
          lieuDit: params.lieuDit ?? '',
          direction: params.direction ?? '',
          latitude: params.latitude ?? '',
          longitude: params.longitude ?? '',
          zoneTouristique: '',
        },
        places: [],
        zoneCodes: [],
      },
      descriptions: {
        localLanguage: 'fr',
        activeLanguage: 'fr',
        availableLanguages: ['fr'],
        object: {
          recordId: null,
          scope: 'object',
          placeId: null,
          label: 'Objet principal',
          visibility: 'public',
          description: {
            baseValue: params.description ?? '',
            values: {},
          },
          chapo: {
            baseValue: '',
            values: {},
          },
          adaptedDescription: {
            baseValue: '',
            values: {},
          },
          mobileDescription: {
            baseValue: '',
            values: {},
          },
          editorialDescription: {
            baseValue: '',
            values: {},
          },
        },
        places: [],
      },
      media: {
        typeOptions: [{ id: 'type-photo', code: 'photo', label: 'Photo' }],
        tagOptions: [{ id: 'tag-hero', code: 'hero', label: 'Hero' }],
        objectItems: [],
        placeItems: [],
        placeScopeUnavailableReason: null,
      },
      contacts: {
        kindOptions: [{ id: 'kind-phone', code: 'phone', label: 'Telephone' }],
        roleOptions: [{ id: 'role-accueil', code: 'accueil', label: 'Accueil' }],
        objectItems: [],
        relatedActorContactsCount: 0,
        relatedOrganizationContactsCount: 0,
      },
      characteristics: {
        languageOptions: [
          { id: 'lang-fr', code: 'fr', label: 'Francais' },
          { id: 'lang-en', code: 'en', label: 'Anglais' },
        ],
        languageLevelOptions: [
          { id: 'level-basic', code: 'basic', label: 'Notions' },
        ],
        selectedLanguages: [
          {
            languageId: 'lang-fr',
            code: 'fr',
            label: 'Francais',
            levelId: '',
            levelCode: '',
            levelLabel: '',
          },
        ],
        paymentOptions: [{ id: 'pay-cb', code: 'cb', label: 'Carte bancaire' }],
        selectedPaymentCodes: ['cb'],
        environmentOptions: [{ id: 'env-lagoon', code: 'lagoon', label: 'Lagon' }],
        selectedEnvironmentCodes: ['lagoon'],
        amenityGroups: [
          {
            familyCode: 'comfort',
            familyLabel: 'Confort',
            options: [{ id: 'amenity-pool', code: 'pool', label: 'Piscine' }],
          },
        ],
        selectedAmenityCodes: ['pool'],
        unavailableReason: null,
      },
      distinctions: {
        distinctionGroups: [
          {
            schemeCode: 'LBL_QUALITE_TOURISME',
            schemeLabel: 'Qualite Tourisme',
            items: [
              {
                recordId: 'distinction-1',
                schemeId: 'scheme-distinction-1',
                schemeCode: 'LBL_QUALITE_TOURISME',
                schemeLabel: 'Qualite Tourisme',
                valueId: 'value-distinction-1',
                valueCode: 'GRANTED',
                valueLabel: 'Titulaire',
                status: 'granted',
                awardedAt: '2026-03-01',
                validUntil: '2029-03-01',
                disabilityTypesCovered: [],
              },
            ],
          },
        ],
        accessibilityLabels: [
          {
            recordId: 'accessibility-1',
            schemeId: 'scheme-accessibility-1',
            schemeCode: 'LBL_TOURISME_HANDICAP',
            schemeLabel: 'Tourisme & Handicap',
            valueId: 'value-accessibility-1',
            valueCode: 'GRANTED',
            valueLabel: 'Attribue',
            status: 'granted',
            awardedAt: '2026-03-15',
            validUntil: '',
            disabilityTypesCovered: ['motor', 'visual'],
          },
        ],
        accessibilityAmenityCoverage: [
          {
            code: 'acc_parking',
            label: 'Parking adapte',
            disabilityTypes: ['motor'],
          },
        ],
        schemeOptions: [
          {
            id: 'scheme-distinction-1',
            code: 'LBL_QUALITE_TOURISME',
            label: 'Qualite Tourisme',
            selectionMode: 'single',
            isAccessibility: false,
            valueOptions: [{ id: 'value-distinction-1', code: 'GRANTED', label: 'Titulaire' }],
          },
          {
            id: 'scheme-accessibility-1',
            code: 'LBL_TOURISME_HANDICAP',
            label: 'Tourisme & Handicap',
            selectionMode: 'single',
            isAccessibility: true,
            valueOptions: [{ id: 'value-accessibility-1', code: 'GRANTED', label: 'Attribue' }],
          },
        ],
        unavailableReason: null,
      },
      capacityPolicies: {
        metricOptions: [{ id: 'metric-rooms', code: 'ROOM_COUNT', label: 'Nombre de chambres' }],
        capacityItems: [
          {
            recordId: null,
            metricId: 'metric-rooms',
            metricCode: 'ROOM_COUNT',
            metricLabel: 'Nombre de chambres',
            unit: 'unites',
            value: '24',
            effectiveFrom: '',
            effectiveTo: '',
          },
        ],
        groupPolicy: {
          minSize: '8',
          maxSize: '40',
          groupOnly: false,
          notes: 'Sur reservation',
        },
        petPolicy: {
          hasPolicy: true,
          accepted: true,
          conditions: 'Supplement menage',
        },
        unavailableReason: null,
      },
      pricing: {
        priceKindOptions: [{ id: 'kind-room', code: 'ROOM', label: 'Chambre' }],
        priceUnitOptions: [{ id: 'unit-night', code: 'NIGHT', label: 'Nuit' }],
        prices: [
          {
            recordId: 'price-1',
            kindId: 'kind-room',
            kindCode: 'ROOM',
            kindLabel: 'Chambre',
            unitId: 'unit-night',
            unitCode: 'NIGHT',
            unitLabel: 'Nuit',
            amount: '120',
            amountMax: '160',
            currency: 'EUR',
            seasonCode: 'HS',
            indicationCode: 'FROM',
            ageMinEnfant: '',
            ageMaxEnfant: '',
            ageMinJunior: '',
            ageMaxJunior: '',
            validFrom: '2026-06-01',
            validTo: '2026-09-30',
            conditions: 'Petit-dejeuner inclus',
            source: 'catalogue',
            periods: [
              {
                recordId: 'period-1',
                startDate: '2026-07-01',
                endDate: '2026-08-31',
                startTime: '',
                endTime: '',
                note: 'Haute saison',
              },
            ],
          },
        ],
        discounts: [
          {
            recordId: 'discount-1',
            conditions: 'A partir de 10 personnes',
            discountPercent: '12',
            discountAmount: '',
            currency: 'EUR',
            minGroupSize: '10',
            maxGroupSize: '',
            validFrom: '2026-05-01',
            validTo: '2026-10-31',
            source: 'commercial',
          },
        ],
        promotions: [
          {
            promotionId: 'promotion-1',
            code: 'SUMMER26',
            name: 'Offre ete',
            discountType: 'percent',
            discountValue: '15',
            currency: '',
            validFrom: '2026-07-01',
            validTo: '2026-08-31',
            isActive: true,
            isPublic: true,
          },
        ],
        promotionsUnavailableReason: null,
        unavailableReason: null,
      },
      openings: {
        periods: [
          {
            recordId: 'opening-period-1',
            order: '1',
            bucket: 'current',
            label: 'Periode courante',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            closedDays: [],
            weekdays: [
              {
                code: 'monday',
                label: 'Lundi',
                slots: [{ start: '09:30', end: '17:00' }],
              },
              {
                code: 'sunday',
                label: 'Dimanche',
                slots: [{ start: '09:30', end: '17:00' }],
              },
            ],
          },
        ],
        unavailableReason: null,
      },
      providerFollowUp: {
        notes: [
          {
            id: 'follow-up-note-1',
            body: 'Prestataire relance pour finaliser la convention 2026.',
            audience: 'private',
            category: 'followup',
            isPinned: true,
            isArchived: false,
            canEdit: true,
            canDelete: true,
            language: 'fr',
            createdAt: '2026-03-25T08:00:00Z',
            updatedAt: '2026-03-26T09:30:00Z',
            createdById: 'user-1',
            createdByName: 'Equipe RUN',
            createdByAvatarUrl: '',
          },
        ],
        interactionsUnavailableReason: "Le live actuel n'expose pas encore les interactions CRM prestataire dans le workspace objet.",
        tasksUnavailableReason: "Le live actuel n'expose pas encore les taches CRM prestataire dans le workspace objet.",
      },
      relationships: {
        organizationLinks: [
          {
            id: 'org-1',
            source: 'org_link',
            type: 'ORG',
            name: 'Office de tourisme',
            status: 'published',
            roleId: 'org-role-1',
            roleCode: 'publisher',
            roleLabel: 'Diffuseur',
            note: 'Structure porteuse principale',
            contacts: [
              {
                id: 'org-contact-1',
                kindCode: 'phone',
                kindLabel: 'Telephone',
                roleCode: 'accueil',
                roleLabel: 'Accueil',
                value: '0262 00 00 00',
                isPublic: true,
                isPrimary: true,
                position: '1',
              },
            ],
          },
        ],
        actors: [
          {
            id: 'actor-1',
            displayName: 'Claire Martin',
            firstName: 'Claire',
            lastName: 'Martin',
            gender: 'f',
            roleId: 'actor-role-1',
            roleCode: 'manager',
            roleLabel: 'Gestionnaire',
            visibility: 'extended',
            isPrimary: true,
            validFrom: '2026-01-01',
            validTo: '',
            note: 'Interlocutrice principale',
            contacts: [
              {
                id: 'actor-contact-1',
                kindCode: 'email',
                kindLabel: 'Email',
                roleCode: 'direct',
                roleLabel: 'Direct',
                value: 'claire@example.com',
                isPublic: false,
                isPrimary: true,
                position: '1',
              },
            ],
          },
        ],
        relatedObjects: [
          {
            id: 'rel-1',
            name: 'Belvedere des hauts',
            type: 'PCU',
            status: 'published',
            relationTypeId: 'rel-type-1',
            relationTypeCode: 'ETAPE',
            relationTypeLabel: 'Etape',
            direction: 'associated',
            note: 'Etape recommandee',
            distanceM: '2400',
          },
        ],
        organizationLinkWriteUnavailableReason: 'Lecture seule ORG',
        actorWriteUnavailableReason: 'Lecture seule acteurs',
        actorConsentUnavailableReason: 'Consentements non exposes',
        relatedObjectWriteUnavailableReason: 'Lecture seule relations',
      },
      memberships: {
        campaignOptions: [
          { id: 'campaign-1', code: '2026', label: 'Campagne 2026' },
        ],
        tierOptions: [
          { id: 'tier-1', code: 'PREMIUM', label: 'Premium' },
        ],
        scopeOptions: [
          { orgObjectId: 'ORG0001', label: 'Office de tourisme', isPrimary: true },
        ],
        items: [
          {
            recordId: 'membership-1',
            scope: 'object',
            orgObjectId: 'ORG0001',
            orgLabel: 'Office de tourisme',
            campaignId: 'campaign-1',
            campaignCode: '2026',
            campaignLabel: 'Campagne 2026',
            tierId: 'tier-1',
            tierCode: 'PREMIUM',
            tierLabel: 'Premium',
            status: 'paid',
            startsAt: '2026-01-01',
            endsAt: '2026-12-31',
            paymentDate: '2026-01-10',
            metadataJson: '{\"invoice\":\"INV-2026-01\"}',
            visibilityImpact: 'Visibilite active',
          },
        ],
        unavailableReason: null,
      },
      legal: {
        typeOptions: [
          {
            id: 'legal-type-1',
            code: 'safety_certificate',
            label: 'Certificat de securite',
            category: 'accommodation',
            isPublic: true,
            isRequired: true,
          },
        ],
        records: [
          {
            recordId: 'legal-record-1',
            typeId: 'legal-type-1',
            typeCode: 'safety_certificate',
            typeLabel: 'Certificat de securite',
            category: 'accommodation',
            isPublic: true,
            isRequired: true,
            valueJson: '{\"reference\":\"SAFE-2026\"}',
            documentId: '11111111-1111-4111-8111-111111111111',
            validFrom: '2026-01-01',
            validTo: '2026-12-31',
            validityMode: 'fixed_end_date',
            status: 'active',
            documentRequestedAt: '2026-01-03T09:00',
            documentDeliveredAt: '2026-01-10T09:00',
            note: 'Controle annuel OK',
            daysUntilExpiry: '200',
          },
        ],
        compliance: {
          complianceStatus: 'expiring',
          requiredCount: 3,
          validCount: 2,
          expiringCount: 1,
          missingCount: 1,
          compliancePercentage: 66.67,
          details: [
            {
              typeCode: 'safety_certificate',
              typeLabel: 'Certificat de securite',
              category: 'accommodation',
              isRequired: true,
              hasRecord: true,
              isValid: true,
              status: 'active',
              validTo: '2026-12-31',
              daysUntilExpiry: '200',
            },
            {
              typeCode: 'fire_safety',
              typeLabel: 'Securite incendie',
              category: 'accommodation',
              isRequired: true,
              hasRecord: false,
              isValid: false,
              status: 'missing',
              validTo: '',
              daysUntilExpiry: '',
            },
          ],
        },
        unavailableReason: null,
      },
    },
    permissions: {
      generalInfo: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
      },
      taxonomy: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
      },
      publication: {
        canDirectWrite: true,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: null,
      },
      syncIdentifiers: {
        canDirectWrite: false,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: 'Lecture seule',
      },
      location: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
        canEditPlaces: false,
        canEditZones: false,
      },
      descriptions: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
        canEditPlaceDescriptions: false,
      },
      media: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
        canEditPlaceMedia: false,
      },
      contacts: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
      },
      characteristics: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
      },
      distinctions: {
        canDirectWrite: false,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: 'Lecture seule',
      },
      capacityPolicies: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
      },
      pricing: {
        canDirectWrite: true,
        canPrepareProposal: true,
        canSubmitProposal: false,
        disabledReason: null,
      },
      openings: {
        canDirectWrite: false,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: 'Lecture seule',
      },
      providerFollowUp: {
        canDirectWrite: true,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: null,
      },
      relationships: {
        canDirectWrite: false,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: 'Lecture seule',
      },
      memberships: {
        canDirectWrite: true,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: null,
      },
      legal: {
        canDirectWrite: true,
        canPrepareProposal: false,
        canSubmitProposal: false,
        disabledReason: null,
      },
    },
  };
}

jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectWorkspaceQuery: (...args: unknown[]) => mockUseObjectWorkspaceQuery(...args),
  useSaveObjectWorkspaceModuleMutation: () => ({
    mutateAsync: mockSaveWorkspaceMutateAsync,
  }),
  usePublishObjectWorkspaceMutation: () => ({
    mutateAsync: mockPublishWorkspaceMutateAsync,
  }),
  useAddObjectPrivateNoteMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useUpdateObjectPrivateNoteMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useDeleteObjectPrivateNoteMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useObjectPrivateNoteWriteAccessQuery: () => ({
    data: true,
    isSuccess: true,
    isError: false,
  }),
}));

jest.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({
    peers: [],
    me: { userId: 'me', name: 'Me', avatar: 'ME', color: '#000' },
    lockedFields: {},
    typingUsers: [],
    lockField: jest.fn(),
    unlockField: jest.fn(),
    announceTyping: jest.fn(),
  }),
}));

describe('ObjectDrawer workspace drafts', () => {
  beforeEach(() => {
    useUiStore.setState({ drawerObjectId: 'obj-1' });
    useObjectDrawerStore.setState({ activeSection: 'general-info', mode: 'edit', dirtyObjects: {} });
    useSessionStore.setState({ role: 'tourism_agent', status: 'ready' });
    mockUseObjectWorkspaceQuery.mockClear();
    mockSaveWorkspaceMutateAsync.mockReset();
    mockPublishWorkspaceMutateAsync.mockReset();
  });

  it('does not overwrite a local tab draft when the same object refetches', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
        description: 'Initial description',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    const { rerender } = render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.change(screen.getByDisplayValue('Hotel A'), { target: { value: 'Hotel A Draft' } });
    expect(screen.getByDisplayValue('Hotel A Draft')).toBeInTheDocument();

    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A Refetched',
        description: 'Server update',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    rerender(<ObjectDrawer objectId="obj-1" />);

    expect(screen.getByDisplayValue('Hotel A Draft')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hotel A Refetched')).not.toBeInTheDocument();
  });

  it('resets the workspace draft when switching to another object', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
        description: 'Initial description',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    const { rerender } = render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.change(screen.getByDisplayValue('Hotel A'), { target: { value: 'Hotel A Draft' } });

    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-2',
        name: 'Restaurant B',
        description: 'Fresh record',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    rerender(<ObjectDrawer objectId="obj-2" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    expect(screen.getByDisplayValue('Restaurant B')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hotel A Draft')).not.toBeInTheDocument();
  });

  it('shows a loading skeleton instead of the object technical id while the workspace is fetching', () => {
    useObjectDrawerStore.setState({ activeSection: 'general-info', mode: 'view', dirtyObjects: {} });

    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="LOIRUN000000000W" />);

    expect(screen.getByTestId('drawer-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('LOIRUN000000000W')).not.toBeInTheDocument();
    expect(screen.queryByText(/chargement de la fiche/i)).not.toBeInTheDocument();
  });

  it('guards tab navigation when the current module is dirty', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.change(screen.getByDisplayValue('Hotel A'), { target: { value: 'Hotel A Draft' } });
    fireEvent.click(screen.getByRole('button', { name: /localisation/i }));

    expect(screen.getByRole('heading', { name: /modifications non sauvegardees/i })).toBeInTheDocument();
    expect(useObjectDrawerStore.getState().activeSection).toBe('general-info');
  });

  it('renders the publication module as a dedicated workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    const navigation = screen.getByRole('navigation', { name: /navigation workspace objet/i });
    const navigationButtons = within(navigation).getAllByRole('button');
    expect(navigationButtons[navigationButtons.length - 1]).toHaveTextContent(/publication/i);

    fireEvent.click(screen.getByRole('button', { name: /publication/i }));

    expect(screen.getByRole('heading', { name: /^publication$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/visibilite commerciale/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publier/i })).toBeInTheDocument();
  });

  it('hides the synchronisation tab for non super admins', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    expect(screen.queryByRole('button', { name: /synchronisation/i })).not.toBeInTheDocument();
  });

  it('shows the synchronisation tab only for super admins and keeps it last', () => {
    useSessionStore.setState({ role: 'super_admin', status: 'ready' });
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    const navigation = screen.getByRole('navigation', { name: /navigation workspace objet/i });
    const navigationButtons = within(navigation).getAllByRole('button');
    expect(navigationButtons[navigationButtons.length - 1]).toHaveTextContent(/synchronisation/i);

    fireEvent.click(screen.getByRole('button', { name: /synchronisation/i }));

    expect(screen.getByRole('heading', { name: /^synchronisation$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /liens de synchronisation/i })).toBeInTheDocument();
  });

  it('merges classifications into the general information tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    expect(screen.queryByRole('button', { name: /classifications/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /informations generales/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /informations generales et classements/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /classements et categories/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/visibilite commerciale/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/classement/i)).toBeInTheDocument();
  });

  it('adapts visible classifications to the object type', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-2',
        name: 'Restaurant B',
        type: 'RES',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-2" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    expect(screen.getByRole('heading', { name: /informations generales et classements/i })).toBeInTheDocument();
    expect(screen.getByText(/aucun classement ou categorie specifique n est prevu pour ce type de fiche/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/classement/i)).not.toBeInTheDocument();
  });

  it('renders the media module as a dedicated workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /médias/i }));

    expect(screen.getByRole('heading', { name: /médias/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un media/i })).toBeInTheDocument();
  });

  it('renders the contacts module as an object-only workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByText(/^Contacts$/i).closest('button') as HTMLElement);

    expect(screen.getByRole('heading', { name: /^contacts$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un contact/i })).toBeInTheDocument();
  });

  it('renders the characteristics module as a transversal workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /équipements & services/i }));

    expect(screen.getByRole('heading', { name: /équipements & services/i })).toBeInTheDocument();
    expect(screen.getByText(/service et accueil/i)).toBeInTheDocument();
    expect(screen.getByText(/carte bancaire/i)).toBeInTheDocument();
  });

  it('renders the distinctions module as a dedicated workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /labels & certifications/i }));

    expect(screen.getByRole('heading', { name: /labels & certifications/i })).toBeInTheDocument();
    expect(screen.getAllByText(/tourisme & handicap/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/parking adapte/i)).toBeInTheDocument();
  });

  it('renders the capacity and policies module as a transversal workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /capacités/i }));

    expect(screen.getByRole('heading', { name: /capacites et politiques/i })).toBeInTheDocument();
    expect(screen.getByText(/accueil collectif/i)).toBeInTheDocument();
    expect(screen.getByText(/conditions d accueil/i)).toBeInTheDocument();
  });

  it('renders the pricing module as a dedicated workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByText(/^Tarifs$/i).closest('button') as HTMLElement);

    expect(screen.getByRole('heading', { name: /^tarifs$/i })).toBeInTheDocument();
    expect(screen.getByText(/petit-dejeuner inclus/i)).toBeInTheDocument();
    expect(screen.getByText(/summer26/i)).toBeInTheDocument();
  });

  it('renders the openings module as a dedicated workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /horaires/i }));

    expect(screen.getByRole('heading', { name: /^horaires$/i })).toBeInTheDocument();
    expect(screen.getByText(/periode courante/i)).toBeInTheDocument();
    expect(screen.getAllByText(/09:30 -> 17:00/i)).toHaveLength(2);
  });

  it('keeps coordinates editable in the map card and syncs them back to the pin', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
        latitude: '-21.339100',
        longitude: '55.478100',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /localisation/i }));

    expect(screen.getAllByLabelText(/latitude/i)).toHaveLength(1);
    expect(screen.getAllByLabelText(/longitude/i)).toHaveLength(1);
    expect(screen.getByDisplayValue('-21.339100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('55.478100')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-location-map')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-location-map')).toHaveAttribute('data-map-style', expect.stringContaining('openfreemap'));
    expect(screen.getByTestId('workspace-location-marker')).toHaveAttribute('data-latitude', '-21.3391');
    expect(screen.getByTestId('workspace-location-marker')).toHaveAttribute('data-longitude', '55.4781');

    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '-21.300000' } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '55.600000' } });

    expect(screen.getByTestId('workspace-location-marker')).toHaveAttribute('data-latitude', '-21.3');
    expect(screen.getByTestId('workspace-location-marker')).toHaveAttribute('data-longitude', '55.6');
  });

  it('confirms a pin move before updating latitude and longitude in localisation', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
        latitude: '-21.339100',
        longitude: '55.478100',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /localisation/i }));

    fireEvent.click(screen.getByTestId('workspace-location-marker'));

    expect(screen.getByRole('heading', { name: /confirmer la nouvelle position/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('-21.339100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('55.478100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirmer la position/i }));

    expect(screen.getByDisplayValue('-21.123456')).toBeInTheDocument();
    expect(screen.getByDisplayValue('55.501234')).toBeInTheDocument();
  });

  it('renders a structured address form and hides empty read-only location side cards', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
        address1: '12',
        address1Suite: 'bis',
        address2: 'Rue Alfred Picard',
        address3: 'Batiment A, appartement 4',
        postcode: '97430',
        city: 'Le Tampon',
        lieuDit: 'La Plaine des Cafres',
        direction: 'Depuis Saint-Pierre, au rond-point apres la station.',
        latitude: '-21.203853',
        longitude: '55.578477',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /localisation/i }));

    expect(screen.getByLabelText(/^numero$/i)).toHaveValue('12');
    expect(screen.getByLabelText(/suffixe/i)).toHaveValue('bis');
    expect(screen.getByLabelText(/^voie$/i)).toHaveValue('Rue Alfred Picard');
    expect(screen.getByLabelText(/complement d'adresse/i)).toHaveValue('Batiment A, appartement 4');
    expect(screen.getByLabelText(/quartier \/ lieu-dit/i)).toHaveValue('La Plaine des Cafres');
    expect(screen.getByPlaceholderText(/ex\. bis, ter, a/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ex\. sud sauvage/i)).toBeInTheDocument();
    expect(screen.getByText(/12 bis Rue Alfred Picard, Batiment A, appartement 4/i)).toBeInTheDocument();
    expect(screen.queryByText(/aucun lieu rattache disponible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aucune zone touristique disponible/i)).not.toBeInTheDocument();
  });

  it('does not treat a street type as an address suffix when parsing a single address line', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
        address1: '8 RUE Josemont Lauret',
        postcode: '97418',
        city: 'Le Tampon',
        latitude: '-21.203853',
        longitude: '55.578477',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /localisation/i }));

    expect(screen.getByLabelText(/^numero$/i)).toHaveValue('8');
    expect(screen.getByLabelText(/suffixe/i)).toHaveValue('');
    expect(screen.getByLabelText(/^voie$/i)).toHaveValue('RUE Josemont Lauret');
  });

  it('renders the legal compliance module as an internal workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /documents légaux/i }));

    expect(screen.getByRole('heading', { name: /documents légaux/i })).toBeInTheDocument();
    expect(screen.getAllByText(/certificat de securite/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/lecture backend/i)).toBeInTheDocument();
  });

  it('renders the memberships module as an internal workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /adhésions/i }));

    expect(screen.getByRole('heading', { name: /^adhésions$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/campagne 2026/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/visibilite active/i)).toBeInTheDocument();
  });

  it('renders the provider follow-up module as an internal workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /suivi prestataire/i }));

    expect(screen.getByRole('heading', { name: /suivi relation prestataires/i })).toBeInTheDocument();
    expect(screen.getByText(/convention 2026/i)).toBeInTheDocument();
    expect(screen.getAllByText(/journal crm/i)[0]).toBeInTheDocument();
  });

  it('renders the relationships module as an internal workspace tab', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({
        id: 'obj-1',
        name: 'Hotel A',
      }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    act(() => {
      useObjectDrawerStore.setState({ mode: 'edit' });
    });

    fireEvent.click(screen.getByRole('button', { name: /rattachements/i }));

    expect(screen.getByRole('heading', { name: /rattachements/i })).toBeInTheDocument();
    expect(screen.getByText(/office de tourisme/i)).toBeInTheDocument();
    expect(screen.getAllByText(/claire martin/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/belvedere des hauts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^lecture seule$/i).length).toBeGreaterThanOrEqual(1);
  });
});
