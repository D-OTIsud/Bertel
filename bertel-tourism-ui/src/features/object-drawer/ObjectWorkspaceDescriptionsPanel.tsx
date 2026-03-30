import type {
  ObjectWorkspaceDescriptionScope,
  ObjectWorkspaceDescriptionsModule,
  WorkspaceTranslatableField,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceDescriptionsPanelProps {
  value: ObjectWorkspaceDescriptionsModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  canEditPlaceDescriptions: boolean;
  onLanguageChange: (language: string) => void;
  onObjectFieldChange: (
    field: 'description' | 'chapo' | 'adaptedDescription' | 'mobileDescription' | 'editorialDescription',
    value: string,
  ) => void;
  onObjectVisibilityChange: (visibility: string) => void;
  onPlaceFieldChange: (
    placeId: string,
    field: 'description' | 'chapo' | 'adaptedDescription' | 'mobileDescription' | 'editorialDescription',
    value: string,
  ) => void;
  onPlaceVisibilityChange: (placeId: string, visibility: string) => void;
  onSave: () => void;
}

function readFieldValue(field: WorkspaceTranslatableField, language: string, localLanguage: string): string {
  if (field.values[language] != null) {
    return field.values[language];
  }

  if (language === localLanguage) {
    return field.baseValue;
  }

  return '';
}

function DescriptionScopeCard(props: {
  scope: ObjectWorkspaceDescriptionScope;
  language: string;
  localLanguage: string;
  disabled: boolean;
  onVisibilityChange: (visibility: string) => void;
  onFieldChange: (
    field: 'description' | 'chapo' | 'adaptedDescription' | 'mobileDescription' | 'editorialDescription',
    value: string,
  ) => void;
}) {
  const { scope, language, localLanguage, disabled, onVisibilityChange, onFieldChange } = props;

  return (
    <article className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{scope.scope === 'object' ? 'Objet' : 'Sous-lieu'}</span>
          <h3>{scope.label}</h3>
        </div>
      </div>

      <div className="drawer-grid">
        <div className="field-block">
          <Label htmlFor={`${scope.scope}-${scope.placeId ?? 'object'}-visibility`}>Visibilite</Label>
          <select
            id={`${scope.scope}-${scope.placeId ?? 'object'}-visibility`}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
            value={scope.visibility}
            disabled={disabled}
            onChange={(event) => onVisibilityChange(event.target.value)}
          >
            <option value="public">public</option>
            <option value="partners">partners</option>
            <option value="private">private</option>
          </select>
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`${scope.scope}-${scope.placeId ?? 'object'}-chapo`}>Chapo</Label>
          <textarea
            id={`${scope.scope}-${scope.placeId ?? 'object'}-chapo`}
            rows={3}
            className="textarea-field"
            disabled={disabled}
            value={readFieldValue(scope.chapo, language, localLanguage)}
            onChange={(event) => onFieldChange('chapo', event.target.value)}
          />
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`${scope.scope}-${scope.placeId ?? 'object'}-description`}>Description</Label>
          <textarea
            id={`${scope.scope}-${scope.placeId ?? 'object'}-description`}
            rows={7}
            className="textarea-field"
            disabled={disabled}
            value={readFieldValue(scope.description, language, localLanguage)}
            onChange={(event) => onFieldChange('description', event.target.value)}
          />
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`${scope.scope}-${scope.placeId ?? 'object'}-adapted`}>Description adaptee</Label>
          <textarea
            id={`${scope.scope}-${scope.placeId ?? 'object'}-adapted`}
            rows={4}
            className="textarea-field"
            disabled={disabled}
            value={readFieldValue(scope.adaptedDescription, language, localLanguage)}
            onChange={(event) => onFieldChange('adaptedDescription', event.target.value)}
          />
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`${scope.scope}-${scope.placeId ?? 'object'}-mobile`}>Version mobile</Label>
          <textarea
            id={`${scope.scope}-${scope.placeId ?? 'object'}-mobile`}
            rows={3}
            className="textarea-field"
            disabled={disabled}
            value={readFieldValue(scope.mobileDescription, language, localLanguage)}
            onChange={(event) => onFieldChange('mobileDescription', event.target.value)}
          />
        </div>

        <div className="field-block field-block--wide">
          <Label htmlFor={`${scope.scope}-${scope.placeId ?? 'object'}-editorial`}>Version edition</Label>
          <textarea
            id={`${scope.scope}-${scope.placeId ?? 'object'}-editorial`}
            rows={3}
            className="textarea-field"
            disabled={disabled}
            value={readFieldValue(scope.editorialDescription, language, localLanguage)}
            onChange={(event) => onFieldChange('editorialDescription', event.target.value)}
          />
        </div>
      </div>
    </article>
  );
}

export function ObjectWorkspaceDescriptionsPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  canEditPlaceDescriptions,
  onLanguageChange,
  onObjectFieldChange,
  onObjectVisibilityChange,
  onPlaceFieldChange,
  onPlaceVisibilityChange,
  onSave,
}: ObjectWorkspaceDescriptionsPanelProps) {
  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">B2</span>
            <h2>Descriptions et langues</h2>
            <p>Le contenu objet et le contenu sous-lieu restent separes, avec un selecteur global de langue pour l'edition.</p>
          </div>
          <div className="stack-list text-right">
            <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
              {saving ? 'Enregistrement...' : saveAction.label}
            </Button>
            {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Langue locale</span>
            <strong>{value.localLanguage.toUpperCase()}</strong>
            <p>Cette langue alimente aussi les champs source utilises par les vues detail et les exports actuels.</p>
          </article>

          <div className="field-block">
            <Label htmlFor="workspace-description-language">Langue de travail</Label>
            <select
              id="workspace-description-language"
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              value={value.activeLanguage}
              onChange={(event) => onLanguageChange(event.target.value)}
            >
              {value.availableLanguages.map((language) => (
                <option key={language} value={language}>
                  {language.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </article>

      <DescriptionScopeCard
        scope={value.object}
        language={value.activeLanguage}
        localLanguage={value.localLanguage}
        disabled={false}
        onVisibilityChange={onObjectVisibilityChange}
        onFieldChange={onObjectFieldChange}
      />

      <section className="drawer-form-stack">
        {value.places.length > 0 ? value.places.map((scope) => (
          <DescriptionScopeCard
            key={scope.placeId ?? scope.label}
            scope={scope}
            language={value.activeLanguage}
            localLanguage={value.localLanguage}
            disabled={!canEditPlaceDescriptions}
            onVisibilityChange={(visibility) => scope.placeId && onPlaceVisibilityChange(scope.placeId, visibility)}
            onFieldChange={(field, fieldValue) => scope.placeId && onPlaceFieldChange(scope.placeId, field, fieldValue)}
          />
        )) : (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Sous-lieux</span>
            <p>Aucun sous-lieu descriptif n'est expose dans le payload courant.</p>
          </article>
        )}

        {!canEditPlaceDescriptions && value.places.length > 0 && (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Moderation</span>
            <p>Les descriptions de sous-lieu restent visibles, mais leur ecriture attend la surface admin / moderation qui arrivera avec A3.</p>
          </article>
        )}
      </section>
    </div>
  );
}
