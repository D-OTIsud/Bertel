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
      {/* Itinéraires — stations ALIGNÉES (même x) et RÉPARTIES sur toute la hauteur du bord
          droit, rejoignant le point de repère à l'horizontale, au niveau de « Bertel ». Le tracé
          reste dans la moitié droite (hors texte) et se referme proprement. Faible opacité : décor. */}
      <g className="auth-hero__routes" stroke="currentColor" strokeLinecap="round" fill="none">
        <path d="M558 110 C 480 150, 360 322, 268 324" strokeWidth="3" opacity="0.17" />
        <path d="M558 240 C 476 250, 360 324, 268 324" strokeWidth="3" opacity="0.14" />
        <path d="M558 375 C 476 372, 360 326, 268 324" strokeWidth="3" opacity="0.12" />
        <path d="M558 510 C 470 486, 360 330, 268 324" strokeWidth="3" opacity="0.10" />
        {/* Stations alignées sur x=558, réparties du haut vers le bas */}
        <g fill="var(--teal)" stroke="currentColor" strokeWidth="3">
          <circle cx="558" cy="110" r="7" opacity="0.55" />
          <circle cx="558" cy="240" r="7" opacity="0.5" />
          <circle cx="558" cy="375" r="7" opacity="0.46" />
          <circle cx="558" cy="510" r="7" opacity="0.4" />
        </g>
      </g>
      {/* Le point de repère où convergent les itinéraires — une seule source de vérité — posé au
          niveau du mot « Bertel ». Accent chaud (brique volcanique) pour le distinguer du teal. */}
      <g className="auth-hero__pin" transform="translate(268 324)">
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
  // L'acronyme est propre à « Bertel » : on ne l'affiche pas pour un re-branding
  // (§167 white-label) — gate sur le nom runtime, aucun texte institutionnel forcé.
  const showBertelAcronym = brandName.trim().toLowerCase() === 'bertel';

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

            {showBertelAcronym ? (
              // Signification de l'acronyme — verbatim de l'infographie institutionnelle
              // (docs/infographie-bertel.html) ; initiales B-E-R-T-É-L mises en avant.
              <p className="auth-hero__acronym">
                <span className="ac">B</span>ase d’<span className="ac">E</span>nregistrement et de{' '}
                <span className="ac">R</span>éférentiel <span className="ac">T</span>ouristique des{' '}
                <span className="ac">É</span>tablissements et <span className="ac">L</span>ieux
              </p>
            ) : null}

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
