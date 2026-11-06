import type { ObjectWorkspaceModules } from './object-workspace-parser';

/** Only the confirmed office gallery belongs to this Photos release. */
export type WorkspaceSaveResult = Partial<Pick<ObjectWorkspaceModules, 'media'>>;
