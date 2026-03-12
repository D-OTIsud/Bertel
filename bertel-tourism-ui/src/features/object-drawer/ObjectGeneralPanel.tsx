import type { FieldLock } from '../../types/domain';

interface ObjectGeneralPanelProps {
  name: string;
  description: string;
  address: string;
  nameLock?: FieldLock;
  descriptionLock?: FieldLock;
  nameBlocked: boolean;
  descriptionBlocked: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLockField: (field: string) => Promise<void>;
  onUnlockField: (field: string) => Promise<void>;
}

export function ObjectGeneralPanel({
  name,
  description,
  address,
  nameLock,
  descriptionLock,
  nameBlocked,
  descriptionBlocked,
  onNameChange,
  onDescriptionChange,
  onLockField,
  onUnlockField,
}: ObjectGeneralPanelProps) {
  return (
    <div className="drawer-grid">
      <label className="field-block">
        <span>Nom</span>
        <input
          value={name}
          disabled={nameBlocked}
          onChange={(event) => onNameChange(event.target.value)}
          onFocus={() => void onLockField('name')}
          onBlur={() => void onUnlockField('name')}
        />
        {nameBlocked && <small>{nameLock?.name} edite ce champ</small>}
      </label>

      <label className="field-block field-block--wide">
        <span>Description</span>
        <textarea
          rows={6}
          value={description}
          disabled={descriptionBlocked}
          onChange={(event) => onDescriptionChange(event.target.value)}
          onFocus={() => void onLockField('description')}
          onBlur={() => void onUnlockField('description')}
        />
        {descriptionBlocked && <small>{descriptionLock?.name} edite ce champ</small>}
      </label>

      <div className="panel-card">
        <span className="facet-title">Localisation</span>
        <p>{address || 'Adresse a completer'}</p>
        <button type="button" className="ghost-button">Deplacer le pin GPS</button>
      </div>
    </div>
  );
}