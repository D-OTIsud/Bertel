import sharp from 'sharp';
import {
  ACTOR_IMAGE_MAX_DIMENSION_PX,
  ACTOR_PDF_MAX_BYTES,
  processActorDocumentBuffer,
} from './process-actor-document';

describe('actor document processing', () => {
  it('redimensionne une image dans 2 000 × 2 000 px en conservant son ratio', async () => {
    const source = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#4488aa' },
    }).jpeg().toBuffer();

    const result = await processActorDocumentBuffer(source, 'image/jpeg');
    const metadata = await sharp(result.buffer).metadata();

    expect(ACTOR_IMAGE_MAX_DIMENSION_PX).toBe(2000);
    expect(metadata.width).toBe(2000);
    expect(metadata.height).toBe(1000);
  });

  it('accepte un PDF de 5 Mo au maximum', async () => {
    const source = Buffer.concat([
      Buffer.from('%PDF-', 'latin1'),
      Buffer.alloc(ACTOR_PDF_MAX_BYTES - 5),
    ]);

    await expect(processActorDocumentBuffer(source, 'application/pdf')).resolves.toMatchObject({
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
  });

  it('refuse un PDF au-delà de 5 Mo', async () => {
    const source = Buffer.concat([
      Buffer.from('%PDF-', 'latin1'),
      Buffer.alloc(ACTOR_PDF_MAX_BYTES - 4),
    ]);

    await expect(processActorDocumentBuffer(source, 'application/pdf')).rejects.toThrow('5 Mo');
  });
});
