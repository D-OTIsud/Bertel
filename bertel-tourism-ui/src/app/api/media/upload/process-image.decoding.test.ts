/** @jest-environment node */
import sharp from 'sharp';
import { processImage } from './process-image';

// Observe decoder entry while still exercising the installed native pipeline.
jest.mock('sharp', () => {
  const actual = jest.requireActual('sharp');
  return Object.assign(jest.fn((...args: unknown[]) => Reflect.apply(actual, undefined, args)), actual);
});

const nativeSharp = jest.requireActual<typeof sharp>('sharp');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');

beforeEach(() => jest.clearAllMocks());

test.each(['image/jpeg', 'image/png', 'image/webp'])('rejects SVG disguised as %s before selecting a native decoder', async (mimeType) => {
  await expect(processImage({ buffer: svg, mimeType })).rejects.toMatchObject({ code: 'decode' });
  expect(sharp).not.toHaveBeenCalled();
});

test('the SVG native loader is also blocked as defense in depth', async () => {
  await expect(nativeSharp(svg).metadata()).rejects.toThrow(/blocked|disabled|unsupported/i);
});

test('high-bit bytes cannot impersonate the RIFF/WEBP signature', async () => {
  const forged = Buffer.from([0xd2, 0xc9, 0xc6, 0xc6, 0, 0, 0, 0, 0xd7, 0xc5, 0xc2, 0xd0]);
  await expect(processImage({ buffer: forged, mimeType: 'image/webp' })).rejects.toMatchObject({ code: 'decode' });
  expect(sharp).not.toHaveBeenCalled();
});

test.each(['jpeg', 'png', 'webp'] as const)('still processes a genuine %s raster through the installed native decoder', async (format) => {
  const input = await nativeSharp({ create: { width: 12, height: 8, channels: 3, background: '#235678' } })
    .toFormat(format).toBuffer();
  const output = await processImage({ buffer: input, mimeType: `image/${format}` });
  expect(sharp).toHaveBeenCalledTimes(1);
  expect(output).toMatchObject({ width: 12, height: 8, mimeType: 'image/jpeg' });
  expect((await nativeSharp(output.buffer).metadata()).format).toBe('jpeg');
});

test('a supported raster with an imprecise declared raster MIME remains accepted', async () => {
  const input = await nativeSharp({ create: { width: 4, height: 3, channels: 3, background: '#456789' } }).jpeg().toBuffer();
  await expect(processImage({ buffer: input, mimeType: 'image/png' })).resolves.toMatchObject({ width: 4, height: 3 });
});
