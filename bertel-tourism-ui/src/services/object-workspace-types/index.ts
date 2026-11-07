import type {
  ObjectWorkspaceGeneralInfo,
  ObjectWorkspaceLocationModule,
  ObjectWorkspacePlacesModule,
  ObjectWorkspacePublicationModule,
  ObjectWorkspaceSyncIdentifiersModule,
  ObjectWorkspaceTaxonomyModule,
} from './core';
import type {
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceDistinctionsModule,
  ObjectWorkspaceSustainabilityModule,
  ObjectWorkspaceTagsModule,
} from './facets';
import type {
  ObjectWorkspaceContactsModule,
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceMediaModule,
} from './content';
import type {
  ObjectWorkspaceCuisineModule,
  ObjectWorkspaceMeetingRoomsModule,
  ObjectWorkspaceMembershipModule,
  ObjectWorkspaceMenusModule,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceRoomsModule,
} from './commercial';
import type {
  ObjectWorkspaceActivityModule,
  ObjectWorkspaceEventModule,
  ObjectWorkspaceItineraryModule,
} from './experience';
import type { ObjectWorkspaceOpeningsModule } from './openings';
import type {
  ObjectWorkspaceDistributionModule,
  ObjectWorkspaceProviderFollowUpModule,
  ObjectWorkspaceProviderModule,
  ObjectWorkspaceRelationshipsModule,
} from './relationships';

export type {
  WorkspaceModuleId,
  ObjectWorkspaceGeneralInfo,
  ObjectWorkspaceTaxonomyPathNode,
  ObjectWorkspaceTaxonomyNodeOption,
  ObjectWorkspaceTaxonomyAssignment,
  ObjectWorkspaceTaxonomyDomain,
  ObjectWorkspaceUnitTypes,
  ObjectWorkspacePositionings,
  ObjectWorkspaceTaxonomyModule,
  ObjectWorkspaceLocationForm,
  ObjectWorkspacePlaceSummary,
  ObjectWorkspaceZoneOption,
  ObjectWorkspaceLocationModule,
  ObjectWorkspacePlaceItem,
  ObjectWorkspacePlacesModule,
  ObjectWorkspaceModerationItem,
  ObjectWorkspacePublicationSelectionItem,
  ObjectWorkspacePublicationModule,
  ObjectWorkspaceExternalIdentifierItem,
  ObjectWorkspaceOriginItem,
  ObjectWorkspaceSyncIdentifiersModule,
} from './core';
export { EMPTY_UNIT_TYPES, EMPTY_POSITIONINGS } from './core';
export type {
  WorkspaceTranslatableField,
  ObjectWorkspaceModuleAvailability,
  WorkspaceReferenceOption,
  WorkspaceMediaOption,
} from './common';
export type {
  ObjectWorkspaceDescriptionScope,
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceLegalTypeOption,
  ObjectWorkspaceLegalRecord,
  ObjectWorkspaceLegalComplianceDetail,
  ObjectWorkspaceLegalComplianceSummary,
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceMediaItem,
  ObjectWorkspaceMediaModule,
  ObjectWorkspaceContactItem,
  ObjectWorkspaceWebChannelItem,
  ObjectWorkspaceContactsModule,
} from './content';
export type {
  ObjectWorkspaceAmenityOption,
  ObjectWorkspaceAmenityGroup,
  ObjectWorkspaceLanguageItem,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceCapacityItem,
  ObjectWorkspaceGroupPolicyForm,
  ObjectWorkspacePetPolicyForm,
  ObjectWorkspaceStayPolicyForm,
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionGroup,
  ObjectWorkspaceAccessibilityAmenityItem,
  ObjectWorkspaceDistinctionSchemeOption,
  ObjectWorkspaceDistinctionsModule,
  ObjectWorkspaceTagItem,
  ObjectWorkspaceTagsModule,
  ObjectWorkspaceSustainabilityAction,
  ObjectWorkspaceSustainabilityCategory,
  ObjectWorkspaceSustainabilityLabel,
  ObjectWorkspaceSustainabilityModule,
} from './facets';
export type {
  ObjectWorkspacePricePeriod,
  ObjectWorkspacePriceItem,
  ObjectWorkspaceDiscountItem,
  ObjectWorkspacePromotionSummary,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceRoomBed,
  ObjectWorkspaceRoomTypeItem,
  ObjectWorkspaceRoomsModule,
  ObjectWorkspaceMeetingRoomItem,
  ObjectWorkspaceMeetingRoomsModule,
  ObjectWorkspaceMenuItem,
  ObjectWorkspaceMenu,
  ObjectWorkspaceMenusModule,
  ObjectWorkspaceCuisineModule,
  ObjectWorkspaceMembershipScopeOption,
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
} from './commercial';
export type {
  ObjectWorkspaceActivityModule,
  ObjectWorkspaceEventOccurrence,
  ObjectWorkspaceEventModule,
  ObjectWorkspaceItineraryStageSummary,
  ObjectWorkspaceItineraryAssocSummary,
  ObjectWorkspaceItineraryModule,
} from './experience';
export type {
  ObjectWorkspaceOpeningBucket,
  ObjectWorkspaceOpeningSlot,
  ObjectWorkspaceOpeningWeekday,
  ObjectWorkspaceOpeningTimeFrame,
  ObjectWorkspaceOpeningTimePeriod,
  ObjectWorkspaceOpeningSchedule,
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningPeriodTypeOption,
  ObjectWorkspaceOpeningsModule,
} from './openings';
export type {
  ObjectWorkspaceFollowUpNote,
  ObjectWorkspaceCrmInteractionItem,
  ObjectWorkspaceCrmTopicCount,
  ObjectWorkspaceProviderFollowUpModule,
  ObjectWorkspaceLinkedContactItem,
  ObjectWorkspaceOrganizationLinkItem,
  ObjectWorkspaceActorLinkItem,
  ObjectWorkspaceRelatedObjectItem,
  ObjectWorkspaceOrgOption,
  ObjectWorkspaceRelationshipsModule,
  ObjectWorkspaceDistributionChannel,
  ObjectWorkspaceDistributionModule,
  ObjectWorkspaceProviderModule,
} from './relationships';

export interface ObjectWorkspaceModules {
  generalInfo: ObjectWorkspaceGeneralInfo;
  taxonomy: ObjectWorkspaceTaxonomyModule;
  distinctions: ObjectWorkspaceDistinctionsModule;
  publication: ObjectWorkspacePublicationModule;
  syncIdentifiers: ObjectWorkspaceSyncIdentifiersModule;
  location: ObjectWorkspaceLocationModule;
  descriptions: ObjectWorkspaceDescriptionsModule;
  places: ObjectWorkspacePlacesModule;
  media: ObjectWorkspaceMediaModule;
  contacts: ObjectWorkspaceContactsModule;
  characteristics: ObjectWorkspaceCharacteristicsModule;
  capacityPolicies: ObjectWorkspaceCapacityPoliciesModule;
  pricing: ObjectWorkspacePricingModule;
  rooms: ObjectWorkspaceRoomsModule;
  meetingRooms: ObjectWorkspaceMeetingRoomsModule;
  menus: ObjectWorkspaceMenusModule;
  cuisine: ObjectWorkspaceCuisineModule;
  activity: ObjectWorkspaceActivityModule;
  event: ObjectWorkspaceEventModule;
  itinerary: ObjectWorkspaceItineraryModule;
  openings: ObjectWorkspaceOpeningsModule;
  providerFollowUp: ObjectWorkspaceProviderFollowUpModule;
  relationships: ObjectWorkspaceRelationshipsModule;
  memberships: ObjectWorkspaceMembershipModule;
  legal: ObjectWorkspaceLegalModule;
  tags: ObjectWorkspaceTagsModule;
  sustainability: ObjectWorkspaceSustainabilityModule;
  distribution: ObjectWorkspaceDistributionModule;
  provider: ObjectWorkspaceProviderModule;
}
