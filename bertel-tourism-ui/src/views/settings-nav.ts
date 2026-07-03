// Phase 7.1 — modèle de navigation de la console /settings : un rail groupé PAR PÉRIMÈTRE,
// gated par rôle. Source unique de la structure du rail (consommée par SettingsRail + la page).
// « Mon compte » : tout le monde. « Plateforme » : super-admin. « Mon organisation » / Équipe
// (7.4) et « Listes & référentiels » (7.5) sont désormais branchés ici.

import {
  Activity,
  BadgeCheck,
  Bot,
  Brush,
  Building2,
  CircleUser,
  KeyRound,
  ListChecks,
  MapPin,
  Palette,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '../types/domain';

export interface SettingsNavSection {
  id: string;
  label: string;
  /** Icône lucide affichée dans le rail (fidélité maquette p7-01). */
  icon?: LucideIcon;
  /** Marqueur « Nouveau » optionnel (badge--ok) sur l'item de rail. */
  isNew?: boolean;
}

/** Périmètre du groupe : « tout le monde » (non gated) ou un badge de rôle requis (gated). */
export interface SettingsNavScope {
  label: string;
  gated?: boolean;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  scope: SettingsNavScope;
  sections: SettingsNavSection[];
}

const ACCOUNT_GROUP: SettingsNavGroup = {
  id: 'account',
  label: 'Mon compte',
  scope: { label: 'tout le monde' },
  sections: [
    { id: 'profile', label: 'Profil', icon: CircleUser },
    { id: 'preferences', label: 'Préférences', icon: SlidersHorizontal },
    { id: 'session', label: 'Session & rôle', icon: BadgeCheck },
  ],
};

// 7.4 — « Mon organisation » : Équipe (gated org-admin ≥ 10 via canAdministerTeam). Team
// emménage ici depuis la route /team (retirée du sidebar). Le gating fin (inviter / défauts
// ORG ≥ 30) + les contrôles serveur restent dans TeamAdminPage = la vraie frontière.
// Task 11 — la section « Apparence de l'organisation » (branding par ORG, admin rang ≥ 30)
// rejoint ce même groupe : le groupe est désormais construit dynamiquement selon les sections
// réellement accessibles (jamais de section fantôme si aucune n'est gated true).
function buildOrgGroup(options: SettingsNavOptions): SettingsNavGroup | null {
  const sections: SettingsNavSection[] = [];
  if (options.canManageTeam) sections.push({ id: 'team', label: 'Équipe', icon: Users });
  if (options.canManageOrgBranding) sections.push({ id: 'org-branding', label: 'Apparence de l’organisation', icon: Brush, isNew: true });
  if (sections.length === 0) return null;
  return { id: 'org', label: 'Mon organisation', scope: { label: 'admin ORG', gated: true }, sections };
}

const PLATFORM_GROUP: SettingsNavGroup = {
  id: 'platform',
  label: 'Plateforme',
  scope: { label: 'super-admin', gated: true },
  sections: [
    { id: 'appearance', label: 'Apparence', icon: Palette },
    { id: 'markers', label: 'Marqueurs', icon: MapPin },
    { id: 'referentiels', label: 'Listes & référentiels', icon: ListChecks, isNew: true },
    { id: 'ai', label: 'Fournisseurs IA', icon: Bot },
    { id: 'partner-keys', label: 'Clés API partenaire', icon: KeyRound, isNew: true },
    { id: 'organisations', label: 'Organisations', icon: Building2, isNew: true },
    { id: 'diagnostic', label: 'Diagnostic', icon: Activity },
  ],
};

export interface SettingsNavOptions {
  /** L'utilisateur peut administrer l'équipe de son ORG (canAdministerTeam) ⇒ groupe « Mon organisation ». */
  canManageTeam?: boolean;
  /** L'utilisateur peut gérer le branding de son ORG (admin rang ≥ 30) ⇒ section « Apparence de l'organisation ». */
  canManageOrgBranding?: boolean;
}

/** Groupes du rail visibles pour ce rôle + périmètre (gating). Ordre : compte → organisation → plateforme. */
export function buildSettingsNav(role: UserRole | null | undefined, options: SettingsNavOptions = {}): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [ACCOUNT_GROUP];
  const orgGroup = buildOrgGroup(options);
  if (orgGroup) groups.push(orgGroup);
  if (role === 'super_admin') {
    groups.push(PLATFORM_GROUP);
  }
  return groups;
}

/** Liste plate des ids de section accessibles (pour valider le `?section=` d'URL). */
export function settingsSectionIds(role: UserRole | null | undefined, options: SettingsNavOptions = {}): string[] {
  return buildSettingsNav(role, options).flatMap((group) => group.sections.map((section) => section.id));
}

/** Section par défaut (premier panneau de « Mon compte »). */
export const DEFAULT_SETTINGS_SECTION = 'profile';

/** Résout la section active : le `?section=` demandé s'il est accessible, sinon le défaut. */
export function resolveSettingsSection(
  role: UserRole | null | undefined,
  requested: string | null | undefined,
  options: SettingsNavOptions = {},
): string {
  const available = settingsSectionIds(role, options);
  return requested && available.includes(requested) ? requested : DEFAULT_SETTINGS_SECTION;
}
