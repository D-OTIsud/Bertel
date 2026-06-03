/** @jest-environment node */
import { GET } from './route';

describe('GET /api/health', () => {
  it('returns a healthy JSON response', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'bertel-tourism-ui',
    });
  });
});
