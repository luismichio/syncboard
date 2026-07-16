// SyncBoard Companion Plugin - Penpot background runner
penpot.ui.open('SyncBoard Companion', './penpot-companion-ui.html', {
  width: 320,
  height: 600,
});

function normalizeTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  if (theme === 'os' || theme === 'system' || theme === 'auto') return 'os';
  return 'dark';
}

let currentTheme = normalizeTheme(penpot.theme);

function sendTheme() {
  penpot.ui.sendMessage({
    action: 'theme-change',
    theme: currentTheme,
  });
}

// Fallback push in case UI is already mounted.
setTimeout(() => {
  sendTheme();
}, 300);

// Keep UI in sync with runtime theme changes.
penpot.on('themechange', (theme) => {
  currentTheme = normalizeTheme(theme);
  sendTheme();
});

async function exportShapeBuffer(shapeId, format, scale) {
  const shapeFromPage =
    penpot.currentPage && typeof penpot.currentPage.getShapeById === 'function'
      ? penpot.currentPage.getShapeById(shapeId)
      : null;

  if (shapeFromPage && typeof shapeFromPage.export === 'function') {
    return shapeFromPage.export({ type: format, scale });
  }

  // Backward compatibility with older Penpot runtimes.
  if (typeof penpot.export === 'function') {
    return penpot.export(shapeId, { format, scale });
  }

  const rootKeys = Object.keys(penpot).filter((key) => key.toLowerCase().includes('export'));
  throw new Error(
    `Penpot export API unavailable in this runtime. Expected shape.export(...). ` +
      `Detected root export-like keys: ${rootKeys.length ? rootKeys.join(', ') : 'none'}`
  );
}

// Listen to messages from the UI Iframe
penpot.ui.onMessage(async (message) => {
  if (!message || typeof message !== 'object') return;

  if (message.action === 'ui-ready') {
    sendTheme();
    return;
  }

  if (message.action === 'get-selection') {
    const selection = penpot.selection[0];
    const file = penpot.currentFile;

    let selWidth = 0;
    let selHeight = 0;
    if (selection && selection.selrect) {
      selWidth = Math.round(selection.selrect.width);
      selHeight = Math.round(selection.selrect.height);
    }

    penpot.ui.sendMessage({
      action: 'selection-result',
      requestId: message.requestId,
      data: selection
        ? {
            id: selection.id,
            name: selection.name,
            fileId: file ? file.id : 'unknown',
            width: selWidth,
            height: selHeight,
          }
        : null,
    });
  }

  if (message.action === 'export-shape') {
    try {
      const format = message.format === 'png' ? 'png' : 'svg';
      const scale = typeof message.scale === 'number' && Number.isFinite(message.scale) ? message.scale : 2;
      const buffer = await exportShapeBuffer(message.shapeId, format, scale);

      // Get the shape name and natural dimensions so the Miro plugin can
      // create the widget at the correct display size regardless of scale.
      let shapeName = 'Selected Frame';
      let shapeWidth = 0;
      let shapeHeight = 0;
      try {
        const shapeFromPage =
          penpot.currentPage && typeof penpot.currentPage.getShapeById === 'function'
            ? penpot.currentPage.getShapeById(message.shapeId)
            : null;
        if (shapeFromPage) {
          if (shapeFromPage.name) shapeName = shapeFromPage.name;
          // selrect gives the shape's natural dimensions (before scale multiplication)
          if (shapeFromPage.selrect && typeof shapeFromPage.selrect.width === 'number') {
            shapeWidth = Math.round(shapeFromPage.selrect.width);
            shapeHeight = Math.round(shapeFromPage.selrect.height);
          }
        }
      } catch (e) {
        // Silently fall back to default name
      }

      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

      if (format === 'svg') {
        // TextDecoder may not be available in the Penpot plugin sandbox;
        // use fromCharCode + decodeURIComponent as a portable fallback.
        let svgText;
        if (typeof TextDecoder !== 'undefined') {
          try {
            svgText = new TextDecoder().decode(bytes);
          } catch (_) {
            svgText = null;
          }
        }
        if (!svgText) {
          let raw = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            raw += String.fromCharCode(bytes[i]);
          }
          svgText = decodeURIComponent(escape(raw));
        }
        penpot.ui.sendMessage({
          action: 'export-result',
          requestId: message.requestId,
          data: { svg: svgText, name: shapeName, width: shapeWidth, height: shapeHeight },
        });
      } else {
        // Base64 encode PNG binary
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        penpot.ui.sendMessage({
          action: 'export-result',
          requestId: message.requestId,
          data: { base64, name: shapeName, width: shapeWidth, height: shapeHeight },
        });
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      penpot.ui.sendMessage({
        action: 'export-result',
        requestId: message.requestId,
        error: messageText,
      });
    }
  }
});
