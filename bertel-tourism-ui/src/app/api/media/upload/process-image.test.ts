/** @jest-environment node */
import sharp from 'sharp';
import { processImage } from './process-image';

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('processImage — resize', () => {
  it('passes through an image that already fits within 2000 px', async () => {
    const input = await makeImage(800, 600);
    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    // Pin the contract: PNG/WebP inputs are always re-encoded to JPEG
    // (route.ts later relies on the `.jpg` extension in `buildStoragePath`).
    expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
  });

  it('resizes a 3000×1500 image down so that the longest side is 2000', async () => {
    const input = await makeImage(3000, 1500);
    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1000);
  });

  it('resizes a 1500×3000 image down so that the longest side is 2000', async () => {
    const input = await makeImage(1500, 3000);
    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    expect(result.width).toBe(1000);
    expect(result.height).toBe(2000);
  });

  it('resizes a 2500×2500 square down to 2000×2000', async () => {
    const input = await makeImage(2500, 2500);
    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    expect(result.width).toBe(2000);
    expect(result.height).toBe(2000);
  });
});

describe('processImage — metadata stripping', () => {
  it('strips EXIF including GPS, Make/Model, and DateTimeOriginal', async () => {
    // Build a fixture with injected EXIF (IFD0 device tags, IFD2 GPS, IFD3 datetime).
    // sharp 0.34's `.withExif()` accepts an object keyed by IFD0/IFD1/IFD2/IFD3.
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withExif({
        IFD0: { Make: 'TestCam', Model: 'X-1', Software: 'Bertel-Test' },
        IFD2: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '43/1 25/1 30/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '5/1 30/1 0/1',
        },
        IFD3: { DateTimeOriginal: '2024:01:15 10:30:00' },
      })
      .jpeg()
      .toBuffer();

    // Sanity check: confirm the fixture itself carries EXIF before processing.
    // If sharp ever changes `.withExif()` semantics so the fixture has no EXIF
    // the strip assertion below would be vacuous — fail loudly instead.
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined();

    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.iptc).toBeUndefined();
    expect(outMeta.xmp).toBeUndefined();
  });
});
