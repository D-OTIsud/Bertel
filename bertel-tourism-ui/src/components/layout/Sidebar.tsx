import { NavLink } from 'react-router-dom';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import type { UserRole } from '../../types/domain';
import { isDemoOnlyModule } from '../../utils/features';

const allItems: Array<{ to: string; label: string; roles: UserRole[] }> = [
  { to: '/explorer', label: 'Explorateur', roles: ['super_admin', 'tourism_agent'] },
  { to: '/dashboard', label: 'Dashboard', roles: ['owner', 'super_admin', 'tourism_agent'] },
  { to: '/crm', label: 'CRM', roles: ['super_admin', 'tourism_agent'] },
  { to: '/moderation', label: 'Moderation', roles: ['super_admin', 'tourism_agent'] },
  { to: '/audits', label: 'Audits', roles: ['super_admin', 'tourism_agent'] },
  { to: '/publications', label: 'Publications', roles: ['super_admin', 'tourism_agent'] },
  { to: '/settings', label: 'Settings', roles: ['owner', 'super_admin', 'tourism_agent'] },
];

export function Sidebar() {
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const items = role
    ? allItems.filter((item) => item.roles.includes(role) && (demoMode || !isDemoOnlyModule(item.to)))
    : [];

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <span className="brand-kicker">Bertel 3.0</span>
        <div className="brand-block__identity">
          {logoUrl ? <img src={logoUrl} alt={brandName} className="brand-logo" /> : <div className="brand-logo brand-logo--fallback">B</div>}
          <div>
            <h1>{brandName}</h1>
            <p>Information dense mais jamais ecrasante.</p>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? 'sidebar-link sidebar-link--active' : 'sidebar-link'
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

