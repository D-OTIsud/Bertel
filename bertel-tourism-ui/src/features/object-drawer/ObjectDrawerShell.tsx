import { useEffect } from 'react';
import { AvatarStack } from '../../components/common/AvatarStack';
import { StatusPill } from '../../components/common/StatusPill';
import { useObjectDetailQuery } from '../../hooks/useExplorerQueries';
import { usePresenceRoom } from '../../hooks/usePresenceRoom';
import { useSessionStore } from '../../store/session-store';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { ObjectContactsPanel } from './ObjectContactsPanel';
import { ObjectDetailView } from './ObjectDetailView';
import { ObjectDrawerNav } from './ObjectDrawerNav';
import { ObjectExternalSyncPanel } from './ObjectExternalSyncPanel';
import { ObjectGeneralPanel } from './ObjectGeneralPanel';
import { ObjectLegalPanel } from './ObjectLegalPanel';
import { ObjectMediaPanel } from './ObjectMediaPanel';
import { ObjectMembershipPanel } from './ObjectMembershipPanel';
import { ObjectMicePanel } from './ObjectMicePanel';
import { ObjectOpeningsPanel } from './ObjectOpeningsPanel';
import { ObjectPricingPanel } from './ObjectPricingPanel';
import { ObjectRoomsPanel } from './ObjectRoomsPanel';
import { parseObjectDetail } from '../../services/object-detail-parser';
import { getSectionsForType, DEFAULT_SECTION } from './object-drawer-sections';
import { readObjectRecord } from './utils';
import { Button } from '@/components/ui/button';

interface ObjectDrawerShellProps {
  objectId: string | null;
  onClose: () => void;
}

const DRAWER_TYPE_LABELS: Record<string, string> = {
  HOT: 'Hotel',
  HPA: 'Hebergement plein air',
  HLO: 'Hebergement loisir',
  CAMP: 'Camping',
  RVA: 'Residence vacances',
  RES: 'Restaurant',
  ITI: 'Itineraire',
  FMA: 'Itineraire',
  ASC: 'Activite',
  LOI: 'Loisir',
  PCU: 'Patrimoine',
  PNA: 'Site naturel',
  PSV: 'Prestataire',
  SRV: 'Service',
  VIL: 'Ville',
  COM: 'Commune',
};

export function ObjectDrawerShell({ objectId, onClose }: ObjectDrawerShellProps) {
  const { data, isLoading, isError, error } = useObjectDetailQuery(objectId);
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
  const draft = useObjectDrawerStore((state) => (objectId ? state.draftsByObject[objectId] : undefined));
  const role = useSessionStore((state) => state.role);
  // All authenticated roles may edit; guests (role === null) see view-only
  const canEdit = role !== null;

  useEffect(() => {
    resetSection();
  }, [objectId, resetSection]);

  useEffect(() => {
    if (!objectId || !data || data.id !== objectId) {
      return;
    }

    const parsed = parseObjectDetail((data.raw ?? {}) as Record<string, unknown>);
    initializeDraft(objectId, {
      name: data.name,
      description: parsed.text.description,
    });
  }, [data, initializeDraft, objectId]);

  // Reconcile store when the object type changes and the current section is no
  // longer in the allowed set. This keeps nav highlight and rendered panel in sync.
  useEffect(() => {
    const allowed = new Set(getSectionsForType(data?.type).map((s) => s.id));
    if (!allowed.has(activeSection)) {
      setActiveSection(DEFAULT_SECTION);
    }
  }, [data?.type, activeSection, setActiveSection]);

  if (!objectId) {
    return null;
  }

  const raw = readObjectRecord(data, objectId);
  const parsed = parseObjectDetail(raw);
  const name = draft?.name ?? '';
  const description = draft?.description ?? '';
  const isDirty = draft?.dirty ?? false;
  const descriptionLock = lockedFields.description;
  const nameLock = lockedFields.name;
  const descriptionBlocked = Boolean(descriptionLock && descriptionLock.userId !== me.userId);
  const nameBlocked = Boolean(nameLock && nameLock.userId !== me.userId);
  const address = parsed.location?.address || parsed.location?.label || '';
  const title = data?.id === objectId ? data.name : objectId;
  const typeLabel = data?.type ? DRAWER_TYPE_LABELS[(data.type ?? '').toUpperCase()] ?? data.type : '';
  const eyebrow = mode === 'edit' ? 'Edition collaborative' : typeLabel;
  const headerChips = parsed.taxonomy.groups
    .filter((group) => ['classifications', 'tags'].includes(group.key))
    .flatMap((group) => group.items.map((item) => item.label))
    .filter((label, index, items) => items.indexOf(label) === index)
    .slice(0, 6);

  // Sections allowed for this object type — drives both nav visibility and panel rendering.
  // Falls back to all sections when data is still loading or type is unrecognised.
  const editSections = getSectionsForType(data?.type);
  const editSectionIds = new Set(editSections.map((s) => s.id));
  // Guard: if activeSection became disallowed for this type, fall back silently
  const resolvedSection = editSectionIds.has(activeSection) ? activeSection : DEFAULT_SECTION;

  return (
    <div key={objectId} className="drawer-shell__inner">
      <div className="drawer-header">
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
        {isDirty && <div className="inline-alert">Brouillon local non sauvegarde.</div>}
        {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
      </div>
      {isLoading && <div className="panel-card panel-card--nested">Chargement de la fiche...</div>}
      {isError && <div className="panel-card panel-card--warning panel-card--nested">{(error as Error).message}</div>}

      <div className={`drawer__content ${mode === 'view' ? 'drawer__content--preview' : 'drawer__content--modular'}`}>
        {mode === 'view' && data?.id === objectId && (
          <section className="drawer__preview-area">
            <ObjectDetailView data={data} raw={raw} />
          </section>
        )}
        {mode === 'edit' && (
          <>
            <ObjectDrawerNav sections={editSections} />
            <section className="drawer__panel-area min-w-0 w-full flex-1">
              {resolvedSection === 'general' && (
                <ObjectGeneralPanel
                  name={name}
                  description={description}
                  address={address}
                  nameLock={nameLock}
                  descriptionLock={descriptionLock}
                  nameBlocked={nameBlocked}
                  descriptionBlocked={descriptionBlocked}
                  onNameChange={(value) => updateDraft(objectId, 'name', value)}
                  onDescriptionChange={(value) => updateDraft(objectId, 'description', value)}
                  onLockField={lockField}
                  onUnlockField={unlockField}
                />
              )}
              {resolvedSection === 'contacts' && <ObjectContactsPanel raw={raw} />}
              {resolvedSection === 'media' && <ObjectMediaPanel raw={raw} />}
              {resolvedSection === 'legal' && <ObjectLegalPanel raw={raw} />}
              {resolvedSection === 'pricing' && <ObjectPricingPanel raw={raw} />}
              {resolvedSection === 'openings' && <ObjectOpeningsPanel raw={raw} />}
              {resolvedSection === 'rooms' && <ObjectRoomsPanel raw={raw} />}
              {resolvedSection === 'mice' && <ObjectMicePanel raw={raw} />}
              {resolvedSection === 'memberships' && <ObjectMembershipPanel raw={raw} />}
              {resolvedSection === 'external-sync' && <ObjectExternalSyncPanel raw={raw} />}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
