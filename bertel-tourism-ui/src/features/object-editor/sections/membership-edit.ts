/**
 * Pure reducers for §17 adhésions (object_membership). Persisted by saveObjectWorkspaceMemberships.
 * A membership always carries a campaign AND a tier (both NOT NULL); "gratuit" (charte) is conveyed by
 * the chosen campaign/tier label, not a price field.
 */
import type {
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

export function buildNewMembership(module: ObjectWorkspaceMembershipModule): ObjectWorkspaceMembershipItem | null {
  const scope = module.scopeOptions[0];
  if (!scope) {
    return null;
  }
  const campaign = module.campaignOptions[0];
  const tier = module.tierOptions[0];
  return {
    recordId: null,
    scope: 'object',
    orgObjectId: scope.orgObjectId,
    orgLabel: scope.label,
    campaignId: campaign?.id ?? '',
    campaignCode: campaign?.code ?? '',
    campaignLabel: campaign?.label ?? '',
    tierId: tier?.id ?? '',
    tierCode: tier?.code ?? '',
    tierLabel: tier?.label ?? '',
    status: 'prospect',
    startsAt: '',
    endsAt: '',
    paymentDate: '',
    metadataJson: '',
    visibilityImpact: '',
  };
}

export function applyMembershipPatch(
  item: ObjectWorkspaceMembershipItem,
  patch: Partial<ObjectWorkspaceMembershipItem>,
  module: ObjectWorkspaceMembershipModule,
): ObjectWorkspaceMembershipItem {
  const next: ObjectWorkspaceMembershipItem = { ...item, ...patch };
  if (patch.campaignCode) {
    const campaign = module.campaignOptions.find((option) => option.code === patch.campaignCode);
    if (campaign) {
      next.campaignId = campaign.id;
      next.campaignLabel = campaign.label;
    }
  }
  if (patch.tierCode) {
    const tier = module.tierOptions.find((option) => option.code === patch.tierCode);
    if (tier) {
      next.tierId = tier.id;
      next.tierLabel = tier.label;
    }
  }
  if (patch.orgObjectId) {
    const scope = module.scopeOptions.find((option) => option.orgObjectId === patch.orgObjectId);
    if (scope) {
      next.orgLabel = scope.label;
    }
  }
  return next;
}

/** Append a just-created campaign/tier option to the local catalog (idempotent by code). */
export function appendCreatedOption(
  options: WorkspaceReferenceOption[],
  created: WorkspaceReferenceOption,
): WorkspaceReferenceOption[] {
  if (options.some((option) => option.code === created.code)) {
    return options;
  }
  return [...options, created];
}
