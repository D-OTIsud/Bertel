import { apiError } from './api-error';

export interface UploadMediaInput {
  file: File;
  objectId: string;
  accessToken: string;
}

export interface UploadedMedia {
  url: string;
  /** Pixel dimensions for images; null for videos (no server-side probe). */
  width: number | null;
  height: number | null;
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
    throw await apiError(response);
  }

  return (await response.json()) as UploadedMedia;
}
