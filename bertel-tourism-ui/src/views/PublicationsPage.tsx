"use client";

import { useQuery } from '@tanstack/react-query';
import { listPublicationBoard } from '../services/rpc';
import { EmptyState } from '../components/common/EmptyState';

const lanes = ['brief', 'layout', 'ready'] as const;
const labels = {
  brief: 'Brief',
  layout: 'Mise en page',
  ready: 'Pret a exporter',
};

export default function PublicationsPage() {
  const query = useQuery({ queryKey: ['publication-board'], queryFn: listPublicationBoard });

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement des publications…</section>;
  }

  if (query.isError) {
    return (
      <section className="p-4">
        <EmptyState
          mode="error"
          title="Publications indisponibles"
          description={(query.error as Error).message}
          action={{ label: 'Réessayer', onClick: () => query.refetch() }}
        />
      </section>
    );
  }

  if ((query.data ?? []).length === 0) {
    return (
      <section className="p-4">
        <EmptyState
          mode="coming-soon"
          title="Chemin de fer publications à venir"
          description="Le workflow de relecture, mise en page et export InDesign / CSV arrivera avec un prochain lot."
        />
      </section>
    );
  }

  return (
    <section className="page-grid p-4">
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