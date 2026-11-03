import * as nodeModule from 'node:module';
import path from 'node:path';
import { prepareVisionImage, MAX_VISION_IMAGES } from '../app/api/menu/extract/media-prep';
import type { VisionImage } from '../app/api/menu/extract/provider';

export const MAX_MENU_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_MENU_PDF_PAGES = 200;
const MAX_RENDER_EDGE = 2000;
export class MenuDocumentError extends Error {
  constructor(readonly code: string, readonly pageCount?: number) { super(code); }
}
function sniff(buffer: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' {
  if (!buffer.length || buffer.length > MAX_MENU_SOURCE_BYTES) throw new MenuDocumentError('size');
  if (buffer.subarray(0,5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buffer.subarray(0,4).toString('latin1') === 'RIFF' && buffer.subarray(8,12).toString('latin1') === 'WEBP') return 'image/webp';
  throw new MenuDocumentError('mime');
}
function selection(total: number, requested?: number[]) {
  const pages = requested ?? Array.from({length: total}, (_,i) => i + 1);
  if (!pages.length || pages.length > MAX_VISION_IMAGES || new Set(pages).size !== pages.length
    || pages.some(page => !Number.isInteger(page) || page < 1 || page > total)) {
    throw new MenuDocumentError(total > MAX_VISION_IMAGES && !requested ? 'select_pages' : 'invalid_pages', total);
  }
  return pages;
}
async function openPdf(buffer: Buffer) {
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Keep Node's runtime resolver: webpack cannot statically resolve a cwd-based
  // createRequire call and otherwise replaces it with undefined in standalone.
  const requireNode = nodeModule.createRequire(path.join(process.cwd(), 'package.json'));
  const packageRoot = path.dirname(requireNode.resolve('pdfjs-dist/package.json'));
  return pdf.getDocument({
    data: new Uint8Array(buffer), isEvalSupported: false, useWorkerFetch: false,
    disableAutoFetch: true, disableStream: true, disableFontFace: true,
    useSystemFonts: false, maxImageSize: 16_000_000, stopAtErrors: true,
    standardFontDataUrl: path.join(packageRoot, 'standard_fonts') + path.sep,
    cMapUrl: path.join(packageRoot, 'cmaps') + path.sep, cMapPacked: true,
  });
}
export interface MenuDocumentInspection {
  mimeType: string; pageCount: number; selectedPages: number[];
}
function fileError(error:unknown):never {
  if(error instanceof Error&&error.name==='PasswordException')throw new MenuDocumentError('password_protected');
  if(error instanceof Error&&['InvalidPDFException','FormatError'].includes(error.name))throw new MenuDocumentError('decode');
  throw error;
}
export async function inspectMenuDocument(buffer: Buffer, requested?: number[]): Promise<MenuDocumentInspection> {
  const mimeType = sniff(buffer);
  if (mimeType !== 'application/pdf') return { mimeType, pageCount: 1, selectedPages: selection(1, requested) };
  const task = await openPdf(buffer);
  try {
    const doc = await task.promise;
    if (doc.numPages < 1 || doc.numPages > MAX_MENU_PDF_PAGES) throw new MenuDocumentError('too_many_pages');
    return { mimeType, pageCount: doc.numPages, selectedPages: selection(doc.numPages, requested) };
  } catch(error) { fileError(error); } finally { await task.destroy(); }
}
interface CanvasPair {
  canvas: { toBuffer(type: 'image/jpeg', quality?: number): Buffer; width: number; height: number };
  context: CanvasRenderingContext2D;
}
interface NodeCanvasFactory {
  create(width: number, height: number): CanvasPair;
  destroy(pair: CanvasPair): void;
}
export async function renderMenuDocument(buffer: Buffer, inspection: MenuDocumentInspection, signal?: AbortSignal): Promise<VisionImage[]> {
  const mimeType = sniff(buffer);
  if (mimeType !== inspection.mimeType) throw new MenuDocumentError('source_changed');
  const selectedPages = selection(inspection.pageCount, inspection.selectedPages);
  if (signal?.aborted) throw new MenuDocumentError('aborted');
  if (mimeType !== 'application/pdf') return [await prepareVisionImage(buffer, mimeType)];
  const task = await openPdf(buffer);
  const cancelTask=()=>{void task.destroy().catch(()=>undefined);};
  signal?.addEventListener('abort',cancelTask,{once:true});
  try {
    if(signal?.aborted)throw new MenuDocumentError('aborted');
    const doc = await task.promise;
    if (doc.numPages !== inspection.pageCount) throw new MenuDocumentError('source_changed');
    const factory = doc.canvasFactory as NodeCanvasFactory;
    const images: VisionImage[] = [];
    for (const number of selectedPages) {
      if (signal?.aborted) throw new MenuDocumentError('aborted');
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      if (!Number.isFinite(base.width) || !Number.isFinite(base.height) || base.width <= 0 || base.height <= 0) {
        throw new MenuDocumentError('invalid_page_size');
      }
      const scale = Math.min(2, MAX_RENDER_EDGE / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const pair = factory.create(Math.max(1,Math.ceil(viewport.width)), Math.max(1,Math.ceil(viewport.height)));
      const render = page.render({ canvasContext: pair.context, viewport, background: 'rgb(255,255,255)' });
      const cancel = () => render.cancel();
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        await render.promise;
        images.push(await prepareVisionImage(pair.canvas.toBuffer('image/jpeg', 90), 'image/jpeg'));
      } finally {
        signal?.removeEventListener('abort', cancel); factory.destroy(pair); page.cleanup();
      }
    }
    return images;
  } catch(error) { if(signal?.aborted)throw new MenuDocumentError('aborted');return fileError(error); }
  finally { signal?.removeEventListener('abort',cancelTask);await task.destroy(); }
}
