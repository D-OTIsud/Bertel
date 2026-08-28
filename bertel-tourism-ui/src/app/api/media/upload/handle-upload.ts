import { randomUUID } from 'node:crypto';
import { processImage, type ProcessImageResult } from './process-image';
import { validateVideo } from './process-video';

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
  /** Pixel dimensions for images; null for videos (no server-side probe). */
  width: number | null;
  height: number | null;
  mimeType: string;
}

function buildStoragePath(objectId: string, ext: string): string {
  // Use a uuid so users cannot guess or collide; the extension reflects the
  // stored bytes (.jpg for processed images, the container ext for videos).
  return `${objectId}/${randomUUID()}.${ext}`;
}

/**
 * Échec d'écriture Storage (chantier 2026-08-28 n°4). Message FR pour l'écran, cause technique au
 * journal serveur — elle atteignait l'utilisateur via `detail`. Factorisé parce que les deux
 * branches (vidéo et image) portaient un DOUBLON textuel exact : corriger l'une laissait l'autre
 * en anglais, sans qu'aucun test ne rougisse.
 */
function storageUploadError(cause: unknown): Error {
  console.warn('[media/upload] échec Storage', cause);
  return new Error("Le fichier n'a pas pu être enregistré. Réessayez ; si le problème persiste, contactez l'administrateur.");
}

export async function handleMediaUpload(input: HandleMediaUploadInput): Promise<UploadedMedia> {
  if (!input.objectId || typeof input.objectId !== 'string') {
    // Erreur de programmation (la route valide déjà) : jamais destinée à l'écran, mais on ne
    // laisse pas d'anglais sur un chemin qui remonte en `detail`.
    throw new Error('Aucune fiche cible fournie.');
  }

  // Videos: validation-only, stored AS-IS (no transform — see process-video.ts
  // for the documented metadata-strip limitation).
  if (input.mimeType.startsWith('video/')) {
    const video = validateVideo({ mimeType: input.mimeType, byteLength: input.fileBuffer.byteLength });
    const path = buildStoragePath(input.objectId, video.ext);
    const upload = await input.uploader.upload(path, input.fileBuffer, video.mimeType);
    if (!upload.ok) {
      throw storageUploadError(upload.error);
    }
    return { url: upload.publicUrl, width: null, height: null, mimeType: video.mimeType };
  }

  const processed: ProcessImageResult = await processImage({
    buffer: input.fileBuffer,
    mimeType: input.mimeType,
  });
  const path = buildStoragePath(input.objectId, 'jpg');
  const upload = await input.uploader.upload(path, processed.buffer, processed.mimeType);
  if (!upload.ok) {
    throw storageUploadError(upload.error);
  }
  return {
    url: upload.publicUrl,
    width: processed.width,
    height: processed.height,
    mimeType: processed.mimeType,
  };
}
