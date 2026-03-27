import { Globe, Mail, Phone } from 'lucide-react';
import type { ModifierPayload } from '../../services/modifier-payload';
import { ModifierEmptyState, ModifierSectionHero } from './modifier-shared';

interface ObjectContactsPanelProps {
  payload: ModifierPayload;
}

function getContactIcon(kindCode: string) {
  const normalized = kindCode.trim().toLowerCase();

  if (normalized === 'email') {
    return Mail;
  }

  if (['phone', 'mobile', 'whatsapp'].includes(normalized)) {
    return Phone;
  }

  return Globe;
}

export function ObjectContactsPanel({ payload }: ObjectContactsPanelProps) {
  const { public: publicContacts } = payload.parsed.contacts;
  const { actors, organizations, all: relatedObjects } = payload.parsed.relations;
  const memberships = payload.contacts.memberships;

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Contacts & Network"
        title="Reseau de diffusion"
        description="La lecture suit l aside detail: contacts utiles, structures liees, objets voisins et pilotage reseau sans repeter les memes infos dans d autres sections."
        stats={[
          { label: 'Contacts', value: String(publicContacts.length) },
          { label: 'Acteurs', value: String(actors.length) },
          { label: 'Organisations', value: String(organizations.length) },
          { label: 'Adhesions', value: String(memberships.length) },
        ]}
        chips={relatedObjects.slice(0, 4).map((item) => item.relationship)}
      />

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Contacts publics</span>
          <div className="modifier-card-list">
            {publicContacts.length > 0 ? publicContacts.map((contact) => {
              const Icon = getContactIcon(contact.kindCode);
              return (
                <article key={contact.id} className="detail-mini-card">
                  <div className="detail-mini-card__header">
                    <strong>{contact.label}</strong>
                    {contact.kind && <span className="detail-chip detail-chip--soft">{contact.kind}</span>}
                  </div>
                  <p className="detail-mini-card__meta">
                    <Icon size={14} />
                    {' '}
                    {contact.value}
                  </p>
                  {contact.sourceName && <small>{contact.sourceName}</small>}
                </article>
              );
            }) : <p>Aucun contact public structure n est remonte pour cette fiche.</p>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <span className="facet-title">Acteurs</span>
          <div className="modifier-card-list">
            {actors.length > 0 ? actors.map((actor) => (
              <article key={actor.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{actor.name}</strong>
                  {actor.role && <span className="detail-chip detail-chip--soft">{actor.role}</span>}
                </div>
                {actor.contacts[0] && <p className="detail-mini-card__meta">{actor.contacts[0]}</p>}
                {actor.note && <small>{actor.note}</small>}
              </article>
            )) : <p>Aucun acteur lie pour le moment.</p>}
          </div>
        </section>
      </div>

      <section className="panel-card panel-card--nested">
        <div className="drawer-grid modifier-read-grid">
          <div>
            <span className="facet-title">Organisations</span>
            <div className="modifier-card-list">
              {organizations.length > 0 ? organizations.map((organization) => (
                <article key={organization.id} className="detail-mini-card">
                  <div className="detail-mini-card__header">
                    <strong>{organization.name}</strong>
                    {organization.linkType && <span className="detail-chip detail-chip--soft">{organization.linkType}</span>}
                  </div>
                  {organization.contacts[0] && <p className="detail-mini-card__meta">{organization.contacts[0]}</p>}
                  {organization.note && <small>{organization.note}</small>}
                </article>
              )) : <p>Aucune structure liee.</p>}
            </div>
          </div>

          <div>
            <span className="facet-title">Adhesions et portefeuille</span>
            <div className="modifier-card-list">
              {memberships.length > 0 ? memberships.map((membership) => (
                <article key={membership.id} className="detail-mini-card">
                  <div className="detail-mini-card__header">
                    <strong>{membership.name}</strong>
                    <span className="detail-chip detail-chip--soft">{membership.status}</span>
                  </div>
                  <p className="detail-mini-card__meta">{[membership.tier, membership.expiresAt].filter(Boolean).join(' · ')}</p>
                  <small>{membership.visibilityImpact}</small>
                </article>
              )) : <p>Pas d adhesion detaillee sur la fiche.</p>}
            </div>
          </div>
        </div>
      </section>

      {relatedObjects.length > 0 ? (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Objets lies</span>
          <div className="detail-list">
            {relatedObjects.slice(0, 8).map((item) => (
              <div key={`${item.id}-${item.relationship}-${item.direction}`} className="detail-list-row detail-list-row--stacked">
                <div className="detail-mini-card__header">
                  <strong>{item.name}</strong>
                  <span className="detail-chip detail-chip--soft">{item.relationship}</span>
                </div>
                <p>{item.type || 'Type non renseigne'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <ModifierEmptyState
          title="Pas de reseau lie"
          body="Les relations objet-objet et les liens organisationnels apparaitront ici des qu ils seront presentes dans la ressource."
        />
      )}
    </div>
  );
}
