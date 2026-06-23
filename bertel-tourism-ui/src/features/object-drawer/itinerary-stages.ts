/**
 * Projection d'AFFICHAGE des étapes RÉELLES d'un itinéraire pour le drawer public
 * (impl. 4.3). Pure. Lit `itinerary_details.stages` (object_iti_stage : `name`,
 * `description`, `extra.kind`, ordre par `position`). Remplace l'ancienne
 * fabrication par interpolation des distances — AUCUNE donnée inventée : sans
 * étape réelle, liste vide ⇒ section non rendue.
 */
import { humanizeCode } from '../../utils/labels';

export interface ItineraryStageRow {
  key: string;
  name: string;
  kindLabel: string;
  description: string;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function buildItineraryStages(details: Record<string, unknown> | null | undefined): ItineraryStageRow[] {
  const raw = Array.isArray(details?.stages) ? details!.stages : [];
  return raw
    .filter((stage): stage is Record<string, unknown> => typeof stage === 'object' && stage !== null)
    .map((stage, index) => {
      const extra = (typeof stage.extra === 'object' && stage.extra !== null) ? (stage.extra as Record<string, unknown>) : {};
      const kind = str(extra.kind);
      return {
        key: str(stage.id) || `stage-${index}`,
        name: str(stage.name) || `Étape ${index + 1}`,
        kindLabel: kind ? humanizeCode(kind) : '',
        description: str(stage.description),
      };
    });
}
