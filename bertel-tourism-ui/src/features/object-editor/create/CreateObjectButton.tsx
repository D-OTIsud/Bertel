'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '../../../store/session-store';
import { CreateObjectDialog } from './CreateObjectDialog';

/**
 * Gated "Créer une fiche" CTA (B1, §105). Visible only when the session can edit objects
 * (`api.current_user_can_edit_objects()`); the RPC re-checks `create_object` server-side.
 * Owns the dialog open state and, on success, navigates to the full-page editor for the
 * freshly-created object — the single authoring surface.
 */
export function CreateObjectButton() {
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!canEditObjects) {
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
      />
    </>
  );
}
