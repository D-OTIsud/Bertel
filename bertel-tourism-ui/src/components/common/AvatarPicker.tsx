'use client';

// Photo de profil : aperçu (photo ou initiales de repli) + bouton d'envoi de fichier.
// Composant PUREMENT présentationnel — pas de Supabase, pas de service, pas de session : il
// reçoit tout en props et remonte le fichier choisi à l'appelant (`onFileSelected`). Extrait de
// ProfileEditModal (§171) pour être partagé avec MemberProfileModal (Task 5) : les deux modales
// affichent le même bloc aperçu-photo, seuls le texte alternatif, les initiales de repli et le
// contenu du bouton (libellé / flash succès / désactivation démo) varient par appelant — d'où
// leur passage en props plutôt qu'une logique dupliquée ici.

import type { ChangeEvent, ReactNode } from 'react';

export function AvatarPicker({
  avatarUrl,
  alt,
  initials,
  disabled = false,
  buttonContent,
  onFileSelected,
  children,
}: {
  /** URL de la photo posée, ou `null` pour retomber sur les initiales. */
  avatarUrl: string | null;
  /** Texte alternatif de l'image — propre à chaque appelant ("Votre photo…" / "Photo de <membre>"). */
  alt: string;
  /** Initiales de repli, déjà résolues par l'appelant (chaque appelant a sa propre règle de repli). */
  initials: string;
  /** Désactive l'input — un seul signal ; l'appelant compose `busy || autreRaison` lui-même s'il a
   *  plusieurs causes de désactivation (envoi en cours, mode démo sans session réelle…). */
  disabled?: boolean;
  /** Contenu du bouton/label, choisi par l'appelant ("Envoi…", flash succès, libellé par défaut…). */
  buttonContent: ReactNode;
  onFileSelected: (file: File) => void;
  /** Contenu optionnel inséré ENTRE le bouton et l'aide générique ("JPEG, PNG…") — permet à un
   *  appelant (ex. ProfileEditModal, note mode démo) de garder son ordre d'origine sans dupliquer
   *  le bloc photo/bouton. */
  children?: ReactNode;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de re-sélectionner le même fichier
    if (file) onFileSelected(file);
  };

  return (
    <>
      <div className="inline-actions" style={{ alignItems: 'center', gap: 16 }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase
          <img
            src={avatarUrl}
            alt={alt}
            width={64}
            height={64}
            style={{ width: 64, height: 64, borderRadius: 999, objectFit: 'cover', flex: 'none' }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--accent, #1f7a6d)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 22,
            }}
          >
            {initials}
          </span>
        )}
        <label className="ghost-button marker-upload-button cursor-pointer">
          {buttonContent}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={handleChange}
          />
        </label>
      </div>
      {children}
      <p className="pref__hint">
        JPEG, PNG ou WebP — ≤ 5 Mo. Redimensionnée et nettoyée (métadonnées EXIF/GPS supprimées) automatiquement.
      </p>
    </>
  );
}
