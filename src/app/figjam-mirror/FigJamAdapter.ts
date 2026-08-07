/**
 * FigJam target adapter.
 * Implements the shared `TargetAdapter` seam for FigJam by wrapping only the
 * Figma/FigJam Plugin API touch points (canvas selection, image placement via
 * createRectangle + createImageAsync IMAGE-fill, in-place pluginData re-target).
 *
 * FigJam differs from Miro: the plugin MUST stay open (requiresOpen = true),
 * SVG is rasterized into an IMAGE fill (vectorSvg = false), and there is no
 * server-side image PATCH — in-place updates re-assert the node's tracking
 * pluginData only. The canvas is served by the Figma Plugin API, so the
 * constructor takes a minimal structural `FigmaLike` to stay unit-testable.
 *
 * No `any` — every SDK surface is typed structurally or via type guards.
 */
import { getOrCreatePairingId } from '@/lib/sync/pairingId';
import type {
  AdoptMeta,
  FramePlacement,
  FrameSelection,
  NodeUpdate,
  TargetAdapter,
  TargetCapabilities,
  TrackedNode,
} from '@/lib/sync/targetTypes';

const metadataKey = 'syncingboard';

/** Minimal structural view of the Figma/FigJam Plugin API surface this adapter needs. */
export interface FigmaLike {
  createRectangle(): FigmaNodeLike;
  createImageAsync(urlOrHash: string): Promise<FigJamImageLike>;
  getNodeById(id: string): FigmaNodeLike | null;
  currentPage: {
    selection: FigmaNodeLike[];
    appendChild(node: FigmaNodeLike): FigmaNodeLike;
  };
  viewport?: {
    center: { x: number; y: number };
  };
  on?(event: string, handler: (event?: unknown) => void): void;
  off?(event: string, handler: (event?: unknown) => void): void;
}

/** Minimal structural view of a placed rectangle / FigJam node. */
export interface FigmaNodeLike {
  id: string;
  type: string;
  name?: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  fills?: (FigJamFillLike | null)[];
  setPluginData?(key: string, value: string): void;
  getPluginData?(key: string): string;
  remove?(): void;
}

/** The resolved image resource returned by `createImageAsync`. */
export interface FigJamImageLike {
  hash: string;
}

/** IMAGE paint authored onto a rectangle to display a rendered frame. */
export interface FigJamFillLike {
  type: 'IMAGE';
  imageHash: string;
  source: string;
  scaleMode?: 'FILL';
}

/** Tracking metadata persisted via node.setPluginData('syncingboard', …). */
export interface FigJamMeta {
  fileKey?: string;
  nodeId?: string;
  nodeName?: string;
  format?: 'png' | 'svg';
  scale?: number;
  platform?: 'figma' | 'penpot';
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_ASPECT = 0.75; // 4:3 fallback when no natural dimensions are known

export class FigJamAdapter implements TargetAdapter {
  readonly name = 'figjam';
  readonly capabilities: TargetCapabilities = {
    gif: true, // FigJam can author GIF/image nodes
    video: false, // prototype video playback not mirrored in FigJam
    vectorSvg: false, // SVG rasterized into an IMAGE fill
    skipLockGuard: false, // no locked-widget guard applicable in FigJam
    deselect: true,
    geometryPreserve: true,
    requiresOpen: true, // FigJam has no host REST: the plugin owns the canvas
  };

  constructor(private readonly figma: FigmaLike) {}

  /** FigJam target generates its own pairing key, mirroring Miro's target-owns model. */
  pairingHost(): string {
    return getOrCreatePairingId();
  }

  async getSelection(): Promise<FrameSelection[]> {
    const out: FrameSelection[] = [];
    for (const n of this.figma.currentPage.selection) {
      const meta = this.readMeta(n);
      if (!meta || !meta.fileKey || !meta.nodeId) continue;
      out.push({
        hostId: n.id,
        key: `${meta.fileKey}|${meta.nodeId}`,
        title: meta.nodeName ?? n.name ?? '',
        fileKey: meta.fileKey,
        nodeId: meta.nodeId,
        nodeName: meta.nodeName ?? '',
        format: meta.format === 'svg' ? 'svg' : 'png',
        scale: typeof meta.scale === 'number' ? meta.scale : 2,
        platform: meta.platform === 'penpot' ? 'penpot' : 'figma',
      });
    }
    return out;
  }

  async createOrUpdate(placement: FramePlacement): Promise<TrackedNode> {
    const start = this.center();
    const x = placement.x ?? start.x;
    const y = placement.y ?? start.y;
    const width = placement.renderWidth ?? placement.width ?? DEFAULT_WIDTH;
    const height = placement.height ?? Math.round(width * DEFAULT_ASPECT);

    const image = await this.figma.createImageAsync(placement.sourceUrl);

    const rect = this.figma.createRectangle();
    rect.x = x;
    rect.y = y;
    rect.name =
      placement.selection.title || placement.selection.nodeName || placement.selection.nodeId;
    rect.width = width;
    rect.height = height;
    rect.fills = [
      {
        type: 'IMAGE',
        imageHash: image.hash,
        source: image.hash,
        scaleMode: 'FILL',
      } satisfies FigJamFillLike,
    ];
    this.figma.currentPage.appendChild(rect);

    const meta: FigJamMeta = {
      fileKey: placement.selection.fileKey,
      nodeId: placement.selection.nodeId,
      nodeName: placement.selection.nodeName,
      format: placement.selection.format,
      scale: placement.selection.scale,
      platform: placement.selection.platform,
      ...placement.metadata,
    };
    let metadataSaved = true;
    let metadataError: string | undefined;
    try {
      this.writeMeta(rect, meta);
    } catch (err) {
      metadataSaved = false;
      metadataError = err instanceof Error ? err.message : String(err);
    }

    return {
      key: placement.selection.key,
      id: rect.id,
      width: rect.width,
      height: rect.height,
      metadataSaved,
      metadataError,
    };
  }

  async adopt(id: string, meta: AdoptMeta): Promise<TrackedNode | null> {
    const node = this.figma.getNodeById(id);
    if (!node) return null;
    const existing = this.readMeta(node);
    this.writeMeta(node, {
      ...meta,
      ...(existing?.width ? { width: existing.width } : {}),
    });
    return {
      key: `${meta.fileKey}|${meta.nodeId}`,
      id: node.id,
      width: node.width,
      height: node.height,
    };
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const node = this.figma.getNodeById(id);
    if (!node) return;
    node.name = title;
  }

  async updateNode(id: string, update: NodeUpdate): Promise<TrackedNode | null> {
    const node = this.figma.getNodeById(id);
    if (!node) return null;
    const existing = this.readMeta(node);
    this.writeMeta(node, {
      fileKey: update.fileKey,
      nodeId: update.nodeId,
      nodeName: update.nodeName,
      format: update.format,
      scale: update.scale,
      platform: update.platform,
      ...(existing?.width ? { width: existing.width } : {}),
      ...(existing?.height ? { height: existing.height } : {}),
    });
    node.name = update.title;
    return {
      key: `${update.fileKey}|${update.nodeId}`,
      id: node.id,
      width: node.width,
      height: node.height,
    };
  }

  async byId(id: string): Promise<TrackedNode | null> {
    const n = this.figma.getNodeById(id);
    if (!n) return null;
    const meta = this.readMeta(n);
    return {
      key: `${meta?.fileKey ?? ''}|${meta?.nodeId ?? ''}`,
      id: n.id,
      width: n.width,
      height: n.height,
    };
  }

  async getGeometry(id: string): Promise<{ width: number; height: number } | null> {
    const n = this.figma.getNodeById(id);
    if (!n) return null;
    if (typeof n.width !== 'number' || typeof n.height !== 'number') return null;
    return { width: n.width, height: n.height };
  }

  selectionTrigger(cb: () => void): () => void {
    if (!this.figma.on || !this.figma.off) return () => {};
    const handler = (): void => cb();
    this.figma.on('selectionchange', handler);
    return () => {
      this.figma.off?.('selectionchange', handler);
    };
  }

  private readMeta(n: FigmaNodeLike): FigJamMeta | null {
    if (typeof n.getPluginData !== 'function') return null;
    const raw = n.getPluginData(metadataKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as FigJamMeta;
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeMeta(n: FigmaNodeLike, meta: FigJamMeta): void {
    if (typeof n.setPluginData !== 'function') {
      throw new Error('node.setPluginData is not available on the returned FigJam node');
    }
    n.setPluginData(metadataKey, JSON.stringify(meta));
  }

  private center(): { x: number; y: number } {
    return this.figma.viewport?.center ?? { x: 0, y: 0 };
  }
}