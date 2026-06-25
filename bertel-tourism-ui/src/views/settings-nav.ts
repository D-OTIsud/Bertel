// Phase 7.1 — modèle de navigation de la console /settings : un rail groupé PAR PÉRIMÈTRE,
// gated par rôle. Source unique de la structure du rail (consommée par SettingsRail + la page).
// « Mon compte » : tout le monde. « Plateforme » : super-admin. « Mon organisation » / Équipe
// (7.4) et « Listes & référentiels » (7.5) sont désormais branchés ici.

import {
  Activity,
  BadgeCheck,
  Bot,
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
    { id: 'preferences', label: 'Préférences', icon: SlidersHorizontal },
    { id: 'session', label: 'Session & rôle', icon: BadgeCheck },
  ],
};

// 7.4 — « Mon organisation » : Équipe (gated org-admin ≥ 10 via canAdministerTeam). Team
// emménage ici depuis la route /team (retirée du sidebar). Le gating fin (inviter / défauts
// ORG ≥ 30) + les contrôles serveur restent dans TeamAdminPage = la vraie frontière.
const ORG_GROUP: SettingsNavGroup = {
  id: 'org',
  label: 'Mon organisation',
  scope: { label: 'admin ORG', gated: true },
  sections: [{ id: 'team', label: 'Équipe', icon: Users }],
};

const PLATFORM_GROUP: SettingsNavGroup = {
  id: 'platform',
  label: 'Plateforme',
  scope: { label: 'super-admin', gated: true },
  sections: [
    { id: 'appearance', label: 'Apparence', icon: Palette },
    { id: 'markers', label: 'Marqueurs', icon: MapPin },
    { id: 'referentiels', label: 'Listes & référentiels', icon: ListChecks, isNew: true },
    { id: 'ai', label: 'Fournisseurs IA', icon: Bot },
    { id: 'diagnostic', label: 'Diagnostic', icon: Activity },
  ],
};

export interface SettingsNavOptions {
  /** L'utilisateur peut administrer l'équipe de son ORG (canAdministerTeam) ⇒ groupe « Mon organisation ». */
  canManageTeam?: boolean;
}

/** Groupes du rail visibles pour ce rôle + périmètre (gating). Ordre : compte → organisation → plateforme. */
export function buildSettingsNav(role: UserRole | null | undefined, options: SettingsNavOptions = {}): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [ACCOUNT_GROUP];
  if (options.canManageTeam) {
    groups.push(ORG_GROUP);
  }
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
export const DEFAULT_SETTINGS_SECTION = 'preferences';

/** Résout la section active : le `?section=` demandé s'il est accessible, sinon le défaut. */
export function resolveSettingsSection(
  role: UserRole | null | undefined,
  requested: string | null | undefined,
  options: SettingsNavOptions = {},
): string {
  const available = settingsSectionIds(role, options);
  return requested && available.includes(requested) ? requested : DEFAULT_SETTINGS_SECTION;
}
