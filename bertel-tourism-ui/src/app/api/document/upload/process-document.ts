import { MediaProcessingError } from '../../media/upload/process-image';

// Justificatif documents: PDFs are stored AS-IS (validation only — no transform).
// Image justificatifs (scanned certificates) do NOT use this validator; they ride the
// shared image pipeline (process-image) so they are resized + EXIF-stripped like photos.
export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;
export const MAX_DOCUMENT_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB — matches the bucket cap.

export interface ValidateDocumentInput {
  mimeType: string;
  byteLength: number;
}

export interface ValidatedDocument {
  ext: 'pdf';
  mimeType: 'application/pdf';
}

/** Validation-only gate for PDF justificatifs — stored as-is. Throws MediaProcessingError. */
export function validateDocument({ mimeType, byteLength }: ValidateDocumentInput): ValidatedDocument {
  if (mimeType !== 'application/pdf') {
    throw new MediaProcessingError('mime', `Unsupported document MIME type: ${mimeType}`);
  }
  if (byteLength > MAX_DOCUMENT_INPUT_BYTES) {
    throw new MediaProcessingError('size', `Document exceeds ${MAX_DOCUMENT_INPUT_BYTES} bytes`);
  }
  return { ext: 'pdf', mimeType: 'application/pdf' };
}
