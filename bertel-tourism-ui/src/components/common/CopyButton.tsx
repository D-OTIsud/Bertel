'use client';

import { useState, type MouseEvent } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  /** Texte copié TEL QU'AFFICHÉ (jamais le href normalisé mailto:/tel:). */
  value: string;
  className?: string;
  /** Libellé accessible — passer la valeur quand plusieurs boutons coexistent. */
  label?: string;
  /** Taille de l'icône lucide (16 fiche établissement, 14 rail CRM). */
  size?: number;
}

/**
 * Bouton « copier dans le presse-papiers » avec retour visuel (Copy → Check ~1 s).
 * Raison d'être (demande CES) : un contact rendu en lien mailto:/tel: n'est pas
 * sélectionnable à la souris — le drag déclenche un glisser de lien — donc ce
 * bouton est LA voie de copie. preventDefault/stopPropagation : il vit à côté ou
 * à l'intérieur de zones cliquables (ligne-lien de la fiche, cartes) et copier ne
 * doit jamais naviguer.
 */
export function CopyButton({ value, className, label = 'Copier dans le presse-papiers', size = 16 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    } catch {
      /* clipboard may be denied */
    }
  };

  return (
    <button type="button" className={className} onClick={handleCopy} aria-label={label} title={label}>
      {copied ? <Check size={size} strokeWidth={2.5} /> : <Copy size={size} strokeWidth={2} />}
    </button>
  );
}
