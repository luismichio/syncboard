// SyncBoard Figma Companion Plugin - Background script
figma.showUI(__html__, {
  width: 320,
  height: 480,
  themeColors: true,
});

let globalFileKey = 'unknown';
let lastActiveSelection = null;

function updateActiveSelectionCache() {
  try {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      lastActiveSelection = {
        id: selection[0].id,
        name: selection[0].name,
        selectionCount: selection.length
      };
    } else {
      lastActiveSelection = null;
    }
  } catch (e) {
    // Ignore
  }
}

// Initialize active selection cache on load
updateActiveSelectionCache();

// Listen to selection changes on the active page
figma.on('selectionchange', () => {
  updateActiveSelectionCache();
  
  let docFileKey = undefined;
  try {
    docFileKey = figma.root.getPluginData('syncboard_file_key');
  } catch (e) {
    // No plugin ID in manifest
  }
  
  figma.ui.postMessage({
    action: 'selection-changed-locally',
    data: lastActiveSelection
      ? {
          id: lastActiveSelection.id,
          name: lastActiveSelection.name,
          fileKey: figma.fileKey || docFileKey || globalFileKey || 'unknown',
        }
      : null,
  });
});

// Message listener from UI
figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.action === 'ui-ready') {
    // Simply acknowledge connection, do not trigger host-result loop
    figma.ui.postMessage({ action: 'ui-ready' });
    return;
  }

  if (msg.action === 'get-host') {
    try {
      const host = await figma.clientStorage.getAsync('syncboard_host_url');
      
      let docFileKey = undefined;
      try {
        docFileKey = figma.root.getPluginData('syncboard_file_key');
      } catch (e) {
        // No plugin ID in manifest
      }

      const savedFileKey = await figma.clientStorage.getAsync('syncboard_file_key');
      globalFileKey = docFileKey || savedFileKey || 'unknown';

      figma.ui.postMessage({
        action: 'host-result',
        host: host || 'https://syncboard.vercel.app',
        fileKey: figma.fileKey || docFileKey || savedFileKey || ''
      });
    } catch (err) {
      figma.ui.postMessage({
        action: 'host-result',
        host: 'https://syncboard.vercel.app',
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
        try {
          figma.root.setPluginData('syncboard_file_key', msg.fileKey);
        } catch (e) {
          // No plugin ID in manifest. Fall back to clientStorage.
          await figma.clientStorage.setAsync('syncboard_file_key', msg.fileKey);
        }
        
        globalFileKey = msg.fileKey;

        // Dispatch updated host-result back to UI to reload iframe with the new fileKey
        const host = await figma.clientStorage.getAsync('syncboard_host_url');
        figma.ui.postMessage({
          action: 'host-result',
          host: host || 'https://syncboard.vercel.app',
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
      let docFileKey = undefined;
      try {
        docFileKey = figma.root.getPluginData('syncboard_file_key');
      } catch (e) {
        // No plugin ID in manifest
      }

      const savedFileKey = await figma.clientStorage.getAsync('syncboard_file_key');
      const fileKey = figma.fileKey || docFileKey || savedFileKey || globalFileKey || 'unknown';

      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: lastActiveSelection
          ? {
              id: lastActiveSelection.id.replace(':', '-'), // Figma uses colons inside API, hyphens inside link node-ids
              name: lastActiveSelection.name,
              fileKey: fileKey,
            }
          : null,
        selectionCount: lastActiveSelection ? lastActiveSelection.selectionCount : 0
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
