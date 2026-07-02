'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';

export interface ToastApi {
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
}

/**
 * Point d'entrée unique des toasts (D4) : fige le vocabulaire (succès / erreur /
 * info / avertissement) et isole la lib (sonner) derrière une API stable — un
 * remplacement ou un enrichissement (journalisation) ne touche plus les appelants.
 * Les nouveaux écrans passent par ce hook ; la migration des imports sonner
 * existants se fait au fil des retouches (D13).
 */
export function useToast(): ToastApi {
  return useMemo(
    () => ({
      success: (message, description) => {
        toast.success(message, description ? { description } : undefined);
      },
      error: (message, description) => {
        toast.error(message, description ? { description } : undefined);
      },
      info: (message, description) => {
        toast.info(message, description ? { description } : undefined);
      },
      warning: (message, description) => {
        toast.warning(message, description ? { description } : undefined);
      },
    }),
    [],
  );
}
