// SyncBoard Figma Companion Plugin - Background script
figma.showUI(__html__, {
  width: 320,
  height: 350,
});

function sendTheme() {
  figma.ui.postMessage({
    action: 'theme-change',
    theme: figma.theme || 'dark',
  });
}

// Initial theme setup on launch
setTimeout(sendTheme, 300);

// Listen to selection changes on the active page
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    action: 'selection-changed-locally',
    data: selection[0]
      ? {
          id: selection[0].id,
          name: selection[0].name,
        }
      : null,
  });
});

// Message listener from UI
figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.action === 'ui-ready') {
    sendTheme();
    // Acknowledge connection
    figma.ui.postMessage({ action: 'ui-ready' });
    return;
  }

  if (msg.action === 'get-selection') {
    try {
      const selection = figma.currentPage.selection;
      
      // Figma file key must be available (requires cloud-saved file)
      const fileKey = figma.fileKey || 'unknown';

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
