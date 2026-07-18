// SyncBoard Figma Companion Plugin - Background script
figma.showUI(__html__, {
  width: 320,
  height: 480,
  themeColors: true,
});

let globalFileKey = 'unknown';

// Listen to selection changes on the active page
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    action: 'selection-changed-locally',
    data: selection[0]
      ? {
          id: selection[0].id,
          name: selection[0].name,
          fileKey: figma.fileKey || globalFileKey || 'unknown',
        }
      : null,
  });
});

// Message listener from UI
figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.action === 'ui-ready') {
    try {
      const host = await figma.clientStorage.getAsync('syncboard_host_url');
      const fileKey = await figma.clientStorage.getAsync('syncboard_file_key');
      
      globalFileKey = figma.fileKey || fileKey || 'unknown';

      figma.ui.postMessage({
        action: 'host-result',
        host: host || 'https://syncboard-dev.luiskobayashi.com',
        fileKey: fileKey || ''
      });
    } catch (err) {
      figma.ui.postMessage({
        action: 'host-result',
        host: 'https://syncboard-dev.luiskobayashi.com',
        fileKey: ''
      });
    }
    return;
  }

  if (msg.action === 'set-host') {
    try {
      await figma.clientStorage.setAsync('syncboard_host_url', msg.host);
      if (typeof msg.fileKey === 'string') {
        await figma.clientStorage.setAsync('syncboard_file_key', msg.fileKey);
        globalFileKey = figma.fileKey || msg.fileKey || 'unknown';
      }
    } catch (err) {
      // Ignore
    }
    return;
  }

  if (msg.action === 'get-selection') {
    try {
      const selection = figma.currentPage.selection;
      const savedFileKey = await figma.clientStorage.getAsync('syncboard_file_key');
      const fileKey = figma.fileKey || savedFileKey || globalFileKey || 'unknown';

      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: selection[0]
          ? {
              id: selection[0].id.replace(':', '-'), // Figma uses colons inside API, hyphens inside link node-ids
              name: selection[0].name,
              fileKey: fileKey,
            }
          : null,
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
