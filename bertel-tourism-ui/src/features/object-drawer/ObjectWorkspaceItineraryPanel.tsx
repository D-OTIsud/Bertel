import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type { ObjectWorkspaceItineraryModule, WorkspaceReferenceOption } from '../../services/object-workspace-parser';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { WorkspaceEmptyState, WorkspaceField, WorkspaceRepeatedCard, WorkspaceSection, WorkspaceTooltip } from './workspace-ui';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspaceItineraryPanelProps {
  value: ObjectWorkspaceItineraryModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspaceItineraryModule) => void;
  onSave: () => void;
}

function toggleCode(codes: string[], code: string, checked: boolean): string[] {
  if (checked) {
    return Array.from(new Set([...codes, code]));
  }
  return codes.filter((item) => item !== code);
}

function PracticeChecklist({
  options,
  selectedCodes,
  disabled,
  onChange,
}: {
  options: WorkspaceReferenceOption[];
  selectedCodes: string[];
  disabled: boolean;
  onChange: (nextCodes: string[]) => void;
}) {
  if (options.length === 0) {
    return <WorkspaceEmptyState title="Aucune pratique disponible" />;
  }

  return (
    <div className="workspace-choice-grid">
      {options.map((option) => (
        <label key={option.code} className="workspace-choice">
          <input
            type="checkbox"
            checked={selectedCodes.includes(option.code)}
            disabled={disabled}
            onChange={(event) => onChange(toggleCode(selectedCodes, option.code, event.target.checked))}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function ObjectWorkspaceItineraryPanel({
  value,
  saving,
  access,
  onChange,
}: ObjectWorkspaceItineraryPanelProps) {
  const disabled = !access.canDirectWrite || saving;

  function patch(patchValue: Partial<ObjectWorkspaceItineraryModule>) {
    onChange({ ...value, ...patchValue });
  }

  return (
    <div className="drawer-form-stack">
      <WorkspaceSection eyebrow="Itineraire" title="Trace et parcours" help={access.disabledReason}>
        <div className="drawer-location-form-grid">
          <WorkspaceField label="Distance km" htmlFor="itinerary-distance">
            <Input id="itinerary-distance" value={value.distanceKm} disabled={disabled} onChange={(event) => patch({ distanceKm: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Duree minutes" htmlFor="itinerary-duration">
            <Input id="itinerary-duration" value={value.durationMin} disabled={disabled} onChange={(event) => patch({ durationMin: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Difficulte" htmlFor="itinerary-difficulty">
            <Input id="itinerary-difficulty" value={value.difficultyLevel} disabled={disabled} onChange={(event) => patch({ difficultyLevel: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Denivele positif m" htmlFor="itinerary-elevation-positive">
            <Input id="itinerary-elevation-positive" value={value.elevationPositiveM} disabled={disabled} onChange={(event) => patch({ elevationPositiveM: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Denivele negatif m" htmlFor="itinerary-elevation-negative">
            <Input id="itinerary-elevation-negative" value={value.elevationNegativeM} disabled={disabled} onChange={(event) => patch({ elevationNegativeM: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Statut ouverture" htmlFor="itinerary-open-status">
            <Select id="itinerary-open-status" value={value.openStatus} disabled={disabled} onChange={(event) => patch({ openStatus: event.target.value })}>
              <option value="open">Ouvert</option>
              <option value="closed">Ferme</option>
              <option value="partially_closed">Partiellement ferme</option>
              <option value="warning">Vigilance</option>
            </Select>
          </WorkspaceField>
          <label className="workspace-toggle">
            <input type="checkbox" checked={value.loop} disabled={disabled} onChange={(event) => patch({ loop: event.target.checked })} />
            <span>Boucle</span>
          </label>
          <WorkspaceField label="Note statut" htmlFor="itinerary-status-note" full>
            <textarea id="itinerary-status-note" className="workspace-textarea" value={value.statusNote} disabled={disabled} onChange={(event) => patch({ statusNote: event.target.value })} />
          </WorkspaceField>
          <WorkspaceField label="Pratiques" full>
            <PracticeChecklist options={value.practiceOptions} selectedCodes={value.practiceCodes} disabled={disabled} onChange={(practiceCodes) => patch({ practiceCodes })} />
          </WorkspaceField>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        eyebrow="Trace"
        title="Geometrie"
        help="La trace et les geometries ne sont pas directement editables ici tant qu un contrat d ecriture stable n est pas confirme."
      >
        <div className="workspace-readonly-line">
          <span>{value.geometrySummary || 'Trace non exposee'}</span>
          <WorkspaceTooltip content="Lecture seule: les champs de trace peuvent impacter le rendu cartographique et les imports, donc ils restent bloques dans cette passe UI." />
        </div>
      </WorkspaceSection>

      <WorkspaceSection eyebrow="Parcours" title="Etapes et profils">
        <div className="workspace-summary-row">
          <span>{value.stages.length} etapes</span>
          <span>{value.sectionsCount} sections</span>
          <span>{value.profilesCount} profils</span>
        </div>
        {value.stages.length === 0 ? (
          <WorkspaceEmptyState title="Aucune etape exposee" />
        ) : (
          <div className="stack-list">
            {value.stages.map((stage, index) => (
              <WorkspaceRepeatedCard key={stage.recordId ?? `stage-${index}`} title={stage.name || `Etape ${index + 1}`} meta={`Position ${stage.position || index + 1}`}>
                {stage.description ? <p className="workspace-muted-copy">{stage.description}</p> : <WorkspaceEmptyState title="Description non renseignee" />}
              </WorkspaceRepeatedCard>
            ))}
          </div>
        )}
      </WorkspaceSection>
    </div>
  );
}
