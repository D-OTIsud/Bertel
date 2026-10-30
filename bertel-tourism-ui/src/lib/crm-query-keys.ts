import type { CrmDirectoryFilters } from '../services/crm';

/** Preserve the existing tuples: persisted caches and prefix invalidations share this contract. */
export const crmQueryKeys = {
  tasks: ['crm-tasks'] as const,
  assignees: ['crm-assignees'] as const,
  demandTopics: ['crm-demand-topics'] as const,
  contactKinds: ['crm-contact-kinds'] as const,
  actorRoles: ['crm-actor-roles'] as const,
  objectDocumentTypes: ['crm-object-document-types'] as const,
  canWrite: ['crm-can-write'] as const,
  actors: ['crm-actor'] as const,
  objects: ['crm-object'] as const,
  timelines: ['crm-timeline'] as const,
  directory: (filters?: CrmDirectoryFilters) => filters === undefined
    ? ['crm-directory'] as const
    : ['crm-directory', filters] as const,
  actor: (actorId: string) => ['crm-actor', actorId] as const,
  actorSupport: (actorId: string) => ['crm-actor-support', actorId] as const,
  actorObjectAddresses: (actorId: string, objectIds: string) => ['crm-actor-object-addresses', actorId, objectIds] as const,
  contactSuggestions: (objectId: string | undefined) => ['crm-contact-suggestions', objectId] as const,
  portalPermission: (userId: string | null, orgId: string | null) => ['crm-actor-portal-permission', userId, orgId] as const,
  portalAccess: (actorId: string) => ['crm-actor-portal-access', actorId] as const,
  object: (objectId: string) => ['crm-object', objectId] as const,
  timeline: (filters: string, beforeId: string | null) => ['crm-timeline', filters, beforeId] as const,
};
