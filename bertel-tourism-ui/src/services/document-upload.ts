export interface UploadDocumentInput {
  file: File;
  objectId: string;
  accessToken: string;
}

export interface UploadedDocument {
  documentId: string;
  url: string;
  title: string;
}

/**
 * Upload a justificatif (PDF or image scan) to /api/document/upload. The route
 * authorizes the caller per object, stores the file in the `documents` bucket, and
 * creates a ref_document row — the returned id goes on object_classification.document_id.
 */
export async function uploadDocument({ file, objectId, accessToken }: UploadDocumentInput): Promise<UploadedDocument> {
  const body = new FormData();
  body.append('file', file);
  body.append('object_id', objectId);

  const response = await fetch('/api/document/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  return (await response.json()) as UploadedDocument;
}
