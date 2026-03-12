import { useEffect } from 'react';
import { AvatarStack } from '../../components/common/AvatarStack';
import { useObjectDetailQuery } from '../../hooks/useExplorerQueries';
import { usePresenceRoom } from '../../hooks/usePresenceRoom';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useUiStore } from '../../store/ui-store';
import { ObjectContactsPanel } from './ObjectContactsPanel';
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
import { readObjectRecord, readString } from './utils';

interface ObjectDrawerShellProps {
  objectId: string | null;
}

export function ObjectDrawerShell({ objectId }: ObjectDrawerShellProps) {
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const { data, isLoading, isError, error } = useObjectDetailQuery(objectId);
  const { peers, me, lockedFields, typingUsers, lockField, unlockField } = usePresenceRoom(
    objectId ? `room:${objectId}` : 'room:empty',
    { enabled: Boolean(objectId), syncGlobalStatus: false },
  );
  const activeSection = useObjectDrawerStore((state) => state.activeSection);
  const resetSection = useObjectDrawerStore((state) => state.resetSection);
  const initializeDraft = useObjectDrawerStore((state) => state.initializeDraft);
  const updateDraft = useObjectDrawerStore((state) => state.updateDraft);
  const draft = useObjectDrawerStore((state) => (objectId ? state.draftsByObject[objectId] : undefined));

  useEffect(() => {
    resetSection();
  }, [objectId, resetSection]);

  useEffect(() => {
    if (!objectId || !data || data.id !== objectId) {
      return;
    }

    initializeDraft(objectId, {
      name: data.name,
      description: readString((data.raw as Record<string, unknown> | undefined)?.description),
    });
  }, [data, initializeDraft, objectId]);

  if (!objectId) {
    return null;
  }

  const raw = readObjectRecord(data, objectId);
  const name = draft?.name ?? '';
  const description = draft?.description ?? '';
  const isDirty = draft?.dirty ?? false;
  const descriptionLock = lockedFields.description;
  const nameLock = lockedFields.name;
  const descriptionBlocked = Boolean(descriptionLock && descriptionLock.userId !== me.userId);
  const nameBlocked = Boolean(nameLock && nameLock.userId !== me.userId);
  const address = readString((raw.location as { address?: string } | undefined)?.address);

  return (
    <aside key={objectId} className="drawer drawer--open drawer--modular">
      <div className="drawer__header">
        <div>
          <span className="eyebrow">Edition collaborative</span>
          <h2>{data?.id === objectId ? data.name : objectId}</h2>
        </div>
        <div className="drawer__header-actions">
          <AvatarStack people={peers} />
          <button type="button" className="ghost-button" onClick={closeDrawer}>
            Fermer
          </button>
        </div>
      </div>

      {isDirty && <div className="inline-alert">Brouillon local non sauvegarde.</div>}
      {typingUsers.length > 0 && <div className="inline-alert">{typingUsers.join(' · ')}</div>}
      {isLoading && <div className="panel-card">Chargement de la fiche...</div>}
      {isError && <div className="panel-card panel-card--warning">{(error as Error).message}</div>}

      <div className="drawer__content drawer__content--modular">
        <ObjectDrawerNav />
        <section className="drawer__panel-area">
          {activeSection === 'general' && (
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
          {activeSection === 'contacts' && <ObjectContactsPanel raw={raw} />}
          {activeSection === 'media' && <ObjectMediaPanel raw={raw} />}
          {activeSection === 'legal' && <ObjectLegalPanel raw={raw} />}
          {activeSection === 'pricing' && <ObjectPricingPanel raw={raw} />}
          {activeSection === 'openings' && <ObjectOpeningsPanel raw={raw} />}
          {activeSection === 'rooms' && <ObjectRoomsPanel raw={raw} />}
          {activeSection === 'mice' && <ObjectMicePanel raw={raw} />}
          {activeSection === 'memberships' && <ObjectMembershipPanel raw={raw} />}
          {activeSection === 'external-sync' && <ObjectExternalSyncPanel raw={raw} />}
        </section>
      </div>
    </aside>
  );
}
