'use client';

import { useMemo, useState, type ComponentType } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  BedDouble,
  UtensilsCrossed,
  Mountain,
  Route,
  PartyPopper,
  Landmark,
  Store,
  Check,
  Loader2,
  type LucideProps,
} from 'lucide-react';
import type { ArchetypeCode } from '../archetypes';
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

type ArchetypeVisual = { color: string; deep: string; Icon: ComponentType<LucideProps> };

/**
 * Per-archetype icon + accent, matching the app's real accent palette (styles.css
 * `.acc-*` → object-detail / object-editor). Selecting a type colours the tile + the
 * "Créer" CTA with the same accent the editor will use, so the choice reads consistently
 * end to end. FMA shares the RES orange (as in archetypes.ts), differentiated by its icon.
 */
const ARCHETYPE_VISUAL: Record<ArchetypeCode, ArchetypeVisual> = {
  HEB: { color: '#176b6a', deep: '#0d4f4e', Icon: BedDouble },
  RES: { color: '#c96d3b', deep: '#93501f', Icon: UtensilsCrossed },
  ASC: { color: '#1e7491', deep: '#0e5872', Icon: Mountain },
  ITI: { color: '#2a7a45', deep: '#1a5a30', Icon: Route },
  FMA: { color: '#c96d3b', deep: '#93501f', Icon: PartyPopper },
  VIS: { color: '#6c4f8a', deep: '#4d3866', Icon: Landmark },
  SRV: { color: '#a45330', deep: '#7a3b20', Icon: Store },
};

/**
 * Object-creation dialog (B1, §107): name the fiche, pick a type, then `createObject`
 * over the live RPC. It deliberately collects ONLY the two fields the RPC requires;
 * everything else is authored in the full-page editor that opens next. One authoring
 * surface. Flow top-to-bottom: name (fixed) → type (scrollable) → create.
 */
export function CreateObjectDialog({ open, onClose, onCreated }: CreateObjectDialogProps) {
  const groups = useMemo(() => buildCreateTypeOptions(), []);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = validateCreateObjectInput({ type, name });
  const selectedArchetype = groups.find((g) => g.types.some((t) => t.code === type))?.archetype ?? null;
  const accent = selectedArchetype ? ARCHETYPE_VISUAL[selectedArchetype] : null;

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
      <DialogContent showClose={!busy} className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b border-line/70 px-6 pb-4 pt-6 text-left">
          <DialogTitle className="text-[19px] font-semibold tracking-tight text-ink">
            Créer une fiche
          </DialogTitle>
          <DialogDescription className="text-[13px] text-ink-3">
            Nommez la fiche, puis choisissez son type. Vous complétez le reste dans l&apos;éditeur juste après.
          </DialogDescription>
        </DialogHeader>

        {/* 1 · Name first */}
        <div className="border-b border-line/70 px-6 py-4">
          <label htmlFor="create-object-name" className="mb-1.5 block text-[13px] font-semibold text-ink">
            Nom de la fiche
          </label>
          <input
            id="create-object-name"
            type="text"
            value={name}
            maxLength={MAX_OBJECT_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder="ex. Hôtel des Cimes"
            autoComplete="off"
            autoFocus
            className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink outline-none transition-shadow placeholder:text-ink-3/70 focus:border-ink-3 focus:ring-2 focus:ring-ink-3/25"
          />
        </div>

        {/* 2 · Type — the scrollable region (clearly the main content) */}
        <div className="flex items-baseline justify-between px-6 pb-1.5 pt-4">
          <p className="text-[13px] font-semibold text-ink">Type de fiche</p>
          <p className="text-[12px] text-ink-3">{groups.reduce((n, g) => n + g.types.length, 0)} types</p>
        </div>
        <div className="relative min-h-0">
          <div className="max-h-[40vh] space-y-5 overflow-y-auto px-6 pb-6 pt-1">
            {groups.map((group) => {
              const v = ARCHETYPE_VISUAL[group.archetype];
              const Icon = v.Icon;
              return (
                <section key={group.archetype}>
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <span
                      className="grid h-7 w-7 flex-none place-items-center rounded-lg"
                      style={{ backgroundColor: `${v.color}1f`, color: v.color }}
                    >
                      <Icon className="h-[15px] w-[15px]" strokeWidth={2.25} />
                    </span>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <h3 className="text-[13.5px] font-semibold tracking-tight text-ink">{group.codeName}</h3>
                      <span className="truncate text-[12px] text-ink-3">{group.family}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={group.codeName}>
                    {group.types.map((option) => {
                      const selected = type === option.code;
                      return (
                        <label
                          key={option.code}
                          className={[
                            'relative flex cursor-pointer items-center rounded-xl border px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 will-change-transform',
                            selected
                              ? 'shadow-sm'
                              : 'border-line bg-surface text-ink-2 hover:-translate-y-px hover:border-ink-3/40 hover:bg-surface2 hover:text-ink hover:shadow-sm',
                          ].join(' ')}
                          style={
                            selected
                              ? {
                                  borderColor: v.color,
                                  backgroundColor: `${v.color}14`,
                                  color: v.deep,
                                  boxShadow: `0 0 0 3px ${v.color}24`,
                                }
                              : undefined
                          }
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
                          <span className="truncate">{option.label}</span>
                          {selected ? (
                            <Check className="ml-auto h-4 w-4 flex-none" strokeWidth={3} style={{ color: v.color }} />
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          {/* scroll affordance: fade hints there is more below */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* 3 · Footer */}
        <div className="space-y-3 border-t border-line/70 px-6 pb-6 pt-4">
          {error ? (
            <p
              role="alert"
              className="rounded-xl border px-3.5 py-2.5 text-[13px]"
              style={{ borderColor: '#e6b8b0', backgroundColor: '#fbf1ef', color: '#9a3b2a' }}
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="h-10 rounded-xl border border-line bg-surface px-4 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-surface2 hover:text-ink disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!validation.ok || busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed"
              style={
                validation.ok && accent
                  ? { backgroundColor: accent.color }
                  : { backgroundColor: '#dcd8d1', color: '#8a857c' }
              }
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Création…' : 'Créer la fiche'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
