import { Suspense } from 'react';
import LoginPage from '@/views/LoginPage';

function LoginFallback() {
  return (
    <section className="auth-page">
      <p className="auth-fallback">Chargement de la connexion…</p>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPage />
    </Suspense>
  );
}
