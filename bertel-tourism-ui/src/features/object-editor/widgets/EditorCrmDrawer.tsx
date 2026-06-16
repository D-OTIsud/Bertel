'use client';

// Tiroir CRM local à l'éditeur (§19). Coquille Sheet clonée d'ObjectDrawer, qui enveloppe le
// contenu dans <div className="crm-app"> — OBLIGATOIRE : tout le CSS CRM ET les overlays des
// sous-modals (CrmModal, sans createPortal) sont scopés sous .crm-app (styles.css). Sans cet
// ancêtre, vues + modals s'affichent non stylés / sans overlay. Ne réutilise PAS
// ObjectDrawerShell (lourd : useObjectWorkspaceQuery + usePresenceRoom). Monté via un useState
// LOCAL dans SectionCrm — PAS le useUiStore mono-slot de l'aperçu fiche.

import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { CrmEstablishmentPanel } from '../../crm/CrmEstablishmentPanel';

export function EditorCrmDrawer({
  objectId,
  canWrite,
  open,
  onClose,
}: {
  objectId: string;
  canWrite: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="right"
        showClose={false}
        aria-describedby={undefined}
        className="drawer-panel w-full max-w-[1180px] overflow-hidden border-0 p-0 sm:max-w-[1180px]"
      >
        <SheetTitle className="sr-only">Suivi CRM de l&apos;établissement</SheetTitle>
        <SheetDescription className="sr-only">
          Panneau latéral du suivi relation prestataire : acteurs liés et historique d&apos;interactions.
        </SheetDescription>
        {/* OBLIGATOIRE : ancêtre .crm-app pour styler les vues CRM + leurs sous-modals. */}
        <div className="crm-app">
          <div className="drawer-shell__inner">
            <div className="drawer-header">
              <div className="drawer-header__left">
                <h2 className="font-display text-2xl font-semibold">Suivi CRM</h2>
              </div>
              <div className="drawer-header__actions">
                <button
                  type="button"
                  className="drawer-header__icon-btn drawer-header__icon-btn--plain"
                  onClick={onClose}
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
            </div>
            <div className="drawer__content">
              <CrmEstablishmentPanel objectId={objectId} canWrite={canWrite} onClose={onClose} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
