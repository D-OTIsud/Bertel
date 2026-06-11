import { useState } from 'react';
import { Field } from '../primitives';
import { uploadMedia, type UploadedMedia } from '../../../services/media-upload';

interface Props {
  objectId: string;
  accessToken: string;
  /** Drives the file-picker allow-list; mirrors the server-side MIME gates. */
  kind?: 'photo' | 'video';
  onUploaded: (media: UploadedMedia) => void;
}

const ACCEPT_BY_KIND = {
  photo: 'image/jpeg,image/png,image/webp',
  video: 'video/mp4,video/webm,video/quicktime',
} as const;

const HINT_BY_KIND = {
  photo: 'Les images sont automatiquement redimensionnées (max 2000 px) et leurs métadonnées EXIF supprimées avant publication.',
  video: 'Vidéo de présentation (MP4/WebM/MOV, max 100 Mo), stockée telle quelle — privilégiez un fichier déjà compressé.',
} as const;

/**
 * File picker that uploads to /api/media/upload. Images are resized and
 * EXIF-stripped server-side; videos are validated (MIME + size) and stored
 * as-is. What comes back is publication-ready.
 */
export function MediaUploadField({ objectId, accessToken, kind = 'photo', onUploaded }: Props) {
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
    <Field label="Fichier" hint={HINT_BY_KIND[kind]}>
      <div className="media-upload-field">
        <input
          type="file"
          accept={ACCEPT_BY_KIND[kind]}
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
