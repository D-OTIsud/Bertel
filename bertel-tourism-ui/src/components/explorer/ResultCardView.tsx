'use client';

import type { ComponentType } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Accessibility, Award, BadgeCheck, Leaf, MapPin, Star } from 'lucide-react';
import type { ExplorerTagFilter, ObjectCard } from '../../types/domain';
import { tagChipStyle } from '../../utils/explorer-card';
import { cardClassementRating, cardLabelLogos, cardTypeDisplay } from '../../utils/explorer-card-display';
import type { ClassementUnit } from '../../utils/explorer-card-display';
import { CLASSEMENT_ICON } from './classement-icons';
import { defaultMarkerStyles, markerIconCatalog } from '../../config/map-markers';
import { normalizeExplorerObjectType } from '../../utils/facets';
import { cn } from '@/lib/utils';

/** Pictos lucide des pastilles-logo de label (impl. 3.1, primitives Phase 1). */
const LABEL_LOGO_ICON: Record<string, ComponentType<{ 'aria-hidden'?: boolean }>> = {
  'lbl-clef-verte': Leaf,
  'lbl-ecolabel': Leaf,
  'lbl-th': Accessibility,
  'lbl-qualite': BadgeCheck,
  'lbl-excellence': Award,
};

/** Libellé FR (singulier, pluriel) de la cocarde par unité de classement. */
const RATING_UNIT_LABEL: Record<ClassementUnit, readonly [string, string]> = {
  etoile: ['étoile', 'étoiles'],
  epi: ['épi', 'épis'],
  cle: ['clé', 'clés'],
};

/**
 * Cocarde de classement « à cheval » en haut-gauche de la miniature : N pictos de l'unité réelle
 * (étoiles, épis Gîtes de France, clés Clévacances), jamais des étoiles par défaut.
 */
function RatingCockade({ count, unit, typeLabel }: { count: number; unit: ClassementUnit; typeLabel: string }) {
  const Icon = CLASSEMENT_ICON[unit];
  const [singular, plural] = RATING_UNIT_LABEL[unit];
  return (
    <span className="thumb__rating" title={`${typeLabel} ${count} ${count > 1 ? plural : singular}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Icon key={i} />
      ))}
    </span>
  );
}

/**
 * Pure presentational Explorer result card (116px tall, grows on demand). Single source of truth
 * shared by the Explorer results list AND the §09 "Tags & étiquettes" editor preview (interactive=
 * false) so the preview shows EXACTLY what the live card renders. Owns no store/selection/drawer
 * state — the container passes data (an already-normalizeExplorerCard'd card) + interaction handlers.
 *
 * Chip row: classements/labels (neutral) FIRST, then the colored §09 tags. Each pill shows its FULL
 * label (no truncation); the row greedily fits as many whole pills as the width allows and rolls the
 * rest into a "+N" badge. Hovering "+N" expands the card height to reveal the remaining pills on a
 * 2nd/3rd line.
 */

type DisplayChip = { key: string; label: string; color?: string; tagSlug?: string };

function pickTaxonomyLabel(card: ObjectCard): string | null {
  const first = card.taxonomy?.[0];
  if (!first) return null;
  const leaf = first.path?.[first.path.length - 1]?.name?.trim();
  if (leaf) return leaf;
  const fallback = first.name?.trim();
  return fallback || null;
}

const CHIP_BASE =
  'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-[5px] px-1.5 text-[11px] font-semibold tracking-wide';
const NEUTRAL_CHIP = cn(CHIP_BASE, 'border border-line bg-surface2 text-ink-2');

function ChipPill({
  chip,
  interactive,
  onToggleLabel,
  onToggleTag,
}: {
  chip: DisplayChip;
  interactive: boolean;
  onToggleLabel?: (label: string) => void;
  onToggleTag?: (tag: ExplorerTagFilter) => void;
}) {
  if (chip.color) {
    // A colored §09 tag: clickable filter button when the surface is interactive and a tag handler
    // is wired (cards + map). The §09 editor preview (interactive=false) keeps tags as inert spans.
    if (interactive && onToggleTag && chip.tagSlug) {
      const slug = chip.tagSlug;
      return (
        <button
          type="button"
          data-chip="1"
          title={chip.label}
          aria-label={`Filtrer par le tag ${chip.label}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleTag({ slug, name: chip.label, color: chip.color });
          }}
          className={cn(CHIP_BASE, 'cursor-pointer transition hover:opacity-90')}
          style={tagChipStyle(chip.color)}
        >
          {chip.label}
        </button>
      );
    }
    return (
      <span data-chip="1" className={CHIP_BASE} style={tagChipStyle(chip.color)} title={chip.label}>
        {chip.label}
      </span>
    );
  }
  if (interactive && onToggleLabel) {
    return (
      <button
        type="button"
        data-chip="1"
        title={chip.label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleLabel(chip.label);
        }}
        className={NEUTRAL_CHIP}
      >
        {chip.label}
      </button>
    );
  }
  return (
    <span data-chip="1" className={NEUTRAL_CHIP} title={chip.label}>
      {chip.label}
    </span>
  );
}

const CHIP_GAP = 4; // gap-1
const PLUS_BADGE_WIDTH = 38; // reserved width for the "+N" badge

/**
 * Renders the chip row: greedily fits whole pills on one line (measuring real widths), rolls the
 * rest into a "+N" badge, and reveals everything (wrapped) when `expanded`.
 */
function CardChipRow({
  chips,
  expanded,
  onRequestExpand,
  interactive,
  onToggleLabel,
  onToggleTag,
}: {
  chips: DisplayChip[];
  expanded: boolean;
  onRequestExpand: () => void;
  interactive: boolean;
  onToggleLabel?: (label: string) => void;
  onToggleTag?: (tag: ExplorerTagFilter) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const sig = chips.map((c) => c.key).join('|');
  const [fit, setFit] = useState<number | null>(null);
  const [measuredSig, setMeasuredSig] = useState('');

  // While the chip set is unmeasured (new sig) or expanded, render every pill so the measure pass
  // sees them all; otherwise show the fitted slice.
  const measuring = fit === null || sig !== measuredSig;

  useLayoutEffect(() => {
    if (expanded) return;
    const row = rowRef.current;
    if (!row) return;
    const items = Array.from(row.querySelectorAll<HTMLElement>('[data-chip="1"]'));
    const avail = row.clientWidth;
    let used = 0;
    let count = 0;
    for (let i = 0; i < items.length; i += 1) {
      const w = items[i].offsetWidth + (i > 0 ? CHIP_GAP : 0);
      if (used + w <= avail) {
        used += w;
        count += 1;
      } else {
        break;
      }
    }
    // Reserve room for the "+N" badge when there is an overflow.
    if (count < items.length) {
      while (count > 0 && used + CHIP_GAP + PLUS_BADGE_WIDTH > avail) {
        used -= items[count - 1].offsetWidth + (count > 1 ? CHIP_GAP : 0);
        count -= 1;
      }
    }
    setFit(count);
    setMeasuredSig(sig);
  }, [sig, expanded]);

  const showAll = expanded || measuring;
  const visible = showAll ? chips : chips.slice(0, fit ?? chips.length);
  const overflow = showAll ? 0 : chips.length - (fit ?? chips.length);

  return (
    <div
      ref={rowRef}
      className={cn('flex min-w-0 items-center gap-1', expanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden')}
    >
      {visible.map((chip) => (
        <ChipPill key={chip.key} chip={chip} interactive={interactive} onToggleLabel={onToggleLabel} onToggleTag={onToggleTag} />
      ))}
      {overflow > 0 ? (
        <button
          type="button"
          aria-label={`Afficher ${overflow} étiquette(s) de plus`}
          title="Afficher plus"
          onMouseEnter={onRequestExpand}
          onFocus={onRequestExpand}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRequestExpand();
          }}
          className="inline-flex h-5 shrink-0 items-center rounded-[5px] border border-line px-1.5 text-[11px] font-semibold text-ink-3 hover:bg-surface2"
        >
          +{overflow}
        </button>
      ) : null}
    </div>
  );
}

interface ResultCardViewProps {
  /** A card already passed through normalizeExplorerCard (labels + tagChips populated). */
  card: ObjectCard;
  domId?: string;
  /** When false (the §09 preview), the card is inert: no navigation, label filtering or star. */
  interactive?: boolean;
  isSelected?: boolean;
  /** D20 : surbrillance croisée liste↔carte (survol du marqueur correspondant). */
  isHovered?: boolean;
  inSelection?: boolean;
  onOpen?: () => void;
  /** D20 : signale l'entrée/sortie du pointeur pour surligner le marqueur carte. */
  onHoverChange?: (hovered: boolean) => void;
  onToggleLabel?: (label: string) => void;
  /** Click-to-filter for a colored §09 tag chip (cards + map). Inert when omitted or interactive=false. */
  onToggleTag?: (tag: ExplorerTagFilter) => void;
  onToggleSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function ResultCardView({
  card,
  domId,
  interactive = true,
  isSelected = false,
  isHovered = false,
  inSelection = false,
  onOpen,
  onHoverChange,
  onToggleLabel,
  onToggleTag,
  onToggleSelect,
}: ResultCardViewProps) {
  const [expanded, setExpanded] = useState(false);

  const display = cardTypeDisplay(card);
  const rating = cardClassementRating(card);
  // Picto + couleur du type : repris EXACTEMENT de la légende carte (même table marqueur), donc la
  // carte résultat ne peut pas diverger des pins ni de MapLegend.
  const markerStyle = defaultMarkerStyles[normalizeExplorerObjectType(card.type)];
  const typeGlyph = markerIconCatalog[markerStyle.icon].glyph;
  const labelLogos = cardLabelLogos(card);
  const city = card.location?.city?.trim() || 'Lieu non renseigné';
  const taxonomyLabel = pickTaxonomyLabel(card);
  const capacityLine = card.render?.capacity?.trim();

  const tagChips = card.tagChips ?? [];
  const neutralLabels = Array.isArray(card.labels) ? card.labels : [];
  // Classements / labels (neutral) FIRST, then the colored §09 tags.
  const chips: DisplayChip[] = [
    ...neutralLabels.map((label, index) => ({ key: `l${index}-${label}`, label })),
    ...tagChips.map((tag, index) => ({ key: `t${index}-${tag.slug || tag.label}`, label: tag.label, color: tag.color, tagSlug: tag.slug })),
  ];

  const containerInteractive = interactive && Boolean(onOpen);

  return (
    <div
      id={domId}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => {
        setExpanded(false);
        onHoverChange?.(false);
      }}
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
        // shrink-0: the card is a flex child of the overflowing results scroll list. Without it,
        // flexbox shrinks an expanded card below its wrapped-chip content (min-h overrides the flex
        // default min-height:auto), so the extra chip rows spill onto the next card. See ResultCardView.test.tsx.
        // `explorer-result-card` : classe stable pour l'anneau :focus-visible (D8).
        // PAS `result-card` — cette classe legacy existe dans styles.css (grille 2
        // colonnes, padding, radius 28px) et cassait la mise en page (étoile éjectée
        // en 2e rangée clippée, révélée au survol via l'expansion).
        'explorer-result-card grid shrink-0 grid-cols-[96px_minmax(0,1fr)_28px] items-stretch gap-3 rounded-shellMd border border-line bg-surface p-2.5 text-left shadow-s',
        expanded ? 'min-h-[116px]' : 'h-[116px]',
        containerInteractive && 'cursor-pointer transition hover:-translate-y-px hover:border-lineStrong hover:shadow-m',
        isSelected && 'border-teal shadow-[0_0_0_3px_rgba(23,107,106,0.14),var(--shadow-s)]',
        isHovered && !isSelected && 'border-lineStrong shadow-m',
      )}
    >
      {/* Miniature + signet « à cheval » (impl. 3.1) : cocarde de classement (HEB) en
          haut-gauche, pastilles-logo de label en bas-droite. Le wrapper autorise le débordement. */}
      <div className="thumb relative h-24 w-24 flex-none">
        <div
          className="h-full w-full overflow-hidden rounded-[10px] bg-surface2 bg-cover bg-center"
          style={card.image ? { backgroundImage: `url(${card.image})` } : undefined}
        />
        {rating != null ? (
          <RatingCockade count={rating.count} unit={rating.unit} typeLabel={display.typeLabel} />
        ) : null}
        {labelLogos.length > 0 ? (
          <span className="thumb__labels">
            {labelLogos.slice(0, 3).map((logo) => {
              const Icon = LABEL_LOGO_ICON[logo.logoClass] ?? BadgeCheck;
              return (
                <span key={logo.key} className={`label-logo ${logo.logoClass}`} title={logo.title}>
                  <Icon aria-hidden />
                </span>
              );
            })}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-col gap-2 py-0.5',
          // Collapsed: center + clip to the fixed 116px. Expanded: let the column (and the grid row)
          // grow to fit the wrapped chips — overflow-hidden on a grid item caps its min size to 0,
          // so it must be removed here or the extra chip lines get clipped.
          expanded ? 'justify-start' : 'justify-center overflow-hidden',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="m-0 truncate font-display text-[14px] font-semibold leading-tight tracking-tight text-ink">
            {card.name}
          </h3>
          {/* Pastille « ouvert/fermé » — TRI-ÉTAT (§133) piloté par la DONNÉE, pour TOUS les types :
              open_now null/undefined = aucune donnée d'ouverture → AUCUNE pastille ;
              true = Ouvert (dont « ouvert sans horaire », §93) ; false = Fermé. */}
          {card.open_now == null ? null : card.open_now ? (
            <span className="badge badge--ok shrink-0" title="Ouvert">
              <span className="dot dot--ok" />
              Ouvert
            </span>
          ) : (
            <span className="badge badge--muted shrink-0" title="Fermé">
              <span className="dot dot--off" />
              Fermé
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
          <span className="inline-flex shrink-0 items-center gap-1" title={display.typeLabel}>
            {/*
              Picto de type : glyphe + couleur du marqueur (cf. MapLegend / map-markers), affiché
              comme un simple picto en ligne — même traitement que la commune, plus de pastille. Le
              glyphe vient d'une constante interne de confiance (markerIconCatalog), jamais d'une
              entrée utilisateur.
            */}
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 shrink-0"
              fill="none"
              stroke={markerStyle.color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              dangerouslySetInnerHTML={{ __html: typeGlyph }}
            />
            {display.typeLabel}
          </span>
          <span className="text-ink-4" aria-hidden>
            ·
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0 text-ink-4" aria-hidden />
            {city}
          </span>
          {/* D19 : les fiches sans coordonnées sont silencieusement absentes de la carte —
              on le dit sur la carte-résultat au lieu de laisser chercher l'épingle. */}
          {interactive && (card.location?.lat == null || card.location?.lon == null) ? (
            <span className="badge badge--muted shrink-0" title="Sans coordonnées — n'apparaît pas sur la carte">
              non localisé
            </span>
          ) : null}
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
        <CardChipRow
          chips={chips}
          expanded={expanded}
          onRequestExpand={() => setExpanded(true)}
          interactive={containerInteractive}
          onToggleLabel={onToggleLabel}
          onToggleTag={onToggleTag}
        />
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
