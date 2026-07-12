/** Canonical object_place_description.visibility values exposed in the editor. */
export type PlaceVisibility = 'public' | 'private' | 'partners';

export const PLACE_VISIBILITY_OPTIONS: { v: PlaceVisibility; l: string }[] = [
  { v: 'public', l: 'Publique' },
  { v: 'partners', l: 'Partenaires' },
  { v: 'private', l: 'Interne' },
];

/** Defensive normalisation for legacy front/DB aliases. */
export function normalizePlaceVisibility(value: string): PlaceVisibility {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'partner' || normalized === 'partners') return 'partners';
  if (normalized === 'internal' || normalized === 'private') return 'private';
  return 'public';
}

export function isPlaceVisibility(value: string): value is PlaceVisibility {
  return value === 'public' || value === 'private' || value === 'partners';
}
