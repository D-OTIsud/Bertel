import type { ModifierPayload } from '../../services/modifier-payload';
import { ModifierEmptyState, ModifierSectionHero, ModifierTooltip } from './modifier-shared';

interface ObjectDistinctionsPanelProps {
  payload: ModifierPayload;
}

export function ObjectDistinctionsPanel({ payload }: ObjectDistinctionsPanelProps) {
  const groups = payload.distinctions.groups;

  if (!groups.length) {
    return (
      <ModifierEmptyState
        title="Aucune distinction structuree"
        body="Les classements, labels et amenites sont encore absents du payload courant pour cette fiche."
      />
    );
  }

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Distinctions"
        title="Classements, labels et signaux de confiance"
        description="La composition suit la logique detail: les evidences fortes d abord, puis les groupes de distinction et enfin les taxonomies plus pratiques."
        stats={[
          { label: 'Groupes', value: String(groups.length) },
          { label: 'Distinctions', value: String(payload.distinctions.highlightCount) },
          { label: 'Amenites', value: String(payload.parsed.taxonomy.amenityItems.length) },
        ]}
        chips={payload.offer.environmentTags.slice(0, 4)}
      />

      <section className="panel-card panel-card--nested">
        <div className="detail-taxonomy-grid detail-taxonomy-grid--distinctions">
          {groups.map((group) => (
            <div key={group.key} className="detail-taxonomy-group detail-taxonomy-group--card detail-taxonomy-group--labels">
              <div className="detail-taxonomy-group__header">
                <span className="detail-taxonomy-group__title">{group.title}</span>
              </div>
              <div className="detail-chip-strip">
                {group.items.map((item) => {
                  const chip = (
                    <span key={item.id} className="detail-chip detail-chip--distinction detail-chip--distinction-labels">
                      {item.label}
                    </span>
                  );

                  if (!item.meta) {
                    return chip;
                  }

                  return (
                    <ModifierTooltip key={item.id} content={item.meta}>
                      {chip}
                    </ModifierTooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="drawer-grid modifier-read-grid">
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Amenites visibles</span>
          <div className="detail-chip-strip detail-chip-strip--compact">
            {payload.parsed.taxonomy.amenityItems.length > 0 ? payload.parsed.taxonomy.amenityItems.map((amenity) => (
              <span key={amenity.id} className="detail-chip detail-chip--soft detail-chip--equipment">
                {amenity.label}
              </span>
            )) : <span className="detail-chip detail-chip--soft">Aucune amenite</span>}
          </div>
        </section>

        <section className="panel-card panel-card--nested">
          <span className="facet-title">Cadre & paiements</span>
          <div className="detail-chip-strip detail-chip-strip--compact">
            {[
              ...payload.offer.environmentTags.map((item) => `Cadre: ${item}`),
              ...payload.offer.paymentMethods.map((item) => `Paiement: ${item}`),
            ].slice(0, 8).map((item) => (
              <span key={item} className="detail-chip detail-chip--soft detail-chip--practical">
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
