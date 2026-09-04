'use client';

import { useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { enterSandbox, leaveSandbox } from '@/services/sandbox';

export default function SandboxEntryPage() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void enterSandbox().then(() => {
      // Recharge les clients et caches avec le stockage dédié au test.
      if (!cancelled) window.location.replace('/explorer');
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Connexion au test impossible.');
    });
    return () => { cancelled = true; };
  }, [attempt]);
  return (
    <AuthShell>
      <div className="auth-panel__head">
        <h2>Espace de test</h2>
        <p>Découvrez Bertel sur des données fictives partagées, sans compte.</p>
      </div>
      {error ? <>
        <p role="alert">{error}</p>
        <button className="auth-link" onClick={() => setAttempt((value) => value + 1)}>Réessayer</button>
      </> : <p role="status">Ouverture de l’espace de test…</p>}
      <a href="/login" className="auth-link" onClick={() => leaveSandbox()}>Retour à la connexion</a>
    </AuthShell>
  );
}
