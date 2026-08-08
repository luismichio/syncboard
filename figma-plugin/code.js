// SyncingBoard Figma Companion Plugin - Background script
// One package runs in both Figma (design companion) and FigJam (target mirror).
// Branch on figma.editorType so the design-file companion logic never runs in FigJam.
const EDITOR_TYPE = typeof figma.editorType === 'string' ? figma.editorType : 'figma';
const IS_FIGJAM = EDITOR_TYPE !== 'figma';

figma.showUI(__html__, {
  width: 320,
  height: 480,
  themeColors: true,
});

let globalFileKey = 'unknown';
let previewHost = '';

// Announce which editor this plugin runs in so the UI can render the right mode.
figma.ui.postMessage({ action: 'editor-type', editorType: EDITOR_TYPE });

// FigJam target: snapshot the currently tracked rectangles so the hosted
// mirror UI can render the sync list on open.
if (IS_FIGJAM) {
  try {
    figma.ui.postMessage({ action: 'figjam-state', tracked: figjamTrackedSummary() });
  } catch (e) {}
}

// Pre-load saved fileKey from storage in the background
try {
  figma.clientStorage.getAsync('syncingboard_file_key').then((val) => {
    if (val) globalFileKey = val;
  }).catch(() => {});
} catch (e) {}
// Pre-load saved preview host override (optional testing/self-host target)
try {
  figma.clientStorage.getAsync('syncingboard_preview_host').then((val) => {
    if (typeof val === 'string') previewHost = val;
  }).catch(() => {});
} catch (e) {}

// Normalize a preview host: trim, strip trailing slashes, keep the scheme.
// Bare hostnames default to https://. Invalid input returns '' (use default).
function normalizeHost(raw) {
  if (typeof raw !== 'string') return '';
  let host = raw.trim().replace(/\/+$/, '');
  if (!host) return '';
  let scheme = 'https://';
  const match = host.match(/^(https?:\/\/)/i);
  if (match) {
    scheme = match[1].toLowerCase();
    host = host.slice(match[1].length);
  }
  if (!/^[a-zA-Z0-9.-]+(:[0-9]{1,5})?$/.test(host)) return '';
  return scheme + host;
}

// Resolve the current file key: figma.fileKey > document metadata > clientStorage > memory
// FigJam files have no design fileKey, so a FigJam instance resolves to '' (target side).
function resolveFileKey() {
  if (IS_FIGJAM) return '';
  let docFileKey;
  try {
    docFileKey = figma.root.getPluginData('syncingboard_file_key');
  } catch (e) {
    // No plugin ID in manifest
  }
  return figma.fileKey || docFileKey || globalFileKey || 'unknown';
}

// ---- FigJam target mirror (editorType === 'figjam') -------------------------
// The FigJam board is a destination. These helpers create a tracked Rectangle
// with an IMAGE fill and update it in place (imageHash swap), deduplicated by
// fileKey|nodeId. They mirror FigJamAdapter (src/app/figjam-plugin/).
const SB_META_KEY = 'syncingboard';

function figjamKey(fileKey, nodeId) {
  return `${fileKey}|${nodeId}`;
}

function figjamAllTracked() {
  try {
    return figma.currentPage.findAll(function (n) {
      try {
        return typeof n.getPluginData === 'function' && !!n.getPluginData(SB_META_KEY);
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    return [];
  }
}

function figjamFindByKey(fileKey, nodeId) {
  return figjamAllTracked().find(function (n) {
    try {
      const meta = JSON.parse(n.getPluginData(SB_META_KEY) || '{}');
      return meta.fileKey === fileKey && meta.nodeId === nodeId;
    } catch (e) {
      return false;
    }
  }) || null;
}

function figjamMeta(node) {
  try {
    return JSON.parse(node.getPluginData(SB_META_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function figjamTrackedSummary() {
  return figjamAllTracked().map(function (n) {
    const meta = figjamMeta(n);
    return {
      id: n.id,
      key: meta.key || figjamKey(meta.fileKey || '', meta.nodeId || ''),
      fileKey: meta.fileKey || '',
      nodeId: meta.nodeId || '',
      name: meta.name || n.name || '',
    };
  });
}

// Place (create or in-place update) a rendered figure as an image Rectangle.
async function figjamPlace(payload) {
  // Whole-body try/catch: FigJam runs this inside the editor and any
  // synchronous throw (node lookup, createRectangle, appendChild...) would
  // otherwise silence the result entirely and leave the mirror waiting on
  // its watchdog. Always answer with a result.
  try {
    if (!payload || typeof payload.dataUrl !== 'string') {
      return { ok: false, error: 'missing dataUrl' };
    }
    const fileKey = String(payload.fileKey || '');
    const nodeId = String(payload.nodeId || '');
    if (!fileKey || !nodeId) {
      return { ok: false, error: 'missing fileKey/nodeId' };
    }
    const title = `${payload.name || nodeId} [FigmaSync|${fileKey}|${nodeId}]`;
    const existing = figjamFindByKey(fileKey, nodeId);

    let image;
    try {
      image = await figma.createImageAsync(payload.dataUrl);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `createImageAsync failed (${detail})` };
    }

    // Recover the PNG's own pixel size from the data-URL so the rect gets
    // the SOURCE frame's aspect ratio: FigJam's FILL crop then shows the
    // whole image instead of cropping to whatever size the rect held before
    // ("using the previous rectangle as crop area").
    const png = pngDimensions(payload.dataUrl);
    const scale = Number.isFinite(payload.scale) && payload.scale > 0 ? payload.scale : 1;
    const targetW = png ? Math.max(1, Math.round(png.width / scale)) : null;
    const targetH = png ? Math.max(1, Math.round(png.height / scale)) : null;

  if (existing) {
    // In-place update: match the rect to the source frame size, then swap
    // the IMAGE fill hash; keep identity + position.
    if (targetW && targetH) existing.resize(targetW, targetH);
    existing.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
    try {
      existing.setPluginData(SB_META_KEY, JSON.stringify({
        fileKey: fileKey, nodeId: nodeId, key: figjamKey(fileKey, nodeId),
        imageHash: image.hash, name: payload.name || figjamMeta(existing).name || '',
        format: payload.format || 'png', scale: payload.scale || 1,
      }));
    } catch (e) {}
    figma.currentPage.selection = [existing];
    return { ok: true, nodeId: existing.id, key: figjamKey(fileKey, nodeId), created: false };
  }

  const rect = figma.createRectangle();
  rect.name = title;
  const W = targetW || (Number.isFinite(payload.width) ? payload.width : 240);
  const H = targetH || (Number.isFinite(payload.height) ? payload.height : 160);
  rect.resize(W, H);
  if (figma.viewport && Number.isFinite(figma.viewport.center.x) && Number.isFinite(figma.viewport.center.y)) {
    rect.x = Math.round(figma.viewport.center.x - W / 2);
    rect.y = Math.round(figma.viewport.center.y - H / 2);
  }
  rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
  try {
    rect.setPluginData(SB_META_KEY, JSON.stringify({
      fileKey: fileKey, nodeId: nodeId, key: figjamKey(fileKey, nodeId),
      imageHash: image.hash,
      name: payload.name || '', format: payload.format || 'png', scale: payload.scale || 1,
    }));
  } catch (e) {}
  figma.currentPage.appendChild(rect);
  figma.currentPage.selection = [rect];
  return { ok: true, nodeId: rect.id, key: figjamKey(fileKey, nodeId), created: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `figjam-place failed (${detail})` };
  }
}

// Return { width, height } from a PNG data-URL (IHDR is always at bytes
// 16-23, big-endian). Falls back to null so callers keep their defaults.
function pngDimensions(dataUrl) {
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const bytes = figma.base64Decode(dataUrl.slice(comma + 1));
    if (bytes.length < 24) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = dv.getUint32(16);
    const height = dv.getUint32(20);
    if (width > 0 && height > 0 && width < 100000 && height < 100000) {
      return { width, height };
    }
  } catch (e) {}
  return null;
}

// Push the current file key to the UI so it can load the companion iframe
function pushFileKey() {
  figma.ui.postMessage({ action: 'file-key', fileKey: resolveFileKey() });
}

// Listen to selection changes on the active page
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    action: 'selection-changed-locally',
    data: selection[0]
      ? {
          id: selection[0].id,
          name: selection[0].name,
          fileKey: resolveFileKey(),
        }
      : null,
  });
});

// Message listener from UI
figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.action === 'ui-ready') {
    // Refresh saved fileKey from storage to keep the cache hot, then reply
    // so the UI can load the iframe with the resolved file key.
    try {
      const saved = await figma.clientStorage.getAsync('syncingboard_file_key');
      if (saved) globalFileKey = saved;
    } catch (e) {}
    pushFileKey();
    return;
  }

  if (msg.action === 'get-host-config') {
    figma.ui.postMessage({ action: 'host-config', previewHost });
    return;
  }

  if (msg.action === 'set-preview-host') {
    // Empty host = cleared (production default); invalid = ignored.
    const host = normalizeHost(msg.host);
    previewHost = host;
    try {
      if (host) {
        await figma.clientStorage.setAsync('syncingboard_preview_host', host);
      } else {
        await figma.clientStorage.deleteAsync('syncingboard_preview_host');
      }
    } catch (e) {}
    figma.ui.postMessage({ action: 'host-config', previewHost });
    return;
  }

  if (msg.action === 'link-file') {
    if (typeof msg.fileKey !== 'string') return;
    try {
      figma.root.setPluginData('syncingboard_file_key', msg.fileKey);
    } catch (e) {
      // No plugin ID in manifest - fall back to clientStorage
      await figma.clientStorage.setAsync('syncingboard_file_key', msg.fileKey);
    }
    globalFileKey = msg.fileKey;
    // Reload the iframe with the newly linked file key
    pushFileKey();
    return;
  }

  if (msg.action === 'figjam-place') {
    // Destination: place (create or in-place update) a rendered figure.
    const result = await figjamPlace(msg.payload);
    figma.ui.postMessage({
      action: 'figjam-place-result',
      requestId: msg.requestId,
      ...result,
    });
    return;
  }

  if (msg.action === 'figjam-list') {
    figma.ui.postMessage({ action: 'figjam-state', tracked: figjamTrackedSummary() });
    return;
  }

  if (msg.action === 'get-selection') {
    if (EDITOR_TYPE !== 'figma') {
      // FigJam is the destination: its own selection is not a source. The
      // source selection lives in the Figma design file (or a pasted link).
      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: null,
        error: 'No source selection yet — choose a frame in Figma Files, or paste a Figma frame link here (source-side relay comes with M3).',
      });
      return;
    }
    try {
      const selection = figma.currentPage.selection; // Synchronous read
      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: selection[0]
          ? {
              id: selection[0].id, // Keep raw ID with colons for Figma REST API
              name: selection[0].name,
              fileKey: resolveFileKey(),
            }
          : null,
        selectionCount: selection.length,
      });
    } catch (err) {
      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
