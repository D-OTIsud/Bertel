import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import type { UserRole } from '../../types/domain';
import { isDemoOnlyModule } from '../../utils/features';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const pathname = usePathname();
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const items = role
    ? allItems.filter((item) => item.roles.includes(role) && (demoMode || !isDemoOnlyModule(item.to)))
    : [];

  return (
    <aside className="sticky top-0 h-screen border-r border-border bg-card/50 p-6 backdrop-blur-md">
      <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur-md">
        <span className="mb-1.5 block text-xs uppercase tracking-widest text-muted-foreground">Bertel 3.0</span>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="h-14 w-14 rounded-2xl border border-border bg-card object-contain p-1.5" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card font-display text-xl font-bold text-primary">
              B
            </div>
          )}
          <div>
            <h1 className="font-display text-lg font-semibold leading-tight">{brandName}</h1>
            <p className="text-sm text-muted-foreground">Information dense mais jamais ecrasante.</p>
          </div>
        </div>
      </div>

      <nav className="mt-5 grid gap-1.5">
        {items.map((item) => {
          const isActive = pathname === item.to;
          return (
            <Button key={item.to} variant="ghost" size="sm" className={cn('w-full justify-start rounded-2xl', isActive && 'bg-accent text-accent-foreground')} asChild>
              <Link href={item.to}>{item.label}</Link>
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}

