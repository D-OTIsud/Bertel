/**
 * D7 (revue UX, WCAG 1.4.1) : les jauges du dashboard n'encodent plus le seuil
 * par la couleur seule — chaque jauge affiche aussi sa zone écrite. Les seuils
 * hauts diffèrent (complétude : Moyen ≥ 50 ; actualisation : Moyen ≥ 60), d'où
 * le paramètre `midThreshold`.
 */
export interface MeterZone {
  label: 'Bon' | 'Moyen' | 'Faible';
  color: string;
}

export function meterZone(score: number, midThreshold: number): MeterZone {
  if (score >= 80) return { label: 'Bon', color: 'var(--teal)' };
  if (score >= midThreshold) return { label: 'Moyen', color: 'var(--warn)' };
  return { label: 'Faible', color: 'var(--red)' };
}
