import { parseActors, parseContacts, parseOrganizations } from './utils';

interface ObjectContactsPanelProps {
  raw: Record<string, unknown>;
}

export function ObjectContactsPanel({ raw }: ObjectContactsPanelProps) {
  const contacts = parseContacts(raw);
  const actors = parseActors(raw);
  const organizations = parseOrganizations(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Acteurs</span>
            <h2>Reseau de gestion</h2>
          </div>
        </div>
        <div className="stack-list">
          {actors.length > 0 ? actors.map((actor) => (
            <article key={actor.id} className="panel-card panel-card--nested">
              <strong>{actor.name}</strong>
              <p>{actor.role}</p>
              {actor.contacts.length > 0 && <small>{actor.contacts.join(' · ')}</small>}
            </article>
          )) : <p>Aucun acteur profond expose pour cette fiche pour le moment.</p>}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Contacts</span>
            <h2>Canaux disponibles</h2>
          </div>
        </div>
        <div className="stack-list">
          {contacts.length > 0 ? contacts.map((contact) => (
            <article key={contact.id} className="panel-card panel-card--nested">
              <strong>{contact.label}</strong>
              <p>{contact.value}</p>
              <small>{contact.kind}</small>
            </article>
          )) : <p>Aucun contact structure remonte via le payload courant.</p>}
        </div>
      </section>

      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Organisations</span>
            <h2>Structures liees</h2>
          </div>
        </div>
        <div className="stack-list">
          {organizations.length > 0 ? organizations.map((organization) => (
            <article key={organization.id} className="panel-card panel-card--nested">
              <strong>{organization.name}</strong>
              <p>{organization.linkType}</p>
              {organization.contacts.length > 0 && <small>{organization.contacts.join(' · ')}</small>}
            </article>
          )) : <p>Ce panneau est pret pour les relations `object_org_link` et `actor_object_role`.</p>}
        </div>
      </section>
    </div>
  );
}
