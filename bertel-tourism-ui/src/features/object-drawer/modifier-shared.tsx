import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

export interface ModifierStat {
  label: string;
  value: string;
}

export function ModifierTooltip({
  content,
  children,
  block = false,
}: {
  content?: ReactNode;
  children: ReactNode;
  block?: boolean;
}) {
  if (!content) {
    return <>{children}</>;
  }

  const Tag = block ? 'div' : 'span';

  return (
    <Tag className={`detail-tooltip${block ? ' detail-tooltip--block' : ''}`}>
      {children}
      <span className="detail-tooltip__bubble" role="tooltip">
        {content}
      </span>
    </Tag>
  );
}

export function ModifierLabel({
  htmlFor,
  label,
  hint,
}: {
  htmlFor?: string;
  label: string;
  hint?: ReactNode;
}) {
  const content = (
    <span className="modifier-label__content">
      <span>{label}</span>
      {hint && (
        <ModifierTooltip content={hint}>
          <span className="modifier-label__hint" aria-label={`Aide ${label}`}>
            <Info size={14} />
          </span>
        </ModifierTooltip>
      )}
    </span>
  );

  if (htmlFor) {
    return <label htmlFor={htmlFor} className="modifier-label">{content}</label>;
  }

  return <div className="modifier-label">{content}</div>;
}

export function ModifierStatStrip({ stats }: { stats: ModifierStat[] }) {
  if (!stats.length) {
    return null;
  }

  return (
    <div className="detail-stats-strip">
      {stats.map((stat) => (
        <div key={`${stat.label}-${stat.value}`} className="detail-stat">
          <span className="detail-stat__value">{stat.value}</span>
          <span className="detail-stat__label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ModifierSectionHero({
  kicker,
  title,
  description,
  stats = [],
  chips = [],
  actions,
}: {
  kicker: string;
  title: string;
  description: string;
  stats?: ModifierStat[];
  chips?: string[];
  actions?: ReactNode;
}) {
  return (
    <section className="panel-card panel-card--nested modifier-hero-card">
      <div className="modifier-hero-card__header">
        <div className="modifier-hero-card__copy">
          <span className="eyebrow">{kicker}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {actions && <div className="modifier-hero-card__actions">{actions}</div>}
      </div>
      {stats.length > 0 && <ModifierStatStrip stats={stats} />}
      {chips.length > 0 && (
        <div className="detail-chip-strip detail-chip-strip--compact">
          {chips.map((chip) => (
            <span key={chip} className="detail-chip detail-chip--soft">
              {chip}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function ModifierEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <article className="panel-card panel-card--nested modifier-empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </article>
  );
}
