// Phase 7.5 — déplacement pur d'un élément dans une liste (réordonnancement des valeurs
// ref_code via boutons monter/descendre). Retourne une NOUVELLE liste (immuable) ; no-op
// si le déplacement sort des bornes.
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  return next;
}
