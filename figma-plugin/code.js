// SyncBoard Figma Companion Plugin - Background script
figma.showUI(__html__, {
  width: 320,
  height: 480,
  themeColors: true,
});

// Listen to selection changes on the active page
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  const docFileKey = figma.root.getPluginData('syncboard_file_key');
  figma.ui.postMessage({
    action: 'selection-changed-locally',
    data: selection[0]
      ? {
          id: selection[0].id,
          name: selection[0].name,
          fileKey: figma.fileKey || docFileKey || 'unknown',
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
      const docFileKey = figma.root.getPluginData('syncboard_file_key');
      
      figma.ui.postMessage({
        action: 'host-result',
        host: host || 'https://syncboard-dev.luiskobayashi.com',
        fileKey: figma.fileKey || docFileKey || ''
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
    } catch (err) {
      // Ignore
    }
    return;
  }

  if (msg.action === 'link-file') {
    try {
      if (typeof msg.fileKey === 'string') {
        figma.root.setPluginData('syncboard_file_key', msg.fileKey);
        // Dispatch updated host-result back to UI to reload iframe with the new fileKey
        const host = await figma.clientStorage.getAsync('syncboard_host_url');
        figma.ui.postMessage({
          action: 'host-result',
          host: host || 'https://syncboard-dev.luiskobayashi.com',
          fileKey: msg.fileKey
        });
      }
    } catch (err) {
      // Ignore
    }
    return;
  }

  if (msg.action === 'get-selection') {
    try {
      const selection = figma.currentPage.selection;
      const docFileKey = figma.root.getPluginData('syncboard_file_key');
      const fileKey = figma.fileKey || docFileKey || 'unknown';

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
