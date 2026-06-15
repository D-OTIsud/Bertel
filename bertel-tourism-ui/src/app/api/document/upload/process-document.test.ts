/** @jest-environment node */
import { validateDocument, MAX_DOCUMENT_INPUT_BYTES } from './process-document';
import { MediaProcessingError } from '../../media/upload/process-image';

describe('validateDocument', () => {
  it('accepts a PDF within the size cap', () => {
    expect(validateDocument({ mimeType: 'application/pdf', byteLength: 1000 })).toEqual({
      ext: 'pdf',
      mimeType: 'application/pdf',
    });
  });

  it('rejects a non-PDF MIME (images go through the image pipeline, not here)', () => {
    expect(() => validateDocument({ mimeType: 'image/png', byteLength: 1000 })).toThrow(MediaProcessingError);
  });

  it('rejects an oversize PDF', () => {
    expect(() => validateDocument({ mimeType: 'application/pdf', byteLength: MAX_DOCUMENT_INPUT_BYTES + 1 })).toThrow(
      /exceeds/,
    );
  });
});
