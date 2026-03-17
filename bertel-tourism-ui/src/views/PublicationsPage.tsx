"use client";

import { useQuery } from '@tanstack/react-query';
import { listPublicationBoard } from '../services/rpc';

const lanes = ['brief', 'layout', 'ready'] as const;
const labels = {
  brief: 'Brief',
  layout: 'Mise en page',
  ready: 'Pret a exporter',
};

export default function PublicationsPage() {
  const query = useQuery({ queryKey: ['publication-board'], queryFn: listPublicationBoard });

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide">Chargement des publications...</section>;
  }

  if (query.isError) {
    return <section className="panel-card panel-card--warning panel-card--wide">{(query.error as Error).message}</section>;
  }

  return (
    <section className="page-grid">
      <article className="hero-panel">
        <span className="eyebrow">Print workflow</span>
        <h2>Chemin de fer publications</h2>
        <p>Workflow type Trello pour relire, disposer puis exporter vers InDesign ou CSV.</p>
      </article>

      <div className="kanban-grid">
        {lanes.map((lane) => (
          <section key={lane} className="kanban-column">
            <h3>{labels[lane]}</h3>
            {(query.data ?? [])
              .filter((item) => item.lane === lane)
              .map((item) => (
                <article key={item.id} className="kanban-card">
                  <strong>{item.title}</strong>
                  <p>Page {item.page}</p>
                  <div className="inline-actions">
                    <button type="button" className="ghost-button">Export InDesign</button>
                    <button type="button" className="ghost-button">Export CSV</button>
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}

export { PublicationsPage };