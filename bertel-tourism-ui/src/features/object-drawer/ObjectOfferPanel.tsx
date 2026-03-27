import type { ModifierPayload } from '../../services/modifier-payload';
import { ModifierEmptyState, ModifierSectionHero, ModifierTooltip } from './modifier-shared';

interface ObjectOfferPanelProps {
  payload: ModifierPayload;
}

export function ObjectOfferPanel({ payload }: ObjectOfferPanelProps) {
  const { prices, openings, paymentMethods, groupPolicies, promotions } = payload.offer;
  const petPolicy = payload.parsed.operations.petPolicy;

  if (!prices.length && !openings.length && !paymentMethods.length && !groupPolicies.length && !petPolicy && !promotions.length) {
    return (
      <ModifierEmptyState
        title="Aucune offre structuree"
        body="Cette fiche ne remonte pas encore de surface tarifaire ou temporelle exploitable."
      />
    );
  }

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Offer & Availability"
        title="Tarifs, horaires et conditions d accueil"
        description="Tout ce qui influence l usage concret de la fiche reste dans la meme section: prix, ouvertures, paiements, groupes, animaux et promos."
        stats={[
          { label: 'Prix', value: String(prices.length) },
          { label: 'Ouvertures', value: String(openings.length) },
          { label: 'Paiements', value: String(paymentMethods.length) },
          { label: 'Promos', value: String(promotions.length) },
        ]}
        chips={paymentMethods.slice(0, 4)}
      />

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Tarifs</span>
          <div className="detail-list">
            {prices.length > 0 ? prices.map((price, index) => (
              <div key={`${price.label}-${price.periodLabel}-${index}`} className="detail-list-row">
                <div>
                  <strong>{price.label}</strong>
                  {price.periodLabel && <p>{price.periodLabel}</p>}
                  {price.details.length > 0 && <small>{price.details.join(' · ')}</small>}
                </div>
                <span className="detail-price-amount">
                  {price.amount} {price.currency}
                </span>
              </div>
            )) : <p>Aucune ligne tarifaire.</p>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <span className="facet-title">Ouvertures</span>
          <div className="detail-list">
            {openings.length > 0 ? openings.map((opening, index) => (
              <div key={`${opening.label}-${index}`} className="detail-list-row detail-list-row--stacked">
                <div>
                  <strong>{opening.label}</strong>
                  {opening.weekdays.length > 0 && <p>{opening.weekdays.join(' · ')}</p>}
                  {opening.slots.length > 0 && <small>{opening.slots.join(' · ')}</small>}
                </div>
                {opening.details.length > 0 && <small>{opening.details.join(' · ')}</small>}
              </div>
            )) : <p>Aucune plage d ouverture structuree.</p>}
          </div>
        </section>
      </div>

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Politiques d accueil</span>
          <div className="modifier-card-list">
            {petPolicy && (
              <article className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>Animaux</strong>
                  <span className="detail-chip detail-chip--soft">{petPolicy.label}</span>
                </div>
                {petPolicy.details.length > 0 && <p className="detail-mini-card__meta">{petPolicy.details.join(' · ')}</p>}
              </article>
            )}
            {groupPolicies.map((policy, index) => (
              <article key={readString(policy.id, `group-policy-${index}`)} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>Groupes</strong>
                  <span className="detail-chip detail-chip--soft">
                    {[readString(policy.min_size), readString(policy.max_size)].filter(Boolean).join(' - ') || 'sur demande'}
                  </span>
                </div>
                <p className="detail-mini-card__meta">{readString(policy.notes, readString(policy.name, 'Politique groupe'))}</p>
              </article>
            ))}
            {!petPolicy && groupPolicies.length === 0 && <p>Aucune politique structuree.</p>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <div className="modifier-offer-header">
            <span className="facet-title">Promotions</span>
            <ModifierTooltip content="La promo reste compacte ici pour ne pas alourdir l interface. Le detail complet vient du lien objet-promotion.">
              <span className="modifier-inline-hint">avance</span>
            </ModifierTooltip>
          </div>
          <div className="modifier-card-list">
            {promotions.length > 0 ? promotions.map((promotion, index) => (
              <article key={readString(promotion.id, `promotion-${index}`)} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{readString(promotion.name, readString(promotion.promotion_id, 'Promotion'))}</strong>
                  {readString(promotion.code) && <span className="detail-chip detail-chip--soft">{readString(promotion.code)}</span>}
                </div>
                <p className="detail-mini-card__meta">{readString(promotion.description, 'Promotion liee a la fiche')}</p>
              </article>
            )) : <p>Aucune promotion liee.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}
