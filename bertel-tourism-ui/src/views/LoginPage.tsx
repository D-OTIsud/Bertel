"use client";

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPostLoginPath, isSafeInternalPath } from '../lib/auth-routing';
import { loginEmailSchema, type LoginFormValues } from '../lib/schemas';
import { signInWithGoogle, signInWithEmailPassword } from '../services/auth';
import { useSessionStore } from '../store/session-store';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.2 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.7-.4-3.9z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useSessionStore((state) => state.status);
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const errorMessage = useSessionStore((state) => state.errorMessage);
  const setGuest = useSessionStore((state) => state.setGuest);

  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginEmailSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (status !== 'ready') return;
    router.replace(getPostLoginPath(role, searchParams?.get('from')));
  }, [role, router, searchParams, status]);

  useEffect(() => {
    if (!errorMessage) return;
    if (status === 'error' || errorMessage.includes('deconnecte')) {
      toast.error(errorMessage);
    }
  }, [errorMessage, status]);

  if (status === 'ready') return null;

  async function onEmailSubmit(values: LoginFormValues) {
    setSubmitting(true);
    try {
      await signInWithEmailPassword(values.email, values.password);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    const from = searchParams?.get('from');
    if (typeof window !== 'undefined') {
      if (isSafeInternalPath(from)) {
        sessionStorage.setItem('auth_redirect_from', from);
      } else {
        sessionStorage.removeItem('auth_redirect_from');
      }
    }
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
    <AuthShell>
      <div className="auth-panel__head">
        <h2>Connexion</h2>
        <p>Accédez à votre espace de travail.</p>
      </div>

      {!demoMode ? (
        <>
          <form onSubmit={handleSubmit(onEmailSubmit)} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="login-email">Adresse e-mail</label>
              <Input
                id="login-email"
                type="email"
                placeholder="prenom.nom@exemple.com"
                autoComplete="email"
                disabled={submitting}
                {...register('email')}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="auth-field">
              <label htmlFor="login-password">Mot de passe</label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={submitting}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>

          <p className="auth-divider">ou</p>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void handleGoogleLogin()}
            disabled={submitting}
          >
            <GoogleMark />
            {submitting ? 'Redirection Google...' : 'Continuer avec Google'}
          </Button>
        </>
      ) : (
        <>
          <p className="auth-field__hint">
            Le mode démo est actif : entrez dans l’application sans OAuth pour travailler le design
            et les parcours.
          </p>
          <Button type="button" className="w-full" onClick={() => setGuest(null)}>
            Revenir à l’écran d’accueil démo
          </Button>
        </>
      )}
    </AuthShell>
  );
}

export { LoginPage };
