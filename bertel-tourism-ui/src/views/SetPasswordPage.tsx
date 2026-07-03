"use client";

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../lib/supabase';
import { toFriendlyAuthError } from '../services/auth';
import { useThemeStore } from '../store/theme-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MIN_PASSWORD_LENGTH = 8;

// Page d'atterrissage du lien d'invitation Supabase (redirectTo de inviteUserByEmail).
// Le lien authentifie l'invité (tokens dans le hash, consommés par supabase-js via
// detectSessionInUrl) ; on attend cette session puis on lui fait choisir son mot de passe.
export default function SetPasswordPage() {
  const router = useRouter();
  const brandName = useThemeStore((state) => state.theme.brandName);

  // 'waiting' = session pas encore détectée ; 'ready' = formulaire ; 'no-session' = lien invalide/expiré.
  const [phase, setPhase] = useState<'waiting' | 'ready' | 'no-session'>('waiting');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setPhase('no-session');
      return undefined;
    }

    let cancelled = false;

    // Les tokens du hash sont consommés de façon asynchrone : on tente tout de suite,
    // on écoute SIGNED_IN, et on tranche « lien invalide » après un court délai.
    void client.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setPhase('ready');
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setPhase('ready');
    });
    const timer = setTimeout(() => {
      if (!cancelled) setPhase((current) => (current === 'waiting' ? 'no-session' : current));
    }, 4000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (password !== confirm) {
      setFieldError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    setSubmitting(true);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Mot de passe enregistré — bienvenue !');
      router.replace('/');
    } catch (error) {
      toast.error(toFriendlyAuthError(error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-hero">
        <span className="eyebrow">{brandName}</span>
        <h1>Bienvenue dans l’équipe</h1>
        <p>Choisissez votre mot de passe pour activer votre compte et accéder à la plateforme.</p>
      </div>

      <article className="auth-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Activation du compte</span>
            <h2>Choisir votre mot de passe</h2>
          </div>
        </div>

        {phase === 'waiting' && <p className="muted">Vérification de votre invitation…</p>}

        {phase === 'no-session' && (
          <>
            <div className="notice notice--warn">
              Ce lien d’invitation est invalide ou a expiré. Demandez à votre administrateur de renvoyer une invitation.
            </div>
            <Button type="button" className="w-full" onClick={() => router.replace('/login')}>
              Aller à la page de connexion
            </Button>
          </>
        )}

        {phase === 'ready' && (
          <form onSubmit={(e) => void submit(e)} className="stack-list" noValidate>
            <div>
              <label htmlFor="set-password" className="sr-only">Nouveau mot de passe</label>
              <Input
                id="set-password"
                type="password"
                placeholder="Nouveau mot de passe"
                autoComplete="new-password"
                disabled={submitting}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="set-password-confirm" className="sr-only">Confirmer le mot de passe</label>
              <Input
                id="set-password-confirm"
                type="password"
                placeholder="Confirmer le mot de passe"
                autoComplete="new-password"
                disabled={submitting}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {fieldError && <p className="text-sm text-destructive mt-1">{fieldError}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={submitting || password === '' || confirm === ''}>
              {submitting ? 'Enregistrement…' : 'Enregistrer et accéder à la plateforme'}
            </Button>
          </form>
        )}
      </article>
    </section>
  );
}
