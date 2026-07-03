import { Suspense } from 'react';
import SetPasswordPage from '@/views/SetPasswordPage';

function SetPasswordFallback() {
  return (
    <section className="auth-page">
      <p className="auth-fallback">Chargement…</p>
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
