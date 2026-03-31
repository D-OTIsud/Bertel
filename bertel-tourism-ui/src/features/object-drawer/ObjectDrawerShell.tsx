import { useEffect, useMemo, useState } from 'react';
import { AvatarStack } from '../../components/common/AvatarStack';
import { StatusPill } from '../../components/common/StatusPill';
import {
  useObjectWorkspaceQuery,
  usePublishObjectWorkspaceMutation,
  useSaveObjectWorkspaceModuleMutation,
} from '../../hooks/useExplorerQueries';
import { usePresenceRoom } from '../../hooks/usePresenceRoom';
import { parseObjectDetail } from '../../services/object-detail-parser';
import type { ObjectWorkspaceModuleAccess, ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import type {
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceContactItem,
  ObjectWorkspaceDistinctionsModule,
  ObjectWorkspaceGeneralInfo,
  ObjectWorkspaceLegalRecord,
  ObjectWorkspaceLocationModule,
  ObjectWorkspaceMembershipModule,
  ObjectWorkspaceMediaItem,
  ObjectWorkspaceModules,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceTaxonomyModule,
  WorkspaceTranslatableField,
} from '../../services/object-workspace-parser';
import { useSessionStore } from '../../store/session-store';
import { useObjectDrawerStore, type ObjectDrawerSection } from '../../store/object-drawer-store';
import { Button } from '@/components/ui/button';
import { ObjectDetailView } from './ObjectDetailView';
import { ObjectDrawerNav } from './ObjectDrawerNav';
import { ObjectWorkspaceDescriptionsPanel } from './ObjectWorkspaceDescriptionsPanel';
import { ObjectWorkspaceDistinctionsPanel } from './ObjectWorkspaceDistinctionsPanel';
import { ObjectWorkspaceGeneralPanel } from './ObjectWorkspaceGeneralPanel';
import { ObjectWorkspaceCapacityPoliciesPanel } from './ObjectWorkspaceCapacityPoliciesPanel';
import { ObjectWorkspaceContactsPanel } from './ObjectWorkspaceContactsPanel';
import { ObjectWorkspaceCharacteristicsPanel } from './ObjectWorkspaceCharacteristicsPanel';
import { ObjectWorkspaceLocationPanel } from './ObjectWorkspaceLocationPanel';
import { ObjectWorkspaceLegalPanel } from './ObjectWorkspaceLegalPanel';
import { ObjectWorkspaceMediaPanel } from './ObjectWorkspaceMediaPanel';
import { ObjectWorkspaceMembershipsPanel } from './ObjectWorkspaceMembershipsPanel';
import { ObjectWorkspaceOpeningsPanel } from './ObjectWorkspaceOpeningsPanel';
import { ObjectWorkspaceProviderFollowUpPanel } from './ObjectWorkspaceProviderFollowUpPanel';
import { ObjectWorkspacePublicationPanel } from './ObjectWorkspacePublicationPanel';
import { ObjectWorkspacePricingPanel } from './ObjectWorkspacePricingPanel';
import { ObjectWorkspaceRelationshipsPanel } from './ObjectWorkspaceRelationshipsPanel';
import { ObjectWorkspaceSyncIdentifiersPanel } from './ObjectWorkspaceSyncIdentifiersPanel';
import { ObjectWorkspaceTaxonomyPanel } from './ObjectWorkspaceTaxonomyPanel';
import { ObjectWorkspaceUnsavedDialog } from './ObjectWorkspaceUnsavedDialog';
import { DEFAULT_SECTION, getSectionsForResource } from './object-drawer-sections';

interface ObjectDrawerShellProps {
  objectId: string | null;
  onClose: () => void;
}

interface EditorSnapshot {
  objectId: string;
  baseline: ObjectWorkspaceModules;
  draft: ObjectWorkspaceModules;
}

type PendingNavigation =
  | { type: 'section'; section: ObjectDrawerSection }
  | { type: 'mode'; mode: 'view' | 'edit' }
  | null;

type SaveState = {
  saving: boolean;
  message: string | null;
};

const DRAWER_TYPE_LABELS: Record<string, string> = {
  HOT: 'Hotel',
  HPA: 'Hebergement plein air',
  HLO: 'Hebergement loisir',
  CAMP: 'Camping',
  RVA: 'Residence vacances',
  RES: 'Restaurant',
  ITI: 'Itineraire',
  FMA: 'Manifestation',
  ASC: 'Activite',
  ACT: 'Activite',
  LOI: 'Loisir',
  PCU: 'Patrimoine',
  PNA: 'Site naturel',
  PSV: 'Prestataire',
  SRV: 'Service',
  VIL: 'Ville',
  COM: 'Commune',
};

function cloneModules(value: ObjectWorkspaceModules): ObjectWorkspaceModules {
  return JSON.parse(JSON.stringify(value)) as ObjectWorkspaceModules;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function updateTranslatableField(
  field: WorkspaceTranslatableField,
  language: string,
  localLanguage: string,
  value: string,
): WorkspaceTranslatableField {
  const nextValues = { ...field.values };
  if (value.trim()) {
    nextValues[language] = value;
  } else {
    delete nextValues[language];
  }

  return {
    baseValue: language === localLanguage ? value : field.baseValue,
    values: nextValues,
  };
}

function buildSaveAction(access: ObjectWorkspaceModuleAccess) {
  if (access.canDirectWrite) {
    return {
      label: 'Enregistrer',
      disabled: false,
      hint: null,
    };
  }

  if (access.canPrepareProposal) {
    return {
      label: 'Proposer',
      disabled: true,
      hint: access.disabledReason,
    };
  }

  return {
    label: 'Lecture seule',
    disabled: true,
    hint: access.disabledReason,
  };
}

function DrawerHeaderSkeleton() {
  return (
    <div className="drawer-loading-heading" aria-hidden="true">
      <span className="drawer-skeleton drawer-skeleton--eyebrow" />
      <span className="drawer-skeleton drawer-skeleton--title" />
      <div className="drawer-header__meta drawer-header__meta--loading">
        <span className="drawer-skeleton drawer-skeleton--chip" />
        <span className="drawer-skeleton drawer-skeleton--chip" />
        <span className="drawer-skeleton drawer-skeleton--chip drawer-skeleton--chip-wide" />
      </div>
    </div>
  );
}

function DrawerPreviewSkeleton() {
  return (
    <div className="drawer-loading-preview" data-testid="drawer-loading-skeleton" aria-hidden="true">
      <div className="drawer-loading-layout">
        <div className="drawer-loading-main">
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--hero" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--section-lg" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--section-md" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--section-md" />
        </div>
        <div className="drawer-loading-aside">
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--media" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--side" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--map" />
        </div>
      </div>
    </div>
  );
}

function DrawerEditSkeleton() {
  return (
    <>
      <section className="object-drawer-nav drawer-loading-nav" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={`nav-skeleton-${index}`} className="drawer-skeleton drawer-loading-nav__item" />
        ))}
      </section>
      <section className="drawer__panel-area min-w-0 w-full flex-1">
        <div className="drawer-loading-panel" data-testid="drawer-loading-skeleton" aria-hidden="true">
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--panel-title" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--panel-field" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--panel-field" />
          <div className="drawer-skeleton drawer-loading-card drawer-loading-card--panel-textarea" />
        </div>
      </section>
    </>
  );
}

const MODULE_KEY_MAP: Record<WorkspaceModuleId, keyof ObjectWorkspaceModules> = {
  'general-info': 'generalInfo',
  taxonomy: 'taxonomy',
  publication: 'publication',
  'sync-identifiers': 'syncIdentifiers',
  location: 'location',
  descriptions: 'descriptions',
  media: 'media',
  contacts: 'contacts',
  characteristics: 'characteristics',
  distinctions: 'distinctions',
  'capacity-policies': 'capacityPolicies',
  pricing: 'pricing',
  openings: 'openings',
  'provider-follow-up': 'providerFollowUp',
  relationships: 'relationships',
  memberships: 'memberships',
  legal: 'legal',
};

const READONLY_MODULES = new Set<WorkspaceModuleId>([
  'publication',
  'sync-identifiers',
  'openings',
  'provider-follow-up',
  'relationships',
]);

function getDirtySections(snapshot: EditorSnapshot | null): Partial<Record<WorkspaceModuleId, boolean>> {
  if (!snapshot) {
    return {};
  }

  const dirty: Partial<Record<WorkspaceModuleId, boolean>> = {};
  for (const [moduleId, key] of Object.entries(MODULE_KEY_MAP) as [WorkspaceModuleId, keyof ObjectWorkspaceModules][]) {
    if (READONLY_MODULES.has(moduleId)) {
      dirty[moduleId] = false;
    } else {
      dirty[moduleId] = serialize(snapshot.draft[key]) !== serialize(snapshot.baseline[key]);
    }
  }
  return dirty;
}

function resolveCurrentSectionAccess(resource: ObjectWorkspaceResource, section: WorkspaceModuleId) {
  return resource.permissions[MODULE_KEY_MAP[section]] as ObjectWorkspaceModuleAccess;
}

export function ObjectDrawerShell({ objectId, onClose }: ObjectDrawerShellProps) {
  const { data, isError, error } = useObjectWorkspaceQuery(objectId);
  const saveModuleMutation = useSaveObjectWorkspaceModuleMutation(objectId);
  const publishObjectMutation = usePublishObjectWorkspaceMutation(objectId);
  const { peers, typingUsers } = usePresenceRoom(
    objectId ? `room:${objectId}` : 'room:empty',
    { enabled: Boolean(objectId), syncGlobalStatus: false },
  );
  const activeSection = useObjectDrawerStore((state) => state.activeSection);
  const setActiveSection = useObjectDrawerStore((state) => state.setActiveSection);
  const mode = useObjectDrawerStore((state) => state.mode);
  const setMode = useObjectDrawerStore((state) => state.setMode);
  const resetSection = useObjectDrawerStore((state) => state.resetSection);
  const setObjectDirty = useObjectDrawerStore((state) => state.setObjectDirty);
  const clearObjectState = useObjectDrawerStore((state) => state.clearObjectState);
  const role = useSessionStore((state) => state.role);
  const canEdit = role !== null;
  const [editorSnapshot, setEditorSnapshot] = useState<EditorSnapshot | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const [saveStateBySection, setSaveStateBySection] = useState<Record<WorkspaceModuleId, SaveState>>({
    'general-info': { saving: false, message: null },
    taxonomy: { saving: false, message: null },
    publication: { saving: false, message: null },
    'sync-identifiers': { saving: false, message: null },
    location: { saving: false, message: null },
    descriptions: { saving: false, message: null },
    media: { saving: false, message: null },
    contacts: { saving: false, message: null },
    characteristics: { saving: false, message: null },
    distinctions: { saving: false, message: null },
    'capacity-policies': { saving: false, message: null },
    pricing: { saving: false, message: null },
    openings: { saving: false, message: null },
    'provider-follow-up': { saving: false, message: null },
    relationships: { saving: false, message: null },
    memberships: { saving: false, message: null },
    legal: { saving: false, message: null },
  });

  useEffect(() => {
    resetSection();
  }, [objectId, resetSection]);

  useEffect(() => {
    if (!objectId) {
      return;
    }

    return () => {
      clearObjectState(objectId);
    };
  }, [clearObjectState, objectId]);

  useEffect(() => {
    if (!objectId || !data || data.id !== objectId) {
      return;
    }

    setEditorSnapshot((previous) => {
      const nextModules = cloneModules(data.modules);
      if (!previous || previous.objectId !== objectId) {
        return {
          objectId,
          baseline: nextModules,
          draft: cloneModules(nextModules),
        };
      }

      const dirtySections = getDirtySections(previous);
      const hasDirtySection = Object.values(dirtySections).some(Boolean);
      if (hasDirtySection) {
        return previous;
      }

      return {
        objectId,
        baseline: nextModules,
        draft: cloneModules(nextModules),
      };
    });
  }, [data, objectId]);

  const dirtySections = useMemo(() => getDirtySections(editorSnapshot), [editorSnapshot]);
  const isCurrentSectionDirty = dirtySections[activeSection] === true;
  const hasAnyDirtySection = Object.values(dirtySections).some(Boolean);

  useEffect(() => {
    if (!objectId) {
      return;
    }
    setObjectDirty(objectId, hasAnyDirtySection);
  }, [hasAnyDirtySection, objectId, setObjectDirty]);

  if (!objectId) {
    return null;
  }

  const resolvedData = data?.id === objectId ? data : null;
  const previewRaw = resolvedData?.detail.raw ?? {};
  const parsedPreview = parseObjectDetail(previewRaw as Record<string, unknown>);
  const isShellLoading = !isError && !resolvedData;
  const title = resolvedData?.name ?? '';
  const typeLabel = resolvedData?.type ? DRAWER_TYPE_LABELS[(resolvedData.type ?? '').toUpperCase()] ?? resolvedData.type : '';
  const eyebrow = mode === 'edit' ? 'Edition' : typeLabel;
  const headerChips = resolvedData
    ? parsedPreview.taxonomy.groups
      .filter((group) => ['classifications', 'tags'].includes(group.key))
      .flatMap((group) => group.items.map((item) => item.label))
      .filter((label, index, items) => items.indexOf(label) === index)
      .slice(0, 6)
    : [];
  const sections = getSectionsForResource(resolvedData ?? undefined);
  const allowedSectionIds = new Set(sections.map((section) => section.id));
  const resolvedSection = allowedSectionIds.has(activeSection) ? activeSection : DEFAULT_SECTION;

  async function handleSaveSection(section: WorkspaceModuleId, navigationTarget: PendingNavigation = null) {
    if (!resolvedData || !editorSnapshot) {
      return;
    }

    const access = resolveCurrentSectionAccess(resolvedData, section);
    if (!access.canDirectWrite) {
      setSaveStateBySection((state) => ({
        ...state,
        [section]: {
          saving: false,
          message: access.disabledReason ?? 'Cette sauvegarde attend le flux de moderation.',
        },
      }));
      return;
    }

    setSaveStateBySection((state) => ({
      ...state,
      [section]: {
        saving: true,
        message: null,
      },
    }));

    try {
      if (READONLY_MODULES.has(section)) {
        return;
      }

      const key = MODULE_KEY_MAP[section];
      const mutationArgs: any = {
        moduleId: section,
        value: editorSnapshot.draft[key],
      };

      if (section === 'descriptions') {
        mutationArgs.canEditPlaceDescriptions = resolvedData.permissions.descriptions.canEditPlaceDescriptions;
      } else if (section === 'media') {
        mutationArgs.canEditPlaceMedia = resolvedData.permissions.media.canEditPlaceMedia;
      }

      await saveModuleMutation.mutateAsync(mutationArgs);

      setEditorSnapshot((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          baseline: {
            ...previous.baseline,
            [key]: cloneModules(previous.draft)[key],
          },
        };
      });

      setSaveStateBySection((state) => ({
        ...state,
        [section]: {
          saving: false,
          message: 'Enregistre.',
        },
      }));

      setPendingNavigation(null);
      if (navigationTarget?.type === 'section') {
        setActiveSection(navigationTarget.section);
      }
      if (navigationTarget?.type === 'mode') {
        setMode(navigationTarget.mode);
      }
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "Impossible d'enregistrer ce module.";
      setSaveStateBySection((state) => ({
        ...state,
        [section]: {
          saving: false,
          message,
        },
      }));
    }
  }

  function patchGeneralInfo(patch: Partial<ObjectWorkspaceGeneralInfo>) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        generalInfo: {
          ...previous.draft.generalInfo,
          ...patch,
        },
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, 'general-info': { saving: false, message: null } }));
  }

  function replaceTaxonomy(nextValue: ObjectWorkspaceTaxonomyModule) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        taxonomy: nextValue,
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, taxonomy: { saving: false, message: null } }));
  }

  function replaceDistinctions(nextValue: ObjectWorkspaceDistinctionsModule) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        distinctions: nextValue,
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, distinctions: { saving: false, message: null } }));
  }

  function replaceCharacteristics(nextValue: ObjectWorkspaceCharacteristicsModule) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        characteristics: nextValue,
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, characteristics: { saving: false, message: null } }));
  }

  function replaceCapacityPolicies(nextValue: ObjectWorkspaceCapacityPoliciesModule) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        capacityPolicies: nextValue,
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, 'capacity-policies': { saving: false, message: null } }));
  }

  function replacePricing(nextValue: ObjectWorkspacePricingModule) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        pricing: nextValue,
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, pricing: { saving: false, message: null } }));
  }

  function replaceMemberships(nextValue: ObjectWorkspaceMembershipModule) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        memberships: nextValue,
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, memberships: { saving: false, message: null } }));
  }

  function patchLocation(patch: Partial<ObjectWorkspaceLocationModule['main']>) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        location: {
          ...previous.draft.location,
          main: {
            ...previous.draft.location.main,
            ...patch,
          },
        },
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, location: { saving: false, message: null } }));
  }

  function patchDescriptionField(
    scope: 'object' | 'place',
    field: 'description' | 'chapo' | 'adaptedDescription' | 'mobileDescription' | 'editorialDescription',
    value: string,
    placeId?: string,
  ) {
    setEditorSnapshot((previous) => {
      if (!previous) {
        return previous;
      }

      const localLanguage = previous.draft.descriptions.localLanguage;
      const activeLanguage = previous.draft.descriptions.activeLanguage;

      if (scope === 'object') {
        const currentField = previous.draft.descriptions.object[field];
        return {
          ...previous,
          draft: {
            ...previous.draft,
            descriptions: {
              ...previous.draft.descriptions,
              object: {
                ...previous.draft.descriptions.object,
                [field]: updateTranslatableField(currentField, activeLanguage, localLanguage, value),
              },
            },
          },
        };
      }

      return {
        ...previous,
        draft: {
          ...previous.draft,
          descriptions: {
            ...previous.draft.descriptions,
            places: previous.draft.descriptions.places.map((placeScope) => {
              if (placeScope.placeId !== placeId) {
                return placeScope;
              }

              return {
                ...placeScope,
                [field]: updateTranslatableField(placeScope[field], activeLanguage, localLanguage, value),
              };
            }),
          },
        },
      };
    });
    setSaveStateBySection((state) => ({ ...state, descriptions: { saving: false, message: null } }));
  }

  function patchDescriptionVisibility(scope: 'object' | 'place', visibility: string, placeId?: string) {
    setEditorSnapshot((previous) => {
      if (!previous) {
        return previous;
      }

      if (scope === 'object') {
        return {
          ...previous,
          draft: {
            ...previous.draft,
            descriptions: {
              ...previous.draft.descriptions,
              object: {
                ...previous.draft.descriptions.object,
                visibility,
              },
            },
          },
        };
      }

      return {
        ...previous,
        draft: {
          ...previous.draft,
          descriptions: {
            ...previous.draft.descriptions,
            places: previous.draft.descriptions.places.map((placeScope) => (
              placeScope.placeId === placeId ? { ...placeScope, visibility } : placeScope
            )),
          },
        },
      };
    });
    setSaveStateBySection((state) => ({ ...state, descriptions: { saving: false, message: null } }));
  }

  function setDescriptionsLanguage(language: string) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        descriptions: {
          ...previous.draft.descriptions,
          activeLanguage: language,
        },
      },
    }) : previous);
  }

  function patchObjectMediaItem(mediaId: string, patch: Partial<ObjectWorkspaceMediaItem>) {
    setEditorSnapshot((previous) => {
      if (!previous) {
        return previous;
      }

      const selectedType = patch.typeCode
        ? previous.draft.media.typeOptions.find((option) => option.code === patch.typeCode)
        : null;

      return {
        ...previous,
        draft: {
          ...previous.draft,
          media: {
            ...previous.draft.media,
            objectItems: previous.draft.media.objectItems.map((item) => {
              if (item.id !== mediaId) {
                return patch.isMain ? { ...item, isMain: false } : item;
              }

              return {
                ...item,
                ...patch,
                typeId: selectedType?.id ?? item.typeId,
                typeLabel: selectedType?.label ?? item.typeLabel,
              };
            }),
          },
        },
      };
    });
    setSaveStateBySection((state) => ({ ...state, media: { saving: false, message: null } }));
  }

  function addObjectMediaItem() {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        media: {
          ...previous.draft.media,
          objectItems: [
            ...previous.draft.media.objectItems,
            {
              id: `draft-media-${Date.now()}`,
              scope: 'object',
              placeId: null,
              scopeLabel: 'Objet principal',
              typeId: previous.draft.media.typeOptions[0]?.id ?? '',
              typeCode: previous.draft.media.typeOptions[0]?.code ?? 'photo',
              typeLabel: previous.draft.media.typeOptions[0]?.label ?? 'Photo',
              title: '',
              titleTranslations: {},
              description: '',
              descriptionTranslations: {},
              url: '',
              credit: '',
              visibility: 'public',
              position: String(previous.draft.media.objectItems.length),
              width: '',
              height: '',
              rightsExpiresAt: '',
              kind: 'illustration',
              isMain: previous.draft.media.objectItems.length === 0,
              isPublished: true,
              tags: [],
            },
          ],
        },
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, media: { saving: false, message: null } }));
  }

  function removeObjectMediaItem(mediaId: string) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        media: {
          ...previous.draft.media,
          objectItems: previous.draft.media.objectItems.filter((item) => item.id !== mediaId),
        },
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, media: { saving: false, message: null } }));
  }

  function patchObjectContact(contactId: string, patch: Partial<ObjectWorkspaceContactItem>) {
    setEditorSnapshot((previous) => {
      if (!previous) {
        return previous;
      }

      const selectedKind = patch.kindCode
        ? previous.draft.contacts.kindOptions.find((option) => option.code === patch.kindCode)
        : null;
      const selectedRole = patch.roleCode
        ? previous.draft.contacts.roleOptions.find((option) => option.code === patch.roleCode)
        : null;

      return {
        ...previous,
        draft: {
          ...previous.draft,
          contacts: {
            ...previous.draft.contacts,
            objectItems: previous.draft.contacts.objectItems.map((item) => {
              const targetKindCode =
                previous.draft.contacts.objectItems.find((candidate) => candidate.id === contactId)?.kindCode ?? patch.kindCode ?? '';

              if (item.id !== contactId) {
                return patch.isPrimary && targetKindCode && item.kindCode === targetKindCode
                  ? { ...item, isPrimary: false }
                  : item;
              }

              return {
                ...item,
                ...patch,
                kindId: selectedKind?.id ?? item.kindId,
                kindLabel: selectedKind?.label ?? item.kindLabel,
                roleId: patch.roleCode === '' ? '' : selectedRole?.id ?? item.roleId,
                roleLabel: patch.roleCode === '' ? '' : selectedRole?.label ?? item.roleLabel,
                isPrimary: patch.isPrimary ?? item.isPrimary,
              };
            }),
          },
        },
      };
    });
    setSaveStateBySection((state) => ({ ...state, contacts: { saving: false, message: null } }));
  }

  function addObjectContact() {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        contacts: {
          ...previous.draft.contacts,
          objectItems: [
            ...previous.draft.contacts.objectItems,
            {
              id: `draft-contact-${Date.now()}`,
              kindId: previous.draft.contacts.kindOptions[0]?.id ?? '',
              kindCode: previous.draft.contacts.kindOptions[0]?.code ?? 'phone',
              kindLabel: previous.draft.contacts.kindOptions[0]?.label ?? 'Telephone',
              roleId: '',
              roleCode: '',
              roleLabel: '',
              value: '',
              isPublic: true,
              isPrimary: previous.draft.contacts.objectItems.length === 0,
              position: String(previous.draft.contacts.objectItems.length),
            },
          ],
        },
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, contacts: { saving: false, message: null } }));
  }

  function updateLegalRecord(recordKey: string, patch: Partial<ObjectWorkspaceLegalRecord>) {
    setEditorSnapshot((previous) => {
      if (!previous) {
        return previous;
      }

      const selectedType = patch.typeCode
        ? previous.draft.legal.typeOptions.find((option) => option.code === patch.typeCode)
        : null;

      return {
        ...previous,
        draft: {
          ...previous.draft,
          legal: {
            ...previous.draft.legal,
            records: previous.draft.legal.records.map((record) => {
              const currentKey = record.recordId ?? `${record.typeCode}-${record.validFrom}`;
              if (currentKey !== recordKey) {
                return record;
              }

              return {
                ...record,
                ...patch,
                typeId: selectedType?.id ?? record.typeId,
                typeLabel: selectedType?.label ?? record.typeLabel,
                category: selectedType?.category ?? record.category,
                isPublic: selectedType?.isPublic ?? record.isPublic,
                isRequired: selectedType?.isRequired ?? record.isRequired,
                validTo:
                  patch.validityMode === 'forever'
                    ? ''
                    : patch.validTo ?? record.validTo,
              };
            }),
          },
        },
      };
    });
    setSaveStateBySection((state) => ({ ...state, legal: { saving: false, message: null } }));
  }

  function addLegalRecord() {
    setEditorSnapshot((previous) => {
      if (!previous) {
        return previous;
      }

      const fallbackType = previous.draft.legal.typeOptions[0];
      if (!fallbackType) {
        return previous;
      }

      const nextRecord: ObjectWorkspaceLegalRecord = {
        recordId: null,
        typeId: fallbackType.id,
        typeCode: fallbackType.code,
        typeLabel: fallbackType.label,
        category: fallbackType.category,
        isPublic: fallbackType.isPublic,
        isRequired: fallbackType.isRequired,
        valueJson: '',
        documentId: '',
        validFrom: '',
        validTo: '',
        validityMode: 'fixed_end_date',
        status: 'active',
        documentRequestedAt: '',
        documentDeliveredAt: '',
        note: '',
        daysUntilExpiry: '',
      };

      return {
        ...previous,
        draft: {
          ...previous.draft,
          legal: {
            ...previous.draft.legal,
            records: [...previous.draft.legal.records, nextRecord],
          },
        },
      };
    });
    setSaveStateBySection((state) => ({ ...state, legal: { saving: false, message: null } }));
  }

  function removeLegalRecord(recordKey: string) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        legal: {
          ...previous.draft.legal,
          records: previous.draft.legal.records.filter((record) => {
            const currentKey = record.recordId ?? `${record.typeCode}-${record.validFrom}`;
            return currentKey !== recordKey;
          }),
        },
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, legal: { saving: false, message: null } }));
  }

  function removeObjectContact(contactId: string) {
    setEditorSnapshot((previous) => previous ? ({
      ...previous,
      draft: {
        ...previous.draft,
        contacts: {
          ...previous.draft.contacts,
          objectItems: previous.draft.contacts.objectItems.filter((item) => item.id !== contactId),
        },
      },
    }) : previous);
    setSaveStateBySection((state) => ({ ...state, contacts: { saving: false, message: null } }));
  }

  function discardCurrentSection() {
    setEditorSnapshot((previous) => {
      if (!previous) {
        return previous;
      }

      if (READONLY_MODULES.has(resolvedSection)) {
        return previous;
      }

      const key = MODULE_KEY_MAP[resolvedSection];
      return {
        ...previous,
        draft: {
          ...previous.draft,
          [key]: cloneModules(previous.baseline)[key],
        },
      };
    });

    setSaveStateBySection((state) => ({
      ...state,
      [resolvedSection]: {
        saving: false,
        message: null,
      },
    }));
  }

  function applyPendingNavigation(target: PendingNavigation) {
    if (!target) {
      return;
    }

    if (target.type === 'section') {
      setActiveSection(target.section);
    }
    if (target.type === 'mode') {
      setMode(target.mode);
    }
  }

  function handleSectionChange(nextSection: WorkspaceModuleId) {
    if (nextSection === resolvedSection) {
      return;
    }

    if (isCurrentSectionDirty) {
      setPendingNavigation({ type: 'section', section: nextSection });
      return;
    }

    setActiveSection(nextSection);
  }

  function handleModeToggle(nextMode: 'view' | 'edit') {
    if (nextMode === mode) {
      return;
    }

    if (mode === 'edit' && isCurrentSectionDirty) {
      setPendingNavigation({ type: 'mode', mode: nextMode });
      return;
    }

    setMode(nextMode);
  }

  async function handlePublicationToggle(publish: boolean) {
    if (!resolvedData) {
      return;
    }

    setSaveStateBySection((state) => ({
      ...state,
      publication: {
        saving: true,
        message: null,
      },
    }));

    try {
      await publishObjectMutation.mutateAsync(publish);
      setSaveStateBySection((state) => ({
        ...state,
        publication: {
          saving: false,
          message: publish ? 'Fiche publiee.' : 'Fiche retiree du public.',
        },
      }));
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "Impossible de mettre a jour la publication.";
      setSaveStateBySection((state) => ({
        ...state,
        publication: {
          saving: false,
          message,
        },
      }));
    }
  }

  const currentSectionAccess = resolvedData ? resolveCurrentSectionAccess(resolvedData, resolvedSection) : null;
  const currentSectionSaveState = saveStateBySection[resolvedSection];
  const currentSaveAction = currentSectionAccess ? buildSaveAction(currentSectionAccess) : {
    label: 'Enregistrer',
    disabled: true,
    hint: null,
  };

  return (
    <div key={objectId} className="drawer-shell__inner">
      <div className="drawer-header" aria-busy={isShellLoading}>
        {isShellLoading ? (
          <DrawerHeaderSkeleton />
        ) : (
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            {headerChips.length > 0 && (
              <div className="drawer-header__meta">
                {headerChips.map((chip) => (
                  <span key={chip} className="drawer-header__chip">
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="drawer-header__actions">
          <StatusPill tone="neutral">{peers.length} live</StatusPill>
          <AvatarStack people={peers} />
          {mode === 'view' && canEdit && (
            <Button variant="outline" size="sm" onClick={() => handleModeToggle('edit')}>
              Workspace
            </Button>
          )}
          {mode === 'edit' && (
            <Button variant="ghost" size="sm" onClick={() => handleModeToggle('view')}>
              Apercu
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>

      <div className="drawer-status-row">
        {hasAnyDirtySection && <div className="inline-alert">Modifications locales non sauvegardees.</div>}
        {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
      </div>
      {isError && <div className="panel-card panel-card--warning panel-card--nested">{(error as Error).message}</div>}

      <div className={`drawer__content ${mode === 'view' ? 'drawer__content--preview' : 'drawer__content--modular'}`}>
        {mode === 'view' && isShellLoading && <DrawerPreviewSkeleton />}
        {mode === 'view' && resolvedData && (
          <section className="drawer__preview-area">
            <ObjectDetailView data={resolvedData.detail} raw={previewRaw as Record<string, unknown>} />
          </section>
        )}
        {mode === 'edit' && isShellLoading && <DrawerEditSkeleton />}
        {mode === 'edit' && !isShellLoading && resolvedData && editorSnapshot && (
          <>
            <ObjectDrawerNav
              sections={sections}
              activeSection={resolvedSection}
              dirtySections={dirtySections}
              onSelectSection={handleSectionChange}
            />
            <section className="drawer__panel-area min-w-0 w-full flex-1">
              {resolvedSection === 'general-info' && (
                <ObjectWorkspaceGeneralPanel
                  value={editorSnapshot.draft.generalInfo}
                  dirty={dirtySections['general-info'] === true}
                  saving={saveStateBySection['general-info'].saving}
                  statusMessage={saveStateBySection['general-info'].message}
                  saveAction={buildSaveAction(resolvedData.permissions.generalInfo)}
                  onChange={patchGeneralInfo}
                  onSave={() => void handleSaveSection('general-info')}
                />
              )}
              {resolvedSection === 'taxonomy' && (
                <ObjectWorkspaceTaxonomyPanel
                  value={editorSnapshot.draft.taxonomy}
                  dirty={dirtySections.taxonomy === true}
                  saving={saveStateBySection.taxonomy.saving}
                  statusMessage={saveStateBySection.taxonomy.message}
                  saveAction={buildSaveAction(resolvedData.permissions.taxonomy)}
                  access={resolvedData.permissions.taxonomy}
                  onChange={replaceTaxonomy}
                  onSave={() => void handleSaveSection('taxonomy')}
                />
              )}
              {resolvedSection === 'publication' && (
                <ObjectWorkspacePublicationPanel
                  value={resolvedData.modules.publication}
                  access={resolvedData.permissions.publication}
                  saving={saveStateBySection.publication.saving}
                  statusMessage={saveStateBySection.publication.message}
                  onTogglePublication={(publish) => void handlePublicationToggle(publish)}
                />
              )}
              {resolvedSection === 'sync-identifiers' && (
                <ObjectWorkspaceSyncIdentifiersPanel
                  value={resolvedData.modules.syncIdentifiers}
                  access={resolvedData.permissions.syncIdentifiers}
                  statusMessage={saveStateBySection['sync-identifiers'].message}
                />
              )}
              {resolvedSection === 'location' && (
                <ObjectWorkspaceLocationPanel
                  value={editorSnapshot.draft.location}
                  dirty={dirtySections.location === true}
                  saving={saveStateBySection.location.saving}
                  statusMessage={saveStateBySection.location.message}
                  saveAction={buildSaveAction(resolvedData.permissions.location)}
                  onChange={patchLocation}
                  onSave={() => void handleSaveSection('location')}
                />
              )}
              {resolvedSection === 'descriptions' && (
                <ObjectWorkspaceDescriptionsPanel
                  value={editorSnapshot.draft.descriptions}
                  dirty={dirtySections.descriptions === true}
                  saving={saveStateBySection.descriptions.saving}
                  statusMessage={saveStateBySection.descriptions.message}
                  saveAction={buildSaveAction(resolvedData.permissions.descriptions)}
                  canEditPlaceDescriptions={resolvedData.permissions.descriptions.canEditPlaceDescriptions}
                  onLanguageChange={setDescriptionsLanguage}
                  onObjectFieldChange={(field, value) => patchDescriptionField('object', field, value)}
                  onObjectVisibilityChange={(visibility) => patchDescriptionVisibility('object', visibility)}
                  onPlaceFieldChange={(placeId, field, value) => patchDescriptionField('place', field, value, placeId)}
                  onPlaceVisibilityChange={(placeId, visibility) => patchDescriptionVisibility('place', visibility, placeId)}
                  onSave={() => void handleSaveSection('descriptions')}
                />
              )}
              {resolvedSection === 'media' && (
                <ObjectWorkspaceMediaPanel
                  value={editorSnapshot.draft.media}
                  dirty={dirtySections.media === true}
                  saving={saveStateBySection.media.saving}
                  statusMessage={saveStateBySection.media.message}
                  saveAction={buildSaveAction(resolvedData.permissions.media)}
                  access={resolvedData.permissions.media}
                  onAddObjectMedia={addObjectMediaItem}
                  onUpdateObjectMedia={patchObjectMediaItem}
                  onRemoveObjectMedia={removeObjectMediaItem}
                  onSave={() => void handleSaveSection('media')}
                />
              )}
              {resolvedSection === 'contacts' && (
                <ObjectWorkspaceContactsPanel
                  value={editorSnapshot.draft.contacts}
                  dirty={dirtySections.contacts === true}
                  saving={saveStateBySection.contacts.saving}
                  statusMessage={saveStateBySection.contacts.message}
                  saveAction={buildSaveAction(resolvedData.permissions.contacts)}
                  access={resolvedData.permissions.contacts}
                  onAddContact={addObjectContact}
                  onUpdateContact={patchObjectContact}
                  onRemoveContact={removeObjectContact}
                  onSave={() => void handleSaveSection('contacts')}
                />
              )}
              {resolvedSection === 'characteristics' && (
                <ObjectWorkspaceCharacteristicsPanel
                  value={editorSnapshot.draft.characteristics}
                  dirty={dirtySections.characteristics === true}
                  saving={saveStateBySection.characteristics.saving}
                  statusMessage={saveStateBySection.characteristics.message}
                  saveAction={buildSaveAction(resolvedData.permissions.characteristics)}
                  access={resolvedData.permissions.characteristics}
                  onChange={replaceCharacteristics}
                  onSave={() => void handleSaveSection('characteristics')}
                />
              )}
              {resolvedSection === 'distinctions' && (
                <ObjectWorkspaceDistinctionsPanel
                  value={editorSnapshot.draft.distinctions}
                  dirty={dirtySections.distinctions === true}
                  saving={saveStateBySection.distinctions.saving}
                  statusMessage={saveStateBySection.distinctions.message}
                  saveAction={buildSaveAction(resolvedData.permissions.distinctions)}
                  access={resolvedData.permissions.distinctions}
                  onChange={replaceDistinctions}
                  onSave={() => void handleSaveSection('distinctions')}
                />
              )}
              {resolvedSection === 'capacity-policies' && (
                <ObjectWorkspaceCapacityPoliciesPanel
                  value={editorSnapshot.draft.capacityPolicies}
                  dirty={dirtySections['capacity-policies'] === true}
                  saving={saveStateBySection['capacity-policies'].saving}
                  statusMessage={saveStateBySection['capacity-policies'].message}
                  saveAction={buildSaveAction(resolvedData.permissions.capacityPolicies)}
                  access={resolvedData.permissions.capacityPolicies}
                  onChange={replaceCapacityPolicies}
                  onSave={() => void handleSaveSection('capacity-policies')}
                />
              )}
              {resolvedSection === 'pricing' && (
                <ObjectWorkspacePricingPanel
                  value={editorSnapshot.draft.pricing}
                  dirty={dirtySections.pricing === true}
                  saving={saveStateBySection.pricing.saving}
                  statusMessage={saveStateBySection.pricing.message}
                  saveAction={buildSaveAction(resolvedData.permissions.pricing)}
                  access={resolvedData.permissions.pricing}
                  onChange={replacePricing}
                  onSave={() => void handleSaveSection('pricing')}
                />
              )}
              {resolvedSection === 'openings' && (
                <ObjectWorkspaceOpeningsPanel
                  value={resolvedData.modules.openings}
                  access={resolvedData.permissions.openings}
                  statusMessage={saveStateBySection.openings.message}
                />
              )}
              {resolvedSection === 'provider-follow-up' && (
                <ObjectWorkspaceProviderFollowUpPanel
                  objectId={resolvedData.id}
                  value={resolvedData.modules.providerFollowUp}
                  access={resolvedData.permissions.providerFollowUp}
                />
              )}
              {resolvedSection === 'relationships' && (
                <ObjectWorkspaceRelationshipsPanel
                  value={resolvedData.modules.relationships}
                  access={resolvedData.permissions.relationships}
                  statusMessage={saveStateBySection.relationships.message}
                />
              )}
              {resolvedSection === 'memberships' && (
                <ObjectWorkspaceMembershipsPanel
                  value={editorSnapshot.draft.memberships}
                  dirty={dirtySections.memberships === true}
                  saving={saveStateBySection.memberships.saving}
                  statusMessage={saveStateBySection.memberships.message}
                  saveAction={buildSaveAction(resolvedData.permissions.memberships)}
                  access={resolvedData.permissions.memberships}
                  onChange={replaceMemberships}
                  onSave={() => void handleSaveSection('memberships')}
                />
              )}
              {resolvedSection === 'legal' && (
                <ObjectWorkspaceLegalPanel
                  value={editorSnapshot.draft.legal}
                  dirty={dirtySections.legal === true}
                  saving={saveStateBySection.legal.saving}
                  statusMessage={saveStateBySection.legal.message}
                  saveAction={buildSaveAction(resolvedData.permissions.legal)}
                  access={resolvedData.permissions.legal}
                  onAddRecord={addLegalRecord}
                  onUpdateRecord={updateLegalRecord}
                  onRemoveRecord={removeLegalRecord}
                  onSave={() => void handleSaveSection('legal')}
                />
              )}
            </section>
          </>
        )}
      </div>

      <ObjectWorkspaceUnsavedDialog
        open={pendingNavigation !== null}
        saving={currentSectionSaveState?.saving ?? false}
        canSaveAndContinue={!currentSaveAction.disabled}
        onStay={() => setPendingNavigation(null)}
        onDiscard={() => {
          const target = pendingNavigation;
          discardCurrentSection();
          setPendingNavigation(null);
          applyPendingNavigation(target);
        }}
        onSaveAndContinue={() => {
          const target = pendingNavigation;
          void handleSaveSection(resolvedSection, target);
        }}
      />
    </div>
  );
}
