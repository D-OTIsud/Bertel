import type { ObjectWorkspaceModules } from './object-workspace-parser';

/** Only writers returning a confirmed canonical slice populate this result. */
export type WorkspaceSaveResult = Partial<Pick<ObjectWorkspaceModules, 'capacityPolicies' | 'menus'>>;
