"use client";

import { useQuery } from '@tanstack/react-query';
import { listAuditTemplate } from '../services/rpc';

export default function AuditsPage() {
  const query = useQuery({ queryKey: ['audit-template'], queryFn: listAuditTemplate });

  if (query.isLoading) {
    return <section className="panel-card panel-card--wide">Chargement du modele d audit...</section>;
  }

  if (query.isError) {
    return <section className="panel-card panel-card--warning panel-card--wide">{(query.error as Error).message}</section>;
  }

  return (
    <section className="page-grid">
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