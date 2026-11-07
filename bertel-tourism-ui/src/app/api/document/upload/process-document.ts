import { MediaProcessingError } from '../../media/upload/process-image';

// Justificatif documents: PDFs are stored AS-IS (validation only — no transform).
// Image justificatifs (scanned certificates) do NOT use this validator; they ride the
// shared image pipeline (process-image) so they are resized + EXIF-stripped like photos.
export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;
export const MAX_DOCUMENT_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB — matches the bucket cap.

// A real PDF starts with "%PDF-". The client `file.type` MIME string is spoofable and the
// bytes are stored as-is into a public bucket, so we verify the actual header (§71 E review).
const PDF_MAGIC = '%PDF-';

export interface ValidateDocumentInput {
  buffer: Buffer;
  mimeType: string;
}

export interface ValidatedDocument {
  ext: 'pdf';
  mimeType: 'application/pdf';
}

/** Validation-only gate for PDF justificatifs — stored as-is. Throws MediaProcessingError. */
export function validateDocument({ buffer, mimeType }: ValidateDocumentInput): ValidatedDocument {
  if (mimeType !== 'application/pdf') {
    throw new MediaProcessingError('mime', `Unsupported document MIME type: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_DOCUMENT_INPUT_BYTES) {
    throw new MediaProcessingError('size', `Document exceeds ${MAX_DOCUMENT_INPUT_BYTES} bytes`);
  }
  // Enforce the allow-list against the actual bytes, not the spoofable client MIME string.
  if (buffer.subarray(0, PDF_MAGIC.length).toString('latin1') !== PDF_MAGIC) {
    throw new MediaProcessingError('decode', 'Le fichier déclaré PDF ne commence pas par l’en-tête %PDF-.');
  }
  return { ext: 'pdf', mimeType: 'application/pdf' };
}
