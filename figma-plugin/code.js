// SyncingBoard Figma Companion Plugin - Background script
figma.showUI(__html__, {
  width: 320,
  height: 480,
  themeColors: true,
});

let globalFileKey = 'unknown';

console.log("[SyncingBoard] Background script executing. Default globalFileKey:", globalFileKey);

// Pre-load saved fileKey from storage immediately in the background on script execution
try {
  figma.clientStorage.getAsync('syncingboard_file_key').then((val) => {
    console.log("[SyncingBoard] Top-level clientStorage.getAsync resolved. Value:", val);
    if (val) {
      globalFileKey = val;
      console.log("[SyncingBoard] Top-level load: globalFileKey updated to:", globalFileKey);
    }
  }).catch((e) => {
    console.error("[SyncingBoard] Top-level clientStorage.getAsync failed:", e);
  });
} catch (e) {
  console.error("[SyncingBoard] Top-level load catch block:", e);
}

// Listen to selection changes on the active page
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  let docFileKey = undefined;
  try {
    docFileKey = figma.root.getPluginData('syncingboard_file_key');
  } catch (e) {
    // No plugin ID in manifest
  }
  
  figma.ui.postMessage({
    action: 'selection-changed-locally',
    data: selection[0]
      ? {
          id: selection[0].id,
          name: selection[0].name,
          fileKey: figma.fileKey || docFileKey || globalFileKey || 'unknown',
        }
      : null,
  });
});

// Message listener from UI
figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.action === 'ui-ready') {
    console.log("[SyncingBoard] Message: ui-ready received.");
    // Refresh saved fileKey from storage asynchronously to keep cache hot
    try {
      figma.clientStorage.getAsync('syncingboard_file_key').then((val) => {
        console.log("[SyncingBoard] ui-ready clientStorage.getAsync resolved. Value:", val);
        if (val) {
          globalFileKey = val;
          console.log("[SyncingBoard] ui-ready load: globalFileKey updated to:", globalFileKey);
        }
      }).catch((e) => {
        console.error("[SyncingBoard] ui-ready clientStorage.getAsync failed:", e);
      });
    } catch (e) {
      console.error("[SyncingBoard] ui-ready catch block:", e);
    }
    
    // Simply acknowledge connection, do not trigger host-result loop
    figma.ui.postMessage({ action: 'ui-ready' });
    return;
  }

  if (msg.action === 'get-host') {
    console.log("[SyncingBoard] Message: get-host received.");
    try {
      const host = await figma.clientStorage.getAsync('syncingboard_host_url');
      
      let docFileKey = undefined;
      try {
        docFileKey = figma.root.getPluginData('syncingboard_file_key');
      } catch (e) {
        // No plugin ID in manifest
      }

      const savedFileKey = await figma.clientStorage.getAsync('syncingboard_file_key');
      globalFileKey = docFileKey || savedFileKey || 'unknown';
      console.log("[SyncingBoard] get-host: loaded savedFileKey:", savedFileKey, "globalFileKey:", globalFileKey);

      figma.ui.postMessage({
        action: 'host-result',
        host: host || 'https://www.syncingboard.com',
        fileKey: figma.fileKey || docFileKey || savedFileKey || ''
      });
    } catch (err) {
      console.error("[SyncingBoard] get-host failed:", err);
      figma.ui.postMessage({
        action: 'host-result',
        host: 'https://www.syncingboard.com',
        fileKey: ''
      });
    }
    return;
  }

  if (msg.action === 'set-host') {
    try {
      await figma.clientStorage.setAsync('syncingboard_host_url', msg.host);
      console.log("[SyncingBoard] Host saved successfully:", msg.host);
    } catch (err) {
      console.error("[SyncingBoard] set-host failed:", err);
    }
    return;
  }

  if (msg.action === 'link-file') {
    console.log("[SyncingBoard] Message: link-file received with key:", msg.fileKey);
    try {
      if (typeof msg.fileKey === 'string') {
        try {
          figma.root.setPluginData('syncingboard_file_key', msg.fileKey);
          console.log("[SyncingBoard] Saved key via setPluginData:", msg.fileKey);
        } catch (e) {
          console.log("[SyncingBoard] setPluginData failed (No ID). Saving via clientStorage instead.");
          // No plugin ID in manifest. Fall back to clientStorage.
          await figma.clientStorage.setAsync('syncingboard_file_key', msg.fileKey);
          console.log("[SyncingBoard] Saved key via clientStorage.setAsync:", msg.fileKey);
        }
        
        globalFileKey = msg.fileKey;
        console.log("[SyncingBoard] link-file: globalFileKey set to:", globalFileKey);

        // Dispatch updated host-result back to UI to reload iframe with the new fileKey
        const host = await figma.clientStorage.getAsync('syncingboard_host_url');
        figma.ui.postMessage({
          action: 'host-result',
          host: host || 'https://www.syncingboard.com',
          fileKey: msg.fileKey
        });
      }
    } catch (err) {
      console.error("[SyncingBoard] link-file failed:", err);
    }
    return;
  }

  if (msg.action === 'get-selection') {
    console.log("[SyncingBoard] Message: get-selection received.");
    try {
      const selection = figma.currentPage.selection; // Synchronous read

      let docFileKey = undefined;
      try {
        docFileKey = figma.root.getPluginData('syncingboard_file_key');
      } catch (e) {
        // No plugin ID in manifest
      }

      // Read from globalFileKey in memory (avoiding async clientStorage)
      const fileKey = figma.fileKey || docFileKey || globalFileKey || 'unknown';
      console.log("[SyncingBoard] get-selection values:", {
        figmaFileKey: figma.fileKey,
        docFileKey,
        globalFileKey,
        finalFileKey: fileKey,
        selectionCount: selection.length
      });

      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: selection[0]
          ? {
              id: selection[0].id, // Keep raw ID with colons for Figma REST API
              name: selection[0].name,
              fileKey: fileKey,
            }
          : null,
        selectionCount: selection.length
      });
    } catch (err) {
      console.error("[SyncingBoard] get-selection failed:", err);
      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
