'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
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
  Info,
  ChevronRight,
  type LucideProps,
} from 'lucide-react';
import { getArchetypeMeta, type ArchetypeCode } from '../archetypes';
import { useObjectSearch } from '../useObjectSearch';
import { assignObjectTaxonomy, createObject } from '../../../services/rpc';
import {
  buildCreateTypeOptions,
  buildCreateTypeTaxonomyLabels,
  validateCreateObjectInput,
  createTypeLabel,
  MAX_OBJECT_NAME_LENGTH,
  type CreateTypeOption,
} from './create-object-options';
import {
  buildCreateAccommodationFamilies,
  findAccommodationNature,
  resolveAccommodationTechnicalType,
} from './accommodation-create-flow';
import { splitDuplicateMatches } from './duplicate-hint';
import { listAccommodationFamilies, listTaxonomyReferences } from '../../../services/explorer-reference';
import type { ExplorerAccommodationFamily, ExplorerTaxonomyDomain } from '../../../types/domain';

interface CreateObjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new object id once creation succeeds (caller navigates to the editor). */
  onCreated: (id: string) => void;
  /** Called when the user opens an existing similar fiche from the duplicate hint. */
  onOpenExisting?: (id: string) => void;
}

type ArchetypeVisual = { color: string; deep: string; Icon: ComponentType<LucideProps> };

/**
 * Per-archetype icon + accent, matching the app's real accent palette (styles.css
 * `.acc-*` → object-detail / object-editor). Selecting a type colours the tile + the
 * "Créer" CTA with the same accent the editor will use. FMA shares the RES orange
 * (as in archetypes.ts), differentiated by its icon.
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

const NEUTRAL_ACCENT = '#8a857c';

/** Accent colour for a raw object-type code, via its archetype. */
function typeColor(typeCode: string): string {
  const archetype = getArchetypeMeta(typeCode)?.archetype;
  return archetype ? ARCHETYPE_VISUAL[archetype].color : NEUTRAL_ACCENT;
}

type TooltipPosition = { left: number; top: number };

const TAXONOMY_PREVIEW_LIMIT = 3;

interface CreateTypeTileProps {
  option: CreateTypeOption;
  selected: boolean;
  visual: ArchetypeVisual;
  subcategories: string[];
  taxonomyLoading: boolean;
  taxonomyError: boolean;
  onSelect: () => void;
}

/**
 * Type tile with a deliberately compact taxonomy preview. The preview is opened
 * only from the info affordance (not from the whole selection tile) and is
 * portalled to escape the dialog's scrollable region.
 */
function CreateTypeTile({
  option,
  selected,
  visual,
  subcategories,
  taxonomyLoading,
  taxonomyError,
  onSelect,
}: CreateTypeTileProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipId = `create-type-${option.code}-tooltip`;

  useLayoutEffect(() => {
    if (!tooltipOpen) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;
      if (!anchor || !tooltip) return;

      const margin = 12;
      const gap = 8;
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
      const left = Math.min(
        Math.max(anchorRect.left + (anchorRect.width - tooltipRect.width) / 2, margin),
        maxLeft,
      );
      const below = anchorRect.bottom + gap;
      const above = anchorRect.top - gap - tooltipRect.height;
      const top = below + tooltipRect.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, above);

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [tooltipOpen, subcategories]);

  const tooltip = tooltipOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-[1000] w-72 max-w-[calc(100vw-24px)] rounded-lg bg-ink px-3 py-2.5 text-left text-[11.5px] font-normal leading-[1.4] text-white shadow-xl"
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          <span className="block text-[12px] font-semibold">
            {subcategories.length > 0
              ? `${subcategories.length} sous-catégorie${subcategories.length > 1 ? 's' : ''} disponible${subcategories.length > 1 ? 's' : ''}`
              : 'Sous-catégories disponibles'}
          </span>
          {taxonomyLoading ? (
            <span className="mt-1 block text-white/75">Chargement du catalogue…</span>
          ) : taxonomyError ? (
            <span className="mt-1 block text-white/75">Catalogue momentanément indisponible.</span>
          ) : subcategories.length > 0 ? (
            <p className="mt-1 text-white/80">
              Ex. {subcategories.slice(0, TAXONOMY_PREVIEW_LIMIT).join(', ')}
              {subcategories.length > TAXONOMY_PREVIEW_LIMIT ? (
                <span className="ml-1 whitespace-nowrap text-white/60">
                  +{subcategories.length - TAXONOMY_PREVIEW_LIMIT} autres
                </span>
              ) : null}
            </p>
          ) : (
            <span className="mt-1 block text-white/75">Aucune sous-catégorie active.</span>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        className={[
          'relative flex items-center rounded-xl border text-[13.5px] font-medium transition-[transform,background-color,border-color,box-shadow,color] duration-150 will-change-transform active:scale-[0.98]',
          selected
            ? 'shadow-sm'
            : 'border-line bg-surface text-ink-2 hover:-translate-y-px hover:border-ink-3/40 hover:bg-surface2 hover:text-ink hover:shadow-sm',
        ].join(' ')}
        style={
          selected
            ? {
                borderColor: visual.color,
                backgroundColor: `${visual.color}14`,
                color: visual.deep,
                boxShadow: `0 0 0 3px ${visual.color}24`,
              }
            : undefined
        }
      >
        <label className="flex min-w-0 flex-1 cursor-pointer items-center py-2.5 pl-3">
          <input
            type="radio"
            name="create-object-type"
            value={option.code}
            checked={selected}
            onChange={onSelect}
            aria-label={option.label}
            className="sr-only"
          />
          <span className="min-w-0 leading-5">{option.label}</span>
          {selected ? (
            <Check
              className="ml-auto h-4 w-4 flex-none"
              strokeWidth={3}
              style={{ color: visual.color }}
            />
          ) : null}
        </label>
        <button
          ref={anchorRef}
          type="button"
          aria-label={`Voir des exemples de sous-catégories pour ${option.label}`}
          aria-describedby={tooltipOpen ? tooltipId : undefined}
          aria-expanded={tooltipOpen}
          onClick={() => setTooltipOpen(true)}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          onFocus={() => setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
          className="mx-1 grid h-8 w-8 flex-none place-items-center rounded-lg text-current opacity-55 transition-[background-color,opacity] hover:bg-black/5 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {tooltip}
    </>
  );
}

/**
 * Object-creation dialog (B1, §107): name the fiche, pick a type, then `createObject`
 * over the live RPC. It deliberately collects ONLY the two fields the RPC requires;
 * everything else is authored in the full-page editor that opens next. As the name is
 * typed, existing fiches with a close name are surfaced (type + location) so an
 * accidental duplicate is caught early; a same name elsewhere stays legitimate.
 */
export function CreateObjectDialog({ open, onClose, onCreated, onOpenExisting }: CreateObjectDialogProps) {
  const groups = useMemo(() => buildCreateTypeOptions(), []);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [taxonomies, setTaxonomies] = useState<ExplorerTaxonomyDomain[] | null>(null);
  const [accommodationFamilyRefs, setAccommodationFamilyRefs] = useState<ExplorerAccommodationFamily[]>([]);
  const [taxonomyError, setTaxonomyError] = useState(false);
  const [familiesError, setFamiliesError] = useState(false);
  /** §201 — parcours hébergement : famille ouverte + nature (ou sous-type) retenue. */
  const [guided, setGuided] = useState(false);
  const [familyCode, setFamilyCode] = useState<string | null>(null);
  const [natureSelection, setNatureSelection] = useState<{ domain: string; code: string } | null>(null);

  useEffect(() => {
    if (!open || taxonomies || taxonomyError) return;
    let cancelled = false;

    // Les deux catalogues sont chargés INDÉPENDAMMENT : un `Promise.all` ferait
    // dépendre l'aide des tuiles de type (13 types hors hébergement) de la
    // disponibilité des familles d'hébergement, qui ne la concernent pas.
    listTaxonomyReferences()
      .then((catalog) => { if (!cancelled) setTaxonomies(catalog); })
      .catch(() => { if (!cancelled) setTaxonomyError(true); });

    listAccommodationFamilies()
      .then((families) => { if (!cancelled) setAccommodationFamilyRefs(families); })
      .catch(() => { if (!cancelled) setFamiliesError(true); });

    return () => {
      cancelled = true;
    };
  }, [open, taxonomies, taxonomyError]);

  const accommodationFamilies = useMemo(
    () => (taxonomies ? buildCreateAccommodationFamilies(taxonomies, accommodationFamilyRefs) : []),
    [taxonomies, accommodationFamilyRefs],
  );
  const openFamily = accommodationFamilies.find((family) => family.code === familyCode) ?? null;
  const selectedNature = findAccommodationNature(accommodationFamilies, natureSelection);
  // Le type technique n'est JAMAIS saisi : il se déduit du domaine de la nature.
  const guidedType = guided ? resolveAccommodationTechnicalType(accommodationFamilies, natureSelection) : null;
  const effectiveType = guided ? (guidedType ?? '') : type;

  const subcategoriesByType = useMemo(() => {
    const result: Record<string, string[]> = {};
    if (!taxonomies) return result;
    for (const group of groups) {
      for (const option of group.types) {
        result[option.code] = buildCreateTypeTaxonomyLabels(taxonomies, option.code);
      }
    }
    return result;
  }, [groups, taxonomies]);

  const validation = validateCreateObjectInput({ type: effectiveType, name });
  const selectedArchetype = groups.find((g) => g.types.some((t) => t.code === effectiveType))?.archetype ?? null;
  const accent = selectedArchetype ? ARCHETYPE_VISUAL[selectedArchetype] : null;

  const { results: similar, loading: searching } = useObjectSearch(name, { debounceMs: 300, limit: 6 });
  const matches = splitDuplicateMatches(name, similar);
  const showMatches = name.trim().length >= 2 && matches.length > 0;

  function reset() {
    setType('');
    setName('');
    setError(null);
    setNotice(null);
    setBusy(false);
    setGuided(false);
    setFamilyCode(null);
    setNatureSelection(null);
  }

  /** Choisir un type hors hébergement quitte le parcours guidé — jamais d'état mixte. */
  function selectPlainType(code: string) {
    setGuided(false);
    setFamilyCode(null);
    setNatureSelection(null);
    setType(code);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  function handleOpenExisting(id: string) {
    if (busy) return;
    reset();
    onOpenExisting?.(id);
  }

  async function handleCreate() {
    if (!validation.ok || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const pendingNature = guided ? natureSelection : null;
    let id: string;
    try {
      id = await createObject({ type: effectiveType, name: name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible pour le moment.');
      setBusy(false);
      return;
    }

    // La fiche EXISTE désormais. Un échec d'affectation de la nature ne doit pas
    // être présenté comme un échec de création — ce serait pousser l'agent à
    // recommencer et à créer un doublon.
    let assignmentNotice: string | null = null;
    if (pendingNature) {
      try {
        await assignObjectTaxonomy({ objectId: id, domain: pendingNature.domain, code: pendingNature.code });
      } catch {
        assignmentNotice = "Fiche créée, mais la nature n'a pas pu être enregistrée : choisissez-la dans la section Identité.";
      }
    }

    reset();
    // APRÈS reset : celui-ci efface les messages, et l'avertissement doit survivre.
    setNotice(assignmentNotice);
    setJustCreated(true);
    onCreated(id);
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
            className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink outline-none transition-shadow focus:border-ink-3 focus:ring-2 focus:ring-lineStrong"
          />

          {showMatches ? (
            <div
              className="mt-2.5 overflow-hidden rounded-xl border"
              style={{ borderColor: '#ecd9ad', backgroundColor: '#fdf7ea' }}
            >
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[12px] font-semibold" style={{ color: '#8a6d1f' }}>
                <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
                {matches.length} fiche{matches.length > 1 ? 's' : ''} au nom proche
                <span className="ml-auto font-normal" style={{ color: '#a98c3f' }}>
                  même nom ailleurs = OK
                </span>
              </div>
              <ul className="max-h-[136px] overflow-y-auto px-1.5 pb-1.5">
                {matches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      onClick={() => handleOpenExisting(match.id)}
                      className="group/dup flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/70"
                    >
                      <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: typeColor(match.type) }} />
                      <span className="flex-none text-[11.5px] font-medium" style={{ color: typeColor(match.type) }}>
                        {createTypeLabel(match.type)}
                      </span>
                      <span className="truncate text-[13px] font-medium text-ink">{match.name}</span>
                      {match.exact ? (
                        <span
                          className="flex-none rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                          style={{ backgroundColor: '#f1e0ad', color: '#7a5e12' }}
                        >
                          identique
                        </span>
                      ) : null}
                      {match.city ? (
                        <span className="ml-auto flex-none truncate text-[12px] text-ink-3">{match.city}</span>
                      ) : null}
                      <ChevronRight className="h-3.5 w-3.5 flex-none text-ink-3/60 transition-transform group-hover/dup:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : searching && name.trim().length >= 2 ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
              <Loader2 className="h-3 w-3 animate-spin" /> Vérification des fiches existantes…
            </p>
          ) : null}
        </div>

        {/* 2 · Type — the scrollable region (clearly the main content) */}
        <div className="flex items-baseline justify-between px-6 pb-1.5 pt-4">
          <p className="text-[13px] font-semibold text-ink">Catégorie de fiche</p>
        </div>
        <div className="relative min-h-0">
          <div className="max-h-[38vh] space-y-5 overflow-y-auto px-6 pb-6 pt-1">
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
                      {group.archetype !== 'HEB' ? (
                        <span className="truncate text-[12px] text-ink-3">{group.family}</span>
                      ) : null}
                    </div>
                  </div>

                  {/* §201 — les cinq familles métier sont les choix de premier
                      niveau. Aucune étape générique « Hébergement » ni aucun code
                      HOT/HLO/RVA/CAMP/HPA n'est présenté à l'agent. */}
                  {group.archetype === 'HEB' ? (
                    <div className="space-y-2.5">
                      {taxonomyError || familiesError ? (
                        <p className="text-[12.5px] text-ink-3">
                          Catalogue momentanément indisponible : réessayez dans un instant.
                        </p>
                      ) : accommodationFamilies.length === 0 ? (
                        <p className="text-[12.5px] text-ink-3">Chargement des familles d&apos;hébergement…</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Familles d'hébergement">
                          {accommodationFamilies.map((family) => {
                            const selected = guided && familyCode === family.code;
                            return (
                              <button
                                key={family.code}
                                type="button"
                                onClick={() => {
                                  setGuided(true);
                                  setType('');
                                  setFamilyCode(family.code);
                                  setNatureSelection(null);
                                }}
                                aria-pressed={selected}
                                className={[
                                  'flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-medium transition',
                                  selected
                                    ? 'shadow-sm'
                                    : 'border-line bg-surface text-ink-2 hover:-translate-y-px hover:border-ink-3/40 hover:bg-surface2 hover:text-ink',
                                ].join(' ')}
                                style={selected ? { borderColor: v.color, backgroundColor: `${v.color}14`, color: v.deep } : undefined}
                              >
                                <span className="min-w-0 flex-1">{family.name}</span>
                                {selected ? <Check className="h-4 w-4 flex-none" strokeWidth={3} style={{ color: v.color }} /> : null}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {openFamily ? (
                        <div className="space-y-2 rounded-xl border border-line bg-surface2/60 p-3">
                          <span className="block text-[12.5px] font-semibold text-ink">
                            Nature de l&apos;établissement
                          </span>
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="group" aria-label="Nature de l'établissement">
                            {openFamily.natures.map((nature) => {
                              const natureSelected = natureSelection?.domain === nature.domain
                                && natureSelection?.code === nature.code;
                              const childSelected = nature.children
                                .some((child) => natureSelection?.domain === child.domain && natureSelection?.code === child.code);
                              return (
                                <div key={`${nature.domain}:${nature.code}`} className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => setNatureSelection({ domain: nature.domain, code: nature.code })}
                                    aria-pressed={natureSelected}
                                    className={[
                                      'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] transition',
                                      natureSelected || childSelected
                                        ? 'border-ink-3 bg-surface text-ink'
                                        : 'border-line bg-surface text-ink-2 hover:border-ink-3/40 hover:text-ink',
                                    ].join(' ')}
                                  >
                                    <span className="min-w-0 flex-1 font-medium">{nature.name}</span>
                                    {natureSelected ? <Check className="h-3.5 w-3.5 flex-none" strokeWidth={3} /> : null}
                                  </button>
                                  {nature.children.length > 0 && (natureSelected || childSelected) ? (
                                    <div className="ml-3 mt-1.5 space-y-1 border-l border-line pl-3">
                                      {nature.children.map((child) => {
                                        const active = natureSelection?.domain === child.domain
                                          && natureSelection?.code === child.code;
                                        return (
                                          <button
                                            key={`${child.domain}:${child.code}`}
                                            type="button"
                                            onClick={() => setNatureSelection({ domain: child.domain, code: child.code })}
                                            aria-pressed={active}
                                            className={[
                                              'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition',
                                              active
                                                ? 'border-ink-3 bg-surface text-ink'
                                                : 'border-line bg-surface text-ink-2 hover:border-ink-3/40 hover:text-ink',
                                            ].join(' ')}
                                          >
                                            <span className="min-w-0 flex-1 font-medium">{child.name}</span>
                                            {active ? <Check className="h-3.5 w-3.5 flex-none" strokeWidth={3} /> : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                          {selectedNature ? (
                            <span className="sr-only" aria-live="polite">
                              Nature sélectionnée.
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={group.codeName}>
                      {group.types.map((option) => (
                        <CreateTypeTile
                          key={option.code}
                          option={option}
                          selected={!guided && type === option.code}
                          visual={v}
                          subcategories={subcategoriesByType[option.code] ?? []}
                          taxonomyLoading={!taxonomies && !taxonomyError}
                          taxonomyError={taxonomyError}
                          onSelect={() => selectPlainType(option.code)}
                        />
                      ))}
                    </div>
                  )}
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
          {notice ? (
            <p
              role="status"
              className="rounded-xl border px-3.5 py-2.5 text-[13px]"
              style={{ borderColor: '#ecd9ad', backgroundColor: '#fdf7ea', color: '#8a6d1f' }}
            >
              {notice}
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
              className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold text-white shadow-sm transition-[transform,box-shadow,background-color,color] duration-150 hover:-translate-y-px hover:shadow-md active:scale-[0.98] active:translate-y-0 disabled:cursor-not-allowed"
              style={
                validation.ok && accent
                  ? { backgroundColor: accent.color }
                  : { backgroundColor: '#dcd8d1', color: '#8a857c' }
              }
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : justCreated ? (
                <Check className="h-4 w-4 motion-pop" aria-hidden />
              ) : null}
              {busy ? 'Création…' : justCreated ? 'Créée' : 'Créer la fiche'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
