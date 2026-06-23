"use client";

import { useQuery } from '@tanstack/react-query';
import { listPendingChanges } from '../services/rpc';
import { EmptyState } from '../components/common/EmptyState';

export default function ModerationPage() {
  const query = useQuery({ queryKey: ['pending-changes'], queryFn: listPendingChanges });

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement de la modération…</section>;
  }

  if (query.isError) {
    return (
      <section className="p-4">
        <EmptyState
          mode="error"
          title="Modération indisponible"
          description={(query.error as Error).message}
          action={{ label: 'Réessayer', onClick: () => query.refetch() }}
        />
      </section>
    );
  }

  // Page honnête : pas de hero sur une liste vide à boutons inertes (audit stubs).
  if ((query.data ?? []).length === 0) {
    return (
      <section className="p-4">
        <EmptyState
          mode="coming-soon"
          title="Modération à venir"
          description="La validation des suggestions terrain (vue avant / après) arrivera avec un prochain lot. Rien à faire pour l’instant."
        />
      </section>
    );
  }

  return (
    <section className="page-grid p-4">
      <article className="hero-panel">
        <span className="eyebrow">Controle</span>
        <h2>Pending changes</h2>
        <p>Vue split-screen avant / apres pour valider les suggestions terrain.</p>
      </article>

      <div className="stack-list">
        {(query.data ?? []).map((item) => (
          <article key={item.id} className="split-card">
            <div>
              <span className="facet-title">Avant</span>
              <p>{item.before}</p>
            </div>
            <div>
              <span className="facet-title">Apres</span>
              <p>{item.after}</p>
            </div>
            <footer className="split-card__footer">
              <span>{item.objectName} · {item.author} · {item.submittedAt}</span>
              <div className="inline-actions">
                <button type="button" className="primary-button">Approuver</button>
                <button type="button" className="ghost-button">Rejeter</button>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

export { ModerationPage };