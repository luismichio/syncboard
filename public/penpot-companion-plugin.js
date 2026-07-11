// SyncBoard Companion Plugin - Penpot background runner
const initialTheme = penpot.theme || "dark";
penpot.ui.open("SyncBoard Companion", `./penpot-companion-ui.html?theme=${initialTheme}`, {
  width: 320,
  height: 480
});

// Listen to theme changes from Penpot and update UI
penpot.on("themechange", (theme) => {
  penpot.ui.sendMessage({
    action: "theme-change",
    theme: theme
  });
});

// Listen to messages from the UI Iframe
penpot.ui.onMessage(async (message) => {
  if (message.action === "get-selection") {
    const selection = penpot.selection[0];
    const file = penpot.currentFile;
    
    penpot.ui.sendMessage({
      action: "selection-result",
      requestId: message.requestId,
      data: selection ? {
        id: selection.id,
        name: selection.name,
        fileId: file ? file.id : 'unknown'
      } : null
    });
  }

  if (message.action === "export-shape") {
    try {
      const buffer = await penpot.export(message.shapeId, {
        format: message.format || "svg",
        scale: message.scale || 2
      });

      if (message.format === "svg") {
        const svgText = new TextDecoder().decode(buffer);
        penpot.ui.sendMessage({
          action: "export-result",
          requestId: message.requestId,
          data: { svg: svgText }
        });
      } else {
        // Base64 encode PNG binary
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        penpot.ui.sendMessage({
          action: "export-result",
          requestId: message.requestId,
          data: { base64 }
        });
      }
    } catch (err) {
      penpot.ui.sendMessage({
        action: "export-result",
        requestId: message.requestId,
        error: err.message
      });
    }
  }
});
