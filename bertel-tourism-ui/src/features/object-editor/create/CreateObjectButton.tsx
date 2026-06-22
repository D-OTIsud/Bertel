'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Créer une fiche
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
