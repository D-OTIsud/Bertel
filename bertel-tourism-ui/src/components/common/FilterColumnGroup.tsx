import type { ReactNode } from 'react';

/**
 * Flat, hairline-divided filter section — no card wrapper.
 *
 * Shared by the Explorer filters column (`FiltersPanel` column variant) and the
 * Dashboard filters sidebar so both read with the same flat aesthetic instead
 * of nesting bordered cards inside the sidebar.
 */
export function FilterColumnGroup({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line py-3.5 last:border-0">
      <div className="mb-2.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <span>{label}</span>
        {count != null ? (
          <span className="rounded-[6px] bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-ink-4">{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
