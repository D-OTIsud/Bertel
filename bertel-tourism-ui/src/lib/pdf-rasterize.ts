import type { ExtractImage } from '../services/menu-extract';

/**
 * Client-side PDF → page images for §06 carte AI extraction. Most OpenAI-compatible vision providers
 * can't take a PDF directly, so we rasterize in the BROWSER (pdf.js) — no native server rasterizer.
 * The worker is served from /public (copied from pdfjs-dist on install; re-copy on upgrade).
 * Renders up to `maxPages` pages to JPEG base64; the extraction route re-encodes/resizes them again.
 */

export const MAX_PDF_PAGES = 8;
const RENDER_SCALE = 2; // legible enough for menu text; the route resizes down to ≤ 2000 px

export async function rasterizePdfToImages(file: File, maxPages = MAX_PDF_PAGES): Promise<ExtractImage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    const count = Math.min(pdf.numPages, maxPages);
    const images: ExtractImage[] = [];
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2D indisponible');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const comma = dataUrl.indexOf(',');
      images.push({ mime: 'image/jpeg', base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl });
      page.cleanup();
    }
    return images;
  } finally {
    await pdf.destroy();
  }
}
