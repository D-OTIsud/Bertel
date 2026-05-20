import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceEventModule, ObjectWorkspaceEventOccurrence } from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkspaceEmptyState, WorkspaceField, WorkspaceRepeatedCard, WorkspaceSection } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceEventPanelProps {
  value: ObjectWorkspaceEventModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceEventModule) => void;
  onSave: () => void;
}

function createOccurrence(index: number): ObjectWorkspaceEventOccurrence {
  return {
    recordId: null,
    startAt: '',
    endAt: '',
    state: index === 0 ? 'scheduled' : '',
  };
}

export function ObjectWorkspaceEventPanel({
  value,
  saving,
  access,
  onChange,
}: ObjectWorkspaceEventPanelProps) {
  const disabled = !access.canDirectWrite || saving;

  function patch(patchValue: Partial<ObjectWorkspaceEventModule>) {
    onChange({ ...value, ...patchValue });
  }

  function updateOccurrence(index: number, patchValue: Partial<ObjectWorkspaceEventOccurrence>) {
    patch({
      occurrences: value.occurrences.map((occurrence, occurrenceIndex) =>
        occurrenceIndex === index ? { ...occurrence, ...patchValue } : occurrence,
      ),
    });
  }

  return (
    <div className="drawer-form-stack">
      <WorkspaceSection
        eyebrow="Manifestation"
        title="Programmation"
        help={access.disabledReason}
        actions={(
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => patch({ occurrences: [...value.occurrences, createOccurrence(value.occurrences.length)] })}>
            Ajouter une occurrence
          </Button>
        )}
      >
        <div className="drawer-location-form-grid">
          <WorkspaceField label="Date debut" htmlFor="event-start-date">
            <input id="event-start-date" className="workspace-input" type="date" value={value.startDate} disabled={disabled} onChange={(event) => patch({ startDate: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Date fin" htmlFor="event-end-date">
            <input id="event-end-date" className="workspace-input" type="date" value={value.endDate} disabled={disabled} onChange={(event) => patch({ endDate: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Heure debut" htmlFor="event-start-time">
            <input id="event-start-time" className="workspace-input" type="time" value={value.startTime} disabled={disabled} onChange={(event) => patch({ startTime: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Heure fin" htmlFor="event-end-time">
            <input id="event-end-time" className="workspace-input" type="time" value={value.endTime} disabled={disabled} onChange={(event) => patch({ endTime: event.target.value })} />
          </WorkspaceField>
          <label className="workspace-toggle">
            <input type="checkbox" checked={value.recurring} disabled={disabled} onChange={(event) => patch({ recurring: event.target.checked })} />
            <span>Recurrence</span>
          </label>
          <WorkspaceField label="Texte recurrence" htmlFor="event-recurrence" full help="Utilise quand la recurrence ne peut pas etre decrite par une occurrence simple.">
            <Input id="event-recurrence" value={value.recurrenceText} disabled={disabled} onChange={(event) => patch({ recurrenceText: event.target.value })} />
          </WorkspaceField>
        </div>

        <div className="workspace-nested-list">
          {value.occurrences.length === 0 ? (
            <WorkspaceEmptyState title="Aucune occurrence" />
          ) : value.occurrences.map((occurrence, index) => (
            <WorkspaceRepeatedCard
              key={occurrence.recordId ?? `occurrence-${index}`}
              title={occurrence.startAt || `Occurrence ${index + 1}`}
              meta={occurrence.state || 'Etat non renseigne'}
              actions={(
                <Button type="button" variant="ghost" disabled={disabled} onClick={() => patch({ occurrences: value.occurrences.filter((_, occurrenceIndex) => occurrenceIndex !== index) })}>
                  Retirer
                </Button>
              )}
            >
              <div className="drawer-location-form-grid">
                <WorkspaceField label="Debut" htmlFor={`event-occurrence-start-${index}`}>
                  <Input id={`event-occurrence-start-${index}`} value={occurrence.startAt} disabled={disabled} onChange={(event) => updateOccurrence(index, { startAt: event.target.value })} />
                </WorkspaceField>
                <WorkspaceField label="Fin" htmlFor={`event-occurrence-end-${index}`}>
                  <Input id={`event-occurrence-end-${index}`} value={occurrence.endAt} disabled={disabled} onChange={(event) => updateOccurrence(index, { endAt: event.target.value })} />
                </WorkspaceField>
                <WorkspaceField label="Etat" htmlFor={`event-occurrence-state-${index}`}>
                  <Input id={`event-occurrence-state-${index}`} value={occurrence.state} disabled={disabled} onChange={(event) => updateOccurrence(index, { state: event.target.value })} />
                </WorkspaceField>
              </div>
            </WorkspaceRepeatedCard>
          ))}
        </div>
      </WorkspaceSection>
    </div>
  );
}
