import { processImage } from '../../media/upload/process-image';
import type { VisionImage } from './provider';

/**
 * Image prep for /api/menu/extract: re-encode each carte image through the shared media pipeline
 * (resize ≤ 2000 px + strip EXIF/IPTC/XMP) before sending it to the third-party AI provider.
 * Stripping metadata matters here — carte photos may carry GPS/device EXIF and we forward bytes
 * to an external service. PDFs are rasterized to images CLIENT-side (browser pdf.js) so the route
 * only ever receives images and needs no native server rasterizer.
 */

export const VISION_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Hard cap on images per extraction (bounds provider cost; route reports truncation). */
export const MAX_VISION_IMAGES = 8;

export async function prepareVisionImage(buffer: Buffer, mimeType: string): Promise<VisionImage> {
  const processed = await processImage({ buffer, mimeType });
  return { mime: processed.mimeType, base64: processed.buffer.toString('base64') };
}
