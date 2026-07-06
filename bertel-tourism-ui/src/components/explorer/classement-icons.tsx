import type { ComponentType } from 'react';
import { Key, Star, Wheat } from 'lucide-react';
import type { ClassementUnit } from '../../utils/explorer-card-display';

/** Picto de l'unité de classement — étoiles (hôtels/campings…), épis (Gîtes), clés (Clévacances). */
export const CLASSEMENT_ICON: Record<ClassementUnit, ComponentType<{ 'aria-hidden'?: boolean }>> = {
  etoile: Star,
  epi: Wheat,
  cle: Key,
};
