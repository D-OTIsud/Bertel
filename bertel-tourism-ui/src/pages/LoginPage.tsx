"use client";

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { env } from '../lib/env';
import { loginSchema, type LoginFormValues } from '../lib/schemas';
import { signInWithGoogle } from '../services/auth';
import { useSessionStore } from '../store/session-store';
import { useThemeStore } from '../store/theme-store';
import { Button } from '@/components/ui/button';

export function LoginPage() {
  const router = useRouter();
  const status = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const setGuest = useSessionStore((state) => state.setGuest);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);

  const [submitting, setSubmitting] = useState(false);
  useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (status === 'ready') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    if (errorMessage) toast.error(errorMessage);
  }, [errorMessage]);

  if (status === 'ready') return null;

  async function handleGoogleLogin() {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      toast.error((error as Error).message);
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
            <Button
              type="button"
              className="auth-google-button w-full"
              onClick={() => void handleGoogleLogin()}
              disabled={submitting}
            >
              {submitting ? 'Redirection Google...' : 'Continuer avec Google'}
            </Button>
            <p className="auth-note">
              Assurez-vous que le provider Google est actif dans Supabase Auth et que l URL de redirection de cette application est autorisee.
            </p>
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
            <Button type="button" className="w-full" onClick={() => setGuest(null)}>
              Revenir a l ecran d accueil demo
            </Button>
          </>
        )}
      </article>
    </section>
  );
}

export default LoginPage;
