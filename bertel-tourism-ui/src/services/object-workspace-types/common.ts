
export interface WorkspaceTranslatableField {
  baseValue: string;
  values: Record<string, string>;
}

export type ObjectWorkspaceModuleAvailability = 'available' | 'unavailable';

export interface WorkspaceReferenceOption {
  id: string;
  code: string;
  label: string;
}

/** A media reference option that also carries its file URL, so pickers can render a
 *  thumbnail (room photo picker §06, menu item media). `id`/`code` = media.id. */
export interface WorkspaceMediaOption extends WorkspaceReferenceOption {
  url: string;
}
