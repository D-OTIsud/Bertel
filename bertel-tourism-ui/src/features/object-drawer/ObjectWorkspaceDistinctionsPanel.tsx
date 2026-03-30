import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceAccessibilityAmenityItem,
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionsModule,
} from '../../services/object-workspace-parser';

interface ObjectWorkspaceDistinctionsPanelProps {
  value: ObjectWorkspaceDistinctionsModule;
  access: ObjectWorkspaceModuleAccess;
  statusMessage: string | null;
}

function renderDisabilityTypes(types: string[]) {
  if (types.length === 0) {
    return 'Aucun type de handicap precise';
  }

  return types.join(', ');
}

function renderDistinctionItem(item: ObjectWorkspaceDistinctionItem) {
  return (
    <article key={`${item.recordId ?? 'draft'}-${item.schemeCode}-${item.valueCode}`} className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="facet-title">{item.schemeLabel}</span>
          <h3>{item.valueLabel}</h3>
        </div>
        <strong>{item.status || 'non precise'}</strong>
      </div>
      <div className="stack-list text-sm text-muted-foreground">
        {item.awardedAt && <span>Attribue le {item.awardedAt}</span>}
        {item.validUntil && <span>Valide jusqu au {item.validUntil}</span>}
        {item.disabilityTypesCovered.length > 0 && (
          <span>Types couverts: {renderDisabilityTypes(item.disabilityTypesCovered)}</span>
        )}
      </div>
    </article>
  );
}

function renderAmenityItem(item: ObjectWorkspaceAccessibilityAmenityItem) {
  return (
    <article key={item.code} className="panel-card panel-card--nested">
      <span className="facet-title">{item.code}</span>
      <h3>{item.label}</h3>
      <p>{renderDisabilityTypes(item.disabilityTypes)}</p>
    </article>
  );
}

export function ObjectWorkspaceDistinctionsPanel({
  value,
  access,
  statusMessage,
}: ObjectWorkspaceDistinctionsPanelProps) {
  const note = statusMessage ?? value.unavailableReason ?? access.disabledReason;
  const distinctionCount = value.distinctionGroups.reduce((count, group) => count + group.items.length, 0);
  const accessibilityCoverageCount = value.accessibilityAmenityCoverage.reduce(
    (count, item) => count + Math.max(item.disabilityTypes.length, 1),
    0,
  );

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">C2</span>
            <h2>Distinctions et accessibilite</h2>
            <p>Ce module separe les distinctions certifiees, les labels d accessibilite et les indices d accessibilite issus des equipements.</p>
          </div>
          <div className="stack-list text-right">
            <strong>Lecture seule</strong>
            {note && <small className="text-muted-foreground">{note}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Distinctions</span>
            <strong>{distinctionCount}</strong>
            <p>Labels et distinctions certifies hors durabilite et hors taxonomie structurante.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Labels accessibilite</span>
            <strong>{value.accessibilityLabels.length}</strong>
            <p>Lectures certifiees de type Tourisme & Handicap et autres labels d accessibilite.</p>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Couverture accessibilite</span>
            <strong>{accessibilityCoverageCount}</strong>
            <p>Indices issus des equipements d accessibilite, sans les confondre avec les labels certifies.</p>
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Distinctions</span>
              <h3>Certifications hors accessibilite</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.distinctionGroups.length > 0 ? value.distinctionGroups.map((group) => (
              <article key={group.schemeCode} className="panel-card panel-card--nested">
                <div className="panel-heading">
                  <div>
                    <span className="facet-title">{group.schemeCode}</span>
                    <h3>{group.schemeLabel}</h3>
                  </div>
                  <strong>{group.items.length}</strong>
                </div>
                <div className="stack-list">
                  {group.items.map(renderDistinctionItem)}
                </div>
              </article>
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Distinctions</span>
                <p>Aucune distinction certifiee n est actuellement exposee pour cet objet.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Accessibilite certifiee</span>
              <h3>Labels et perimetres couverts</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.accessibilityLabels.length > 0 ? value.accessibilityLabels.map(renderDistinctionItem) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Labels accessibilite</span>
                <p>Aucun label d accessibilite certifie n est actuellement expose.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Couverture par equipements</span>
              <h3>Indices non certifies</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.accessibilityAmenityCoverage.length > 0 ? value.accessibilityAmenityCoverage.map(renderAmenityItem) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Accessibilite</span>
                <p>Aucun equipement d accessibilite typant la couverture n est actuellement remonte.</p>
              </article>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
