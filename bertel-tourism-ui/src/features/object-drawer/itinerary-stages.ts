/**
 * Projection d'AFFICHAGE des étapes RÉELLES d'un itinéraire pour le drawer public
 * (PLAN 4.6). Pure. Lit `itinerary_details.stages` (object_iti_stage : `name`,
 * `description`, `extra.kind`, `lng`/`lat`, `media`, ordre serveur par
 * `position`). AUCUNE donnée inventée : le nom reste vide quand absent (jamais
 * « Étape n » comme nom) ; « Étape n » n'est qu'une métadonnée d'ordre. Une
 * étape n'est écartée que si nom + description + type + coordonnées + médias
 * sont TOUS absents.
 */
import { humanizeCode } from '../../utils/labels';

export interface ItineraryStageRow {
  key: string;
  /** Nom réel de l'étape ; '' quand absent (jamais fabriqué). */
  name: string;
  /** Métadonnée d'ordre « Étape n » — jamais utilisée comme nom. */
  positionLabel: string;
  kindLabel: string;
  description: string;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteCoord(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function buildItineraryStages(details: Record<string, unknown> | null | undefined): ItineraryStageRow[] {
  const raw = Array.isArray(details?.stages) ? details!.stages : [];
  const rows: ItineraryStageRow[] = [];
  raw.filter(isRecord).forEach((stage, index) => {
    const extra = isRecord(stage.extra) ? stage.extra : {};
    const kind = str(extra.kind);
    const name = str(stage.name);
    const description = str(stage.description);
    const hasCoords = isFiniteCoord(stage.lng) && isFiniteCoord(stage.lat);
    const hasMedia = Array.isArray(stage.media) && stage.media.length > 0;

    // Écarte UNIQUEMENT une étape totalement vide.
    if (!name && !description && !kind && !hasCoords && !hasMedia) return;

    rows.push({
      key: str(stage.id) || `stage-${index}`,
      name,
      positionLabel: `Étape ${rows.length + 1}`,
      kindLabel: kind ? humanizeCode(kind) : '',
      description,
    });
  });
  return rows;
}
