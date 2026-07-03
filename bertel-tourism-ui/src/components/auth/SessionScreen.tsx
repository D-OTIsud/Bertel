"use client";

import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { Button } from '@/components/ui/button';

/**
 * Écran de session hors shell (boot / erreur), même identité que /login en
 * version splash : logo + nom de marque du thème runtime. `booting` = attente
 * silencieuse (pulse) ; `error` = message + sorties (recharger / connexion).
 */
export function SessionScreen() {
  const status = useSessionStore((state) => state.status);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);

  const isBooting = status === 'booting';

  return (
    <section className="auth-page">
      <div className="session-screen" aria-live="polite">
        {logoUrl ? (
          <span className={`auth-hero__logo${isBooting ? ' session-screen__logo--pulse' : ''}`}>
            <img src={logoUrl} alt="" />
          </span>
        ) : null}
        <h1>{brandName}</h1>
        {isBooting ? (
          <p>Chargement de votre espace…</p>
        ) : (
          <>
            <p>{errorMessage ?? 'La session n’a pas pu être établie.'}</p>
            <div className="session-screen__actions">
              <Button type="button" onClick={() => window.location.reload()}>
                Réessayer
              </Button>
              <Button variant="outline" asChild>
                {/* <a> volontaire (pas de Link) : repartir d'un chargement propre */}
                <a href="/login">Aller à la connexion</a>
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
