import type { ObjectLifecycleStatus } from '../../../services/object-workspace';

export interface StatusAction {
  label: string;
  target: ObjectLifecycleStatus;
}

/** The lifecycle actions valid from `status`, mirroring api.rpc_set_object_status's state machine. */
export function computeStatusActions(status: string, publishedAt: string | null | undefined): StatusAction[] {
  switch (status) {
    case 'draft':
      return [{ label: 'Publier', target: 'published' }, { label: 'Archiver', target: 'archived' }];
    case 'hidden':
      return [{ label: 'Publier', target: 'published' }, { label: 'Archiver', target: 'archived' }];
    case 'published':
      return [{ label: 'Dépublier', target: 'hidden' }, { label: 'Archiver', target: 'archived' }];
    case 'archived':
      return [{ label: 'Restaurer', target: publishedAt ? 'hidden' : 'draft' }];
    default:
      return [];
  }
}
