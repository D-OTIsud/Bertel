// Phase 7.1 — modèle de navigation de la console /settings : un rail groupé PAR PÉRIMÈTRE,
// gated par rôle. Source unique de la structure du rail (consommée par SettingsRail + la page).
// « Mon compte » : tout le monde. « Plateforme » : super-admin. (« Mon organisation » / Équipe
// = 7.4, « Listes & référentiels » = 7.5 : se brancheront ici quand livrés.)

import type { UserRole } from '../types/domain';

export interface SettingsNavSection {
  id: string;
  label: string;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  sections: SettingsNavSection[];
}

const ACCOUNT_GROUP: SettingsNavGroup = {
  id: 'account',
  label: 'Mon compte',
  sections: [
    { id: 'preferences', label: 'Préférences' },
    { id: 'session', label: 'Session & rôle' },
  ],
};

const PLATFORM_GROUP: SettingsNavGroup = {
  id: 'platform',
  label: 'Plateforme',
  sections: [
    { id: 'appearance', label: 'Apparence' },
    { id: 'markers', label: 'Marqueurs' },
    { id: 'ai', label: 'Fournisseurs IA' },
    { id: 'diagnostic', label: 'Diagnostic' },
  ],
};

/** Groupes du rail visibles pour ce rôle (gating périmètre). */
export function buildSettingsNav(role: UserRole | null | undefined): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [ACCOUNT_GROUP];
  if (role === 'super_admin') {
    groups.push(PLATFORM_GROUP);
  }
  return groups;
}

/** Liste plate des ids de section accessibles à ce rôle (pour valider le `?section=` d'URL). */
export function settingsSectionIds(role: UserRole | null | undefined): string[] {
  return buildSettingsNav(role).flatMap((group) => group.sections.map((section) => section.id));
}

/** Section par défaut (premier panneau de « Mon compte »). */
export const DEFAULT_SETTINGS_SECTION = 'preferences';

/** Résout la section active : le `?section=` demandé s'il est accessible, sinon le défaut. */
export function resolveSettingsSection(role: UserRole | null | undefined, requested: string | null | undefined): string {
  const available = settingsSectionIds(role);
  return requested && available.includes(requested) ? requested : DEFAULT_SETTINGS_SECTION;
}
