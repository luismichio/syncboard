import { describe, expect, it, vi } from 'vitest';
import { MiroAdapter, type MiroBoardLike, type MiroWidgetLike } from './MiroAdapter';

function widget(id: string, meta?: unknown): MiroWidgetLike {
  const base: MiroWidgetLike & { setMetadata?: unknown; sync?: unknown } = {
    id,
    width: 100,
    height: 60,
  };
  base.getMetadata = (ns: string) =>
    Promise.resolve(ns === 'syncingboard' ? (meta ?? undefined) : undefined);
  base.setMetadata = () => Promise.resolve();
  base.sync = () => Promise.resolve();
  return base;
}

function makeBoard(getSelectionWidgets: MiroWidgetLike[]): {
  board: MiroBoardLike;
  createImageSpy: ReturnType<typeof vi.fn>;
} {
  const createImageSpy = vi.fn(
    async (opts: { url: string; title: string; x: number; y: number }) =>
      widget('img1', { fileKey: 'f1', nodeId: 'n1' }),
  );
  const board: MiroBoardLike = {
    viewport: {
      get: async () => ({ x: 0, y: 0, width: 1000, height: 800 }),
    },
    getSelection: async () => getSelectionWidgets,
    getById: async (id) => getSelectionWidgets.find((w) => w.id === id) ?? null,
    createImage: createImageSpy,
    ui: {
      on: () => () => {},
    },
  };
  return { board, createImageSpy };
}

describe('MiroAdapter (TargetAdapter seam)', () => {
  it('owns the pairing host like the Miro target does', () => {
    const { board } = makeBoard([]);
    const a = new MiroAdapter(board);
    expect(a.pairingHost()).toMatch(/^sb_/);
  });

  it('normalizes the board selection into target-agnostic FrameSelection[]', async () => {
    const w = widget('w1', {
      fileKey: 'f1',
      nodeId: 'n:1',
      nodeName: 'Frame Head',
      format: 'png',
      scale: 2,
      platform: 'figma',
    });
    const { board } = makeBoard([w]);
    const a = new MiroAdapter(board);
    const sel = await a.getSelection();
    expect(sel).toHaveLength(1);
    expect(sel[0]).toMatchObject({
      hostId: 'w1',
      key: 'f1|n:1',
      fileKey: 'f1',
      nodeId: 'n:1',
      nodeName: 'Frame Head',
      format: 'png',
      scale: 2,
      platform: 'figma',
    });
  });

  it('creates an image at viewport center and returns a tracked node', async () => {
    const { board, createImageSpy } = makeBoard([]);
    const a = new MiroAdapter(board);
    const node = await a.createOrUpdate({
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
      width: 100,
      height: 60,
    });
    expect(node).toMatchObject({ key: 'f9|n9', id: 'img1' });
    expect(createImageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://image/9', title: 'Screen', x: 500, y: 400 }),
    );
  });

  it('resolves byId and returns geometry', async () => {
    const w = widget('w1', {
      fileKey: 'f1',
      nodeId: 'n:1',
      nodeName: 'Head',
      format: 'png',
      scale: 2,
      platform: 'figma',
    });
    const { board } = makeBoard([w]);
    const a = new MiroAdapter(board);
    expect((await a.byId('w1'))?.id).toBe('w1');
    expect(await a.getGeometry('w1')).toEqual({ width: 100, height: 60 });
  });

  it('updates node metadata + title in place via updateNode (preserves natural dimensions)', async () => {
    const setMetadataSpy = vi.fn(async (_namespace: string, _value: unknown) => {});
    const w: MiroWidgetLike = {
      id: 'w1',
      title: 'old-title',
      width: 100,
      height: 60,
      getMetadata: async () => ({ syncingboard: { width: 200, height: 120 } }),
      setMetadata: setMetadataSpy,
      sync: vi.fn(() => Promise.resolve()),
    };
    const board: MiroBoardLike = {
      viewport: { get: async () => ({ x: 0, y: 0, width: 0, height: 0 }) },
      getSelection: async () => [],
      getById: async () => w,
      createImage: async () => w,
      ui: { on: () => {} },
    };
    const a = new MiroAdapter(board);
    const res = await a.updateNode('w1', {
      nodeName: 'New Screen',
      fileKey: 'f1',
      nodeId: 'n:1',
      format: 'png',
      scale: 2,
      platform: 'figma',
      title: 'New Screen [FigmaSync|f1|n:1]',
    });
    expect(res?.id).toBe('w1');
    expect(w.title).toBe('New Screen [FigmaSync|f1|n:1]');
    expect(w.sync).toHaveBeenCalled();
    // natural dimensions preserved from existing metadata
    const call = setMetadataSpy.mock.calls[0];
    expect(call[0]).toBe('syncingboard');
    expect(call[1]).toMatchObject({ nodeName: 'New Screen', width: 200, height: 120 });
  });

  it('adopts a selected image (metadata write) and re-asserts title via updateTitle', async () => {
    const setMetadataSpy = vi.fn(async (_n: string, _v: unknown) => {});
    const w: MiroWidgetLike = {
      id: 'w2',
      width: 90,
      height: 70,
      getMetadata: async () => ({ syncingboard: { width: 200 } }),
      setMetadata: setMetadataSpy,
      sync: vi.fn(() => Promise.resolve()),
    };
    const board: MiroBoardLike = {
      viewport: { get: async () => ({ x: 0, y: 0, width: 0, height: 0 }) },
      getSelection: async () => [],
      getById: async () => w,
      createImage: async () => w,
      ui: { on: () => {} },
    };
    const a = new MiroAdapter(board);
    const adopted = await a.adopt('w2', {
      fileKey: 'f2',
      nodeId: 'n:2',
      nodeName: 'Retargeted',
      format: 'png',
      scale: 1,
      platform: 'penpot',
    });
    expect(adopted?.id).toBe('w2');
    expect(setMetadataSpy.mock.calls[0][1]).toMatchObject({
      fileKey: 'f2',
      platform: 'penpot',
      width: 200, // natural width preserved
    });
    await a.updateTitle('w2', 'Retargeted [PenpotSync|f2|n:2]');
    expect(w.title).toBe('Retargeted [PenpotSync|f2|n:2]');
  });

  it('exposes capabilities (Miro is full-fidelity, no REST-open requirement)', () => {
    const { board } = makeBoard([]);
    const a = new MiroAdapter(board);
    expect(a.capabilities).toMatchObject({
      gif: true,
      video: true,
      vectorSvg: true,
      requiresOpen: false,
    });
  });
});