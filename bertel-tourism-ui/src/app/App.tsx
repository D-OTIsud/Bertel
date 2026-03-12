import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useBootstrapSession } from '../hooks/useBootstrapSession';
import { useNetworkMonitor } from '../hooks/useNetworkMonitor';
import { useSessionStore } from '../store/session-store';
import { isDemoOnlyModule } from '../utils/features';

const AuditsPage = lazy(async () => ({ default: (await import('../pages/AuditsPage')).AuditsPage }));
const CrmPage = lazy(async () => ({ default: (await import('../pages/CrmPage')).CrmPage }));
const DashboardPage = lazy(async () => ({ default: (await import('../pages/DashboardPage')).DashboardPage }));
const ExplorerPage = lazy(async () => ({ default: (await import('../pages/ExplorerPage')).ExplorerPage }));
const LoginPage = lazy(async () => ({ default: (await import('../pages/LoginPage')).LoginPage }));
const ModerationPage = lazy(async () => ({ default: (await import('../pages/ModerationPage')).ModerationPage }));
const PublicationsPage = lazy(async () => ({ default: (await import('../pages/PublicationsPage')).PublicationsPage }));
const SettingsPage = lazy(async () => ({ default: (await import('../pages/SettingsPage')).SettingsPage }));

function SessionFallback() {
  const status = useSessionStore((state) => state.status);
  const errorMessage = useSessionStore((state) => state.errorMessage);

  return (
    <section className="page-grid">
      <article className="panel-card panel-card--wide">
        <div className="panel-heading">
          <h2>{status === 'booting' ? 'Initialisation de la session' : 'Session invalide'}</h2>
        </div>
        <p>{status === 'booting' ? 'Chargement de la session Supabase...' : errorMessage}</p>
      </article>
    </section>
  );
}

function RouteFallback() {
  return (
    <section className="page-grid">
      <article className="panel-card panel-card--wide">
        <div className="panel-heading">
          <h2>Chargement du module</h2>
        </div>
        <p>L interface prepare la vue demandee.</p>
      </article>
    </section>
  );
}

function FeatureUnavailable({ path }: { path: string }) {
  return (
    <section className="page-grid">
      <article className="panel-card panel-card--warning panel-card--wide">
        <div className="panel-heading">
          <h2>Module non branche</h2>
        </div>
        <p>
          Le module <strong>{path}</strong> est reserve au mode demo tant que ses RPC backend ne sont pas implementes.
        </p>
      </article>
    </section>
  );
}

function SessionGate({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status);
  const location = useLocation();

  if (status === 'ready') {
    return <>{children}</>;
  }

  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <SessionFallback />;
}

function FeatureGate({ path, children }: { path: string; children: ReactNode }) {
  const demoMode = useSessionStore((state) => state.demoMode);
  if (!demoMode && isDemoOnlyModule(path)) {
    return <FeatureUnavailable path={path} />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const role = useSessionStore((state) => state.role);
  return <Navigate to={role === 'owner' ? '/dashboard' : '/explorer'} replace />;
}

function ExplorerGate() {
  const role = useSessionStore((state) => state.role);
  return role === 'owner' ? <Navigate to="/dashboard" replace /> : <ExplorerPage />;
}

function CrmGate() {
  const role = useSessionStore((state) => state.role);
  return role === 'owner' ? <Navigate to="/dashboard" replace /> : <CrmPage />;
}

function ModerationGate() {
  const role = useSessionStore((state) => state.role);
  return role === 'owner' ? <Navigate to="/dashboard" replace /> : <ModerationPage />;
}

function AuditsGate() {
  const role = useSessionStore((state) => state.role);
  return role === 'owner' ? <Navigate to="/dashboard" replace /> : <AuditsPage />;
}

function PublicationsGate() {
  const role = useSessionStore((state) => state.role);
  return role === 'owner' ? <Navigate to="/dashboard" replace /> : <PublicationsPage />;
}

export function App() {
  useNetworkMonitor();
  useBootstrapSession();

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<SessionGate><HomeRedirect /></SessionGate>} />
            <Route path="/explorer" element={<SessionGate><ExplorerGate /></SessionGate>} />
            <Route path="/dashboard" element={<SessionGate><DashboardPage /></SessionGate>} />
            <Route path="/crm" element={<SessionGate><FeatureGate path="/crm"><CrmGate /></FeatureGate></SessionGate>} />
            <Route path="/moderation" element={<SessionGate><FeatureGate path="/moderation"><ModerationGate /></FeatureGate></SessionGate>} />
            <Route path="/audits" element={<SessionGate><FeatureGate path="/audits"><AuditsGate /></FeatureGate></SessionGate>} />
            <Route path="/publications" element={<SessionGate><FeatureGate path="/publications"><PublicationsGate /></FeatureGate></SessionGate>} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
