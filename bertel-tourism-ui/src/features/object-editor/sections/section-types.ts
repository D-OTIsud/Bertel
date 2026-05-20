import type { ObjectEditorState } from '../useObjectEditorState';
import type { ArchetypeCode } from '../archetypes';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

/** Props shared by every editor section: the editor state + the resource's permissions. */
export interface SectionProps {
  editor: ObjectEditorState;
  permissions: ObjectWorkspacePermissions;
  objectId?: string;
  /** Canonical type code (HOT, RES, …) for labels in identity / type-specific UI. */
  typeCode?: string;
  archetype?: ArchetypeCode;
  folded?: boolean;
}
