import { describe, expect, it, vi } from 'vitest';
import {
  FigJamAdapter,
  type FigJamFillLike,
  type FigJamMeta,
  type FigmaLike,
  type FigmaNodeLike,
} from './FigJamAdapter';

function node(id: string, meta?: FigJamMeta): FigmaNodeLike {
  let payload = meta ? JSON.stringify(meta) : '';
  const n: FigmaNodeLike = {
    id,
    type: 'RECTANGLE',
    name: '',
    width: 100,
    height: 60,
    x: 0,
    y: 0,
    fills: [],
    getPluginData: (key: string) => (key === 'syncingboard' ? payload : ''),
    setPluginData: (key: string, value: string) => {
      if (key === 'syncingboard') payload = value;
    },
  };
  return n;
}

function makeFigma(ctx: FigmaNodeLike[]): {
  figma: FigmaLike;
  createImageSpy: ReturnType<typeof vi.fn>;
  appendSpy: ReturnType<typeof vi.fn>;
  registry: FigmaNodeLike[];
} {
  const registry: FigmaNodeLike[] = [...ctx];
  const createRectangleSpy = vi.fn(() => {
    const rect = node(`rect${registry.length + 1}`);
    registry.push(rect);
    return rect;
  });
  const createImageSpy = vi.fn(async (url: string) => ({ hash: `img-${url}` }));
  const appendSpy = vi.fn(() => {});
  const figma: FigmaLike = {
    createRectangle() {
      return createRectangleSpy() as FigmaNodeLike;
    },
    createImageAsync: createImageSpy as FigmaLike['createImageAsync'],
    getNodeById: (id: string) => registry.find((r) => r.id === id) ?? null,
    currentPage: {
      selection: ctx,
      appendChild: appendSpy as unknown as FigmaLike['currentPage']['appendChild'],
    },
    viewport: { center: { x: 500, y: 400 } },
    on: vi.fn(),
    off: vi.fn(),
  };
  return { figma, createImageSpy, appendSpy, registry };
}

function metaFrame(extra?: Partial<FigJamMeta>): FigJamMeta {
  return {
    fileKey: 'f1',
    nodeId: 'n:1',
    nodeName: 'Frame Head',
    format: 'png',
    scale: 2,
    platform: 'figma',
    ...extra,
  };
}

describe('FigJamAdapter (TargetAdapter seam)', () => {
  it('owns the pairing host like the target does (getOrCreatePairingId)', () => {
    const { figma } = makeFigma([]);
    const a = new FigJamAdapter(figma);
    expect(a.pairingHost()).toMatch(/^sb_/);
  });

  it('normalizes the FigJam selection into target-agnostic FrameSelection[]', async () => {
    const sel = node('n1', metaFrame());
    const { figma } = makeFigma([sel]);
    const a = new FigJamAdapter(figma);
    const out = await a.getSelection();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      hostId: 'n1',
      key: 'f1|n:1',
      fileKey: 'f1',
      nodeId: 'n:1',
      nodeName: 'Frame Head',
      format: 'png',
      scale: 2,
      platform: 'figma',
    });
  });

  it('places an IMAGE fill at viewport center and returns a tracked node', async () => {
    const { figma, createImageSpy, registry } = makeFigma([]);
    const a = new FigJamAdapter(figma);
    const tracked = await a.createOrUpdate({
      selection: {
        hostId: '',
        key: 'f9|n9',
        title: '',
        fileKey: 'f9',
        nodeId: 'n9',
        nodeName: 'Screen',
        format: 'png',
        scale: 2,
        platform: 'figma',
      },
      sourceUrl: 'http://image/9',
      width: 400,
      height: 300,
    });
    expect(tracked).toMatchObject({ key: 'f9|n9', width: 400, height: 300 });
    expect(createImageSpy).toHaveBeenCalledWith('http://image/9');
    const placed = registry.find((r) => r.id === tracked.id);
    expect(placed?.x).toBe(500);
    expect(placed?.y).toBe(400);
    const fill = placed?.fills?.[0] as FigJamFillLike | null;
    expect(fill?.type).toBe('IMAGE');
    expect(fill?.imageHash).toBe('img-http://image/9');
  });

  it('resolves byId and returns geometry', async () => {
    const n = node('n1', metaFrame());
    const { figma } = makeFigma([n]);
    const a = new FigJamAdapter(figma);
    expect((await a.byId('n1'))?.id).toBe('n1');
    expect(await a.getGeometry('n1')).toEqual({ width: 100, height: 60 });
  });

  it('updates node metadata + title in place via updateNode (preserves dimensions)', async () => {
    const n = node('n3', metaFrame({ width: 200, height: 120 }));
    const { figma } = makeFigma([n]);
    const a = new FigJamAdapter(figma);
    const res = await a.updateNode('n3', {
      nodeName: 'New Screen',
      fileKey: 'f1',
      nodeId: 'n:3',
      format: 'png',
      scale: 2,
      platform: 'figma',
      title: 'New Screen [FigmaSync|f1|n:3]',
    });
    expect(res?.id).toBe('n3');
    expect(n.name).toBe('New Screen [FigmaSync|f1|n:3]');
    const saved = JSON.parse(n.getPluginData?.('syncingboard') ?? '') as FigJamMeta;
    expect(saved).toMatchObject({ nodeName: 'New Screen', width: 200, height: 120 });
  });

  it('adopts a selected node (pluginData write) and re-asserts title', async () => {
    const n = node('n4', metaFrame({ width: 200 }));
    const { figma } = makeFigma([n]);
    const a = new FigJamAdapter(figma);
    const adopted = await a.adopt('n4', {
      fileKey: 'f2',
      nodeId: 'n:2',
      nodeName: 'Retargeted',
      format: 'svg',
      scale: 1,
      platform: 'penpot',
    });
    expect(adopted?.id).toBe('n4');
    const saved = JSON.parse(n.getPluginData?.('syncingboard') ?? '') as FigJamMeta;
    expect(saved).toMatchObject({ fileKey: 'f2', platform: 'penpot', width: 200 });
    await a.updateTitle('n4', 'Retargeted [PenpotSync|f2|n:2]');
    expect(n.name).toBe('Retargeted [PenpotSync|f2|n:2]');
  });

  it('exposes FigJam capabilities (open-required, SVG rasterized)', () => {
    const { figma } = makeFigma([]);
    const a = new FigJamAdapter(figma);
    expect(a.capabilities).toMatchObject({
      gif: true,
      video: false,
      vectorSvg: false,
      requiresOpen: true,
    });
  });
});