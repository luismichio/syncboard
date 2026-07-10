import { describe, it, expect } from 'vitest';
import { parsePenpotUrl } from './penpotUrlParser';

describe('parsePenpotUrl', () => {
  it('should parse standard SaaS Penpot URLs', () => {
    const url = 'https://design.penpot.app/#/workspace/a875ff7d-4786-8051-8001-c81b67270f2f/project/156c2d1b-252a-8066-8002-ebcb239dfc82/file/0c9a099a-7a56-8049-8002-c9a72cd16e45?page-id=2a7cf727-b5bd-8058-8002-c9ebfb90a214&node=fb7729f8-d45e-80c1-8002-e222a76f27be';
    const result = parsePenpotUrl(url);
    
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('0c9a099a-7a56-8049-8002-c9a72cd16e45');
    expect(result?.objectId).toBe('fb7729f8-d45e-80c1-8002-e222a76f27be');
  });

  it('should parse workspace query-based Penpot URLs', () => {
    const url = 'https://design.penpot.app/#/workspace?team-id=37d6e7bf-72f9-806c-8005-b3ba8874119b&file-id=72ad1239-4f5c-8115-8007-a9d627f5d053&page-id=72ad1239-4f5c-8115-8007-a9d627f5d054&layout=layers&board-id=0a5e60a8-2b30-80d6-8008-4ea07987740a';
    const result = parsePenpotUrl(url);
    
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('72ad1239-4f5c-8115-8007-a9d627f5d053');
    expect(result?.objectId).toBe('0a5e60a8-2b30-80d6-8008-4ea07987740a');
  });

  it('should parse self-hosted Penpot URLs', () => {
    const url = 'http://penpot.mycompany.local/#/workspace/a875ff7d-4786-8051-8001-c81b67270f2f/project/156c2d1b-252a-8066-8002-ebcb239dfc82/file/0c9a099a-7a56-8049-8002-c9a72cd16e45?node=fb7729f8-d45e-80c1-8002-e222a76f27be';
    const result = parsePenpotUrl(url);
    
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('0c9a099a-7a56-8049-8002-c9a72cd16e45');
    expect(result?.objectId).toBe('fb7729f8-d45e-80c1-8002-e222a76f27be');
  });

  it('should parse URLs lacking node/objectId and default to selection', () => {
    const url = 'https://design.penpot.app/#/workspace/a875ff7d-4786-8051-8001-c81b67270f2f/project/156c2d1b-252a-8066-8002-ebcb239dfc82/file/0c9a099a-7a56-8049-8002-c9a72cd16e45';
    const result = parsePenpotUrl(url);
    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('0c9a099a-7a56-8049-8002-c9a72cd16e45');
    expect(result?.objectId).toBe('selection');
  });

  it('should return null for URLs lacking fileId', () => {
    const url = 'https://design.penpot.app/#/workspace/a875/project/123?node=fb7729f8-d45e-80c1-8002-e222a76f27be';
    const result = parsePenpotUrl(url);
    expect(result).toBeNull();
  });

  it('should return null for invalid domain URLs', () => {
    const url = 'https://google.com';
    const result = parsePenpotUrl(url);
    expect(result).toBeNull();
  });
});
