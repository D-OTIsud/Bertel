export interface UploadMediaInput {
  file: File;
  objectId: string;
  accessToken: string;
}

export interface UploadedMedia {
  url: string;
  width: number;
  height: number;
  mimeType: string;
}

export async function uploadMedia({ file, objectId, accessToken }: UploadMediaInput): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  body.append('object_id', objectId);

  const response = await fetch('/api/media/upload', {
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

  return (await response.json()) as UploadedMedia;
}
