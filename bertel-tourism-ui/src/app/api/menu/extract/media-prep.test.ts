import sharp from 'sharp';
import { prepareVisionImage, VISION_IMAGE_MIMES, MAX_VISION_IMAGES } from './media-prep';

describe('prepareVisionImage', () => {
  it('re-encodes an image to a base64 JPEG (resize + EXIF strip via the shared pipeline)', async () => {
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer();

    const out = await prepareVisionImage(png, 'image/png');

    expect(out.mime).toBe('image/jpeg');
    expect(out.base64.length).toBeGreaterThan(0);
    // round-trips back to a decodable image
    const meta = await sharp(Buffer.from(out.base64, 'base64')).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('rejects a non-image buffer', async () => {
    await expect(prepareVisionImage(Buffer.from('not an image'), 'image/png')).rejects.toBeTruthy();
  });
});

describe('vision image constants', () => {
  it('allows the documented image mimes and caps the count', () => {
    expect(VISION_IMAGE_MIMES).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/webp']));
    expect(MAX_VISION_IMAGES).toBeGreaterThanOrEqual(1);
  });
});
