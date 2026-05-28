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
 * Resize-down to fit MAX_DIMENSION_PX on both axes, apply EXIF rotation, and
 * strip all metadata (EXIF, IPTC, XMP) before re-encoding as JPEG q85.
 * MIME and size validation are added in Task 7. Aspect ratio preserved.
 * Pass-through for images already small enough — the `inside` fit with
 * `withoutEnlargement: true` guarantees no upscaling.
 */
export async function processImage({ buffer, mimeType }: ProcessImageInput): Promise<ProcessImageResult> {
  // (resize + metadata strip; MIME + size validation added in Task 7)
  void mimeType; // declared for the public contract; consumed by validation in task 7
  const pipeline = sharp(buffer).rotate(); // apply EXIF orientation before stripping

  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new MediaProcessingError('decode', 'Unable to read image dimensions.');
  }

  const needsResize = meta.width > MAX_DIMENSION_PX || meta.height > MAX_DIMENSION_PX;
  const finalPipeline = needsResize
    ? pipeline.resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
    : pipeline;

  // METADATA STRIPPING — defense in depth.
  // sharp >= 0.33 strips all metadata (EXIF, IPTC, XMP) by default on re-encode.
  // We intentionally DO NOT call `.withMetadata()` or `.keepMetadata()` here
  // because both opt INTO keeping metadata (verified against sharp 0.34.5
  // `lib/output.js`: `withMetadata` calls `keepMetadata()` internally).
  // The strip test (`processImage — metadata stripping`) is the regression guard:
  // if a future change ever adds `.withMetadata()` or upgrades sharp to a version
  // whose default keeps metadata, that test will fail loudly. See process-image.test.ts.
  const out = await finalPipeline.jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    mimeType: 'image/jpeg',
  };
}
