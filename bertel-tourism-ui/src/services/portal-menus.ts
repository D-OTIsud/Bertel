/** Prepared M service only: no portal screen calls it until its separate design/activation. */
import { getApiClient } from '../lib/supabase';
import { readRecord } from '../lib/json-read';
import { useSessionStore } from '../store/session-store';
import type { ObjectWorkspaceMenusModule } from './object-workspace-parser';
import { buildMenusWritePayload, parseMenuWriteSnapshot, withMenusWriteSnapshot, type MenuWriteSnapshot } from './menu-write-contract';
import { withPendingMenuRequest } from './menu-save-request';
import { mapDatabaseError } from './api-error';

function portalMenuError(error: unknown): Error & { code?: string } {
  const code = typeof readRecord(error).code === 'string' ? String(readRecord(error).code) : undefined;
  if (code === 'PT409') {
    return Object.assign(new Error('Les menus ont changé. Rechargez la fiche pour les vérifier ; votre saisie est conservée.'), { code });
  }
  return Object.assign(mapDatabaseError(error, 'Impossible de confirmer les menus. Votre saisie est conservée.'), { code });
}

async function rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const client = getApiClient();
  if (!client) throw new Error('Connexion backend indisponible pour les menus.');
  const { data, error } = await client.schema('api').rpc(name, args);
  if (error) throw portalMenuError(error);
  return readRecord(data);
}

function portalSnapshot(value: unknown, objectId: string): MenuWriteSnapshot {
  const snapshot = parseMenuWriteSnapshot(value);
  if (snapshot.menus.some(row => row.object_id !== objectId || row.visibility !== 'public'
    || typeof row.write_token !== 'string' || !/^[0-9a-f]{64}$/.test(row.write_token))
    || snapshot.items.some(row => typeof row.write_token !== 'string' || !/^[0-9a-f]{64}$/.test(row.write_token)
      || !snapshot.menus.some(menu => menu.id === row.menu_id))) {
    throw new Error('Les menus n’ont pas pu être vérifiés. Rechargez la fiche ; votre saisie est conservée.');
  }
  return snapshot;
}

export async function getPortalMenus(objectId: string, references: ObjectWorkspaceMenusModule): Promise<ObjectWorkspaceMenusModule> {
  const result = await rpc('get_portal_menus_snapshot', { p_object_id: objectId });
  const snapshot = portalSnapshot(result, objectId);
  return withMenusWriteSnapshot({ ...references, mediaOptions: [], unavailableReason: null }, snapshot);
}

export async function publishPortalMenus(
  objectId: string,
  input: ObjectWorkspaceMenusModule,
  extractionOperationId: string | null = null,
): Promise<ObjectWorkspaceMenusModule> {
  if (input.unavailableReason) throw new Error(input.unavailableReason);
  const knownItems = new Set(input.menuWriteBaseline?.snapshot.items.map(row => row.id));
  if (input.items.some(menu => menu.items.some(item => !knownItems.has(item.recordId) && !item.name.trim()))) {
    throw new Error('Nommez les nouveaux plats avant de publier les menus ; votre saisie est conservée.');
  }
  const payload = { ...buildMenusWritePayload(input), extraction_operation_id: extractionOperationId };
  const result = await withPendingMenuRequest(useSessionStore.getState().userId, objectId, payload, async request => {
    const patch = Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'extraction_operation_id'));
    return rpc('publish_portal_menus', { p_object_id: objectId, p_payload: patch, p_extraction_operation_id: request.extraction_operation_id ?? null });
  }, response => { portalSnapshot(response.snapshot, objectId); }, {
    baselineReadId: input.menuWriteBaseline?.readId,
    resolve: async requestId => {
      const response = await rpc('get_portal_menu_write_receipt', { p_object_id: objectId, p_payload: { request_id: requestId } });
      return response.known === true ? response : null;
    },
  });
  return withMenusWriteSnapshot({ ...input, mediaOptions: [] }, portalSnapshot(result.snapshot, objectId));
}
