import { parseOpenings } from './utils';

interface ObjectOpeningsPanelProps {
  raw: Record<string, unknown>;
}

export function ObjectOpeningsPanel({ raw }: ObjectOpeningsPanelProps) {
  const openings = parseOpenings(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Ouvertures</span>
            <h2>Periodes, plannings et creneaux</h2>
          </div>
          <button type="button" className="ghost-button">Ajouter une periode</button>
        </div>
        <div className="stack-list">
          {openings.length > 0 ? openings.map((item, index) => (
            <article key={`${item.label}-${index}`} className="panel-card panel-card--nested">
              <strong>{item.label}</strong>
              <p>{item.slots.length > 0 ? item.slots.join(' · ') : 'Aucun creneau'}</p>
              <small>{item.weekdays.length > 0 ? item.weekdays.join(', ') : 'Tous les jours'}</small>
              {item.details.length > 0 && <small>{item.details.join(' · ')}</small>}
            </article>
          )) : <p>Le panneau est pret pour `opening_period`, `opening_schedule` et `opening_time_frame`.</p>}
        </div>
      </section>
    </div>
  );
}
