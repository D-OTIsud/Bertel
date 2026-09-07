'use client';

// Couverture avec repli propre sur URL cassée (§listes 2026-09-07, revue architecte). Une
// `background-image` CSS n'émet AUCUN événement d'erreur : une URL morte y restait un aplat
// coloré neutre indiscernable d'un simple placeholder — jamais un signal visible du problème.
// On rend donc une <img> réelle (seule à exposer `onError`) et on bascule sur l'aplat neutre
// UNIQUEMENT quand le chargement échoue réellement.
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CoverImageProps {
  src: string | null;
  alt?: string;
  /** Classes de POSITIONNEMENT/TAILLE (absolute inset-0 h-full w-full…) — jamais bg-*. */
  className?: string;
}

export function CoverImage({ src, alt = '', className }: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  // Une nouvelle URL (autre lieu choisi comme couverture, autre carte) mérite un nouvel essai —
  // sans ça, une couverture valide choisie après une cassée resterait bloquée sur l'aplat neutre.
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return <div className={cn('bg-[#cfc6b6]', className)} aria-hidden={alt === ''} role={alt ? 'img' : undefined} aria-label={alt || undefined} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}
