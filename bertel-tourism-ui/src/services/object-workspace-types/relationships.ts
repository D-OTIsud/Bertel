import type { CrmInteractionReply } from '../../types/domain';
import type { WorkspaceReferenceOption } from './common';

export interface ObjectWorkspaceFollowUpNote {
  id: string;
  body: string;
  audience: string;
  category: 'general' | 'important' | 'urgent' | 'internal' | 'followup';
  isPinned: boolean;
  isArchived: boolean;
  canEdit: boolean;
  canDelete: boolean;
  language: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  createdByAvatarUrl: string;
}

/** One CRM interaction row from `api.list_object_crm` (§19 — CRM module, RPC-only DEFINER). */
export interface ObjectWorkspaceCrmInteractionItem {
  id: string;
  interactionType: string;
  subject: string;
  body: string | null;
  occurredAt: string | null;
  /** Acteur de l'interaction (list_object_crm le porte désormais) — null si absent. */
  actorId: string | null;
  actorName: string | null;
  topicCode: string | null;
  topicName: string | null;
  sentimentCode: string | null;
  sentimentName: string | null;
  ownerName: string | null;
  source: string | null;
  /** Interlocuteur connu (interlocutor_email) — alimente interactionAuthorOf (fix « par Système »). */
  interlocutorEmail: string | null;
  /** Statut de la demande, cycle de vie §6.1 : new, in_progress, awaiting_provider,
   *  resolved, closed, canceled ; null = absent.
   *  list_object_crm le porte (comme list_actor_crm / la timeline) ⇒ la chip « En attente /
   *  Traitée » s'affiche dans la vue objet aussi (sinon elle restait fantôme, status hard-codé). */
  status: string | null;
  /** Demande traitée (§65/§66) : timestamp de résolution, null = en attente. */
  resolvedAt: string | null;
  /** Fil de discussion (§65/§66) — réponses NICHÉES ; [] si aucune. */
  replies: CrmInteractionReply[];
}

/** Per-topic interaction count from `api.list_object_crm` (`demand_topic` distribution). */
export interface ObjectWorkspaceCrmTopicCount {
  code: string;
  name: string;
  count: number;
}

export interface ObjectWorkspaceProviderFollowUpModule {
  notes: ObjectWorkspaceFollowUpNote[];
  /** Real CRM journal — filled post-parse by the `list_object_crm` enrichment, never by the parser. */
  interactions: ObjectWorkspaceCrmInteractionItem[];
  topics: ObjectWorkspaceCrmTopicCount[];
  interactionsUnavailableReason: string | null;
  tasksUnavailableReason: string | null;
}

export interface ObjectWorkspaceLinkedContactItem {
  id: string;
  kindCode: string;
  kindLabel: string;
  roleCode: string;
  roleLabel: string;
  value: string;
  isPublic: boolean;
  isPrimary: boolean;
  position: string;
}

export interface ObjectWorkspaceOrganizationLinkItem {
  id: string;
  source: 'organization' | 'org_link';
  type: string;
  name: string;
  status: string;
  roleId: string;
  roleCode: string;
  roleLabel: string;
  isPrimary: boolean;
  note: string;
  contacts: ObjectWorkspaceLinkedContactItem[];
}

export interface ObjectWorkspaceActorLinkItem {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  gender: string;
  roleId: string;
  roleCode: string;
  roleLabel: string;
  visibility: string;
  isPrimary: boolean;
  validFrom: string;
  validTo: string;
  note: string;
  contacts: ObjectWorkspaceLinkedContactItem[];
  /** §208 — TRUE quand api.can_read_actor_contacts a refusé au CALLEUR (get_object_resource,
   * migration_actor_contacts_org_gate.sql) : `note`/`contacts` sortent alors nuls/vides parce
   * que RÉSERVÉS, pas parce que rien n'a été saisi. La sauvegarde (api.save_object_relations)
   * REPORTE la note serveur pour un tel appelant quoi qu'il envoie (T13b) — l'éditeur DOIT
   * désactiver le champ Note plutôt que laisser une saisie être silencieusement ignorée. */
  contactsRestricted: boolean;
}

export interface ObjectWorkspaceRelatedObjectItem {
  id: string;
  name: string;
  type: string;
  status: string;
  relationTypeId: string;
  relationTypeCode: string;
  relationTypeLabel: string;
  direction: 'out' | 'in' | 'associated';
  note: string;
  distanceM: string;
}

export interface ObjectWorkspaceOrgOption {
  id: string;
  name: string;
}

export interface ObjectWorkspaceRelationshipsModule {
  organizationLinks: ObjectWorkspaceOrganizationLinkItem[];
  actors: ObjectWorkspaceActorLinkItem[];
  relatedObjects: ObjectWorkspaceRelatedObjectItem[];
  /** §48 reference catalogs filled by the relationships loader (empty in the parser defaults). */
  orgRoleOptions: WorkspaceReferenceOption[];
  orgOptions: ObjectWorkspaceOrgOption[];
  actorRoleOptions: WorkspaceReferenceOption[];
  organizationLinkWriteUnavailableReason: string | null;
  actorWriteUnavailableReason: string | null;
  actorConsentUnavailableReason: string | null;
  relatedObjectWriteUnavailableReason: string | null;
  /**
   * §208 — motif (ou `null`) pour lequel la NOTE d'un lien prestataire n'est pas modifiable sur
   * CETTE fiche. `contacts_restricted` est un verdict PAR APPELANT + PAR FICHE
   * (api.can_read_actor_contacts), jamais par ligne : le résoudre UNE fois ici est la seule forme
   * correcte — l'échantillonner sur une ligne quelconque ne dit rien d'un lien pas encore
   * enregistré. Forme « …UnavailableReason » comme ses voisins : le motif EST le texte affiché,
   * donc il ne peut pas mentir sur la raison. Voir `deriveActorNoteWriteUnavailableReason`.
   */
  actorNoteWriteUnavailableReason: string | null;
}

export interface ObjectWorkspaceDistributionChannel {
  id: string;
  code: string;
  name: string;
  url: string;
  syncStatus: string;
  syncTone: 'ok' | 'warn';
  group: 'booking' | 'social';
}

export interface ObjectWorkspaceDistributionModule {
  channels: ObjectWorkspaceDistributionChannel[];
  readonlyReason: string | null;
}

export interface ObjectWorkspaceProviderModule {
  siret: string;
  companyName: string;
  sireneVerified: boolean;
  legalForm: string;
  nafCode: string;
  consularChamber: string;
  cfeOrganization: string;
  directorFullName: string;
  directorEmail: string;
  directorPhone: string;
  address: string;
  incorporationDate: string;
  readonlyReason: string | null;
}
