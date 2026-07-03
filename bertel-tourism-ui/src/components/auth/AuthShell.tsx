"use client";

import { useThemeStore } from '../../store/theme-store';

// Vagues décoratives, écho du blason OTI du Sud ; currentColor = texte du hero,
// donc le motif suit automatiquement un re-branding runtime.
function HeroWaves() {
  return (
    <svg
      className="auth-hero__waves"
      viewBox="0 0 520 140"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M-20 30 Q 25 8 70 30 T 160 30 T 250 30 T 340 30 T 430 30 T 520 30"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        opacity="0.22"
      />
      <path
        d="M-20 74 Q 25 52 70 74 T 160 74 T 250 74 T 340 74 T 430 74 T 520 74"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        opacity="0.14"
      />
      <path
        d="M-20 118 Q 25 96 70 118 T 160 118 T 250 118 T 340 118 T 430 118 T 520 118"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        opacity="0.08"
      />
    </svg>
  );
}

/**
 * Coquille commune des pages hors-shell (/login, /set-password) : panneau de
 * marque (logo + nom issus du thème runtime — get_public_branding est lisible
 * par les anonymes) accolé à la carte formulaire passée en children.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);

  return (
    <section className="auth-page">
      <div className="auth-frame">
        <div className="auth-hero">
          {logoUrl ? (
            <span className="auth-hero__logo">
              {/* alt vide : le nom de marque suit en h1, éviter la double annonce */}
              <img src={logoUrl} alt="" />
            </span>
          ) : null}
          <h1>{brandName}</h1>
          <p className="auth-hero__tagline">
            La plateforme de gestion de l’offre touristique : fiches établissements, horaires,
            médias, publications et relations partenaires.
          </p>
          <HeroWaves />
        </div>
        <div className="auth-panel">{children}</div>
      </div>
    </section>
  );
}
