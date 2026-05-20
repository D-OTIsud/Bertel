import type { ReactNode } from 'react';
import { CircleHelp, Info } from 'lucide-react';

interface WorkspaceTooltipProps {
  content: string | null;
  label?: string;
}

export function WorkspaceTooltip({ content, label = 'Aide' }: WorkspaceTooltipProps) {
  if (!content) {
    return null;
  }

  return (
    <span className="workspace-tooltip">
      <button type="button" className="workspace-tooltip__trigger" aria-label={label}>
        <CircleHelp size={15} aria-hidden="true" />
      </button>
      <span className="workspace-tooltip__bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}

interface WorkspaceSectionProps {
  eyebrow?: string;
  title: string;
  help?: string | null;
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkspaceSection({ eyebrow, title, help, actions, children }: WorkspaceSectionProps) {
  return (
    <article className="panel-card panel-card--nested workspace-section">
      <div className="workspace-section__header">
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        <div className="workspace-section__tools">
          <WorkspaceTooltip content={help ?? null} />
          {actions}
        </div>
      </div>
      {children}
    </article>
  );
}

interface WorkspaceFieldProps {
  label: string;
  htmlFor?: string;
  help?: string | null;
  full?: boolean;
  children: ReactNode;
}

export function WorkspaceField({ label, htmlFor, help, full = false, children }: WorkspaceFieldProps) {
  return (
    <div className={full ? 'drawer-inline-field drawer-inline-field--full' : 'drawer-inline-field'}>
      <div className="workspace-field-label-row">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        <WorkspaceTooltip content={help ?? null} label={`Aide: ${label}`} />
      </div>
      {children}
    </div>
  );
}

interface WorkspaceEmptyStateProps {
  title: string;
  children?: ReactNode;
}

export function WorkspaceEmptyState({ title, children }: WorkspaceEmptyStateProps) {
  return (
    <div className="workspace-empty-state">
      <Info size={16} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children ? <span>{children}</span> : null}
      </div>
    </div>
  );
}

interface WorkspaceRepeatedCardProps {
  title: string;
  meta?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkspaceRepeatedCard({ title, meta, actions, children }: WorkspaceRepeatedCardProps) {
  return (
    <article className="panel-card panel-card--nested workspace-repeated-card">
      <div className="workspace-repeated-card__header">
        <div>
          {meta ? <span className="facet-title">{meta}</span> : null}
          <h3>{title}</h3>
        </div>
        {actions ? <div className="inline-actions">{actions}</div> : null}
      </div>
      {children}
    </article>
  );
}
