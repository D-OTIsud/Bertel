import type { WorkspaceMediaOption, WorkspaceReferenceOption } from './common';
import type { ObjectWorkspaceAmenityGroup } from './facets';

export interface ObjectWorkspacePricePeriod {
  recordId: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  note: string;
}

export interface ObjectWorkspacePriceItem {
  recordId: string | null;
  kindId: string;
  kindCode: string;
  kindLabel: string;
  unitId: string;
  unitCode: string;
  unitLabel: string;
  amount: string;
  amountMax: string;
  currency: string;
  seasonCode: string;
  indicationCode: string;
  ageMinEnfant: string;
  ageMaxEnfant: string;
  ageMinJunior: string;
  ageMaxJunior: string;
  validFrom: string;
  validTo: string;
  conditions: string;
  source: string;
  periods: ObjectWorkspacePricePeriod[];
}

export interface ObjectWorkspaceDiscountItem {
  recordId: string | null;
  conditions: string;
  discountPercent: string;
  discountAmount: string;
  currency: string;
  minGroupSize: string;
  maxGroupSize: string;
  validFrom: string;
  validTo: string;
  source: string;
}

export interface ObjectWorkspacePromotionSummary {
  promotionId: string;
  code: string;
  name: string;
  discountType: string;
  discountValue: string;
  currency: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  isPublic: boolean;
}

export interface ObjectWorkspacePricingModule {
  priceKindOptions: WorkspaceReferenceOption[];
  /** §13 two-axis: tariff type (ref_code domain 'price_type'), persisted in object_price.indication_code. */
  priceTypeOptions: WorkspaceReferenceOption[];
  /** §13 season scope (ref_code domain 'season_type'), persisted in object_price.season_code. */
  priceSeasonOptions: WorkspaceReferenceOption[];
  priceUnitOptions: WorkspaceReferenceOption[];
  prices: ObjectWorkspacePriceItem[];
  discounts: ObjectWorkspaceDiscountItem[];
  promotions: ObjectWorkspacePromotionSummary[];
  promotionsUnavailableReason: string | null;
  unavailableReason: string | null;
}

/** One structured bed entry of a room type (§72): quantity × bed type from ref_code 'bed_type'. */
export interface ObjectWorkspaceRoomBed {
  bedTypeId: string;
  bedTypeCode: string;
  bedTypeLabel: string;
  quantity: string;
  position?: number | null;
}

export interface ObjectWorkspaceRoomTypeItem {
  recordId: string | null;
  /** Editor-only marker: stable client IDs on drafts must not be mistaken for persisted rows. */
  isNew?: boolean;
  code: string;
  name: string;
  rawName?: string | null;
  extra?: Record<string, unknown> | null;
  nameTranslations: Record<string, string>;
  description: string;
  descriptionTranslations: Record<string, string>;
  capacityAdults: string;
  capacityChildren: string;
  capacityTotal: string;
  sizeSqm: string;
  bedConfig: string;
  bedConfigTranslations: Record<string, string>;
  quantity: string;
  floorLevel: string;
  viewTypeId: string;
  viewTypeCode: string;
  viewTypeLabel: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeLabel: string;
  basePrice: string;
  currency: string;
  accessible: boolean;
  rawAccessible?: boolean | null;
  published: boolean;
  rawPublished?: boolean | null;
  position: string;
  amenityCodes: string[];
  mediaIds: string[];
  beds: ObjectWorkspaceRoomBed[];
}

export interface ObjectWorkspaceRoomsModule {
  viewTypeOptions: WorkspaceReferenceOption[];
  roomTypeOptions: WorkspaceReferenceOption[];
  amenityOptions: WorkspaceReferenceOption[];
  /** Room equipment catalog grouped by family, ordered by industry popularity (§73):
   *  families by total usage, options by per-amenity usage. Drives the §06 collapsible picker. */
  amenityGroups: ObjectWorkspaceAmenityGroup[];
  bedTypeOptions: WorkspaceReferenceOption[];
  mediaOptions: WorkspaceMediaOption[];
  items: ObjectWorkspaceRoomTypeItem[];
  /** IDs present when this editor snapshot was loaded; only omissions from this set are deletions. */
  knownRoomIds?: string[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceMeetingRoomItem {
  recordId: string | null;
  uid?: string;
  name: string;
  rawName?: string | null;
  extra?: Record<string, unknown> | null;
  equipmentDetails?: { equipmentId: string; note: string | null; position: number | null }[];
  nameTranslations: Record<string, string>;
  areaM2: string;
  capacityTheatre: string;
  capacityU: string;
  capacityClassroom: string;
  capacityBoardroom: string;
  equipmentCodes: string[];
}

export interface ObjectWorkspaceMeetingRoomsModule {
  equipmentOptions: WorkspaceReferenceOption[];
  items: ObjectWorkspaceMeetingRoomItem[];
  /** IDs present when this editor snapshot was loaded; protects rooms added concurrently. */
  knownRoomIds?: string[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceMenuItem {
  recordId: string | null;
  name: string;
  description: string;
  price: string;
  currency: string;
  kindId: string;
  kindCode: string;
  kindLabel: string;
  unitId: string;
  unitCode: string;
  unitLabel: string;
  mediaIds: string[];
  available: boolean;
  position: string;
  dietaryTagCodes: string[];
  allergenCodes: string[];
  cuisineTypeCodes: string[];
  // §06 P2b — section du plat (Entrée/Plat/Dessert…), object_menu_item.section_id → ref_code menu_category
  sectionCode: string;
  sectionId: string;
  sectionLabel: string;
}

export interface ObjectWorkspaceMenu {
  recordId: string | null;
  categoryId: string;
  categoryCode: string;
  categoryLabel: string;
  name: string;
  rawName?: string | null;
  description: string;
  active: boolean;
  visibility: string;
  rawVisibility?: string | null;
  position: string;
  items: ObjectWorkspaceMenuItem[];
}

export interface ObjectWorkspaceMenusModule {
  categoryOptions: WorkspaceReferenceOption[];
  dietaryTagOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  cuisineTypeOptions: WorkspaceReferenceOption[];
  priceKindOptions: WorkspaceReferenceOption[];
  priceUnitOptions: WorkspaceReferenceOption[];
  mediaOptions: WorkspaceMediaOption[];
  items: ObjectWorkspaceMenu[];
  unavailableReason: string | null;
}

/**
 * §06 P1 — « Cuisines proposées » : facette GLOBALE de recherche au niveau objet
 * (`object_cuisine_type`), découplée des menus. `codes` ordonné par `position`
 * (la 1ère = cuisine principale). `options` = catalogue complet `ref_code` `cuisine_type`.
 */
export interface ObjectWorkspaceCuisineModule {
  codes: string[];
  options: WorkspaceReferenceOption[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceMembershipScopeOption {
  orgObjectId: string;
  label: string;
  isPrimary: boolean;
}

export interface ObjectWorkspaceMembershipItem {
  recordId: string | null;
  scope: 'object' | 'organization';
  orgObjectId: string;
  orgLabel: string;
  campaignId: string;
  campaignCode: string;
  campaignLabel: string;
  tierId: string;
  tierCode: string;
  tierLabel: string;
  status: string;
  startsAt: string;
  endsAt: string;
  paymentDate: string;
  metadataJson: string;
  visibilityImpact: string;
}

export interface ObjectWorkspaceMembershipModule {
  campaignOptions: WorkspaceReferenceOption[];
  tierOptions: WorkspaceReferenceOption[];
  scopeOptions: ObjectWorkspaceMembershipScopeOption[];
  items: ObjectWorkspaceMembershipItem[];
  unavailableReason: string | null;
}
