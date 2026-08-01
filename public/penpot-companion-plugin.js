// SyncingBoard Companion Plugin - Penpot background runner
penpot.ui.open('SyncingBoard Companion', './penpot-companion-ui.html', {
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

async function findShapeById(shapeId) {
  // 1. Check active selection first (fastest and most reliable)
  if (penpot.selection && penpot.selection.length > 0) {
    const selMatch = penpot.selection.find((s) => s && s.id === shapeId);
    if (selMatch) return selMatch;
    // Do NOT fall back to the current selection if shapeId doesn't match.
    // The stored nodeId in SyncingBoard metadata is the source of truth.
  }

  // 2. Use official getShapeById API on current page (O(1) internal map lookup)
  //    This is synchronous and much faster than tree walking.
  if (penpot.currentPage && typeof penpot.currentPage.getShapeById === 'function') {
    const found = penpot.currentPage.getShapeById(shapeId);
    if (found) return found;
  }

  // 3. Cross-page search via official getShapeById API (O(1) per page)
  const allPages = penpot.pages || (penpot.currentFile && penpot.currentFile.pages);
  if (allPages && Array.isArray(allPages)) {
    for (const page of allPages) {
      if (page === penpot.currentPage) continue;
      if (typeof page.getShapeById === 'function') {
        const found = page.getShapeById(shapeId);
        if (found) {
          return found;
        }
      }
    }
  }

  // 4. Fallback: recursive tree walk (for older Penpot instances without getShapeById)
  function search(node) {
    if (!node) return null;
    if (node.id === shapeId) return node;
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
    }
    return null;
  }

  if (penpot.currentPage && penpot.currentPage.root) {
    const found = search(penpot.currentPage.root);
    if (found) return found;
  }

  if (allPages && Array.isArray(allPages)) {
    for (const page of allPages) {
      if (page === penpot.currentPage || !page.root) continue;
      const found = search(page.root);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function exportShapeBuffer(shapeId, format, scale) {
  // Preload: if the shape is on a different page, navigate there so WASM
  // has the shape data cached and export is instant (<1s) instead of a
  // 10-60s main-thread freeze. After export, navigate back to the original
  // page so the user's workspace is not disrupted.
  const originalPageId = penpot.currentPage ? penpot.currentPage.id : null;
  if (typeof penpot.openPage === 'function' && originalPageId) {
    const allPages = penpot.pages || (penpot.currentFile && penpot.currentFile.pages);
    if (allPages && Array.isArray(allPages)) {
      for (const page of allPages) {
        if (page.id === originalPageId) continue;
        if (typeof page.getShapeById === 'function') {
          const found = page.getShapeById(shapeId);
          if (found) {
            await penpot.openPage(page);
            break;
          }
        }
      }
    }
  }

  // Run the actual export (await the full result so WASM data is captured
  // before any page navigation happens).
  const shapeFromPage = await findShapeById(shapeId);
  let result;
  if (shapeFromPage && typeof shapeFromPage.export === 'function') {
    result = await shapeFromPage.export({ type: format, scale });
  } else if (shapeFromPage && typeof shapeFromPage.exportShape === 'function') {
    result = await shapeFromPage.exportShape({ format, scale });
  } else if (typeof penpot.export === 'function') {
    result = await penpot.export(shapeId, { format, scale });
  } else {
    throw new Error(`Penpot shape "${shapeId}" export API unavailable. Ensure a valid frame or shape is selected in Penpot.`);
  }

  // Navigate back after export data is fully captured in memory.
  if (originalPageId && typeof penpot.openPage === 'function') {
    await penpot.openPage(originalPageId).catch(() => {});
  }

  return result;
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
    const fileId = penpot.currentFile ? penpot.currentFile.id : (penpot.currentFileId || penpot.fileId || 'penpot-doc');

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
            fileId: fileId,
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
      // When the shape is not found on the current page, omit the name (null)
      // so the Miro plugin preserves the existing widget name rather than
      // overwriting it with a placeholder.
      let shapeName = null;
      let shapeWidth = 0;
      let shapeHeight = 0;
      try {
        const shapeFromPage = await findShapeById(message.shapeId);
        if (shapeFromPage) {
          if (shapeFromPage.name) shapeName = shapeFromPage.name;
          // selrect gives the shape's natural dimensions (before scale multiplication)
          if (shapeFromPage.selrect && typeof shapeFromPage.selrect.width === 'number') {
            shapeWidth = Math.round(shapeFromPage.selrect.width);
            shapeHeight = Math.round(shapeFromPage.selrect.height);
          }
        }
      } catch (e) {
        // Silently fall back — name stays null, Miro plugin uses existing widget name
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
