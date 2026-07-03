import { Suspense } from 'react';
import SetPasswordPage from '@/views/SetPasswordPage';

function SetPasswordFallback() {
  return (
    <section className="auth-page">
      <article className="auth-card">
        <div className="panel-heading">
          <h2>Chargement…</h2>
        </div>
      </article>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<SetPasswordFallback />}>
      <SetPasswordPage />
    </Suspense>
  );
}
