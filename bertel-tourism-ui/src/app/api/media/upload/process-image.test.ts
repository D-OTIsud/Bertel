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
});
