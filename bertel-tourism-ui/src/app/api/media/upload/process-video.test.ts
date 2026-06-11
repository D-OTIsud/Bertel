/** @jest-environment node */
import { validateVideo, ALLOWED_VIDEO_MIME_TYPES, MAX_VIDEO_INPUT_BYTES } from './process-video';

describe('validateVideo', () => {
  it('accepts the allowed video MIME types and maps them to a storage extension', () => {
    expect(ALLOWED_VIDEO_MIME_TYPES).toEqual(expect.arrayContaining(['video/mp4', 'video/webm']));
    expect(validateVideo({ mimeType: 'video/mp4', byteLength: 1024 })).toEqual({ ext: 'mp4', mimeType: 'video/mp4' });
    expect(validateVideo({ mimeType: 'video/webm', byteLength: 1024 })).toEqual({ ext: 'webm', mimeType: 'video/webm' });
    expect(validateVideo({ mimeType: 'video/quicktime', byteLength: 1024 })).toEqual({ ext: 'mov', mimeType: 'video/quicktime' });
  });

  it('rejects a non-allowed video MIME with code mime', () => {
    expect(() => validateVideo({ mimeType: 'video/x-msvideo', byteLength: 1024 })).toThrow(
      expect.objectContaining({ code: 'mime' }),
    );
  });

  it('rejects an oversized video with code size', () => {
    expect(() => validateVideo({ mimeType: 'video/mp4', byteLength: MAX_VIDEO_INPUT_BYTES + 1 })).toThrow(
      expect.objectContaining({ code: 'size' }),
    );
  });
});
