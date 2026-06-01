import { useState } from 'react';
import { Field } from '../primitives';
import { uploadMedia, type UploadedMedia } from '../../../services/media-upload';

interface Props {
  objectId: string;
  accessToken: string;
  onUploaded: (media: UploadedMedia) => void;
}

const UPLOAD_HINT = 'Les images sont automatiquement redimensionnées (max 2000 px) et leurs métadonnées EXIF supprimées avant publication.';

/**
 * File picker that uploads to /api/media/upload. The server resizes any image
 * larger than 2000 px and strips EXIF before storing it in the public bucket,
 * so what comes back is already publication-safe.
 */
export function MediaUploadField({ objectId, accessToken, onUploaded }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // reset so picking the same file again still fires change
    if (!file) return;
    setStatus('uploading');
    setError(null);
    try {
      const result = await uploadMedia({ file, objectId, accessToken });
      onUploaded(result);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement.');
      setStatus('error');
    }
  }

  return (
    <Field label="Fichier" hint={UPLOAD_HINT}>
      <div className="media-upload-field">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          disabled={status === 'uploading'}
          aria-label="Choisir un fichier"
        />
        {status === 'uploading' && <p role="status">Traitement en cours…</p>}
        {status === 'error' && error && (
          <p role="alert" className="media-upload-field__error">{error}</p>
        )}
      </div>
    </Field>
  );
}
