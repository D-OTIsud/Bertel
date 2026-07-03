"use client";

import { useThemeStore } from '../../store/theme-store';

// Domaines de données de Bertel = les « lignes » qui convergent vers le point de repère
// (métaphore du logo). Rendu en ligne pointée (voix éditoriale du template Listes),
// pas en grille de cartes.
const DATA_DOMAINS = ['Établissements', 'Horaires', 'Médias', 'Itinéraires', 'Partenaires'];

/**
 * Décor institutionnel du hero : des itinéraires (écho du « B » Bertel : réseau de lignes
 * qui convergent vers un point de repère) posés sur des vagues (écho du blason OTI / du
 * territoire insulaire). Tons portés par currentColor + var(--accent-brand) ⇒ suit un
 * re-branding runtime. `slice` pour couvrir tout le panneau quelle que soit sa forme.
 */
function AuthHeroScene() {
  return (
    <svg
      className="auth-hero__scene"
      viewBox="0 0 600 660"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Itinéraires convergents — quatre lignes arrivant DE LA DROITE (l'espace vide) vers le
          point de repère posé juste après « Bertel ». Sens droite→gauche : le tracé reste hors
          de la colonne de lecture (à gauche) et équilibre la composition. Faible opacité : décor. */}
      <g className="auth-hero__routes" stroke="currentColor" strokeLinecap="round" fill="none">
        <path d="M572 108 C 470 122, 372 300, 294 380" strokeWidth="3" opacity="0.17" />
        <path d="M578 182 C 494 192, 380 316, 292 384" strokeWidth="3" opacity="0.13" />
        <path d="M578 264 C 500 274, 388 348, 290 386" strokeWidth="3" opacity="0.13" />
        <path d="M572 346 C 500 352, 396 380, 288 390" strokeWidth="3" opacity="0.10" />
        {/* Stations (à droite) */}
        <g fill="var(--teal)" stroke="currentColor" strokeWidth="3">
          <circle cx="572" cy="108" r="7" opacity="0.55" />
          <circle cx="578" cy="182" r="7" opacity="0.5" />
          <circle cx="578" cy="264" r="7" opacity="0.5" />
          <circle cx="572" cy="346" r="7" opacity="0.42" />
        </g>
      </g>
      {/* Le point de repère où tout converge — une seule source de vérité — posé juste après le
          mot « Bertel ». Accent chaud (brique volcanique) pour le distinguer du drenched teal. */}
      <g className="auth-hero__pin" transform="translate(290 386)">
        <circle r="24" fill="currentColor" opacity="0.10" />
        <path
          d="M0 -13 C 8 -13, 13 -7, 13 0 C 13 8, 4 14, 0 20 C -4 14, -13 8, -13 0 C -13 -7, -8 -13, 0 -13 Z"
          fill="var(--accent-brand)"
        />
        <circle cx="0" cy="-1" r="4.4" fill="var(--surface)" />
      </g>
      {/* Vagues — écho du blason OTI et de l'île. */}
      <g stroke="currentColor" strokeLinecap="round" fill="none" className="auth-hero__waves">
        <path d="M-40 566 Q 70 540 180 566 T 400 566 T 640 566" strokeWidth="10" opacity="0.18" />
        <path d="M-40 606 Q 70 580 180 606 T 400 606 T 640 606" strokeWidth="10" opacity="0.12" />
        <path d="M-40 646 Q 70 620 180 646 T 400 646 T 640 646" strokeWidth="10" opacity="0.07" />
      </g>
    </svg>
  );
}

/**
 * Coquille commune des pages hors-shell (/login, /set-password) : panneau de marque
 * institutionnel (identité produit Bertel — logo + nom issus du thème runtime,
 * get_public_branding est lisible par les anonymes) accolé à la carte formulaire.
 *
 * Trois zones d'identité (§171) : le PRODUIT (Bertel) mène ; le TERRITOIRE (Sud de La
 * Réunion · l'île intense) ancre ; l'INSTITUTION (OTI du Sud) est en appui, en attribution.
 * Territoire et opérateur viennent du branding runtime ⇒ NULL = rien affiché (white-label).
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const operatorName = useThemeStore((state) => state.theme.operatorName);
  const territory = useThemeStore((state) => state.theme.territory);
  const islandTagline = useThemeStore((state) => state.theme.islandTagline);

  return (
    <section className="auth-page">
      <div className="auth-frame">
        <div className="auth-hero">
          <AuthHeroScene />
          <div className="auth-hero__content">
            <div className="auth-hero__brandrow">
              {logoUrl ? (
                <span className="auth-hero__logo">
                  {/* alt vide : le nom de marque suit en h1, éviter la double annonce */}
                  <img src={logoUrl} alt="" />
                </span>
              ) : null}
              {territory || islandTagline ? (
                <span className="auth-hero__place">
                  {territory ? <span className="auth-hero__territory">{territory}</span> : null}
                  {islandTagline ? <span className="auth-hero__island">{islandTagline}</span> : null}
                </span>
              ) : null}
            </div>

            <h1 className="auth-hero__title">{brandName}</h1>

            <p className="auth-hero__tagline">
              Le référentiel de l’offre touristique : une source unique, du terrain à la publication.
            </p>

            <p className="auth-hero__domains">
              {DATA_DOMAINS.map((domain, index) => (
                <span key={domain} className="auth-hero__domain">
                  {index > 0 ? <span className="auth-hero__domain-dot" aria-hidden="true">·</span> : null}
                  {domain}
                </span>
              ))}
            </p>

            {operatorName ? (
              <p className="auth-hero__operator">
                <span className="auth-hero__operator-rule" aria-hidden="true" />
                Édité par {operatorName}
              </p>
            ) : null}
          </div>
        </div>
        <div className="auth-panel">{children}</div>
      </div>
    </section>
  );
}
