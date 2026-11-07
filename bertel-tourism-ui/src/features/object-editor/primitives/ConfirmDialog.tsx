import type { ComponentProps } from 'react';
import { ConfirmDialog as SharedConfirmDialog } from '../../../components/common/ConfirmDialog';

type ConfirmDialogProps = Omit<ComponentProps<typeof SharedConfirmDialog>, 'appearance'>;

/** API-compatible editor adapter; shared content/guards, nested-safe Radix shell. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return <SharedConfirmDialog {...props} appearance="editor" />;
}
