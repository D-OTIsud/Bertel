"use client";

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../lib/supabase';
import { toFriendlyAuthError } from '../services/auth';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MIN_PASSWORD_LENGTH = 8;

// Page d'atterrissage des liens authentifiants Supabase : invitation (redirectTo de
// inviteUserByEmail) et réinitialisation (redirectTo de resetPasswordForEmail).
// Le lien authentifie l'utilisateur (tokens dans le hash, consommés par supabase-js via
// detectSessionInUrl) ; on attend cette session puis on lui fait choisir son mot de passe.
export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // `?espace=1` est posé par le lien d'invitation d'un partenaire : la page lui parle
  // alors de SA fiche, pas d'une arrivée dans l'équipe de l'office. Le signal ne survit
  // pas au flux « mot de passe oublié » (voir `isWelcome` plus bas) : quelqu'un qui
  // refait son mot de passe n'est pas en train d'être accueilli.
  const isPartner = searchParams?.get('espace') === '1';

  // 'waiting' = session pas encore détectée ; 'ready' = formulaire ; 'no-session' = lien invalide/expiré.
  const [phase, setPhase] = useState<'waiting' | 'ready' | 'no-session'>('waiting');
  // PASSWORD_RECOVERY (flux « mot de passe oublié ») adapte la copie ; défaut = invitation.
  const [isRecovery, setIsRecovery] = useState(false);
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
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
      if (session) setPhase('ready');
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
      toast.success(isRecovery ? 'Mot de passe mis à jour.' : 'Mot de passe enregistré — bienvenue !');
      router.replace('/');
    } catch (error) {
      toast.error(toFriendlyAuthError(error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const isPartnerWelcome = isPartner && !isRecovery;

  return (
    <AuthShell>
      <div className="auth-panel__head">
        <h2>
          {isRecovery
            ? 'Réinitialisez votre mot de passe'
            : isPartnerWelcome
              ? 'Bienvenue'
              : 'Bienvenue dans l’équipe'}
        </h2>
        <p>
          {isRecovery
            ? 'Choisissez un nouveau mot de passe pour votre compte.'
            : isPartnerWelcome
              ? 'Choisissez un mot de passe pour accéder à votre fiche.'
              : 'Choisissez votre mot de passe pour activer votre compte.'}
        </p>
      </div>

      {phase === 'waiting' && <p className="auth-field__hint">Vérification de votre lien…</p>}

      {phase === 'no-session' && (
        <>
          {/* Hors portail : copie neutre, on ne sait pas si le lien mort venait d'une
              invitation ou d'une réinitialisation. Pour un partenaire, une seule
              consigne, et l'interlocuteur qu'il connaît : son office de tourisme. */}
          <div className="notice notice--warn">
            {isPartner
              ? 'Ce lien ne fonctionne plus. Demandez à votre office de tourisme de vous renvoyer une invitation.'
              : 'Ce lien est invalide ou a expiré. Refaites une demande via « Mot de passe oublié ? » sur la page de connexion, ou demandez à votre administrateur de renvoyer une invitation.'}
          </div>
          {/* Le signal est reconduit : sans lui, /login rebasculerait en copie interne. */}
          <Button
            type="button"
            className="w-full"
            onClick={() => router.replace(isPartner ? '/login?espace=1' : '/login')}
          >
            Aller à la page de connexion
          </Button>
        </>
      )}

      {phase === 'ready' && (
        <form onSubmit={(e) => void submit(e)} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="set-password">Nouveau mot de passe</label>
            <Input
              id="set-password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={submitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="auth-field__hint">Au moins {MIN_PASSWORD_LENGTH} caractères.</p>
          </div>
          <div className="auth-field">
            <label htmlFor="set-password-confirm">Confirmer le mot de passe</label>
            <Input
              id="set-password-confirm"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={submitting}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || password === '' || confirm === ''}
          >
            {submitting
              ? 'Enregistrement…'
              : isPartnerWelcome
                ? 'C’est parti'
                : 'Enregistrer et accéder à la plateforme'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
