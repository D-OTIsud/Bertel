import { useNavigate } from 'react-router-dom';
import { signOut } from '../../services/auth';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { useUiStore } from '../../store/ui-store';
import { StatusPill } from '../common/StatusPill';

export function TopBar() {
  const navigate = useNavigate();
  const role = useSessionStore((state) => state.role);
  const userName = useSessionStore((state) => state.userName);
  const sessionStatus = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);

  const tone = networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red';

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        {logoUrl ? <img src={logoUrl} alt={brandName} className="topbar-brand__logo" /> : null}
        <div className="topbar-brand__copy">
          <strong>{brandName}</strong>
          <span>Ctrl+K pour rechercher partout</span>
        </div>
      </div>

      <label className="omnibar">
        <span>Recherche globale</span>
        <input type="search" placeholder="Ctrl+K, nom, fiche, acteur, publication..." />
      </label>

      <div className="topbar-statuses">
        <StatusPill tone={tone}>{networkStatus}</StatusPill>
        <StatusPill tone="neutral">{liveUsersCount} en direct</StatusPill>
        <StatusPill tone="neutral">Role: {role ?? 'indetermine'}</StatusPill>
        <StatusPill tone="neutral">Session: {sessionStatus}</StatusPill>
        <span className="user-pill">{userName || 'Utilisateur non charge'}</span>
        {!demoMode && sessionStatus === 'ready' ? (
          <button type="button" className="ghost-button" onClick={() => void handleSignOut()}>
            Deconnexion
          </button>
        ) : null}
      </div>
    </header>
  );
}

