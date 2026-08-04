// SyncingBoard Figma Companion Plugin - Background script
figma.showUI(__html__, {
  width: 320,
  height: 480,
  themeColors: true,
});

let globalFileKey = 'unknown';

// Pre-load saved fileKey from storage in the background
try {
  figma.clientStorage.getAsync('syncingboard_file_key').then((val) => {
    if (val) globalFileKey = val;
  }).catch(() => {});
} catch (e) {}

// Resolve the current file key: figma.fileKey > document metadata > clientStorage > memory
function resolveFileKey() {
  let docFileKey;
  try {
    docFileKey = figma.root.getPluginData('syncingboard_file_key');
  } catch (e) {
    // No plugin ID in manifest
  }
  return figma.fileKey || docFileKey || globalFileKey || 'unknown';
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

  if (msg.action === 'get-selection') {
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
