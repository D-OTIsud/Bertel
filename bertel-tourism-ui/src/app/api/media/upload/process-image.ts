import sharp from 'sharp';

export const MAX_DIMENSION_PX = 2000;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export interface ProcessImageInput {
  buffer: Buffer;
  mimeType: string;
  /**
   * Max size (px) on both axes. Defaults to MAX_DIMENSION_PX (2000, object media).
   * Avatars pass a smaller value (see /api/avatar/upload) — a 2000px profile
   * picture is wasteful bandwidth in cards/emails.
   */
  maxDimension?: number;
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
 * Validate MIME type and input size, then resize-down to fit MAX_DIMENSION_PX
 * on both axes, apply EXIF rotation, and strip all metadata (EXIF, IPTC, XMP)
 * before re-encoding as JPEG q85. Aspect ratio preserved.
 * Pass-through for images already small enough — the `inside` fit with
 * `withoutEnlargement: true` guarantees no upscaling.
 * Throws MediaProcessingError with `code` in {'mime','size','decode'}.
 */
export async function processImage({ buffer, mimeType, maxDimension = MAX_DIMENSION_PX }: ProcessImageInput): Promise<ProcessImageResult> {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new MediaProcessingError('mime', `Unsupported MIME type: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_INPUT_BYTES) {
    throw new MediaProcessingError('size', `Input exceeds ${MAX_INPUT_BYTES} bytes`);
  }
  const maxDim = Number.isFinite(maxDimension) && maxDimension > 0 ? Math.floor(maxDimension) : MAX_DIMENSION_PX;

  try {
    const pipeline = sharp(buffer).rotate(); // apply EXIF orientation before stripping

    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) {
      throw new MediaProcessingError('decode', 'Unable to read image dimensions.');
    }

    const needsResize = meta.width > maxDim || meta.height > maxDim;
    const finalPipeline = needsResize
      ? pipeline.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
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
  } catch (err) {
    if (err instanceof MediaProcessingError) throw err;
    throw new MediaProcessingError('decode', err instanceof Error ? err.message : String(err));
  }
}
