import { usePathname } from 'next/navigation';
import { CalendarDays, LogOut, Search, Users, Wifi, WifiOff } from 'lucide-react';
import { signOut } from '../../services/auth';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { StatusPill } from '../common/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const pageMeta = [
  {
    path: '/explorer',
    eyebrow: 'Atlas',
    title: 'Explorateur tourisme',
    description: 'Recherchez les fiches, comparez les offres et ouvrez les objets directement depuis la carte.',
  },
  {
    path: '/dashboard',
    eyebrow: 'Overview',
    title: 'Tableau de bord reseau',
    description: 'Suivez le portefeuille, la collaboration live et la preparation des publications.',
  },
  {
    path: '/crm',
    eyebrow: 'CRM',
    title: 'Pipeline de suivi',
    description: 'Coordonnez les relances, les notes et les prochaines actions avec les equipes terrain.',
  },
  {
    path: '/moderation',
    eyebrow: 'Moderation',
    title: 'Validation editoriale',
    description: 'Revoyez les changements entrants et gardez le catalogue public parfaitement aligne.',
  },
  {
    path: '/audits',
    eyebrow: 'Audits',
    title: 'Operations terrain',
    description: 'Auditez, signalez et faites circuler les observations plus vite entre les equipes.',
  },
  {
    path: '/publications',
    eyebrow: 'Publishing',
    title: 'Board publications',
    description: 'Faites passer les contenus du brief a lexport dans un flux plus leger.',
  },
  {
    path: '/settings',
    eyebrow: 'Settings',
    title: 'Branding et runtime',
    description: 'Ajustez le theme, les marqueurs et les comportements de la plateforme.',
  },
];

function resolvePageMeta(pathname: string | null) {
  return pageMeta.find((entry) => pathname?.startsWith(entry.path)) ?? pageMeta[0];
}

function initialsFromName(value: string | null | undefined): string {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'BT';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function TopBar() {
  const pathname = usePathname();
  const role = useSessionStore((state) => state.role);
  const userName = useSessionStore((state) => state.userName);
  const sessionStatus = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);
  const meta = resolvePageMeta(pathname);
  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);
  const currentDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  async function handleSignOut() {
    await signOut();
  }

  const statusTone = networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red';

  return (
    <header className="topbar-shell">
      <div className="topbar-heading">
        <span className="eyebrow">{meta.eyebrow}</span>
        <div className="topbar-heading__row">
          <h1>{meta.title}</h1>
          <span className="topbar-date">
            <CalendarDays className="h-4 w-4" />
            {currentDate}
          </span>
        </div>
        <p>{meta.description}</p>
      </div>

      <label className="topbar-search" aria-label="Recherche globale">
        <Search className="h-4 w-4" />
        <Input
          type="search"
          placeholder="Rechercher une fiche, une ville, un acteur ou une publication..."
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </label>

      <div className="topbar-actions">
        <StatusPill tone={statusTone}>{networkStatus}</StatusPill>
        <StatusPill tone="neutral">{liveUsersCount} live</StatusPill>
        <div className="topbar-user">
          <span className="topbar-user__avatar">{initials}</span>
          <div>
            <strong>{userLabel}</strong>
            <span>
              <Users className="h-3.5 w-3.5" />
              {role ?? 'guest'} · {sessionStatus}
            </span>
          </div>
        </div>
        {!demoMode && sessionStatus === 'ready' ? (
          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        ) : (
          <span className="topbar-mode">
            {networkStatus === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {demoMode ? 'Demo workspace' : 'Secure workspace'}
          </span>
        )}
      </div>
    </header>
  );
}
