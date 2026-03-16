'use client';

import { useUiStore } from '../../store/ui-store';
import { ObjectDrawerShell } from '../../features/object-drawer/ObjectDrawerShell';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface ObjectDrawerProps {
  objectId: string | null;
}

export function ObjectDrawer({ objectId }: ObjectDrawerProps) {
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const open = Boolean(objectId);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) closeDrawer(); }}>
      <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        {objectId ? <ObjectDrawerShell objectId={objectId} onClose={closeDrawer} /> : null}
      </SheetContent>
    </Sheet>
  );
}