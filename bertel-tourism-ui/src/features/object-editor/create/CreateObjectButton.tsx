'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmNavigation } from '@/lib/navigation-guard';
import { useSessionStore } from '../../../store/session-store';
import { CreateObjectDialog } from './CreateObjectDialog';

/**
 * Gated "Créer une fiche" CTA (B1, §107). Visible only to users who can actually CREATE a
 * fiche — `canCreateObjects` (= `api.user_can_create_object()`: active ORG membership AND
 * the `create_object` permission), NOT the broader `canEditObjects`. So a read-only or
 * enrich-only member (a "collecteur") never sees it. The RPC re-checks server-side.
 * Owns the dialog open state and, on success, navigates to the full-page editor for the
 * freshly-created object — the single authoring surface.
 */
export function CreateObjectButton() {
  const canCreateObjects = useSessionStore((state) => state.canCreateObjects);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!canCreateObjects) {
    return null;
  }

  return (
    <>
      <Button type="button" size="sm" aria-label="Créer une fiche" onClick={() => {
        if (confirmNavigation()) setOpen(true);
      }}>
        <Plus className="h-4 w-4" />
        <span className="sm:hidden">Créer</span>
        <span className="hidden sm:inline">Créer une fiche</span>
      </Button>
      <CreateObjectDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => {
          setOpen(false);
          router.push(`/objects/${id}/edit`);
        }}
        onOpenExisting={(id) => {
          setOpen(false);
          router.push(`/objects/${id}/edit`);
        }}
      />
    </>
  );
}
