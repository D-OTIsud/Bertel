import { MediaProcessingError } from './process-image';

export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export type AllowedVideoMime = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

/** 100 MB — presentation clips, not raw footage. The bucket's own per-file limit
 *  (Supabase project setting) still applies and surfaces as a storage error. */
export const MAX_VIDEO_INPUT_BYTES = 100 * 1024 * 1024;

const EXT_BY_MIME: Record<AllowedVideoMime, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export interface ValidateVideoInput {
  mimeType: string;
  byteLength: number;
}

export interface ValidatedVideo {
  ext: string;
  mimeType: AllowedVideoMime;
}

/**
 * Validation-only gate for video uploads — videos are stored AS-IS.
 *
 * HONEST LIMITATION (vs the image pipeline): container metadata is NOT stripped
 * (MP4/MOV atoms can carry creation GPS, device info…) because we have no
 * server-side transcoder (sharp is image-only; no ffmpeg in the runtime).
 * Accepted for presentation videos pending a transcode pipeline — tracked in
 * the §05 review deferred list. The single-writer invariant (POST
 * /api/media/upload) and the RESTRICTIVE bucket policy fully apply.
 */
export function validateVideo({ mimeType, byteLength }: ValidateVideoInput): ValidatedVideo {
  if (!(ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new MediaProcessingError('mime', `Unsupported video MIME type: ${mimeType}`);
  }
  if (byteLength > MAX_VIDEO_INPUT_BYTES) {
    throw new MediaProcessingError('size', `Video exceeds ${MAX_VIDEO_INPUT_BYTES} bytes`);
  }
  return { ext: EXT_BY_MIME[mimeType as AllowedVideoMime], mimeType: mimeType as AllowedVideoMime };
}
