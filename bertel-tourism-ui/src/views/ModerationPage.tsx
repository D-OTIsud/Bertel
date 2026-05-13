"use client";

import { useQuery } from '@tanstack/react-query';
import { listPendingChanges } from '../services/rpc';

export default function ModerationPage() {
  const query = useQuery({ queryKey: ['pending-changes'], queryFn: listPendingChanges });

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement de la moderation...</section>;
  }

  if (query.isError) {
    return <section className="panel-card panel-card--warning panel-card--wide m-4">{(query.error as Error).message}</section>;
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