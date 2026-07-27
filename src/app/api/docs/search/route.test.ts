import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /api/docs/search', () => {
  it('returns empty results array when query parameter is missing or empty', async () => {
    const request = new Request('http://localhost:3000/api/docs/search');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.results).toEqual([]);
  });

  it('returns matching documentation results for valid search query', async () => {
    const request = new Request('http://localhost:3000/api/docs/search?q=stateless');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThan(0);

    // Verify search result object shape
    const firstMatch = json.results[0];
    expect(firstMatch).toHaveProperty('slug');
    expect(firstMatch).toHaveProperty('title');
    expect(firstMatch).toHaveProperty('score');
  });

  it('correctly handles search query with section deep-links', async () => {
    const request = new Request('http://localhost:3000/api/docs/search?q=rate');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.results.length).toBeGreaterThan(0);

    const matchWithSection = json.results.find((r: { sectionId?: string }) => r.sectionId);
    if (matchWithSection) {
      expect(typeof matchWithSection.sectionId).toBe('string');
    }
  });
});
