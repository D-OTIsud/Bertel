import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { AvatarStack } from '../../components/common/AvatarStack';
import { StatusPill } from '../../components/common/StatusPill';
import { useObjectModifierQuery, useSaveObjectModifierMutation } from '../../hooks/useExplorerQueries';
import { usePresenceRoom } from '../../hooks/usePresenceRoom';
import { useSessionStore } from '../../store/session-store';
import { useObjectDrawerStore, type ObjectDrawerSection } from '../../store/object-drawer-store';
import { ObjectContactsPanel } from './ObjectContactsPanel';
import { ObjectCrmPanel } from './ObjectCrmPanel';
import { ObjectDetailView } from './ObjectDetailView';
import { ObjectDistinctionsPanel } from './ObjectDistinctionsPanel';
import { ObjectDrawerNav } from './ObjectDrawerNav';
import { ObjectLegalSyncPanel } from './ObjectLegalSyncPanel';
import { ObjectLocationPanel } from './ObjectLocationPanel';
import { ObjectMediaPanel } from './ObjectMediaPanel';
import { ObjectOfferPanel } from './ObjectOfferPanel';
import { ObjectOverviewPanel } from './ObjectOverviewPanel';
import { ObjectTypeDetailsPanel } from './ObjectTypeDetailsPanel';
import { buildModifierDraftFields, buildModifierPayload, OBJECT_TYPE_LABELS } from '../../services/modifier-payload';
import { getSectionsForType, DEFAULT_SECTION, FIELD_SECTION_MAP } from './object-drawer-sections';
import { Button } from '@/components/ui/button';

interface ObjectDrawerShellProps {
  objectId: string | null;
  onClose: () => void;
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
        {Array.from({ length: 6 }, (_, index) => (
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

export function ObjectDrawerShell({ objectId, onClose }: ObjectDrawerShellProps) {
  const { data, isError, error } = useObjectModifierQuery(objectId);
  const saveMutation = useSaveObjectModifierMutation(objectId);
  const { peers, me, lockedFields, typingUsers, lockField, unlockField } = usePresenceRoom(
    objectId ? `room:${objectId}` : 'room:empty',
    { enabled: Boolean(objectId), syncGlobalStatus: false },
  );
  const activeSection = useObjectDrawerStore((state) => state.activeSection);
  const setActiveSection = useObjectDrawerStore((state) => state.setActiveSection);
  const mode = useObjectDrawerStore((state) => state.mode);
  const setMode = useObjectDrawerStore((state) => state.setMode);
  const resetSection = useObjectDrawerStore((state) => state.resetSection);
  const initializeDraft = useObjectDrawerStore((state) => state.initializeDraft);
  const updateDraft = useObjectDrawerStore((state) => state.updateDraft);
  const updateDraftField = useObjectDrawerStore((state) => state.updateDraftField);
  const commitDraft = useObjectDrawerStore((state) => state.commitDraft);
  const draft = useObjectDrawerStore((state) => (objectId ? state.draftsByObject[objectId] : undefined));
  const role = useSessionStore((state) => state.role);
  // All authenticated roles may edit; guests (role === null) see view-only
  const canEdit = role !== null;
  const payload = useMemo(() => (data ? buildModifierPayload(data) : null), [data]);
  const raw = useMemo(
    () => ((data?.raw ?? {}) as Record<string, unknown>),
    [data?.raw],
  );

  useEffect(() => {
    resetSection();
  }, [objectId, resetSection]);

  useEffect(() => {
    if (!objectId || !data || data.id !== objectId || !payload) {
      return;
    }

    initializeDraft(objectId, {
      name: data.name,
      description: payload.parsed.text.description,
      fields: buildModifierDraftFields(payload),
    });
  }, [data, initializeDraft, objectId, payload]);

  // Reconcile store when the object type changes and the current section is no
  // longer in the allowed set. This keeps nav highlight and rendered panel in sync.
  useEffect(() => {
    const allowed = new Set(getSectionsForType(data?.type, payload?.navCounts).map((s) => s.id));
    if (!allowed.has(activeSection)) {
      setActiveSection(DEFAULT_SECTION);
    }
  }, [data?.type, payload?.navCounts, activeSection, setActiveSection]);

  if (!objectId) {
    return null;
  }

  const name = draft?.name ?? data?.name ?? '';
  const description = draft?.description ?? payload?.parsed.text.description ?? '';
  const fields = draft?.fields ?? (payload ? buildModifierDraftFields(payload) : {});
  const isDirty = draft?.dirty ?? false;
  const dirtySections = new Set<ObjectDrawerSection>(
    (draft?.dirtyFields ?? [])
      .map((field) => FIELD_SECTION_MAP[field])
      .filter((section): section is ObjectDrawerSection => Boolean(section)),
  );
  const descriptionLock = lockedFields.description;
  const nameLock = lockedFields.name;
  const descriptionBlocked = Boolean(descriptionLock && descriptionLock.userId !== me.userId);
  const nameBlocked = Boolean(nameLock && nameLock.userId !== me.userId);
  const hasResolvedData = data?.id === objectId;
  const isShellLoading = !isError && !hasResolvedData;
  const title = hasResolvedData ? data.name : '';
  const typeLabel = hasResolvedData && data?.type ? OBJECT_TYPE_LABELS[(data.type ?? '').toUpperCase()] ?? data.type : '';
  const eyebrow = mode === 'edit' ? 'Edition collaborative' : typeLabel;
  const headerChips = hasResolvedData && payload ? payload.parsed.taxonomy.groups
    .filter((group) => ['classifications', 'tags'].includes(group.key))
    .flatMap((group) => group.items.map((item) => item.label))
    .filter((label, index, items) => items.indexOf(label) === index)
    .slice(0, 6) : [];

  // Sections allowed for this object type — drives both nav visibility and panel rendering.
  // Falls back to all sections when data is still loading or type is unrecognised.
  const editSections = getSectionsForType(data?.type, payload?.navCounts).map((section) => ({
    ...section,
    dirty: dirtySections.has(section.id),
  }));
  const editSectionIds = new Set(editSections.map((s) => s.id));
  // Guard: if activeSection became disallowed for this type, fall back silently
  const resolvedSection = editSectionIds.has(activeSection) ? activeSection : DEFAULT_SECTION;

  const handleSave = async () => {
    if (!objectId || !isDirty) {
      return;
    }

    try {
      await saveMutation.mutateAsync({
        name,
        description,
        fields,
      });
      commitDraft(objectId);
      toast.success("Overview et lieu principal enregistres.");
    } catch (saveError) {
      const message = saveError instanceof Error
        ? saveError.message
        : "Impossible d'enregistrer ces changements pour le moment.";
      toast.error(message);
    }
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
            <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
              Modifier
            </Button>
          )}
          {mode === 'edit' && (
            <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
              Aperçu
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>

      <div className="drawer-status-row">
        {isDirty && <div className="inline-alert">Brouillon local sur {dirtySections.size || 1} section(s).</div>}
        {mode === 'edit' && !isDirty && <div className="inline-alert inline-alert--soft">Edition detaillee alignee sur la logique de la fiche detail.</div>}
        {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
      </div>
      {isError && <div className="panel-card panel-card--warning panel-card--nested">{(error as Error).message}</div>}

      <div className={`drawer__content ${mode === 'view' ? 'drawer__content--preview' : 'drawer__content--modular'}`}>
        {mode === 'view' && isShellLoading && <DrawerPreviewSkeleton />}
        {mode === 'view' && hasResolvedData && (
          <section className="drawer__preview-area">
            <ObjectDetailView data={data} raw={raw} />
          </section>
        )}
        {mode === 'edit' && isShellLoading && <DrawerEditSkeleton />}
        {mode === 'edit' && !isShellLoading && payload && (
          <>
            <ObjectDrawerNav sections={editSections} />
            <section className="drawer__panel-area min-w-0 w-full flex-1">
              {resolvedSection === 'overview' && (
                <ObjectOverviewPanel
                  payload={payload}
                  name={name}
                  description={description}
                  fields={fields}
                  nameLock={nameLock}
                  descriptionLock={descriptionLock}
                  nameBlocked={nameBlocked}
                  descriptionBlocked={descriptionBlocked}
                  onNameChange={(value) => updateDraft(objectId, 'name', value)}
                  onDescriptionChange={(value) => updateDraft(objectId, 'description', value)}
                  onFieldChange={(field, value) => updateDraftField(objectId, field, value)}
                  onLockField={lockField}
                  onUnlockField={unlockField}
                />
              )}
              {resolvedSection === 'location' && (
                <ObjectLocationPanel
                  payload={payload}
                  fields={fields}
                  onFieldChange={(field, value) => updateDraftField(objectId, field, value)}
                />
              )}
              {resolvedSection === 'contacts' && <ObjectContactsPanel payload={payload} />}
              {resolvedSection === 'media' && <ObjectMediaPanel payload={payload} />}
              {resolvedSection === 'distinctions' && <ObjectDistinctionsPanel payload={payload} />}
              {resolvedSection === 'offer' && <ObjectOfferPanel payload={payload} />}
              {resolvedSection === 'type-details' && <ObjectTypeDetailsPanel payload={payload} />}
              {resolvedSection === 'crm' && <ObjectCrmPanel payload={payload} />}
              {resolvedSection === 'legal-sync' && <ObjectLegalSyncPanel payload={payload} />}

              <div className="panel-card panel-card--nested modifier-footer">
                <div className="modifier-footer__copy">
                  <strong>Enregistrement actuel</strong>
                  <p>Cette iteration enregistre l overview et le lieu principal; les autres sections utilisent deja le payload complet mais restent en lecture structuree.</p>
                </div>
                <div className="modifier-footer__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!payload || !objectId) {
                        return;
                      }

                      initializeDraft(objectId, {
                        name: data?.name ?? '',
                        description: payload.parsed.text.description,
                        fields: buildModifierDraftFields(payload),
                      });
                    }}
                    disabled={saveMutation.isPending}
                  >
                    Reinitialiser
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={!isDirty || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
