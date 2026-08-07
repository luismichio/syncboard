import { describe, it, expect } from 'vitest';
import { parseFigmaUrl } from './figmaUrlParser';

describe('parseFigmaUrl', () => {
  it('should parse a standard figma file URL with node-id', () => {
    const url = 'https://www.figma.com/file/abcdef123456/My-Design-File?node-id=10-20';
    const result = parseFigmaUrl(url);
    expect(result).toEqual({
      fileKey: 'abcdef123456',
      nodeId: '10:20',
    });
  });

  it('should parse a modern figma design URL with node-id', () => {
    const url = 'https://www.figma.com/design/XYZ987654321/App-Layout?node-id=5-12&t=randomToken';
    const result = parseFigmaUrl(url);
    expect(result).toEqual({
      fileKey: 'XYZ987654321',
      nodeId: '5:12',
    });
  });

  it('should return null for invalid URLs', () => {
    expect(parseFigmaUrl('')).toBeNull();
    expect(parseFigmaUrl('https://google.com')).toBeNull();
    expect(parseFigmaUrl('https://www.figma.com/file/abcdef123456/My-Design-File')).toBeNull(); // missing node-id
  });

  it('should handle URL encoding or trailing slashes', () => {
    const url = 'https://www.figma.com/design/abcdef123456/My-Design-File/?node-id=3-45';
    const result = parseFigmaUrl(url);
    expect(result).toEqual({
      fileKey: 'abcdef123456',
      nodeId: '3:45',
    });
  });
});
