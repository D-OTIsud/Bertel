"use client";

import { useQuery } from '@tanstack/react-query';
import { listAuditTemplate } from '../services/rpc';
import { EmptyState } from '../components/common/EmptyState';

export default function AuditsPage() {
  const query = useQuery({ queryKey: ['audit-template'], queryFn: listAuditTemplate });

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide m-4">Chargement du modèle d’audit…</section>;
  }

  if (query.isError) {
    return (
      <section className="p-4">
        <EmptyState
          mode="error"
          title="Audits indisponibles"
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
          title="Audits & incidents à venir"
          description="La checklist tactile, la prise de note et le signalement géolocalisé arriveront avec un prochain lot."
        />
      </section>
    );
  }

  return (
    <section className="page-grid p-4">
      <article className="hero-panel">
        <span className="eyebrow">Terrain</span>
        <h2>Audits & incidents mobile-first</h2>
        <p>Checklist tactile, prise de note rapide, photo et signalement geolocalise.</p>
      </article>

      <div className="audit-layout">
        <article className="panel-card panel-card--wide">
          <div className="panel-heading">
            <h2>Checklist auditeur</h2>
          </div>
          <div className="stack-list">
            {(query.data ?? []).map((question) => (
              <label key={question.id} className="checklist-row">
                <span>{question.label}</span>
                <input type="checkbox" defaultChecked={Boolean(question.score && question.score >= 3)} />
              </label>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-heading">
            <h2>Incident</h2>
          </div>
          <label className="field-block">
            <span>Gravite</span>
            <select defaultValue="medium">
              <option value="low">Faible</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
            </select>
          </label>
          <label className="field-block">
            <span>Observation</span>
            <textarea rows={4} placeholder="Photo, GPS mobile, commentaire..." />
          </label>
          <button type="button" className="primary-button">Envoyer le signalement</button>
        </article>
      </div>
    </section>
  );
}

export { AuditsPage };