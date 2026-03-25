'use client';

import { useUiStore } from '../../store/ui-store';
import { ObjectDrawerShell } from '../../features/object-drawer/ObjectDrawerShell';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

interface ObjectDrawerProps {
  objectId: string | null;
}

export function ObjectDrawer({ objectId }: ObjectDrawerProps) {
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const open = Boolean(objectId);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) closeDrawer(); }}>
      <SheetContent
        side="right"
        showClose={false}
        aria-describedby={undefined}
        className="drawer-panel w-full max-w-[1180px] overflow-hidden border-0 p-0 sm:max-w-[1180px]"
      >
        <SheetTitle className="sr-only">Fiche objet</SheetTitle>
        <SheetDescription className="sr-only">Panneau lateral de detail d un objet touristique. Le bouton Modifier permet d acceder au mode edition.</SheetDescription>
        {objectId ? <ObjectDrawerShell objectId={objectId} onClose={closeDrawer} /> : null}
      </SheetContent>
    </Sheet>
  );
}
