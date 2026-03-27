import type { ModifierPayload } from '../../services/modifier-payload';
import { ModifierEmptyState, ModifierSectionHero } from './modifier-shared';

interface ObjectCrmPanelProps {
  payload: ModifierPayload;
}

export function ObjectCrmPanel({ payload }: ObjectCrmPanelProps) {
  const notes = payload.parsed.text.privateNotes;
  const { reviews, interactions, tasks, consents } = payload.crm;
  const hasContent = notes.length > 0 || reviews.length > 0 || interactions.length > 0 || tasks.length > 0 || consents.length > 0;

  if (!hasContent) {
    return (
      <ModifierEmptyState
        title="CRM leger"
        body="Cette fiche n expose pas encore de notes ou de suivi CRM detaille."
      />
    );
  }

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="CRM"
        title="Suivi interne et reputation"
        description="Les blocs restent compacts pour garder un panneau lean: notes d equipe, reputation externe, interactions et taches sans noyer l utilisateur dans des tableaux."
        stats={[
          { label: 'Notes', value: String(notes.length) },
          { label: 'Avis', value: String(reviews.length) },
          { label: 'Interactions', value: String(interactions.length) },
          { label: 'Taches', value: String(tasks.length) },
        ]}
        chips={reviews.slice(0, 3).map((review) => `${review.source} ${review.rating}`)}
      />

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Notes internes</span>
          <div className="modifier-card-list">
            {notes.length > 0 ? notes.slice(0, 5).map((note) => (
              <article key={note.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{note.createdByName || 'Equipe'}</strong>
                  <span className="detail-chip detail-chip--soft">{note.category}</span>
                </div>
                <p className="detail-mini-card__meta">{note.body}</p>
              </article>
            )) : <p>Aucune note interne visible.</p>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <span className="facet-title">Avis publies</span>
          <div className="modifier-card-list">
            {reviews.length > 0 ? reviews.slice(0, 4).map((review) => (
              <article key={review.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{review.title || review.source}</strong>
                  {review.rating && <span className="detail-chip detail-chip--soft">{review.rating}</span>}
                </div>
                <p className="detail-mini-card__meta">{review.author || review.source}</p>
                {review.body && <small>{review.body}</small>}
                {review.response && <small>Reponse: {review.response}</small>}
              </article>
            )) : <p>Aucun avis importe.</p>}
          </div>
        </section>
      </div>

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Interactions</span>
          <div className="modifier-card-list">
            {interactions.length > 0 ? interactions.slice(0, 5).map((interaction) => (
              <article key={interaction.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{interaction.subject}</strong>
                  <span className="detail-chip detail-chip--soft">{interaction.status}</span>
                </div>
                <p className="detail-mini-card__meta">{interaction.type}</p>
                {interaction.body && <small>{interaction.body}</small>}
              </article>
            )) : <p>Aucune interaction CRM.</p>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <span className="facet-title">Taches & consentements</span>
          <div className="modifier-card-list">
            {tasks.slice(0, 4).map((task) => (
              <article key={task.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{task.title}</strong>
                  <span className="detail-chip detail-chip--soft">{task.status}</span>
                </div>
                <p className="detail-mini-card__meta">{task.priority}</p>
                {task.description && <small>{task.description}</small>}
              </article>
            ))}
            {consents.slice(0, 3).map((consent) => (
              <article key={`${consent.actorId}-${consent.channel}`} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{consent.actorName}</strong>
                  <span className="detail-chip detail-chip--soft">{consent.consent}</span>
                </div>
                <p className="detail-mini-card__meta">{consent.channel}</p>
              </article>
            ))}
            {tasks.length === 0 && consents.length === 0 && <p>Pas de suivi additionnel.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
