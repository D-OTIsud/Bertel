import type { MembershipItem } from './utils';
import { parseMemberships } from './utils';

interface ObjectMembershipPanelProps {
  raw: Record<string, unknown>;
}

function getMembershipTone(item: MembershipItem): 'green' | 'orange' | 'red' | 'neutral' {
  const status = item.status.toLowerCase();
  const invoiceStatus = item.invoiceStatus.toLowerCase();
  const visibilityImpact = item.visibilityImpact.toLowerCase();

  if (status.includes('lapsed') || status.includes('expire') || visibilityImpact.includes('masquee')) {
    return 'red';
  }

  if (invoiceStatus.includes('pending') || invoiceStatus.includes('retard') || status.includes('renew')) {
    return 'orange';
  }

  if (status.includes('active') || status.includes('valide')) {
    return 'green';
  }

  return 'neutral';
}

export function ObjectMembershipPanel({ raw }: ObjectMembershipPanelProps) {
  const memberships = parseMemberships(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Commercial</span>
            <h2>Adhesions & visibilite</h2>
          </div>
          <button type="button" className="ghost-button">Mettre a jour l adhesion</button>
        </div>
        <div className="stack-list">
          {memberships.length > 0 ? memberships.map((membership) => (
            <article key={membership.id} className="legal-card">
              <div className="legal-card__header">
                <div>
                  <strong>{membership.name}</strong>
                  <p>{membership.tier}{membership.campaign ? ` · ${membership.campaign}` : ''}</p>
                </div>
                <span className={`status-pill status-pill--${getMembershipTone(membership)}`}>
                  {membership.status}
                </span>
              </div>
              <div className="legal-card__grid">
                <span>Facturation: {membership.invoiceStatus}</span>
                <span>Visibilite: {membership.visibilityImpact}</span>
                <span>Echeance: {membership.expiresAt}</span>
                <span>Palier: {membership.tier}</span>
              </div>
            </article>
          )) : <p>Le panneau est pret pour `object_membership`, la facturation et l impact de visibilite commerciale.</p>}
        </div>
      </section>
    </div>
  );
}
