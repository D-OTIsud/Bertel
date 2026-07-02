import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Flat, hairline-divided filter section — no card wrapper.
 *
 * Shared by the Explorer filters column (`FiltersPanel` column variant) and the
 * Dashboard filters sidebar so both read with the same flat aesthetic instead
 * of nesting bordered cards inside the sidebar.
 *
 * `collapsible` turns the header into a disclosure button (type-specific
 * Explorer sections, décision §152). The count badge stays in the header while
 * collapsed so an active filter is never hidden by the fold.
 */
export function FilterColumnGroup({
  label,
  count,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  label: string;
  count?: number;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  // Suffixe sr-only dans le chemin collapsible : sans lui le nom accessible du
  // bouton serait « Hebergements 2 » — un nombre nu sans contexte pour les AT.
  const countBadge =
    count != null ? (
      <span className="rounded-[6px] bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-ink-4">
        {count}
        {collapsible ? <span className="sr-only"> critère{count > 1 ? 's' : ''} actif{count > 1 ? 's' : ''}</span> : null}
      </span>
    ) : null;

  if (!collapsible) {
    return (
      <section className="border-b border-line py-3.5 last:border-0">
        <div className="mb-2.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
          <span>{label}</span>
          {countBadge}
        </div>
        {children}
      </section>
    );
  }

  return (
    <section className="border-b border-line py-3.5 last:border-0">
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3 transition hover:text-ink',
          open && 'mb-2.5',
        )}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {/* Préfixe sr-only : la chip de bucket homonyme (« Hebergements »…) vit
              dans la même colonne avec un comportement destructif (désélection +
              cascade D23) — le disclosure doit porter un nom accessible distinct. */}
          <span className="sr-only">Section </span>
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          {countBadge}
          <ChevronDown size={14} aria-hidden="true" className={cn('transition-transform', !open && '-rotate-90')} />
        </span>
      </button>
      {open ? <div id={bodyId}>{children}</div> : null}
    </section>
  );
}
