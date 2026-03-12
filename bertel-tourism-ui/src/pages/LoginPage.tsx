import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { env } from '../lib/env';
import { signInWithGoogle } from '../services/auth';
import { useSessionStore } from '../store/session-store';
import { useThemeStore } from '../store/theme-store';

export function LoginPage() {
  const status = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const setGuest = useSessionStore((state) => state.setGuest);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'ready') {
    return <Navigate to="/" replace />;
  }

  async function handleGoogleLogin() {
    setSubmitting(true);
    setAuthError(null);

    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-hero">
        <span className="eyebrow">{brandName}</span>
        <h1>Connexion a la plateforme tourisme & CRM</h1>
        <p>
          Authentification principale via Google, session geree par Supabase, et adaptation automatique de l interface selon le role.
        </p>
        {logoUrl ? <img src={logoUrl} alt={brandName} className="theme-preview-card__logo" /> : null}
      </div>

      <article className="auth-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Authentification</span>
            <h2>Se connecter a {brandName}</h2>
          </div>
        </div>

        {!demoMode ? (
          <>
            <button type="button" className="primary-button auth-google-button" onClick={() => void handleGoogleLogin()} disabled={submitting}>
              {submitting ? 'Redirection Google...' : 'Continuer avec Google'}
            </button>
            <p className="auth-note">
              Assurez-vous que le provider Google est active dans Supabase Auth et que l URL de redirection de cette application est autorisee.
            </p>
            {errorMessage ? <div className="panel-card panel-card--warning">{errorMessage}</div> : null}
            {authError ? <div className="panel-card panel-card--warning">{authError}</div> : null}
            <div className="stack-list auth-runtime-list">
              <span>Supabase URL: {env.supabaseUrl || 'non configure'}</span>
              <span>Mode demo: non</span>
            </div>
          </>
        ) : (
          <>
            <div className="panel-card">
              <p>Le mode demo est actif. Vous pouvez entrer dans l application sans OAuth pour travailler le design et les parcours.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => setGuest(null)}>
              Revenir a l ecran d accueil demo
            </button>
          </>
        )}
      </article>
    </section>
  );
}
