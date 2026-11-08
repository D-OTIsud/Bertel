'use client';

import { useRef } from 'react';
import { useUiStore } from '../../store/ui-store';
import { ObjectDrawerShell } from '../../features/object-drawer/ObjectDrawerShell';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

interface ObjectDrawerProps {
  objectId: string | null;
}

export function ObjectDrawer({ objectId }: ObjectDrawerProps) {
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const restoreDrawerFocus = useUiStore((state) => state.drawerRestoreFocus);
  const open = Boolean(objectId);
  const returnFocusRef = useRef<(() => boolean) | null>(null);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) closeDrawer(); }}>
      <SheetContent
        side="right"
        showClose={false}
        aria-describedby={undefined}
        className="drawer-panel w-full max-w-[1180px] overflow-hidden border-0 p-0 sm:max-w-[1180px]"
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          returnFocusRef.current = restoreDrawerFocus ?? (() => {
            if (!(active instanceof HTMLElement) || active === document.body || !active.isConnected) return false;
            active.focus();
            return true;
          });
        }}
        onCloseAutoFocus={(event) => {
          const restoreFocus = returnFocusRef.current;
          returnFocusRef.current = null;
          if (restoreFocus?.()) event.preventDefault();
        }}
      >
        <SheetTitle className="sr-only">Fiche objet</SheetTitle>
        <SheetDescription className="sr-only">Panneau lateral de detail d un objet touristique. Le bouton Modifier ouvre la page d edition pleine ecran.</SheetDescription>
        {objectId ? <ObjectDrawerShell objectId={objectId} onClose={closeDrawer} /> : null}
      </SheetContent>
    </Sheet>
  );
}
