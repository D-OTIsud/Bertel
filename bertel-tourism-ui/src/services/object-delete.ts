// §108 — client service. POST /api/objects/delete : exécute le RPC de suppression définitive
// en tant qu'appelant (superuser-gated) puis balaie les buckets media + documents.

export interface DeleteObjectInput {
  objectId: string;
  confirmName: string;
  accessToken: string;
}

export interface DeleteObjectResult {
  ok: boolean;
  report: Record<string, unknown>;
  mediaDeleted: string[];
  documentsDeleted: string[];
  storageError: string | null;
  /** True when the object was deleted but file cleanup was skipped (service-role key absent). */
  storageSkipped: boolean;
}

export async function requestObjectDeletion(input: DeleteObjectInput): Promise<DeleteObjectResult> {
  const response = await fetch('/api/objects/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.accessToken}` },
    body: JSON.stringify({ objectId: input.objectId, confirmName: input.confirmName }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  return (await response.json()) as DeleteObjectResult;
}
