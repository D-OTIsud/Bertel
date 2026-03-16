import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldLock } from '../../types/domain';
import { objectGeneralSchema, type ObjectGeneralFormValues } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const form = useForm<ObjectGeneralFormValues>({
    resolver: zodResolver(objectGeneralSchema),
    defaultValues: { name, description, address },
  });
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (!isDirty) {
      form.reset({ name, description, address });
    }
  }, [address, description, form, isDirty, name]);

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Essentiel</span>
            <h2>Identite editoriale</h2>
            <p>Structurez le titre, la promesse et les informations de base de la fiche.</p>
          </div>
        </div>

        <div className="drawer-grid">
          <div className="field-block">
            <Label htmlFor="object-name">Nom</Label>
            <Input
              id="object-name"
              {...form.register('name', {
                onChange: (e) => onNameChange(e.target.value),
                onBlur: () => void onUnlockField('name'),
              })}
              disabled={nameBlocked}
              onFocus={() => void onLockField('name')}
            />
            {nameBlocked && <small className="text-muted-foreground">{nameLock?.name} edite ce champ</small>}
            {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
          </div>

          <div className="field-block field-block--wide">
            <Label htmlFor="object-description">Description</Label>
            <textarea
              id="object-description"
              rows={6}
              className="textarea-field"
              {...form.register('description', {
                onChange: (e) => onDescriptionChange(e.target.value),
                onBlur: () => void onUnlockField('description'),
              })}
              disabled={descriptionBlocked}
              onFocus={() => void onLockField('description')}
            />
            {descriptionBlocked && <small className="text-muted-foreground">{descriptionLock?.name} edite ce champ</small>}
            {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
          </div>
        </div>
      </article>

      <div className="drawer-grid">
        <article className="panel-card panel-card--nested">
          <span className="facet-title">Localisation</span>
          <div className="stack-list">
            <strong>{address || 'Adresse a completer'}</strong>
            <p>La carte et la coherence territoriale restent liees a cette adresse principale.</p>
            <Button type="button" variant="ghost">Deplacer le pin GPS</Button>
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <span className="facet-title">Collaboration</span>
          <div className="stack-list">
            <article className="timeline-item">
              <strong>Champ nom</strong>
              <p>{nameBlocked ? `${nameLock?.name} travaille actuellement dessus.` : 'Disponible pour edition.'}</p>
            </article>
            <article className="timeline-item">
              <strong>Champ description</strong>
              <p>{descriptionBlocked ? `${descriptionLock?.name} travaille actuellement dessus.` : 'Disponible pour edition.'}</p>
            </article>
          </div>
        </article>
      </div>
    </div>
  );
}
