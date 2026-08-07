/**
 * Target-agnostic types for the SyncingBoard whiteboard target layer.
 * Shared by every target adapter (Miro, FigJam, future Mural/Whiteboard/Excalidraw).
 * No framework or SDK dependency — pure, framework-free types.
 */

export interface NodeUpdate {
  nodeName: string;
  fileKey: string;
  nodeId: string;
  format: 'png' | 'svg';
  scale: number;
  platform: 'figma' | 'penpot';
  /** Fully built title tag (target-agnostic: the caller computes it). */
  title: string;
}

export interface AdoptMeta {
  fileKey: string;
  nodeId: string;
  nodeName: string;
  format: 'png' | 'svg';
  scale: number;
  platform: 'figma' | 'penpot';
}

export interface FrameSelection {
  /** Target-native identity of the selected frame/node (Miro widget id / FigJam node id). */
  hostId: string;
  /** Source frame key identity, e.g. `${fileKey}|${nodeId}`. */
  key: string;
  title: string;
  fileKey: string;
  nodeId: string;
  nodeName: string;
  format: 'png' | 'svg';
  scale: number;
  platform: 'figma' | 'penpot';
}

export interface FramePlacement {
  /** The frame metadata that produced this placement. */
  selection: FrameSelection;
  /** Materialized image payload (data URL for Miro; image content for FigJam). */
  sourceUrl: string;
  width?: number;
  height?: number;
  /** Optional target-specific node dimensions to author alongside (e.g. Miro displayWidth). */
  renderWidth?: number;
  /** Target coordinates (viewport-centered placement). */
  x?: number;
  y?: number;
  /** Target-neutral metadata passthrough the adapter writes verbatim (e.g. Penpot platform/geometry). */
  metadata?: Record<string, unknown>;
}

export interface TrackedNode {
  /** Placement key used for in-place update (stable across refreshes). */
  key: string;
  /** Target-native id (Miro widget id / FigJam node id). */
  id: string;
  width?: number;
  height?: number;
  /** Whether the node's metadata write succeeded (Miro `setMetadata`/`sync`). */
  metadataSaved?: boolean;
  /** Message when metadata write failed (placement itself succeeded). */
  metadataError?: string;
}

export interface TargetCapabilities {
  /** Whether the target supports animated GIF nodes. */
  gif: boolean;
  /** Whether the target supports video nodes (prototype animations). */
  video: boolean;
  /** Whether SVG stays true-vector (Miro yes; FigJam rasterizes → false). */
  vectorSvg: boolean;
  /** Whether skip/Locked-widget guard is applicable. */
  skipLockGuard: boolean;
  /** Whether items can be deselected from the sync list. */
  deselect: boolean;
  /** Whether explicit geometry preservation is applicable. */
  geometryPreserve: boolean;
  /** Whether the plugin MUST stay open on the board (no target REST) — FigJam true, Miro false. */
  requiresOpen: boolean;
}

export interface TargetAdapter {
  readonly name: string;
  readonly capabilities: TargetCapabilities;
  /** Read the target board's current selection, normalized to FrameSelection[]. */
  getSelection(): Promise<FrameSelection[]>;
  /** Create or in-place update an image node from a rendered frame payload. */
  createOrUpdate(placement: FramePlacement): Promise<TrackedNode>;
  /** In-place update metadata/title of an already-placed node (keeps its id). */
  updateNode(id: string, update: NodeUpdate): Promise<TrackedNode | null>;
  /** Re-target an existing node's tracking metadata (adoption step of replace-selected). */
  adopt(id: string, meta: AdoptMeta): Promise<TrackedNode | null>;
  /** Re-assert a node's title after a server-side rename (title via SDK to avoid encoding drift). */
  updateTitle(id: string, title: string): Promise<void>;
  /** Resolve a previously placed node by its target-native id (host app tracks key↔id). */
  byId(id: string): Promise<TrackedNode | null>;
  /** Read a placed node's geometry (for preserve-size). */
  getGeometry(id: string): Promise<{ width: number; height: number } | null>;
  /** The target owns the pairing host (getOrCreatePairingId) — mirror of Miro. */
  pairingHost(): string;
  /** Register the target's selection-change trigger; returns an unsubscribe fn. */
  selectionTrigger(cb: () => void): () => void;
}