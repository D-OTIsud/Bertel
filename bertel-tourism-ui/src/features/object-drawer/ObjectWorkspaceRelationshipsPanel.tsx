import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceActorLinkItem,
  ObjectWorkspaceLinkedContactItem,
  ObjectWorkspaceOrganizationLinkItem,
  ObjectWorkspaceRelatedObjectItem,
  ObjectWorkspaceRelationshipsModule,
} from '../../services/object-workspace-parser';

interface ObjectWorkspaceRelationshipsPanelProps {
  value: ObjectWorkspaceRelationshipsModule;
  access: ObjectWorkspaceModuleAccess;
  statusMessage: string | null;
}

function sourceLabel(source: ObjectWorkspaceOrganizationLinkItem['source']): string {
  return source === 'org_link' ? 'object_org_link' : 'deep_data.organizations';
}

function directionLabel(direction: ObjectWorkspaceRelatedObjectItem['direction']): string {
  switch (direction) {
    case 'in':
      return 'Entrant';
    case 'out':
      return 'Sortant';
    default:
      return 'Associe';
  }
}

function contactLine(contact: ObjectWorkspaceLinkedContactItem): string {
  return [contact.kindLabel, contact.value].filter(Boolean).join(' · ');
}

function renderContactList(contacts: ObjectWorkspaceLinkedContactItem[]) {
  if (contacts.length === 0) {
    return <p>Aucun canal structure n est actuellement remonte pour cette liaison.</p>;
  }

  return (
    <div className="stack-list text-sm text-muted-foreground">
      {contacts.map((contact) => (
        <span key={`${contact.id}-${contact.value}`}>
          {contactLine(contact)}
          {contact.isPrimary ? ' · principal' : ''}
          {!contact.isPublic ? ' · non public' : ''}
        </span>
      ))}
    </div>
  );
}

function renderOrganization(item: ObjectWorkspaceOrganizationLinkItem) {
  return (
    <article key={`${item.source}-${item.id}-${item.roleCode}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.roleLabel || 'Rattachement'}</span>
          <h3>{item.name}</h3>
        </div>
        <strong>{item.status || 'statut non precise'}</strong>
      </div>

      <div className="stack-list text-sm text-muted-foreground">
        <span>{sourceLabel(item.source)}</span>
        {item.type && <span>Type: {item.type}</span>}
        {item.note && <span>Note: {item.note}</span>}
      </div>

      <div className="stack-list mt-4">
        {renderContactList(item.contacts)}
      </div>
    </article>
  );
}

function renderActor(item: ObjectWorkspaceActorLinkItem) {
  return (
    <article key={`${item.id}-${item.roleCode}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.roleLabel || 'Acteur lie'}</span>
          <h3>{item.displayName}</h3>
        </div>
        <strong>{item.isPrimary ? 'principal' : item.visibility || 'visible'}</strong>
      </div>

      <div className="stack-list text-sm text-muted-foreground">
        {(item.firstName || item.lastName) && <span>{[item.firstName, item.lastName].filter(Boolean).join(' ')}</span>}
        {item.gender && <span>Genre: {item.gender}</span>}
        {(item.validFrom || item.validTo) && <span>Validite: {[item.validFrom, item.validTo].filter(Boolean).join(' -> ')}</span>}
        {item.note && <span>Note: {item.note}</span>}
      </div>

      <div className="stack-list mt-4">
        {renderContactList(item.contacts)}
      </div>
    </article>
  );
}

function renderRelatedObject(item: ObjectWorkspaceRelatedObjectItem) {
  return (
    <article key={`${item.id}-${item.direction}-${item.relationTypeCode || item.relationTypeLabel}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{directionLabel(item.direction)}</span>
          <h3>{item.name}</h3>
        </div>
        <strong>{item.relationTypeLabel || 'Relation'}</strong>
      </div>

      <div className="stack-list text-sm text-muted-foreground">
        {item.type && <span>Type: {item.type}</span>}
        {item.status && <span>Statut: {item.status}</span>}
        {item.distanceM && <span>Distance: {item.distanceM} m</span>}
        {item.note && <span>Note: {item.note}</span>}
      </div>
    </article>
  );
}

export function ObjectWorkspaceRelationshipsPanel({
  value,
  access,
  statusMessage,
}: ObjectWorkspaceRelationshipsPanelProps) {
  const note = statusMessage ?? access.disabledReason;
  const linkedContactsCount =
    value.organizationLinks.reduce((count, item) => count + item.contacts.length, 0)
    + value.actors.reduce((count, item) => count + item.contacts.length, 0);

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Rattachements</h2>
          </div>
          <div className="stack-list text-right">
            <strong>Lecture seule</strong>
            {note && <small className="text-muted-foreground">{note}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Structures liées</span>
            <strong>{value.organizationLinks.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Acteurs liés</span>
            <strong>{value.actors.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Relations objet</span>
            <strong>{value.relatedObjects.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Canaux liés</span>
            <strong>{linkedContactsCount}</strong>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Rattachements ORG</span>
              <h3>Structures et portage</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.organizationLinks.length > 0 ? value.organizationLinks.map(renderOrganization) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Rattachements</span>
                <p>Aucun rattachement organisationnel n est actuellement remonte pour cette fiche.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Acteurs lies</span>
              <h3>Interlocuteurs et roles</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.actors.length > 0 ? value.actors.map(renderActor) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Acteurs</span>
                <p>Aucun acteur lie n est actuellement remonte dans le workspace.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Relations objet</span>
              <h3>Liens entrants, sortants et associes</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.relatedObjects.length > 0 ? value.relatedObjects.map(renderRelatedObject) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Relations</span>
                <p>Aucune relation objet structuree n est actuellement remontee pour cette fiche.</p>
              </article>
            )}
          </div>
        </article>

      </section>
    </div>
  );
}
