import {
  ClipboardList,
  Files,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Settings2,
  ShieldCheck,
  UserX,
  Users,
} from 'lucide-react';
import type { UserRole } from '../types/domain';
import { isDemoOnlyModule } from '../utils/features';

export interface NavItem {
  to: string;
  label: string;
  caption: string;
  roles: UserRole[];
  icon: typeof MapPinned;
}

/**
 * Registre UNIQUE des modules navigables (D24) : consommé par la Sidebar ET la
 * palette de commandes — une seule source, pas de dérive de libellés/gating.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/explorer', label: 'Explorer', caption: 'Carte, filtres et fiches', roles: ['super_admin', 'tourism_agent'], icon: MapPinned },
  { to: '/dashboard', label: 'Dashboard', caption: 'Vue globale du reseau', roles: ['owner', 'super_admin', 'tourism_agent'], icon: LayoutDashboard },
  { to: '/crm', label: 'CRM', caption: 'Interactions et suivis', roles: ['super_admin', 'tourism_agent'], icon: Users },
  { to: '/moderation', label: 'Moderation', caption: 'Validation editoriale', roles: ['super_admin', 'tourism_agent'], icon: ShieldCheck },
  { to: '/audits', label: 'Audits', caption: 'Terrain et incidents', roles: ['super_admin', 'tourism_agent'], icon: ClipboardList },
  { to: '/publications', label: 'Publications', caption: 'Exports et mises en page', roles: ['super_admin', 'tourism_agent'], icon: Files },
  { to: '/listes', label: 'Listes', caption: 'Sélections à imprimer et envoyer', roles: ['super_admin', 'tourism_agent'], icon: ListChecks },
  // 7.4 — Équipe emménage dans Paramètres → Mon organisation (plus d'entrée /team au sidebar).
  { to: '/rgpd', label: 'RGPD', caption: 'Effacement & droits des personnes', roles: ['owner', 'super_admin'], icon: UserX },
  { to: '/settings', label: 'Paramètres', caption: 'Branding et environnement', roles: ['owner', 'super_admin', 'tourism_agent'], icon: Settings2 },
];

/** Modules visibles pour un rôle donné (mêmes règles que la Sidebar : rôle + demo-gating). */
export function visibleNavItems(role: UserRole | null, demoMode: boolean): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role) && (demoMode || !isDemoOnlyModule(item.to)));
}
