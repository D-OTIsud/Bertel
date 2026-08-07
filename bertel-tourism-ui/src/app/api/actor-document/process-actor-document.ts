import { processImage, MediaProcessingError } from '../media/upload/process-image';
import { validateDocument } from '../document/upload/process-document';

export const ACTOR_IMAGE_MAX_DIMENSION_PX = 2000;
export const ACTOR_PDF_MAX_BYTES = 5 * 1024 * 1024;

/** Traitement commun des fichiers privés d'un acteur, testable sans charger la route Next.js. */
export async function processActorDocumentBuffer(buffer: Buffer, mimeType: string) {
  if (mimeType === 'application/pdf') {
    if (buffer.byteLength > ACTOR_PDF_MAX_BYTES) {
      throw new MediaProcessingError('size', `Le PDF dépasse la limite de ${ACTOR_PDF_MAX_BYTES} octets (5 Mo).`);
    }
    validateDocument({ buffer, mimeType });
    return { buffer, mimeType: 'application/pdf' as const, extension: 'pdf' as const };
  }
  // Pipeline partagé avec les autres images : rotation EXIF, suppression des métadonnées,
  // réencodage et redimensionnement proportionnel dans une boîte de 2 000 × 2 000 px.
  const processed = await processImage({ buffer, mimeType, maxDimension: ACTOR_IMAGE_MAX_DIMENSION_PX });
  return { buffer: processed.buffer, mimeType: processed.mimeType, extension: 'jpg' as const };
}
