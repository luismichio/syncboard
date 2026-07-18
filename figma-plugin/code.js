// SyncBoard Figma Companion Plugin - Background script
figma.showUI(__html__, {
  width: 320,
  height: 480,
  themeColors: true,
});

let globalFileKey = 'unknown';

console.log("[SyncBoard] Background script executing. Default globalFileKey:", globalFileKey);

// Pre-load saved fileKey from storage immediately in the background on script execution
try {
  figma.clientStorage.getAsync('syncboard_file_key').then((val) => {
    console.log("[SyncBoard] Top-level clientStorage.getAsync resolved. Value:", val);
    if (val) {
      globalFileKey = val;
      console.log("[SyncBoard] Top-level load: globalFileKey updated to:", globalFileKey);
    }
  }).catch((e) => {
    console.error("[SyncBoard] Top-level clientStorage.getAsync failed:", e);
  });
} catch (e) {
  console.error("[SyncBoard] Top-level load catch block:", e);
}

// Listen to selection changes on the active page
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  let docFileKey = undefined;
  try {
    docFileKey = figma.root.getPluginData('syncboard_file_key');
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
    console.log("[SyncBoard] Message: ui-ready received.");
    // Refresh saved fileKey from storage asynchronously to keep cache hot
    try {
      figma.clientStorage.getAsync('syncboard_file_key').then((val) => {
        console.log("[SyncBoard] ui-ready clientStorage.getAsync resolved. Value:", val);
        if (val) {
          globalFileKey = val;
          console.log("[SyncBoard] ui-ready load: globalFileKey updated to:", globalFileKey);
        }
      }).catch((e) => {
        console.error("[SyncBoard] ui-ready clientStorage.getAsync failed:", e);
      });
    } catch (e) {
      console.error("[SyncBoard] ui-ready catch block:", e);
    }
    
    // Simply acknowledge connection, do not trigger host-result loop
    figma.ui.postMessage({ action: 'ui-ready' });
    return;
  }

  if (msg.action === 'get-host') {
    console.log("[SyncBoard] Message: get-host received.");
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
      console.log("[SyncBoard] get-host: loaded savedFileKey:", savedFileKey, "globalFileKey:", globalFileKey);

      figma.ui.postMessage({
        action: 'host-result',
        host: host || 'https://syncboard.vercel.app',
        fileKey: figma.fileKey || docFileKey || savedFileKey || ''
      });
    } catch (err) {
      console.error("[SyncBoard] get-host failed:", err);
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
      console.log("[SyncBoard] Host saved successfully:", msg.host);
    } catch (err) {
      console.error("[SyncBoard] set-host failed:", err);
    }
    return;
  }

  if (msg.action === 'link-file') {
    console.log("[SyncBoard] Message: link-file received with key:", msg.fileKey);
    try {
      if (typeof msg.fileKey === 'string') {
        try {
          figma.root.setPluginData('syncboard_file_key', msg.fileKey);
          console.log("[SyncBoard] Saved key via setPluginData:", msg.fileKey);
        } catch (e) {
          console.log("[SyncBoard] setPluginData failed (No ID). Saving via clientStorage instead.");
          // No plugin ID in manifest. Fall back to clientStorage.
          await figma.clientStorage.setAsync('syncboard_file_key', msg.fileKey);
          console.log("[SyncBoard] Saved key via clientStorage.setAsync:", msg.fileKey);
        }
        
        globalFileKey = msg.fileKey;
        console.log("[SyncBoard] link-file: globalFileKey set to:", globalFileKey);

        // Dispatch updated host-result back to UI to reload iframe with the new fileKey
        const host = await figma.clientStorage.getAsync('syncboard_host_url');
        figma.ui.postMessage({
          action: 'host-result',
          host: host || 'https://syncboard.vercel.app',
          fileKey: msg.fileKey
        });
      }
    } catch (err) {
      console.error("[SyncBoard] link-file failed:", err);
    }
    return;
  }

  if (msg.action === 'get-selection') {
    console.log("[SyncBoard] Message: get-selection received.");
    try {
      const selection = figma.currentPage.selection; // Synchronous read

      let docFileKey = undefined;
      try {
        docFileKey = figma.root.getPluginData('syncboard_file_key');
      } catch (e) {
        // No plugin ID in manifest
      }

      // Read from globalFileKey in memory (avoiding async clientStorage)
      const fileKey = figma.fileKey || docFileKey || globalFileKey || 'unknown';
      console.log("[SyncBoard] get-selection values:", {
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
      console.error("[SyncBoard] get-selection failed:", err);
      figma.ui.postMessage({
        action: 'selection-result',
        requestId: msg.requestId,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
