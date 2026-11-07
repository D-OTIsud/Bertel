import { apiError } from './api-error';

export interface ActorDocumentActionInput {
  actorId: string;
  documentId: string;
  accessToken: string;
}

export async function uploadActorDocument(input: {
  actorId: string;
  file: File;
  accessToken: string;
}): Promise<{ documentId: string; title: string }> {
  const body = new FormData();
  body.append('actor_id', input.actorId);
  body.append('file', input.file);
  const response = await fetch('/api/actor-document', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body,
  });
  return readResponse(response);
}

export async function getActorDocumentUrl(input: ActorDocumentActionInput): Promise<string> {
  const response = await fetch('/api/actor-document/url', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: input.actorId, documentId: input.documentId }),
  });
  const payload = await readResponse<{ url: string }>(response);
  return payload.url;
}

export async function deleteActorDocument(input: ActorDocumentActionInput): Promise<void> {
  const response = await fetch('/api/actor-document', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: input.actorId, documentId: input.documentId }),
  });
  await readResponse(response);
}

export async function promoteActorDocument(input: ActorDocumentActionInput & {
  objectId: string;
  roleCode: string;
  title: string;
}): Promise<{ documentId: string }> {
  const response = await fetch('/api/actor-document', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readResponse(response);
}

/** Helper MUTUALISÉ : sert createActorDocument, getActorDocumentUrl, deleteActorDocument,
 *  promoteActorDocument et le PATCH. Le corriger corrige les cinq d'un coup. */
async function readResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await apiError(response);
  }
  return await response.json() as T;
}
