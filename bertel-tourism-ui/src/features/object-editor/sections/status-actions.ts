import type { ObjectLifecycleStatus } from '../../../services/object-workspace';

/** Stable semantic identity of a lifecycle action — keys its confirmation copy. */
export type StatusActionKind = 'publish' | 'unpublish' | 'archive' | 'restore';

export interface StatusAction {
  label: string;
  target: ObjectLifecycleStatus;
  kind: StatusActionKind;
}

/** The lifecycle actions valid from `status`, mirroring api.rpc_set_object_status's state machine. */
export function computeStatusActions(status: string, publishedAt: string | null | undefined): StatusAction[] {
  switch (status) {
    case 'draft':
    case 'hidden':
      return [
        { label: 'Publier', target: 'published', kind: 'publish' },
        { label: 'Archiver', target: 'archived', kind: 'archive' },
      ];
    case 'published':
      return [
        { label: 'Dépublier', target: 'hidden', kind: 'unpublish' },
        { label: 'Archiver', target: 'archived', kind: 'archive' },
      ];
    case 'archived':
      return [{ label: 'Restaurer', target: publishedAt ? 'hidden' : 'draft', kind: 'restore' }];
    default:
      return [];
  }
}

export interface StatusActionConfirm {
  title: string;
  /** A sentence stating exactly what the change does, shown in the confirmation modal. */
  message: string;
  confirmLabel: string;
  /** 'danger' (red confirm) for actions that pull the fiche out of public/active state. */
  tone: 'default' | 'danger';
}

/**
 * Confirmation copy shown before a lifecycle change runs (§21 ConfirmDialog). A status change is
 * effective immediately and outward-facing (publication), so each action is gated by an explicit
 * "are you sure?" step rather than firing on the first click.
 */
export const STATUS_ACTION_CONFIRM: Record<StatusActionKind, StatusActionConfirm> = {
  publish: {
    title: 'Publier la fiche ?',
    message: "La fiche deviendra visible publiquement sur le site et dans l'explorateur.",
    confirmLabel: 'Publier',
    tone: 'default',
  },
  unpublish: {
    title: 'Dépublier la fiche ?',
    message:
      'La fiche sera retirée du site public. Elle reste modifiable et vous pourrez la republier à tout moment.',
    confirmLabel: 'Dépublier',
    tone: 'danger',
  },
  archive: {
    title: 'Archiver la fiche ?',
    message: "La fiche sera archivée et retirée de l'explorateur. Vous pourrez la restaurer plus tard.",
    confirmLabel: 'Archiver',
    tone: 'danger',
  },
  restore: {
    title: 'Restaurer la fiche ?',
    message: 'La fiche quittera les archives et redeviendra modifiable. Republiez-la pour la remettre en ligne.',
    confirmLabel: 'Restaurer',
    tone: 'default',
  },
};
