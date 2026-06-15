import type { ReactNode } from 'react';
import { MapPin, Star } from 'lucide-react';
import type { BackendObjectTypeCode, ExplorerBucketKey, ObjectCard } from '../../types/domain';
import { EXPLORER_BUCKET_OPTIONS, EXPLORER_BUCKET_TYPE_MAP, normalizeExplorerObjectType } from '../../utils/facets';
import { tagChipStyle } from '../../utils/explorer-card';
import { cn } from '@/lib/utils';

/**
 * Pure presentational Explorer result card (the 116px row). Single source of truth shared by the
 * Explorer results list AND the §09 "Tags & étiquettes" editor preview (interactive=false) so the
 * preview shows EXACTLY what the live card renders. Owns no store/selection/drawer state — the
 * container passes data (an already-normalizeExplorerCard'd card) + interaction handlers.
 *
 * Chip row (PO decision D4): [category/bucket tag] -> [<=1 colored §09 tag] -> [<=1 neutral
 * classification/label] -> [+N]. §09 tags render FIRST (the curated colored layer) with their global
 * hex color; the neutral classification keeps priority on truncation; +N counts both hidden groups.
 */

function bucketForCardType(type: string): ExplorerBucketKey | null {
  const code = normalizeExplorerObjectType(type) as BackendObjectTypeCode;
  for (const [bucket, types] of Object.entries(EXPLORER_BUCKET_TYPE_MAP) as [ExplorerBucketKey, BackendObjectTypeCode[]][]) {
    if (types.includes(code)) {
      return bucket;
    }
  }
  return null;
}

function categoryTagClasses(bucket: ExplorerBucketKey | null): string {
  if (bucket === 'HOT') return 'bg-teal-soft text-teal-2';
  if (bucket === 'ACT') return 'bg-orange-soft text-orange-2';
  return 'border border-line bg-surface2 text-ink-2';
}

function categoryTagLabel(bucket: ExplorerBucketKey | null, typeLabel: string): string {
  if (bucket) {
    const opt = EXPLORER_BUCKET_OPTIONS.find((o) => o.code === bucket);
    if (opt) return opt.label;
  }
  return typeLabel;
}

function pickTaxonomyLabel(card: ObjectCard): string | null {
  const first = card.taxonomy?.[0];
  if (!first) return null;
  const leaf = first.path?.[first.path.length - 1]?.name?.trim();
  if (leaf) return leaf;
  const fallback = first.name?.trim();
  return fallback || null;
}

const NEUTRAL_CHIP_CLASS =
  'inline-flex h-5 max-w-[9rem] shrink items-center truncate rounded-[5px] border border-line bg-surface2 px-1.5 text-[11px] font-semibold tracking-wide text-ink-2';

interface ResultCardViewProps {
  /** A card already passed through normalizeExplorerCard (labels + tagChips populated). */
  card: ObjectCard;
  domId?: string;
  /** When false (the §09 preview), the card is inert: no navigation, label filtering or star. */
  interactive?: boolean;
  isSelected?: boolean;
  inSelection?: boolean;
  onOpen?: () => void;
  onToggleLabel?: (label: string) => void;
  onToggleSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function ResultCardView({
  card,
  domId,
  interactive = true,
  isSelected = false,
  inSelection = false,
  onOpen,
  onToggleLabel,
  onToggleSelect,
}: ResultCardViewProps) {
  const typeLabel = normalizeExplorerObjectType(card.type);
  const bucket = bucketForCardType(card.type);
  const categoryLabel = categoryTagLabel(bucket, typeLabel);
  const city = card.location?.city ?? '—';
  const taxonomyLabel = pickTaxonomyLabel(card);
  const isOpen = Boolean(card.open_now);
  const capacityLine = card.render?.capacity?.trim();

  const tagChips = card.tagChips ?? [];
  const neutralLabels = Array.isArray(card.labels) ? card.labels : [];
  // The type/category pill now lives on the metadata line (below), so the bottom row is the curated
  // display layer ONLY: up to 2 colored §09 tags + 1 neutral classification/label + overflow.
  const visibleTags = tagChips.slice(0, 2);
  const visibleNeutral = neutralLabels[0];
  const overflow = tagChips.length - visibleTags.length + (neutralLabels.length - (visibleNeutral ? 1 : 0));

  const containerInteractive = interactive && Boolean(onOpen);

  const categoryPill: ReactNode = (
    <span
      className={cn(
        'inline-flex h-5 max-w-[9rem] shrink-0 items-center truncate rounded-[5px] px-1.5 text-[11px] font-semibold tracking-wide',
        categoryTagClasses(bucket),
      )}
      title={categoryLabel}
    >
      {categoryLabel}
    </span>
  );

  const chipRow: ReactNode = (
    <div className="mt-auto flex min-w-0 flex-nowrap items-center gap-1">
      {visibleTags.map((tag) => (
        <span
          key={tag.slug || tag.label}
          className="inline-flex h-5 max-w-[9rem] shrink items-center truncate rounded-[5px] px-1.5 text-[11px] font-semibold tracking-wide"
          style={tagChipStyle(tag.color)}
          title={tag.label}
        >
          {tag.label}
        </span>
      ))}

      {visibleNeutral ? (
        containerInteractive ? (
          <button
            type="button"
            title={visibleNeutral}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleLabel?.(visibleNeutral);
            }}
            className={NEUTRAL_CHIP_CLASS}
          >
            {visibleNeutral}
          </button>
        ) : (
          <span title={visibleNeutral} className={NEUTRAL_CHIP_CLASS}>
            {visibleNeutral}
          </span>
        )
      ) : null}

      {overflow > 0 ? (
        <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] border border-line px-1.5 text-[11px] font-semibold text-ink-3">
          +{overflow}
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      id={domId}
      {...(containerInteractive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: onOpen,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen?.();
              }
            },
          }
        : {})}
      className={cn(
        'grid h-[116px] grid-cols-[96px_minmax(0,1fr)_28px] items-stretch gap-3 rounded-shellMd border border-line bg-surface p-2.5 text-left shadow-s',
        containerInteractive && 'cursor-pointer transition hover:-translate-y-px hover:border-lineStrong hover:shadow-m',
        isSelected && 'border-teal shadow-[0_0_0_3px_rgba(23,107,106,0.14),var(--shadow-s)]',
      )}
    >
      <div
        className="h-24 w-24 flex-none overflow-hidden rounded-[10px] bg-surface2 bg-cover bg-center"
        style={card.image ? { backgroundImage: `url(${card.image})` } : undefined}
      />

      <div className="flex min-w-0 flex-col gap-1 overflow-hidden py-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              isOpen
                ? 'bg-brand-green shadow-[0_0_0_3px_rgba(44,163,111,0.16)]'
                : 'bg-brand-red shadow-[0_0_0_3px_rgba(200,92,72,0.14)]',
            )}
            title={isOpen ? 'Ouvert' : 'Fermeture'}
          />
          <h3 className="m-0 truncate font-display text-[14px] font-semibold leading-tight tracking-tight text-ink">
            {card.name}
          </h3>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
          {categoryPill}
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0 text-ink-4" aria-hidden />
            {city}
          </span>
          {taxonomyLabel ? (
            <>
              <span className="text-ink-4">·</span>
              <span className="max-w-[12rem] shrink-0 truncate" title={taxonomyLabel}>
                {taxonomyLabel}
              </span>
            </>
          ) : null}
          {capacityLine ? (
            <>
              <span className="text-ink-4">·</span>
              <span className="shrink-0">{capacityLine}</span>
            </>
          ) : null}
        </div>
        {chipRow}
      </div>

      <div className="flex flex-col items-end self-start py-0.5">
        {containerInteractive ? (
          <button
            type="button"
            className={cn(
              'grid h-7 w-7 place-items-center rounded-[8px] transition',
              inSelection ? 'text-orange' : 'text-ink-4 hover:bg-orange-soft hover:text-orange',
            )}
            aria-label={inSelection ? 'Retirer de la selection' : 'Ajouter a la selection'}
            aria-pressed={inSelection}
            title={inSelection ? 'Retirer de la selection' : 'Ajouter a la selection'}
            onClick={onToggleSelect}
          >
            <Star className={cn('h-4 w-4', inSelection && 'fill-current')} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
