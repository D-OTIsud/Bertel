/** @jest-environment node */

import { GET } from './route';

describe('GET /api/app-version', () => {
  it('returns public write compatibility metadata without caching', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body).toEqual({ minimumClientVersion: 1, writeContractVersion: 1 });
    expect(JSON.stringify(body)).not.toMatch(/secret|token|key/i);
  });
});
