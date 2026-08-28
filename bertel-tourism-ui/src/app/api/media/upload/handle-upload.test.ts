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

  // Chantier 2026-08-28 n°4 — assertion RETOURNÉE : elle épinglait le relais de la cause
  // technique Storage (« bucket missing ») jusqu'à l'écran, via `detail`.
  //
  // Et surtout : le message existait en DOUBLON textuel exact sur les branches IMAGE et VIDÉO,
  // avec une indentation différente. Une correction naïve n'en touchait qu'une, et AUCUN test ne
  // rougissait — la première passe de ce chantier est effectivement tombée dans le piège. Les
  // DEUX branches sont donc éprouvées ici, séparément.
  it.each([
    ['image', 'image/jpeg', 'photo.jpg'],
    ['vidéo', 'video/mp4', 'clip.mp4'],
  ])('branche %s : un échec Storage rend un message FR, jamais la cause technique', async (_label, mimeType, filename) => {
    const uploader: StorageUploader = {
      upload: jest.fn(async (): Promise<StorageUploadResult> => ({ ok: false, error: 'bucket missing' })),
    };
    const promise = handleMediaUpload({
      fileBuffer: await jpg(),
      filename,
      mimeType,
      objectId: 'obj-123',
      uploader,
    });
    await expect(promise).rejects.toThrow(/n'a pas pu être enregistré/);
    await expect(promise).rejects.not.toThrow(/bucket missing/);
  });
});
