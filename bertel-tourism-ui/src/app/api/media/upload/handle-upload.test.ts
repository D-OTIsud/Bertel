/** @jest-environment node */
import sharp from 'sharp';
import { handleMediaUpload, type StorageUploader, type StorageUploadResult } from './handle-upload';

async function jpg(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: '#444' } }).jpeg().toBuffer();
}

function fakeUploader(overrides?: Partial<StorageUploader>): StorageUploader {
  return {
    upload: jest.fn(
      async (path: string): Promise<StorageUploadResult> => ({
        ok: true,
        publicUrl: `https://example.test/storage/${path}`,
      }),
    ),
    ...overrides,
  };
}

describe('handleMediaUpload', () => {
  it('returns the public URL and processed dimensions on success', async () => {
    const uploader = fakeUploader();
    const result = await handleMediaUpload({
      fileBuffer: await jpg(),
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      objectId: 'obj-123',
      uploader,
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.url).toMatch(/^https:\/\/example\.test\/storage\/obj-123\/.+\.jpg$/);
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it('propagates a MediaProcessingError when MIME is invalid', async () => {
    const uploader = fakeUploader();
    await expect(
      handleMediaUpload({
        fileBuffer: Buffer.from('x'),
        filename: 'logo.svg',
        mimeType: 'image/svg+xml',
        objectId: 'obj-123',
        uploader,
      }),
    ).rejects.toMatchObject({ code: 'mime' });
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('stores a video as-is (no transform) under a typed extension, with null dimensions', async () => {
    const uploader = fakeUploader();
    const bytes = Buffer.from('fake-mp4-bytes');
    const result = await handleMediaUpload({
      fileBuffer: bytes,
      filename: 'presentation.mp4',
      mimeType: 'video/mp4',
      objectId: 'obj-123',
      uploader,
    });
    expect(result.url).toMatch(/^https:\/\/example\.test\/storage\/obj-123\/.+\.mp4$/);
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.mimeType).toBe('video/mp4');
    // the buffer must be passed through untouched (no sharp, no re-encode)
    const call = (uploader.upload as jest.Mock).mock.calls[0];
    expect(call[1]).toBe(bytes);
    expect(call[2]).toBe('video/mp4');
  });

  it('rejects a non-allowed video container with code mime', async () => {
    const uploader = fakeUploader();
    await expect(
      handleMediaUpload({
        fileBuffer: Buffer.from('x'),
        filename: 'clip.avi',
        mimeType: 'video/x-msvideo',
        objectId: 'obj-123',
        uploader,
      }),
    ).rejects.toMatchObject({ code: 'mime' });
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('returns an error when uploader reports failure', async () => {
    const uploader: StorageUploader = {
      upload: jest.fn(async (): Promise<StorageUploadResult> => ({ ok: false, error: 'bucket missing' })),
    };
    await expect(
      handleMediaUpload({
        fileBuffer: await jpg(),
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        objectId: 'obj-123',
        uploader,
      }),
    ).rejects.toThrow(/bucket missing/);
  });
});
