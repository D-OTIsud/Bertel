import {
  type ObjectWorkspaceSustainabilityModule,
  type ObjectWorkspaceTagsModule,
} from '../object-workspace-parser';
import { toRpcUuid, toNullableText } from './input';

/** Pure builder for the api.save_object_workspace_sustainability payload (P1.3 contributor fork). */
export function buildSustainabilityRpcPayload(input: ObjectWorkspaceSustainabilityModule): Record<string, unknown> {
  return {
    actions: input.categories.flatMap((category) =>
      category.actions
        .filter((action) => action.selected)
        .map((action) => ({
          action_id: toRpcUuid(action.id),
          action_code: action.code,
          category_code: category.code,
          note: toNullableText(action.note),
          document_id: toRpcUuid(action.documentId),
        })),
    ),
  };
}



/** Pure builder for the api.save_object_workspace_tags payload (P1.3 contributor fork).
 *  Per-object save persists ONLY which tags are displayed + their order (tag_link rows +
 *  position). Color is GLOBAL per tag (ref_tag.color) and is written by api.set_tag_color,
 *  not here. Label is read from ref_tag at load time (never persisted per-object). */
export function buildTagsRpcPayload(input: ObjectWorkspaceTagsModule): Record<string, unknown> {
  return {
    tags: input.displayed.map((tag) => ({
      tag_id: toRpcUuid(tag.tagId),
      slug: tag.slug,
    })),
  };
}
