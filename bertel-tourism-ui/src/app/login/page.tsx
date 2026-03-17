import { Suspense } from 'react';
import LoginPage from '@/views/LoginPage';

function LoginFallback() {
  return (
    <section className="auth-page">
      <article className="auth-card">
        <div className="panel-heading">
          <h2>Chargement de la connexion</h2>
        </div>
      </article>
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
