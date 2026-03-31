import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceOpeningBucket,
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningWeekday,
  ObjectWorkspaceOpeningsModule,
} from '../../services/object-workspace-parser';

interface ObjectWorkspaceOpeningsPanelProps {
  value: ObjectWorkspaceOpeningsModule;
  access: ObjectWorkspaceModuleAccess;
  statusMessage: string | null;
}

function bucketLabel(bucket: ObjectWorkspaceOpeningBucket): string {
  switch (bucket) {
    case 'current':
      return 'Annee en cours';
    case 'next-year':
      return 'Annee suivante';
    default:
      return 'Plage non datee';
  }
}

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate && endDate) {
    return `${startDate} -> ${endDate}`;
  }

  return startDate || endDate || 'Dates non precisees';
}

function renderWeekdayRow(weekday: ObjectWorkspaceOpeningWeekday) {
  const slotLabel = weekday.slots.length > 0
    ? weekday.slots.map((slot) => slot.end ? `${slot.start} -> ${slot.end}` : slot.start).join(' · ')
    : 'Aucun creneau';

  return (
    <article key={`${weekday.code}-${slotLabel}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{weekday.label}</span>
          <h3>{slotLabel}</h3>
        </div>
        <strong>{weekday.slots.length}</strong>
      </div>
    </article>
  );
}

function renderPeriod(period: ObjectWorkspaceOpeningPeriod) {
  const slotsCount = period.weekdays.reduce((count, weekday) => count + weekday.slots.length, 0);

  return (
    <article key={`${period.recordId ?? 'draft'}-${period.bucket}-${period.order}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{bucketLabel(period.bucket)}</span>
          <h3>{period.label || `Periode ${period.order}`}</h3>
        </div>
        <strong>{slotsCount} creneau(x)</strong>
      </div>

      <div className="stack-list text-sm text-muted-foreground">
        <span>{formatDateRange(period.startDate, period.endDate)}</span>
        {period.closedDays.length > 0 && <span>Jours fermes: {period.closedDays.join(', ')}</span>}
      </div>

      <div className="stack-list mt-4">
        {period.weekdays.length > 0 ? period.weekdays.map(renderWeekdayRow) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Creneaux</span>
            <p>Aucun creneau detaille n est actuellement expose pour cette periode.</p>
          </article>
        )}
      </div>
    </article>
  );
}

export function ObjectWorkspaceOpeningsPanel({
  value,
  access,
  statusMessage,
}: ObjectWorkspaceOpeningsPanelProps) {
  const note = statusMessage ?? value.unavailableReason ?? access.disabledReason;
  const currentCount = value.periods.filter((period) => period.bucket === 'current').length;
  const nextYearCount = value.periods.filter((period) => period.bucket === 'next-year').length;
  const weekdayCount = value.periods.reduce((count, period) => count + period.weekdays.length, 0);

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Horaires</h2>
          </div>
          <div className="stack-list text-right">
            <strong>Lecture seule</strong>
            {note && <small className="text-muted-foreground">{note}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Periodes</span>
            <strong>{value.periods.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Annee en cours</span>
            <strong>{currentCount}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Annee suivante</span>
            <strong>{nextYearCount}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Jours typés</span>
            <strong>{weekdayCount}</strong>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        {value.periods.length > 0 ? value.periods.map(renderPeriod) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Horaires</span>
            <p>Aucune periode d ouverture n est actuellement exposee pour cet objet.</p>
          </article>
        )}
      </section>
    </div>
  );
}
