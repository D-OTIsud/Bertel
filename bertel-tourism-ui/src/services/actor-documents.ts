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

async function readResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch {
      // Keep HTTP status fallback.
    }
    throw new Error(detail);
  }
  return await response.json() as T;
}
