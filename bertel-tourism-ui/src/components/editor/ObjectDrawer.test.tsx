import { fireEvent, render, screen } from '@testing-library/react';
import { ObjectDrawer } from './ObjectDrawer';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';

const mockPush = jest.fn();
const mockUseObjectWorkspaceQuery = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectWorkspaceQuery: (...args: unknown[]) => mockUseObjectWorkspaceQuery(...args),
  useLocationReferenceOptionsQuery: () => ({ data: {}, isLoading: false, isError: false, error: null }),
  useSaveObjectWorkspaceModuleMutation: () => ({ mutateAsync: jest.fn() }),
  usePublishObjectWorkspaceMutation: () => ({ mutateAsync: jest.fn() }),
  useAddObjectPrivateNoteMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateObjectPrivateNoteMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteObjectPrivateNoteMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useObjectPrivateNoteWriteAccessQuery: () => ({ data: true, isSuccess: true, isError: false }),
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

const emptyPlan4Modules = {
  tags: { displayed: [], derived: [], library: [] },
  sustainability: { categories: [], equivalentLabels: [] },
  distribution: { channels: [], readonlyReason: null },
  provider: {
    siret: '',
    companyName: '',
    sireneVerified: false,
    legalForm: '',
    nafCode: '',
    consularChamber: '',
    cfeOrganization: '',
    directorFullName: '',
    directorEmail: '',
    directorPhone: '',
    address: '',
    incorporationDate: '',
    readonlyReason: null,
  },
};

const emptyPlan4Permissions = {
  tags: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
  sustainability: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
  distribution: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
  provider: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
};

function buildWorkspaceResource(params: { id: string; name: string; type?: string; description?: string }) {
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
        status: 'published',
      },
    },
    modules: {
      generalInfo: {
        name: params.name,
        nameTranslations: {},
        businessTimezone: 'Indian/Reunion',
        commercialVisibility: 'active',
        regionCode: 'RUN',
        status: 'published',
        publishedAt: '',
        isEditing: false,
        secondaryTypes: [],
      },
      taxonomy: { domains: [], unavailableReason: null },
      publication: {
        status: 'published',
        publishedAt: '',
        isEditing: false,
        moderation: { availability: 'available', pendingCount: 0, unavailableReason: null, items: [] },
        printPublications: { availability: 'available', selectionCount: 0, unavailableReason: null, items: [] },
      },
      syncIdentifiers: {
        objectCreatedAt: '',
        objectUpdatedAt: '',
        objectUpdatedAtSource: 'manual',
        externalIdentifiers: [],
        origins: [],
        externalIdentifiersVisibilityNote: null,
        originsVisibilityNote: null,
      },
      location: {
        main: {
          recordId: null,
          address1: '',
          address1Suite: '',
          address2: '',
          address3: '',
          postcode: '',
          city: '',
          codeInsee: '',
          lieuDit: '',
          direction: '',
          latitude: '',
          longitude: '',
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
          description: { baseValue: params.description ?? '', values: {} },
          chapo: { baseValue: '', values: {} },
          adaptedDescription: { baseValue: '', values: {} },
          mobileDescription: { baseValue: '', values: {} },
          editorialDescription: { baseValue: '', values: {} },
        },
        places: [],
      },
      media: { typeOptions: [], tagOptions: [], objectItems: [], placeItems: [], placeScopeUnavailableReason: null, unavailableReason: null },
      contacts: { kindOptions: [], roleOptions: [], objectItems: [], webItems: [], webKindOptions: [], relatedActorContactsCount: 0, relatedOrganizationContactsCount: 0 },
      characteristics: {
        languageOptions: [],
        languageLevelOptions: [],
        selectedLanguages: [],
        paymentOptions: [],
        selectedPaymentCodes: [],
        environmentOptions: [],
        selectedEnvironmentCodes: [],
        amenityGroups: [],
        selectedAmenityCodes: [],
        unavailableReason: null,
      },
      distinctions: {
        distinctionGroups: [],
        accessibilityLabels: [],
        accessibilityAmenityCoverage: [],
        schemeOptions: [],
        unavailableReason: null,
      },
      capacityPolicies: {
        metricOptions: [],
        capacityItems: [],
        groupPolicy: { minSize: '', maxSize: '', groupOnly: false, notes: '' },
        petPolicy: { accepted: false, conditions: '' },
        unavailableReason: null,
      },
      pricing: {
        priceKindOptions: [],
        priceTypeOptions: [],
        priceSeasonOptions: [],
        priceUnitOptions: [],
        prices: [],
        discounts: [],
        promotions: [],
        promotionsUnavailableReason: null,
        unavailableReason: null,
      },
      rooms: { viewTypeOptions: [], amenityOptions: [], mediaOptions: [], items: [], unavailableReason: null },
      meetingRooms: { equipmentOptions: [], items: [], unavailableReason: null },
      menus: {
        categoryOptions: [],
        dietaryTagOptions: [],
        allergenOptions: [],
        cuisineTypeOptions: [],
        priceKindOptions: [],
        priceUnitOptions: [],
        mediaOptions: [],
        items: [],
        unavailableReason: null,
      },
      activity: {
        durationMin: '',
        minParticipants: '',
        maxParticipants: '',
        difficultyLevel: '',
        guideRequired: false,
        minAge: '',
        equipmentProvided: false,
        equipmentProvidedDetails: '',
        difficultyOptions: [],
        unavailableReason: null,
      },
      places: { items: [], unavailableReason: null },
      event: {
        startDate: '',
        endDate: '',
        startTime: '',
        endTime: '',
        recurring: false,
        recurrenceText: '',
        occurrences: [],
        unavailableReason: null,
      },
      itinerary: {
        distanceKm: '',
        durationMin: '',
        difficultyLevel: '',
        elevationPositiveM: '',
        elevationNegativeM: '',
        loop: false,
        openStatus: '',
        statusNote: '',
        practiceOptions: [],
        practiceCodes: [],
        stages: [],
        sectionsCount: 0,
        profilesCount: 0,
        geometrySummary: '',
        traceEditable: false,
        unavailableReason: null,
      },
      openings: { periods: [], unavailableReason: null },
      providerFollowUp: { notes: [], interactionsUnavailableReason: null, tasksUnavailableReason: null },
      relationships: {
        organizationLinks: [],
        actors: [],
        relatedObjects: [],
        orgRoleOptions: [],
        orgOptions: [],
        actorRoleOptions: [],
        organizationLinkWriteUnavailableReason: null,
        actorWriteUnavailableReason: null,
        actorConsentUnavailableReason: null,
        relatedObjectWriteUnavailableReason: null,
      },
      memberships: { campaignOptions: [], tierOptions: [], scopeOptions: [], items: [], unavailableReason: null },
      legal: {
        typeOptions: [],
        records: [],
        compliance: {
          complianceStatus: 'unknown',
          requiredCount: 0,
          validCount: 0,
          expiringCount: 0,
          missingCount: 0,
          compliancePercentage: 0,
          details: [],
        },
        unavailableReason: null,
      },
      ...emptyPlan4Modules,
    },
    permissions: {
      generalInfo: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      taxonomy: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      publication: { canDirectWrite: true, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      syncIdentifiers: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      location: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null, canEditZones: true },
      places: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      descriptions: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null, canEditCanonical: true, canEditOrgEnrichment: false },
      media: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null, canEditPlaceMedia: false },
      contacts: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      characteristics: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      distinctions: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      capacityPolicies: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      pricing: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      rooms: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      meetingRooms: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      menus: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      activity: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      event: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      itinerary: { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: false, disabledReason: null },
      openings: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      providerFollowUp: { canDirectWrite: true, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      relationships: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      memberships: { canDirectWrite: true, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      legal: { canDirectWrite: true, canPrepareProposal: false, canSubmitProposal: false, disabledReason: null },
      ...emptyPlan4Permissions,
    },
  };
}

describe('ObjectDrawer view-only shell', () => {
  beforeEach(() => {
    mockPush.mockReset();
    useUiStore.setState({ drawerObjectId: 'obj-1' });
    useObjectDrawerStore.setState({ dirtyObjects: {} });
    useSessionStore.setState({ role: 'tourism_agent', status: 'ready' });
    mockUseObjectWorkspaceQuery.mockReset();
  });

  it('shows a loading skeleton instead of the object technical id while fetching', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="LOIRUN000000000W" />);

    expect(screen.getByTestId('drawer-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('LOIRUN000000000W')).not.toBeInTheDocument();
  });

  it('renders the detail preview when the workspace is loaded', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({ id: 'obj-1', name: 'Hotel A', description: 'Vue mer' }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);

    expect(screen.getAllByRole('heading', { name: 'Hotel A' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Vue mer')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /navigation workspace objet/i })).not.toBeInTheDocument();
  });

  it('navigates to the full-page editor when Modifier is clicked', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({ id: 'obj-1', name: 'Hotel A' }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="obj-1" />);
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));

    expect(mockPush).toHaveBeenCalledWith('/objects/obj-1/edit');
  });

  it('PLAN 6 : rend le panneau ORG (pas d’éditeur, renvoi vers /team) pour une ORG', () => {
    mockUseObjectWorkspaceQuery.mockReturnValue({
      data: buildWorkspaceResource({ id: 'org-1', name: 'OTI du Sud', type: 'ORG' }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ObjectDrawer objectId="org-1" />);

    // Panneau ORG explicite au lieu de la fiche touristique.
    expect(screen.getByText(/administration des équipes/i)).toBeInTheDocument();
    // Le bouton « Modifier » (éditeur d'objet) est masqué pour une ORG, même éditeur autorisé.
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    // « Ouvrir l'administration » ferme le drawer puis navigue vers /team.
    fireEvent.click(screen.getByRole('button', { name: /ouvrir l.administration/i }));
    expect(mockPush).toHaveBeenCalledWith('/team');
  });
});
