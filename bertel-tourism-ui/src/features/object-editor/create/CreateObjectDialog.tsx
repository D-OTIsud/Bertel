'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createObject } from '../../../services/rpc';
import {
  buildCreateTypeOptions,
  validateCreateObjectInput,
  MAX_OBJECT_NAME_LENGTH,
} from './create-object-options';

interface CreateObjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new object id once creation succeeds (caller navigates to the editor). */
  onCreated: (id: string) => void;
}

/**
 * Thin object-creation dialog (B1, §105): pick a type + name, then `createObject` over the
 * live RPC. It deliberately collects ONLY the two fields the RPC requires — all other
 * authoring happens in the full-page editor, which loads the freshly-created object. One
 * authoring surface, one place to fix.
 */
export function CreateObjectDialog({ open, onClose, onCreated }: CreateObjectDialogProps) {
  const groups = useMemo(() => buildCreateTypeOptions(), []);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = validateCreateObjectInput({ type, name });

  function reset() {
    setType('');
    setName('');
    setError(null);
    setBusy(false);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleCreate() {
    if (!validation.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createObject({ type, name: name.trim() });
      reset();
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible pour le moment.');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Créer une fiche</DialogTitle>
          <DialogDescription>
            Choisissez un type et un nom. Vous compléterez la fiche dans l&apos;éditeur juste après.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold text-ink">Type de fiche</legend>
            {groups.map((group) => (
              <div key={group.archetype} className="grid gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  {group.codeName}
                  <span className="ml-2 font-normal normal-case text-ink-3/80">{group.family}</span>
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={group.codeName}>
                  {group.types.map((option) => {
                    const selected = type === option.code;
                    return (
                      <label
                        key={option.code}
                        className={[
                          'cursor-pointer rounded-shell border px-3 py-1.5 text-sm font-medium transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-ink'
                            : 'border-line bg-surface text-ink-3 hover:bg-surface2 hover:text-ink',
                        ].join(' ')}
                      >
                        <input
                          type="radio"
                          name="create-object-type"
                          value={option.code}
                          checked={selected}
                          onChange={() => setType(option.code)}
                          aria-label={option.label}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>

          <div className="grid gap-1.5">
            <label htmlFor="create-object-name" className="text-sm font-semibold text-ink">
              Nom de la fiche
            </label>
            <input
              id="create-object-name"
              type="text"
              value={name}
              maxLength={MAX_OBJECT_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              placeholder="ex. Hôtel des Cimes"
              className="h-10 rounded-shell border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-shell border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="button" onClick={handleCreate} disabled={!validation.ok || busy}>
            {busy ? 'Création…' : 'Créer la fiche'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
