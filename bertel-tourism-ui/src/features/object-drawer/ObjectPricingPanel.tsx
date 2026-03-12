import { parsePrices } from './utils';

interface ObjectPricingPanelProps {
  raw: Record<string, unknown>;
}

export function ObjectPricingPanel({ raw }: ObjectPricingPanelProps) {
  const prices = parsePrices(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Tarification</span>
            <h2>Prix, periodes et remises</h2>
          </div>
          <button type="button" className="ghost-button">Gerer les periodes tarifaires</button>
        </div>
        <div className="stack-list">
          {prices.length > 0 ? prices.map((price, index) => (
            <article key={`${price.label}-${price.periodLabel}-${index}`} className="panel-card panel-card--nested">
              <strong>{price.label}</strong>
              <p>{price.amount} {price.currency}</p>
              <small>{price.periodLabel}</small>
              {price.details.length > 0 && <small>{price.details.join(' · ')}</small>}
            </article>
          )) : <p>Le panneau est pret pour `object_price`, `object_price_period` et les remises bornees.</p>}
        </div>
      </section>
    </div>
  );
}
