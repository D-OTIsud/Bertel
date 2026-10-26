import type { Meta, StoryObj } from '@storybook/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditorModalContext } from '../primitives/EditorModal';
import { OpeningPeriodEditModal } from './OpeningPeriodEditModal';
import { ClosureEditModal } from './ClosureEditModal';
import { DiscountEditModal } from './DiscountEditModal';
import { MeetingRoomEditModal } from './MeetingRoomEditModal';
import { RoomEditModal } from './RoomEditModal';
import { LegalDocumentEditModal } from './LegalDocumentEditModal';
import { MediaEditModal } from './MediaEditModal';
import { StageEditModal } from './StageEditModal';
import { PlaceEditModal } from './PlaceEditModal';
import { AssociatedObjectModal } from './AssociatedObjectModal';
import { CrmInteractionModal } from '../../crm/CrmInteractionModal';
import { CrmTaskModal } from '../../crm/CrmTaskModal';
import { PricingLineEditModal } from './PricingLineEditModal';
import { createPricingDraft } from '../sections/pricing-row';
import { buildNewDocumentRecord } from '../sections/legal-edit';
import type { ObjectWorkspacePricingModule } from '../../../services/object-workspace-parser';
import { createPeriodDraft } from '../sections/opening-period-edit';
import { createDiscountRow } from '../sections/discount-row';
import '../object-editor.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
queryClient.setQueryData(['location-reference-options'], { lieuDits: [] });
queryClient.setQueryData(['crm-assignees'], [{ userId: 'user-example', displayName: 'Camille Payet' }]);
const itineraryTrack = {
  type: 'LineString',
  coordinates: [
    [55.5, -21.3],
    [55.51, -21.31],
    [55.52, -21.305],
  ],
};
queryClient.setQueryData(
  ['itinerary-nearby-objects', 'itinerary-example', [55.48, -21.33, 55.540000000000006, -21.28]],
  [
    {
      id: 'restaurant-example',
      name: 'Le jardin créole',
      type: 'RES',
      status: 'published',
      location: { lon: 55.51, lat: -21.31, city: 'Saint-Joseph' },
    },
    {
      id: 'visit-example',
      name: 'Jardin botanique',
      type: 'VIS',
      status: 'published',
      location: { lon: 55.513, lat: -21.308, city: 'Saint-Joseph' },
    },
  ],
);
const meta: Meta = {
  title: 'Editor/Modal models/Horaires et tarifs',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <EditorModalContext.Provider value="Domaine du Bel Air · Hébergement">
          <Story />
        </EditorModalContext.Provider>
      </QueryClientProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj;
const noop = () => undefined;
const period = {
  ...createPeriodDraft(),
  recordId: 'period-example',
  label: 'Saison principale',
  startDate: '2000-11-01',
  endDate: '2000-03-31',
  weekdayNotes: { tuesday: 'Sur réservation', thursday: 'Sur réservation' },
  weekdays: createPeriodDraft().weekdays.map((day) => ({
    ...day,
    slots:
      day.code === 'monday'
        ? []
        : [
            { start: '09:00', end: '12:00' },
            { start: '14:00', end: '18:00' },
          ],
  })),
};

export const Periode: Story = {
  render: () => (
    <OpeningPeriodEditModal
      open
      mode="edit"
      draft={period}
      existingPeriods={[period]}
      periodTypeOptions={[
        { code: 'high', label: 'Haute saison', color: '#176b6a', allYear: false },
        { code: 'mid', label: 'Mi-saison', color: '#c08a3e', allYear: false },
        { code: 'low', label: 'Hors saison', color: '#8b969b', allYear: false },
      ]}
      onClose={noop}
      onSave={noop}
    />
  ),
};

export const Exception: Story = {
  render: () => <ClosureEditModal open mode="add" onClose={noop} onSave={noop} />,
};
export const Remise: Story = {
  render: () => (
    <DiscountEditModal open mode="add" draft={createDiscountRow()} onClose={noop} onSave={noop} />
  ),
};
export const Salle: Story = {
  render: () => (
    <MeetingRoomEditModal
      open
      room={{
        recordId: null,
        name: '',
        nameTranslations: {},
        areaM2: '',
        capacityTheatre: '',
        capacityU: '',
        capacityClassroom: '',
        capacityBoardroom: '',
        equipmentCodes: [],
      }}
      equipmentOptions={['Écran', 'Lumières', 'Micro', 'Paperboard', 'Pupitre', 'Scène', 'Sonorisation'].map(
        (label, i) => ({ id: String(i), code: `equipment_${i}`, label }),
      )}
      onClose={noop}
      onSave={noop}
    />
  ),
};

const ref = (code: string, label: string) => ({ id: code, code, label });
const pricing: ObjectWorkspacePricingModule = {
  priceKindOptions: [ref('adult', 'Adulte'), ref('child', 'Enfant'), ref('group', 'Groupe')],
  priceTypeOptions: [ref('standard', 'Tarif principal'), ref('option', 'Option / extra')],
  priceUnitOptions: [ref('night', 'Par nuit'), ref('person', 'Par personne')],
  priceSeasonOptions: [ref('low', 'Basse saison'), ref('high', 'Haute saison')],
  prices: [],
  discounts: [],
  promotions: [],
  promotionsUnavailableReason: null,
  unavailableReason: null,
};
export const Tarif: Story = {
  render: () => (
    <PricingLineEditModal
      open
      mode="add"
      pricing={pricing}
      draft={createPricingDraft(pricing)}
      archetype="HEB"
      typeCode="HOT"
      onClose={noop}
      onSave={noop}
    />
  ),
};

export const Chambre: Story = {
  render: () => (
    <RoomEditModal
      open
      room={{
        recordId: null,
        code: 'room-example',
        name: '',
        nameTranslations: {},
        description: '',
        descriptionTranslations: {},
        capacityAdults: '',
        capacityChildren: '',
        capacityTotal: '',
        sizeSqm: '',
        bedConfig: '',
        bedConfigTranslations: {},
        quantity: '',
        floorLevel: '',
        viewTypeId: '',
        viewTypeCode: '',
        viewTypeLabel: '',
        roomTypeId: '',
        roomTypeCode: '',
        roomTypeLabel: '',
        basePrice: '',
        currency: 'EUR',
        accessible: false,
        published: true,
        position: '1',
        amenityCodes: [],
        mediaIds: [],
        beds: [],
      }}
      module={{
        roomTypeOptions: [
          ref('single', 'Simple'),
          ref('double', 'Double'),
          ref('twin', 'Lits jumeaux'),
          ref('triple', 'Triple'),
          ref('family', 'Familiale'),
          ref('suite', 'Suite'),
        ],
        viewTypeOptions: [ref('sea', 'Vue mer')],
        amenityOptions: [ref('wifi', 'Wi-Fi'), ref('air_conditioning', 'Climatisation')],
        amenityGroups: [
          {
            familyCode: 'general',
            familyLabel: 'Général',
            options: [
              { ...ref('wifi', 'Wi-Fi'), disabilityTypes: [] },
              { ...ref('air_conditioning', 'Climatisation'), disabilityTypes: [] },
            ],
          },
        ],
        bedTypeOptions: [ref('single', 'Lit simple'), ref('double', 'Lit double')],
        mediaOptions: [],
      }}
      onClose={noop}
      onSave={noop}
    />
  ),
};

const legalTypes = [
  {
    ...ref('kbis', 'Extrait KBIS'),
    description: 'Justificatif d’immatriculation de l’entreprise.',
    category: 'business',
    isPublic: false,
    isRequired: false,
  },
  {
    ...ref('erp', 'Sécurité incendie (ERP)'),
    description: 'Suivi de sécurité de l’établissement.',
    category: 'business',
    isPublic: false,
    isRequired: false,
  },
];
export const Document: Story = {
  render: () => (
    <LegalDocumentEditModal
      open
      mode="add"
      draft={buildNewDocumentRecord(legalTypes[0])}
      typeOptions={legalTypes}
      objectId=""
      onClose={noop}
      onSave={noop}
    />
  ),
};

export const Media: Story = {
  render: () => (
    <MediaEditModal
      open
      media={{
        id: 'media-example',
        scope: 'object',
        placeId: null,
        scopeLabel: 'Objet',
        typeId: 'photo',
        typeCode: 'photo',
        typeLabel: 'Photo',
        title: 'Façade',
        titleTranslations: {},
        description: 'La façade et la terrasse de l’établissement',
        descriptionTranslations: {},
        url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="360"%3E%3Crect width="600" height="360" fill="%23dce9e7"/%3E%3Cpath d="M0 360L180 100L350 290L450 200L600 360" fill="%236b9e97"/%3E%3C/svg%3E',
        credit: 'OTI du Sud',
        visibility: 'public',
        position: '1',
        width: '600',
        height: '360',
        rightsExpiresAt: '',
        kind: '',
        isMain: false,
        isPublished: true,
        tags: [],
      }}
      typeOptions={[ref('photo', 'Photo'), ref('video', 'Vidéo')]}
      languages={['fr', 'en', 'cre']}
      objectId=""
      onClose={noop}
      onSave={noop}
    />
  ),
};

export const Etape: Story = {
  render: () => (
    <StageEditModal
      open
      stage={{
        recordId: null,
        name: '',
        description: '',
        position: '1',
        kind: 'panorama',
        lng: '',
        lat: '',
        mediaIds: [],
      }}
      stageKindOptions={[
        ref('start', 'Départ'),
        ref('stop', 'Étape'),
        ref('poi', 'Point d’intérêt'),
        ref('panorama', 'Panorama'),
        ref('water', 'Point d’eau'),
        ref('parking', 'Parking'),
        ref('end', 'Arrivée'),
      ]}
      mediaOptions={[]}
      trackGeojson={{
        type: 'LineString',
        coordinates: [
          [55.5, -21.3],
          [55.51, -21.31],
          [55.52, -21.305],
        ],
      }}
      onClose={noop}
      onSave={noop}
    />
  ),
};

export const Site: Story = {
  render: () => (
    <PlaceEditModal
      open
      place={{
        recordId: null,
        label: '',
        position: 1,
        descriptionRecordId: null,
        description: { baseValue: '', values: {} },
        visibility: 'public',
        location: {
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
      }}
      activeLanguage="fr"
      localLanguage="fr"
      zoneOptions={[{ code: '97412', label: 'Saint-Joseph' }]}
      onClose={noop}
      onSave={noop}
    />
  ),
};

export const Interaction: Story = {
  render: () => (
    <CrmInteractionModal
      fixedContext={{ objectId: 'object-example', objectName: 'Domaine du Bel Air' }}
      actorOptions={[{ actorId: 'actor-example', displayName: 'Marie Payet' }]}
      topics={[
        { code: 'information', name: 'Demande d’information' },
        { code: 'visit', name: 'Visite' },
      ]}
      onClose={noop}
      onSaved={noop}
    />
  ),
};

export const Tache: Story = {
  render: () => (
    <CrmTaskModal
      picker="select"
      objectOptions={[{ objectId: 'object-example', objectName: 'Domaine du Bel Air' }]}
      onClose={noop}
      onSaved={noop}
    />
  ),
};

export const FicheLiee: Story = {
  render: () => (
    <AssociatedObjectModal
      open
      objectId="itinerary-example"
      trackGeojson={itineraryTrack}
      roleOptions={[
        ref('stop', 'Étape'),
        ref('visit', 'À visiter'),
        ref('restaurant', 'Où manger'),
        ref('accommodation', 'Où dormir'),
      ]}
      onClose={noop}
      onSave={noop}
    />
  ),
};
