import { useState } from 'react';
import { Field } from '../primitives';
import { uploadDocument, type UploadedDocument } from '../../../services/document-upload';

interface Props {
  objectId: string;
  accessToken: string;
  onUploaded: (document: UploadedDocument) => void;
}

// PDF (attestations) + images (scans/photos of a plaque or certificate). The server
// re-encodes images to jpg and strips EXIF; PDFs are stored as-is.
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const HINT =
  'Justificatif PDF (attestation) ou image (photo/scan de plaque ou certificat). Max 10 Mo. Les métadonnées EXIF des images sont supprimées.';

/**
 * File picker that uploads a justificatif to /api/document/upload and reports the
 * created ref_document (id + url) to the parent for object_classification.document_id.
 */
export function DocumentUploadField({ objectId, accessToken, onUploaded }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // reset so picking the same file again still fires change
    if (!file) return;
    setStatus('uploading');
    setError(null);
    try {
      const result = await uploadDocument({ file, objectId, accessToken });
      onUploaded(result);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement.');
      setStatus('error');
    }
  }

  return (
    <Field label="Justificatif (facultatif)" hint={HINT}>
      <div className="media-upload-field">
        <input
          type="file"
          accept={ACCEPT}
          onChange={handleChange}
          disabled={status === 'uploading'}
          aria-label="Choisir un justificatif"
        />
        {status === 'uploading' && <p role="status">Téléversement en cours…</p>}
        {status === 'error' && error && <p role="alert" className="media-upload-field__error">{error}</p>}
      </div>
    </Field>
  );
}
