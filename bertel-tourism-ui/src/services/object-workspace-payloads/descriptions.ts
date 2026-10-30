import {
  type ObjectWorkspaceDescriptionsModule,
  type ObjectWorkspaceDescriptionScope,
} from '../object-workspace-parser';
import { toNullableText } from './input';

/** Pure (exported for tests): the object/place description write payload. */
export function buildDescriptionPayload(scope: ObjectWorkspaceDescriptionsModule['object']) {
  return {
    description: toNullableText(scope.description.baseValue),
    description_i18n: Object.keys(scope.description.values).length > 0 ? scope.description.values : null,
    description_chapo: toNullableText(scope.chapo.baseValue),
    description_chapo_i18n: Object.keys(scope.chapo.values).length > 0 ? scope.chapo.values : null,
    description_adapted: toNullableText(scope.adaptedDescription.baseValue),
    description_adapted_i18n: Object.keys(scope.adaptedDescription.values).length > 0 ? scope.adaptedDescription.values : null,
    description_mobile: toNullableText(scope.mobileDescription.baseValue),
    description_mobile_i18n: Object.keys(scope.mobileDescription.values).length > 0 ? scope.mobileDescription.values : null,
    description_edition: toNullableText(scope.editorialDescription.baseValue),
    description_edition_i18n: Object.keys(scope.editorialDescription.values).length > 0 ? scope.editorialDescription.values : null,
    // No 'public' default: a NULL-visibility row is extended-scope-only under the 8t
    // read gate — blindly coercing it on save would widen it to anon once published.
    // New rows still default to 'public' at the INSERT call sites.
    visibility: toNullableText(scope.visibility),
  };
}



/** Pure: TRUE if an org overlay scope carries any text or translation worth persisting. */
export function orgOverlayHasContent(scope: ObjectWorkspaceDescriptionScope): boolean {
  const fields = [scope.chapo, scope.description, scope.adaptedDescription];
  return fields.some((f) => f.baseValue.trim() !== '' || Object.keys(f.values).length > 0);
}



/** Pure: the org-overlay write payload — the three enrichable fields only. */
export function buildOrgDescriptionPayload(scope: ObjectWorkspaceDescriptionScope) {
  return {
    description: toNullableText(scope.description.baseValue),
    description_i18n: Object.keys(scope.description.values).length > 0 ? scope.description.values : null,
    description_chapo: toNullableText(scope.chapo.baseValue),
    description_chapo_i18n: Object.keys(scope.chapo.values).length > 0 ? scope.chapo.values : null,
    description_adapted: toNullableText(scope.adaptedDescription.baseValue),
    description_adapted_i18n: Object.keys(scope.adaptedDescription.values).length > 0 ? scope.adaptedDescription.values : null,
  };
}
