/**
 * Miro target adapter.
 * Implements the shared `TargetAdapter` seam for Miro by wrapping only the
 * Miro Web SDK touch points (board selection, image creation, in-place update).
 * The constructor takes a minimal structural board so it is unit-testable
 * without a live Miro session. No `any` — SDK surfaces are typed structurally.
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

const metadataNamespace = 'syncingboard';

/** Minimal structural view of the Miro SDK surface this adapter needs. */
export interface MiroBoardLike {
  viewport: {
    get(): Promise<{ x: number; y: number; width: number; height: number }>;
  };
  getSelection(): Promise<MiroWidgetLike[]>;
  getById(id: string): Promise<MiroWidgetLike | null>;
  createImage(opts: {
    url: string;
    title: string;
    x: number;
    y: number;
    width?: number;
  }): Promise<MiroWidgetLike>;
  ui?: {
    /** Miro SDK's `ui.on` returns void (no unsubscribe); lifecycle is the plugin window. */
    on(event: string, handler: (eventValue: unknown) => void): void;
  };
}

/** Minimal structural view of a Miro image widget. */
export interface MiroWidgetLike {
  id: string;
  title?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  getMetadata?(namespace?: string): Promise<unknown>;
  setMetadata?(namespace: string, value: unknown): Promise<void>;
  sync?(): Promise<void>;
}

interface SyncingboardMeta {
  fileKey?: string;
  nodeId?: string;
  nodeName?: string;
  format?: 'png' | 'svg';
  scale?: number;
  platform?: 'figma' | 'penpot';
}

const SYNC_META = 'syncingboard';
const DEFAULT_SCALE = 2;

export class MiroAdapter implements TargetAdapter {
  readonly name = 'miro';
  readonly capabilities: TargetCapabilities = {
    gif: true,
    video: true,
    vectorSvg: true,
    skipLockGuard: true,
    deselect: true,
    geometryPreserve: true,
    requiresOpen: false,
  };

  constructor(private readonly board: MiroBoardLike) {}

  /** The Miro target owns/generates its pairing (mirror behavior verified in code). */
  pairingHost(): string {
    return getOrCreatePairingId();
  }

  async getSelection(): Promise<FrameSelection[]> {
    const widgets = await this.board.getSelection();
    const out: FrameSelection[] = [];
    for (const w of widgets) {
      const meta = (await this.readMeta(w)) ?? undefined;
      out.push({
        hostId: w.id,
        key: `${meta?.fileKey ?? ''}|${meta?.nodeId ?? ''}`,
        title: meta?.nodeName ?? '',
        fileKey: meta?.fileKey ?? '',
        nodeId: meta?.nodeId ?? '',
        nodeName: meta?.nodeName ?? '',
        format: meta?.format === 'svg' ? 'svg' : 'png',
        scale: typeof meta?.scale === 'number' ? meta.scale : DEFAULT_SCALE,
        platform: meta?.platform === 'penpot' ? 'penpot' : 'figma',
      });
    }
    return out;
  }

  async createOrUpdate(placement: FramePlacement): Promise<TrackedNode> {
    const center = await this.viewportCenter();
    const x = placement.x ?? center.x;
    const y = placement.y ?? center.y;
    const title =
      placement.selection.title ||
      placement.selection.nodeName ||
      placement.selection.nodeId;

    const image = await this.board.createImage({
      url: placement.sourceUrl,
      title,
      x,
      y,
      width: placement.renderWidth,
    });

    let metadataSaved = true;
    let metadataError: string | undefined;
    try {
      await image.setMetadata?.(metadataNamespace, {
        fileKey: placement.selection.fileKey,
        nodeId: placement.selection.nodeId,
        nodeName: placement.selection.nodeName,
        format: placement.selection.format,
        scale: placement.selection.scale,
        ...placement.metadata,
      } satisfies SyncingboardMeta);
      await image.sync?.();
    } catch (err) {
      metadataSaved = false;
      metadataError = err instanceof Error ? err.message : String(err);
    }

    return {
      key: placement.selection.key,
      id: image.id,
      width: image.width,
      height: image.height,
      metadataSaved,
      metadataError,
    };
  }

  async adopt(id: string, meta: AdoptMeta): Promise<TrackedNode | null> {
    const img = await this.board.getById(id);
    if (!img) return null;
    if ('setMetadata' in img && typeof img.setMetadata === 'function') {
      const existing = (await img.getMetadata?.().catch(() => null)) as Record<
        string,
        unknown
      >;
      const existingMeta = existing?.syncingboard as
        | Record<string, unknown>
        | undefined;
      await img.setMetadata(metadataNamespace, {
        ...meta,
        ...(existingMeta?.width && typeof existingMeta.width === 'number'
          ? { width: existingMeta.width }
          : {}),
      } as SyncingboardMeta);
      await img.sync?.();
    }
    return {
      key: `${meta.fileKey}|${meta.nodeId}`,
      id,
      width: img.width,
      height: img.height,
    };
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const widget = await this.board.getById(id);
    if (!widget) return;
    widget.title = title;
    await widget.sync?.();
  }

  async updateNode(id: string, update: NodeUpdate): Promise<TrackedNode | null> {
    const widget = await this.board.getById(id);
    if (!widget) return null;
    if ('setMetadata' in widget && typeof widget.setMetadata === 'function') {
      const existing = (await widget.getMetadata?.().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const existingMeta = existing?.syncingboard as
        | Record<string, unknown>
        | undefined;
      await widget.setMetadata(metadataNamespace, {
        fileKey: update.fileKey,
        nodeId: update.nodeId,
        nodeName: update.nodeName,
        format: update.format,
        scale: update.scale,
        platform: update.platform,
        ...(existingMeta?.width ? { width: existingMeta.width } : {}),
        ...(existingMeta?.height ? { height: existingMeta.height } : {}),
      } as SyncingboardMeta);
      widget.title = update.title;
      await widget.sync?.();
    }
    return {
      key: `${update.fileKey}|${update.nodeId}`,
      id,
      width: widget.width,
      height: widget.height,
    };
  }

  async byId(id: string): Promise<TrackedNode | null> {
    const w = await this.board.getById(id);
    if (!w) return null;
    const meta = await this.readMeta(w);
    return {
      key: `${meta?.fileKey ?? ''}|${meta?.nodeId ?? ''}`,
      id: w.id,
      width: w.width,
      height: w.height,
    };
  }

  async getGeometry(id: string): Promise<{ width: number; height: number } | null> {
    const w = await this.board.getById(id);
    if (!w) return null;
    if (typeof w.width !== 'number' || typeof w.height !== 'number') return null;
    return { width: w.width, height: w.height };
  }

  selectionTrigger(cb: () => void): () => void {
    if (!this.board.ui) return () => {};
    this.board.ui.on('selection:update', cb);
    // Miro provides no unsubscribe handle; lifecycle is the plugin window.
    return () => {};
  }

  private async readMeta(w: MiroWidgetLike): Promise<SyncingboardMeta | null> {
    if (typeof w.getMetadata !== 'function') return null;
    try {
      const raw = await w.getMetadata(metadataNamespace);
      if (!raw || typeof raw !== 'object') return null;
      return raw as SyncingboardMeta;
    } catch {
      return null;
    }
  }

  private async viewportCenter(): Promise<{ x: number; y: number }> {
    try {
      const vp = await this.board.viewport.get();
      return { x: vp.x + vp.width / 2, y: vp.y + vp.height / 2 };
    } catch {
      return { x: 0, y: 0 };
    }
  }
}