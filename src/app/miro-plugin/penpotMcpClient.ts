export interface PenpotMcpResponse {
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  isError?: boolean;
}

function getOrCreatePairingId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('syncboard_pairing_id');
  if (!id) {
    // Generate simple readable pairing token
    id = 'sb_' + Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('syncboard_pairing_id', id);
  }
  return id;
}

/**
 * Communicates with the local Penpot design system resource via the Tauri local secure loopback bridge.
 * Serves selection query and SVG/PNG rendering exports directly from the open Penpot browser tab.
 */
export async function callPenpotMcpTool(toolName: string, toolArgs: Record<string, unknown>): Promise<PenpotMcpResponse> {
  if (typeof window === 'undefined') {
    throw new Error('Window context is required.');
  }

  const useTauri = localStorage.getItem('syncboard_use_tauri') === 'true';
  if (!useTauri) {
    throw new Error('SyncBridge is disconnected. Connect it in the Settings tab to sync Penpot.');
  }

  const pairingId = getOrCreatePairingId();
  const tauriHost = 'https://local.syncboard.com:4401';
  
  if (toolName === 'execute_code') {
    // Relays selection query to Tauri local secure server
    const res = await fetch(`${tauriHost}/detect-penpot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingId }),
    });
    if (!res.ok) {
      throw new Error(`Tauri connection failed: HTTP ${res.status}`);
    }
    const payload = await res.json() as { error?: string; data?: { id: string; name: string; fileId: string } | null };
    if (payload.error) {
      throw new Error(payload.error);
    }
    // Return mocked JSON payload matching execute_code schema inside usePenpotImporter.ts
    return {
      content: [{
        type: 'text',
        text: payload.data ? JSON.stringify(payload.data) : 'null'
      }]
    };
  }

  if (toolName === 'export_shape') {
    const shapeId = toolArgs.shapeId as string;
    const format = toolArgs.format as string || 'svg';
    const scale = toolArgs.scale as number || 2;

    const res = await fetch(`${tauriHost}/export-penpot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingId, shapeId, format, scale }),
    });
    if (!res.ok) {
      throw new Error(`Tauri export failed: HTTP ${res.status}`);
    }
    const payload = await res.json() as { error?: string; data?: { svg?: string; base64?: string } };
    if (payload.error) {
      throw new Error(payload.error);
    }

    if (format === 'svg') {
      const svgText = payload.data?.svg;
      if (!svgText) throw new Error('Tauri returned empty SVG vector data.');
      return {
        content: [{ type: 'text', text: svgText }]
      };
    } else {
      const base64Data = payload.data?.base64;
      if (!base64Data) throw new Error('Tauri returned empty PNG render data.');
      return {
        content: [{
          type: 'image',
          data: base64Data,
          mimeType: 'image/png'
        }]
      };
    }
  }

  throw new Error(`Tool "${toolName}" is not supported in Tauri Bridge Mode.`);
}

/**
 * Queries local selection inside the active Figma Desktop App via Tauri Proxy.
 */
export async function callFigmaSelectionTauri(): Promise<{ id: string; name: string; fileKey: string } | null> {
  const useTauri = localStorage.getItem('syncboard_use_tauri') === 'true';
  if (!useTauri) return null;

  try {
    const res = await fetch('https://local.syncboard.com:4401/detect-figma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const payload = await res.json() as { error?: string; data?: { id: string; name: string; fileKey: string } | null };
    return payload.data || null;
  } catch {
    return null;
  }
}
