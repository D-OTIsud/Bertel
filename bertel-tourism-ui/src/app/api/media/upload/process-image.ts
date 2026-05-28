import sharp from 'sharp';

export const MAX_DIMENSION_PX = 2000;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export interface ProcessImageInput {
  buffer: Buffer;
  mimeType: string;
}

export interface ProcessImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: AllowedMime;
}

export class MediaProcessingError extends Error {
  constructor(public readonly code: 'mime' | 'size' | 'decode', message: string) {
    super(message);
    this.name = 'MediaProcessingError';
  }
}

/**
 * Validate, resize-down to fit MAX_DIMENSION_PX on both axes, and strip all
 * metadata (EXIF, IPTC, XMP). Aspect ratio is preserved (sharp's default
 * `inside` fit). Pass-through for images already small enough.
 */
export async function processImage({ buffer, mimeType }: ProcessImageInput): Promise<ProcessImageResult> {
  // (resize-only first pass; MIME + size + strip added in next tasks)
  void mimeType; // declared for the public contract; consumed by validation tasks 6 & 7
  const pipeline = sharp(buffer).rotate(); // apply EXIF orientation before stripping

  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new MediaProcessingError('decode', 'Unable to read image dimensions.');
  }

  const needsResize = meta.width > MAX_DIMENSION_PX || meta.height > MAX_DIMENSION_PX;
  const finalPipeline = needsResize
    ? pipeline.resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
    : pipeline;

  const out = await finalPipeline.jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    mimeType: 'image/jpeg',
  };
}
