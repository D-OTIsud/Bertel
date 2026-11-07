import { useEffect, useState } from 'react';

/**
 * Valeur retardée : la frappe met à jour l'état immédiatement (le champ reste réactif) mais
 * le consommateur — ici la requête serveur de l'annuaire CRM — ne suit qu'après une pause.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
