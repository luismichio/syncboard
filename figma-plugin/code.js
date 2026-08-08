// SyncingBoard Figma Companion Plugin - Background script
// One package runs in both Figma (design companion) and FigJam (target mirror).
// Branch on figma.editorType so the design-file companion logic never runs in FigJam.
const EDITOR_TYPE = typeof figma.editorType === 'string' ? figma.editorType : 'figma';

// FigJam editor: give the mirror a taller plugin window so its cards + footer
// fit without scrollbars. The Figma design sidebar keeps its default height.
if (EDITOR_TYPE === 'figjam') {
  try {
    figma.ui.resize(360, 720);
  } catch (e) {}
}
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
  return figjamFindAllByKey(fileKey, nodeId)[0] || null;
}

// Duplicates of a rect share the pluginData key but are separate nodes;
// syncing must update ALL of them in place (the mirror counts them as one
// frame, and copies stay in sync like Miro's in-place updates).
function figjamFindAllByKey(fileKey, nodeId) {
  try {
    return figjamAllTracked().filter(function (n) {
      try {
        const meta = JSON.parse(n.getPluginData(SB_META_KEY) || '{}');
        return meta.fileKey === fileKey && meta.nodeId === nodeId;
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    return [];
  }
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
      format: meta.format || 'png',
      scale: meta.scale || 1,
      platform: meta.platform || 'figma',
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

    const existingAll = figjamFindAllByKey(fileKey, nodeId);
    // Selection-driven default: update ONLY the instances the caller names.
    // Sync tab sends the selected nodeIds; "update all copies" (allCopies)
    // opts into every instance of the key.
    const targetNodes =
      payload.allCopies
        ? existingAll
        : (Array.isArray(payload.nodeIds) && payload.nodeIds.length > 0
            ? existingAll.filter((n) => payload.nodeIds.includes(n.id))
            : existingAll);
    // "Keep canvas size": never resize, the FILL crop stays by design.
    const keepSize = payload.preserveSize === true;
    let image;
    try {
      image = await figma.createImageAsync(payload.dataUrl);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `createImageAsync failed (${detail})` };
    }

    // Recover the PNG's own pixel size from the data-URL. The exported PNG
    // is already scaled by the render request (design size x scale), so the
    // rect gets exactly those pixels: scale=2 visibly doubles the canvas
    // object while staying crisp. SVG has no pixels — parse its width/height
    // attributes (design size) and multiply by scale for the same intent.
    const isSvg = String(payload.format || 'png').toLowerCase() === 'svg';
    const scale = Number.isFinite(payload.scale) && payload.scale > 0 ? payload.scale : 1;
    let targetW = null;
    let targetH = null;
    if (isSvg) {
      const svg = svgDimensions(payload.dataUrl);
      if (svg) {
        targetW = Math.max(1, Math.round(svg.width * scale));
        targetH = Math.max(1, Math.round(svg.height * scale));
      }
    } else {
      const png = pngDimensions(payload.dataUrl);
      if (png) {
        targetW = Math.max(1, Math.round(png.width));
        targetH = Math.max(1, Math.round(png.height));
      }
    }

  if (targetNodes.length > 0) {
    // In-place update: only the requested instances are resized + re-filled.
    for (const existing of targetNodes) {
      // Keep the user's crop position: carry the previous FILL transform over
      // so re-syncing does not reset the image inside the rectangle.
      let prevTransform;
      try {
        const prevFill = existing.fills && existing.fills[0];
        if (prevFill && prevFill.type === 'IMAGE') prevTransform = prevFill.imageTransform;
      } catch (e) {}
      if (!keepSize && targetW && targetH) existing.resize(targetW, targetH);
      const newFill = { type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' };
      if (prevTransform) newFill.imageTransform = prevTransform;
      existing.fills = [newFill];
      try {
        existing.setPluginData(SB_META_KEY, JSON.stringify({
          fileKey: fileKey, nodeId: nodeId, key: figjamKey(fileKey, nodeId),
          imageHash: image.hash, name: payload.name || figjamMeta(existing).name || '',
          format: payload.format || 'png',
          scale: payload.scale || 1,
          platform: payload.platform || 'figma',
        }));
      } catch (e) {}
    }
    figma.currentPage.selection = targetNodes;
    return { ok: true, nodeId: targetNodes[0].id, key: figjamKey(fileKey, nodeId), created: false, updated: targetNodes.length };
  }

  const rect = figma.createRectangle();
  rect.name = title;
  const W = targetW || (Number.isFinite(payload.width) ? payload.width : 240);
  const H = targetH || (Number.isFinite(payload.height) ? payload.height : 160);
  if (!keepSize) rect.resize(W, H);
  if (figma.viewport && Number.isFinite(figma.viewport.center.x) && Number.isFinite(figma.viewport.center.y)) {
    rect.x = Math.round(figma.viewport.center.x - W / 2);
    rect.y = Math.round(figma.viewport.center.y - H / 2);
  }
  const newFill = { type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' };
  rect.fills = [newFill];
  try {
    rect.setPluginData(SB_META_KEY, JSON.stringify({
      fileKey: fileKey, nodeId: nodeId, key: figjamKey(fileKey, nodeId),
      imageHash: image.hash,
      name: payload.name || '', format: payload.format || 'png', scale: payload.scale || 1,
      platform: payload.platform || 'figma',
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

// Parse dimension info out of an SVG data-URL: width/height attributes
// first, then the viewBox. Returns design-space {width, height} or null.
function svgDimensions(dataUrl) {
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const isB64 = !/^data:image\/svg[^;]*(;charset[^;]*)?;base64,/i.test(dataUrl.slice(0, comma + 1));
    let text;
    if (isB64 || dataUrl.slice(0, comma).indexOf('base64') > -1) {
      const bytes = figma.base64Decode(dataUrl.slice(comma + 1));
      text = String.fromCharCode.apply(null, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    } else {
      text = decodeURIComponent(dataUrl.slice(comma + 1));
    }
    const head = text.slice(0, 4096);
    const num = /\b(width|height)=["']([\d.]+)["']/g;
    const w = /\bwidth=["']([\d.]+)/.exec(head);
    const h = /\bheight=["']([\d.]+)/.exec(head);
    let width = w ? parseFloat(w[1]) : NaN;
    let height = h ? parseFloat(h[1]) : NaN;
    if (!isFinite(width) || !isFinite(height)) {
      const vb = /\bviewBox=["']([-\d.\s]+)["']/.exec(head);
      if (vb && vb[1]) {
        const parts = vb[1].trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts.every((n) => isFinite(n))) {
          if (!isFinite(width)) width = parts[2];
          if (!isFinite(height)) height = parts[3];
        }
      }
    }
    if (isFinite(width) && isFinite(height) && width > 0 && height > 0 && width < 100000 && height < 100000) {
      return { width, height };
    }
  } catch (e) {}
  return null;
}

// Push the current file key to the UI so it can load the companion iframe
function pushFileKey() {
  figma.ui.postMessage({ action: 'file-key', fileKey: resolveFileKey() });
}

// Selection state sent to the mirror: ONLY the currently selected tracked
// rectangles (the Sync tab + badge are selection-driven, like Miro).
// The summary carries each node's persisted format/scale/platform so the
// mirror cards round-trip the group settings.
function figjamNodeSummary(n) {
  const meta = figjamMeta(n);
  return {
    id: n.id,
    key: meta.key || figjamKey(meta.fileKey || '', meta.nodeId || ''),
    fileKey: meta.fileKey || '',
    nodeId: meta.nodeId || '',
    name: meta.name || n.name || '',
    format: meta.format || 'png',
    scale: meta.scale || 1,
    platform: meta.platform || 'figma',
  };
}

function figjamSelectionSummary() {
  const selection = figma.currentPage.selection || [];
  return selection
    .filter(function (n) {
      try {
        return typeof n.getPluginData === 'function' && !!n.getPluginData(SB_META_KEY);
      } catch (e) {
        return false;
      }
    })
    .map(figjamNodeSummary);
}

// Listen to selection changes on the active page: the mirror's Sync tab is
// SELECTION-DRIVEN (like Miro) — the badge counts selected tracked mirrors
// and cards show only the selected ones.
figma.on('selectionchange', () => {
  figma.ui.postMessage({ action: 'figjam-selection', tracked: figjamSelectionSummary() });
  // M3 relay-pull: in the Figma design editor, also stream the current
  // selection to the companion UI so it can publish it to the pairing
  // channel (the FigJam mirror fills its Import card live).
  if (EDITOR_TYPE === 'figma') {
    const selection = figma.currentPage.selection;
    figma.ui.postMessage({
      action: 'selection-changed-locally',
      data: selection[0]
        ? { name: selection[0].name, id: selection[0].id, fileKey: resolveFileKey() }
        : null,
    });
  }
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

  if (msg.action === 'get-selection-state') {
    figma.ui.postMessage({ action: 'figjam-selection', tracked: figjamSelectionSummary() });
    return;
  }

  // Persist per-instance render settings (format/scale) from the mirror's
  // Sync tab group controls; propagate extends to sibling copies of the key.
  if (msg.action === 'figjam-set-meta') {
    const ids = Array.isArray(msg.nodeIds) ? msg.nodeIds : [];
    const next = {};
    if (typeof msg.format === 'string') next.format = msg.format;
    if (Number.isFinite(msg.scale) && msg.scale > 0) next.scale = msg.scale;
    if (typeof msg.platform === 'string') next.platform = msg.platform;
    try {
      figjamAllTracked()
        .filter(function (n) {
          if (ids.includes(n.id)) return true;
          if (msg.propagate) {
            const meta = figjamMeta(n);
            return ids.some(function (id) {
              const node = figjamAllTracked().find(function (m) { return m.id === id; });
              if (!node) return false;
              const m = figjamMeta(node);
              return meta.fileKey === m.fileKey && meta.nodeId === m.nodeId;
            });
          }
          return false;
        })
        .forEach(function (n) {
          const meta = figjamMeta(n);
          const updated = Object.assign({}, meta, next, { key: figjamKey(meta.fileKey || '', meta.nodeId || '') });
          n.setPluginData(SB_META_KEY, JSON.stringify(updated));
        });
    } catch (e) {}
    figma.ui.postMessage({ action: 'figjam-selection', tracked: figjamSelectionSummary() });
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
