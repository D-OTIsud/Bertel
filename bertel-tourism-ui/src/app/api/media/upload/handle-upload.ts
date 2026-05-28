import { randomUUID } from 'node:crypto';
import { processImage, type ProcessImageResult } from './process-image';

export interface StorageUploadOk {
  ok: true;
  publicUrl: string;
}
export interface StorageUploadErr {
  ok: false;
  error: string;
}
export type StorageUploadResult = StorageUploadOk | StorageUploadErr;

/**
 * Abstraction over Supabase Storage so the orchestrator can be tested
 * without hitting the network. The real implementation lives in route.ts.
 */
export interface StorageUploader {
  upload(path: string, buffer: Buffer, contentType: string): Promise<StorageUploadResult>;
}

export interface HandleMediaUploadInput {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  objectId: string;
  uploader: StorageUploader;
}

export interface UploadedMedia {
  url: string;
  width: number;
  height: number;
  mimeType: string;
}

function buildStoragePath(objectId: string): string {
  // Use a uuid so users cannot guess or collide; .jpg because processImage normalises to jpeg.
  return `${objectId}/${randomUUID()}.jpg`;
}

export async function handleMediaUpload(input: HandleMediaUploadInput): Promise<UploadedMedia> {
  if (!input.objectId || typeof input.objectId !== 'string') {
    throw new Error('object_id is required');
  }
  const processed: ProcessImageResult = await processImage({
    buffer: input.fileBuffer,
    mimeType: input.mimeType,
  });
  const path = buildStoragePath(input.objectId);
  const upload = await input.uploader.upload(path, processed.buffer, processed.mimeType);
  if (!upload.ok) {
    throw new Error(`Storage upload failed: ${upload.error}`);
  }
  return {
    url: upload.publicUrl,
    width: processed.width,
    height: processed.height,
    mimeType: processed.mimeType,
  };
}
