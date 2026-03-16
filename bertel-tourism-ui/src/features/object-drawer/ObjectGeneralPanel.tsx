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

  return (
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
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="field-block field-block--wide">
        <Label htmlFor="object-description">Description</Label>
        <textarea
          id="object-description"
          rows={6}
          className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...form.register('description', {
            onChange: (e) => onDescriptionChange(e.target.value),
            onBlur: () => void onUnlockField('description'),
          })}
          disabled={descriptionBlocked}
          onFocus={() => void onLockField('description')}
        />
        {descriptionBlocked && <small className="text-muted-foreground">{descriptionLock?.name} edite ce champ</small>}
        {form.formState.errors.description && (
          <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="panel-card">
        <span className="facet-title">Localisation</span>
        <p>{address || 'Adresse a completer'}</p>
        <Button type="button" variant="ghost">Deplacer le pin GPS</Button>
      </div>
    </div>
  );
}