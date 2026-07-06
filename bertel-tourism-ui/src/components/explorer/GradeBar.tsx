'use client';
import type { ClassementUnit } from '../../utils/explorer-card-display';
import type { ExplorerReferenceOption } from '../../types/domain';
import { CLASSEMENT_ICON } from './classement-icons';
import { cn } from '@/lib/utils';

interface GradeBarProps {
  values: ExplorerReferenceOption[];
  unit: ClassementUnit;
  selected: string[];
  onChange: (codes: string[]) => void;
}

/**
 * §174 — barre de niveaux de classement (étoiles/épis/clés), interactive.
 * Toggle indépendant par niveau (pas de sémantique "au moins N" — l'utilisateur
 * choisit exactement les niveaux qui l'intéressent). Niveaux numériques → picto
 * de l'unité du scheme ; niveaux non-numériques (ex. ot_category) → libellé texte.
 */
export function GradeBar({ values, unit, selected, onChange }: GradeBarProps) {
  const Icon = CLASSEMENT_ICON[unit];
  const numeric = values.every((v) => /^\d+$/.test(v.code));

  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  // Micro-interaction "pop" au clic : agrandissement bref puis retour, sur `transform`
  // uniquement (compositor-friendly). Le hover/active CSS assure le reste du feedback.
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>, code: string) => {
    const el = event.currentTarget;
    el.style.transform = 'scale(1.45)';
    window.setTimeout(() => {
      el.style.transform = '';
    }, 150);
    toggle(code);
  };

  return (
    <div className="grade-bar" role="group" aria-label="Niveau de classement">
      {values.map((v) => {
        const on = selected.includes(v.code);
        return (
          <button
            key={v.code}
            type="button"
            aria-label={v.name}
            aria-pressed={on}
            title={v.name}
            onClick={(event) => handleClick(event, v.code)}
            className={cn(numeric ? 'grade-star' : 'grade-cat', on && 'grade-on')}
          >
            {numeric ? <Icon aria-hidden /> : v.name}
          </button>
        );
      })}
    </div>
  );
}
