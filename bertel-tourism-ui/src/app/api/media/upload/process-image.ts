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
  /**
   * Output encoding. Defaults to 'jpeg' (object media, avatars, portraits — a
   * flat photo). Pass 'preserve' to keep the source format (png→png, webp→webp,
   * jpeg→jpeg) so images with an ALPHA CHANNEL survive — a brand logo
   * (see /api/branding/logo/upload) must not be flattened onto an opaque JPEG
   * background. Metadata is still stripped on re-encode in both modes.
   */
  outputFormat?: 'jpeg' | 'preserve';
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
export async function processImage({ buffer, mimeType, maxDimension = MAX_DIMENSION_PX, outputFormat = 'jpeg' }: ProcessImageInput): Promise<ProcessImageResult> {
  // Messages en FRANÇAIS (chantier 2026-08-28 n°4) : ils remontent tels quels jusqu'à l'écran —
  // route.ts:95 les met dans `detail`, que le client affiche. Gravité 1 : ce sont eux que
  // l'utilisateur lit sous le champ d'upload, en `role="alert"`.
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new MediaProcessingError(
      'mime',
      `Format d'image non pris en charge (reçu : ${mimeType}). Formats acceptés : JPEG, PNG, WebP.`,
    );
  }
  if (buffer.byteLength > MAX_INPUT_BYTES) {
    throw new MediaProcessingError(
      'size',
      `Image trop volumineuse (max ${Math.round(MAX_INPUT_BYTES / (1024 * 1024))} Mo).`,
    );
  }
  const maxDim = Number.isFinite(maxDimension) && maxDimension > 0 ? Math.floor(maxDimension) : MAX_DIMENSION_PX;

  try {
    const pipeline = sharp(buffer).rotate(); // apply EXIF orientation before stripping

    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) {
      throw new MediaProcessingError('decode', "Les dimensions de l'image n'ont pas pu être lues : fichier corrompu ?");
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
    // 'preserve' keeps the decoded source format so an alpha channel survives
    // (a logo on a colored surface must stay transparent); 'jpeg' (default)
    // flattens to an opaque photo. Either way sharp strips metadata on re-encode.
    const encoded =
      outputFormat === 'preserve'
        ? meta.format === 'png'
          ? finalPipeline.png()
          : meta.format === 'webp'
            ? finalPipeline.webp()
            : finalPipeline.jpeg({ quality: 85 })
        : finalPipeline.jpeg({ quality: 85 });
    const out = await encoded.toBuffer({ resolveWithObject: true });
    const outMime: AllowedMime =
      out.info.format === 'png' ? 'image/png' : out.info.format === 'webp' ? 'image/webp' : 'image/jpeg';
    return {
      buffer: out.data,
      width: out.info.width,
      height: out.info.height,
      mimeType: outMime,
    };
  } catch (err) {
    if (err instanceof MediaProcessingError) throw err;
    // Le message brut de sharp est anglais et technique : il part au journal serveur, pas à
    // l'écran (il atteignait l'utilisateur via `detail`).
    console.warn('[process-image] échec sharp non mappé', err);
    throw new MediaProcessingError('decode', "Cette image n'a pas pu être traitée. Réessayez avec un autre fichier.");
  }
}
