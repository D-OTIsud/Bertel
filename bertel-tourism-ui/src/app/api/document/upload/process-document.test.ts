/** @jest-environment node */
import { validateDocument, MAX_DOCUMENT_INPUT_BYTES } from './process-document';
import { MediaProcessingError } from '../../media/upload/process-image';

const pdfBuffer = (extra = 'data') => Buffer.from(`%PDF-1.4\n${extra}`, 'latin1');

describe('validateDocument', () => {
  it('accepts a real PDF (correct MIME + %PDF- header) within the size cap', () => {
    expect(validateDocument({ buffer: pdfBuffer(), mimeType: 'application/pdf' })).toEqual({
      ext: 'pdf',
      mimeType: 'application/pdf',
    });
  });

  it('rejects a non-PDF MIME (images go through the image pipeline, not here)', () => {
    expect(() => validateDocument({ buffer: pdfBuffer(), mimeType: 'image/png' })).toThrow(MediaProcessingError);
  });

  it('rejects an oversize PDF', () => {
    const big = Buffer.concat([Buffer.from('%PDF-', 'latin1'), Buffer.alloc(MAX_DOCUMENT_INPUT_BYTES)]);
    expect(() => validateDocument({ buffer: big, mimeType: 'application/pdf' })).toThrow(/exceeds/);
  });

  it('rejects a spoofed PDF (application/pdf MIME but bytes are not %PDF-)', () => {
    const spoof = Buffer.from('<html>not a pdf</html>', 'latin1');
    expect(() => validateDocument({ buffer: spoof, mimeType: 'application/pdf' })).toThrow(/%PDF-/);
  });
});
