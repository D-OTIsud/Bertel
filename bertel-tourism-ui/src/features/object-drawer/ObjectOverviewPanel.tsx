import type { FieldLock } from '../../types/domain';
import type { ModifierPayload } from '../../services/modifier-payload';
import { Input } from '@/components/ui/input';
import { ModifierLabel, ModifierSectionHero } from './modifier-shared';

interface ObjectOverviewPanelProps {
  payload: ModifierPayload;
  name: string;
  description: string;
  fields: Record<string, string>;
  nameLock?: FieldLock;
  descriptionLock?: FieldLock;
  nameBlocked: boolean;
  descriptionBlocked: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onFieldChange: (field: string, value: string) => void;
  onLockField: (field: string) => Promise<void>;
  onUnlockField: (field: string) => Promise<void>;
}

function readField(fields: Record<string, string>, key: string): string {
  return fields[key] ?? '';
}

export function ObjectOverviewPanel({
  payload,
  name,
  description,
  fields,
  nameLock,
  descriptionLock,
  nameBlocked,
  descriptionBlocked,
  onNameChange,
  onDescriptionChange,
  onFieldChange,
  onLockField,
  onUnlockField,
}: ObjectOverviewPanelProps) {
  const chips = [
    payload.typeLabel,
    payload.identity.status || 'draft',
    payload.identity.commercialVisibility || 'visibilite a definir',
    payload.identity.businessTimezone || 'timezone a definir',
  ].filter(Boolean);

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Overview"
        title="Narration et gouvernance"
        description="Reprend le ton du detail avec une couche d edition plus legere: le coeur editorial d abord, les meta-donnees utiles ensuite."
        stats={[
          { label: 'Textes', value: String(payload.overview.descriptionsCount || 1) },
          { label: 'Langues', value: String(payload.overview.languages.length) },
          { label: 'Types secondaires', value: String(payload.identity.secondaryTypes.length) },
        ]}
        chips={chips}
      />

      <section className="panel-card panel-card--nested">
        <div className="drawer-grid modifier-form-grid">
          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-name"
              label="Nom public"
              hint="Titre principal utilise dans la fiche, les cartes et les exports."
            />
            <Input
              id="modifier-name"
              value={name}
              disabled={nameBlocked}
              onChange={(event) => onNameChange(event.target.value)}
              onFocus={() => void onLockField('name')}
              onBlur={() => void onUnlockField('name')}
            />
            {nameBlocked && <small className="text-muted-foreground">{nameLock?.name} edite ce champ</small>}
          </div>

          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-visibility"
              label="Visibilite commerciale"
              hint="Valeur de pilotage commercial. Elle est aussi reprise dans les badges de synthese."
            />
            <Input
              id="modifier-visibility"
              value={readField(fields, 'overview.commercialVisibility')}
              onChange={(event) => onFieldChange('overview.commercialVisibility', event.target.value)}
            />
          </div>

          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-secondary-types"
              label="Types secondaires"
              hint="Liste comma-separated. Utile pour les fiches hybrides sans dupliquer les surfaces."
            />
            <Input
              id="modifier-secondary-types"
              value={readField(fields, 'overview.secondaryTypes')}
              onChange={(event) => onFieldChange('overview.secondaryTypes', event.target.value)}
            />
          </div>

          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-timezone"
              label="Fuseau metier"
              hint="Utilise pour les affichages temporels et les controles metier cote edition."
            />
            <Input
              id="modifier-timezone"
              value={readField(fields, 'overview.businessTimezone')}
              onChange={(event) => onFieldChange('overview.businessTimezone', event.target.value)}
            />
          </div>

          <div className="field-block field-block--wide">
            <ModifierLabel
              htmlFor="modifier-short-description"
              label="Chapo"
              hint="Version courte affichee haut dans le detail. Garder une promesse claire et compacte."
            />
            <textarea
              id="modifier-short-description"
              rows={3}
              className="textarea-field"
              value={readField(fields, 'overview.shortDescription')}
              onChange={(event) => onFieldChange('overview.shortDescription', event.target.value)}
            />
          </div>

          <div className="field-block field-block--wide">
            <ModifierLabel
              htmlFor="modifier-description"
              label="Description complete"
              hint="Texte de reference pour la fiche detaillee."
            />
            <textarea
              id="modifier-description"
              rows={7}
              className="textarea-field"
              value={description}
              disabled={descriptionBlocked}
              onChange={(event) => onDescriptionChange(event.target.value)}
              onFocus={() => void onLockField('description')}
              onBlur={() => void onUnlockField('description')}
            />
            {descriptionBlocked && <small className="text-muted-foreground">{descriptionLock?.name} edite ce champ</small>}
          </div>

          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-adapted-description"
              label="Version adaptee"
              hint="Variante editorialisee pour audiences ou usages specifiques."
            />
            <textarea
              id="modifier-adapted-description"
              rows={4}
              className="textarea-field"
              value={readField(fields, 'overview.adaptedDescription')}
              onChange={(event) => onFieldChange('overview.adaptedDescription', event.target.value)}
            />
          </div>

          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-mobile-description"
              label="Version mobile"
              hint="Version courte pensee pour les formats mobiles."
            />
            <textarea
              id="modifier-mobile-description"
              rows={4}
              className="textarea-field"
              value={readField(fields, 'overview.mobileDescription')}
              onChange={(event) => onFieldChange('overview.mobileDescription', event.target.value)}
            />
          </div>

          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-editorial-description"
              label="Version edition"
              hint="Bloc prepare pour print, brochure ou publication."
            />
            <textarea
              id="modifier-editorial-description"
              rows={4}
              className="textarea-field"
              value={readField(fields, 'overview.editorialDescription')}
              onChange={(event) => onFieldChange('overview.editorialDescription', event.target.value)}
            />
          </div>

          <div className="field-block">
            <ModifierLabel
              htmlFor="modifier-sanitary"
              label="Mesures sanitaires"
              hint="Texte optionnel garde compact grace au tooltip plutot qu a une aide fixe."
            />
            <textarea
              id="modifier-sanitary"
              rows={4}
              className="textarea-field"
              value={readField(fields, 'overview.sanitaryMeasures')}
              onChange={(event) => onFieldChange('overview.sanitaryMeasures', event.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="drawer-grid modifier-read-grid">
        <article className="panel-card panel-card--nested">
          <span className="facet-title">Langues detectees</span>
          <div className="detail-chip-strip detail-chip-strip--compact">
            {payload.overview.languages.length > 0 ? payload.overview.languages.map((language) => (
              <span key={language} className="detail-chip detail-chip--soft">
                {language}
              </span>
            )) : <span className="detail-chip detail-chip--soft">Aucune langue structuree</span>}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <span className="facet-title">Logique detail</span>
          <div className="stack-list">
            <p>Le chapo reste la premiere promesse visible.</p>
            <p>Les variantes editoriales restent compactes et restent hors du flux principal du detail.</p>
            <p>Les meta-donnees peu frequentes sont gardees lean grace aux tooltips.</p>
          </div>
        </article>
      </div>
    </div>
  );
}
