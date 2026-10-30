import {
  type ObjectWorkspaceAmenityGroup,
  type ObjectWorkspaceCharacteristicsModule,
} from '../object-workspace-parser';
import { toRpcUuid } from './input';

export const ACCESSIBILITY_AMENITY_FAMILY = 'accessibility';



/** Establishment-level amenity groups for HEB (object/both scope, excluding accessibility). */
export function filterEstablishmentAmenityGroups(groups: ObjectWorkspaceAmenityGroup[]): ObjectWorkspaceAmenityGroup[] {
  return groups.filter((group) => group.familyCode !== ACCESSIBILITY_AMENITY_FAMILY);
}



/** Preserve amenity codes hidden from the establishment selector (PMR, etc.). */
export function mergeEstablishmentAmenitySelection(
  selectedCodes: string[],
  visibleSelection: string[],
  visibleOptionCodes: Set<string>,
): string[] {
  const hidden = selectedCodes.filter((code) => !visibleOptionCodes.has(code));
  return Array.from(new Set([...hidden, ...visibleSelection]));
}



export function buildEstablishmentAmenityPayload(
  characteristics: ObjectWorkspaceCharacteristicsModule,
  visibleOptionCodes: Set<string>,
  visibleSelectedCodes: string[],
): Record<string, unknown> {
  const merged = mergeEstablishmentAmenitySelection(
    characteristics.selectedAmenityCodes,
    visibleSelectedCodes,
    visibleOptionCodes,
  );
  return buildCharacteristicsRpcPayload({ ...characteristics, selectedAmenityCodes: merged });
}



/** Pure builder for the api.save_object_commercial characteristics arm (P1.3 contributor fork
 *  reuses this so a proposal carries the exact RPC payload the moderator re-dispatches). */
export function buildCharacteristicsRpcPayload(input: ObjectWorkspaceCharacteristicsModule): Record<string, unknown> {
  return {
    languages: input.selectedLanguages.map((item) => ({
      language_id: toRpcUuid(item.languageId),
      language_code: item.code || null,
      level_id: toRpcUuid(item.levelId),
      level_code: item.levelCode || null,
    })),
    payment_methods: Array.from(new Set(input.selectedPaymentCodes)).map((code) => ({
      payment_method_code: code,
    })),
    environment_tags: Array.from(new Set(input.selectedEnvironmentCodes)).map((code) => ({
      environment_tag_code: code,
    })),
    amenities: Array.from(new Set(input.selectedAmenityCodes)).map((code) => ({
      amenity_code: code,
    })),
  };
}
