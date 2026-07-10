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
 * Communicates with the local Penpot design system resource.
 * Supports dual transportation modes:
 * 1. Tauri Bridge Mode (Production): Relays requests to Tauri local secure server (https://local.syncboard.com:4401)
 *    which handles WSS browser integrations.
 * 2. Local MCP Server Mode (Development fallback): Calls local Penpot MCP streamable http server (http://localhost:4401/mcp).
 */
export async function callPenpotMcpTool(toolName: string, toolArgs: Record<string, unknown>): Promise<PenpotMcpResponse> {
  if (typeof window === 'undefined') {
    throw new Error('Window context is required.');
  }

  const useTauri = localStorage.getItem('syncboard_use_tauri') === 'true';
  const pairingId = getOrCreatePairingId();

  // --- MODE A: TAURI SECURE LOCAL HTTPS BRIDGE ---
  if (useTauri) {
    const tauriHost = 'https://local.syncboard.com:4401';
    
    if (toolName === 'execute_code') {
      // In Tauri mode, we map execute_code to selection detection
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
      // Return mocked JSON payload matches execute_code schema inside usePenpotImporter.ts
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

  // --- MODE B: LOCAL DEVELOPMENT FALLBACK (DIRECT MCP) ---
  const mcpHost = 'http://localhost:4401';
  const mcpUrl = `${mcpHost}/mcp`;

  // Standard JSON-RPC handshake over streamable HTTP
  const initResponse = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'syncboard', version: '1.0.0' },
      },
      id: 1,
    }),
  });

  if (!initResponse.ok) {
    throw new Error(`Failed to initialize session: HTTP ${initResponse.status}`);
  }

  const sessionId = initResponse.headers.get('mcp-session-id');
  if (!sessionId) {
    throw new Error('MCP server failed to return session configuration (mcp-session-id).');
  }

  await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });

  const toolResponse = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs,
      },
      id: 2,
    }),
  });

  if (!toolResponse.ok) {
    throw new Error(`Tool connection failed: HTTP ${toolResponse.status}`);
  }

  const payload = await toolResponse.json() as { 
    jsonrpc: string; 
    id: number; 
    result?: PenpotMcpResponse; 
    error?: { code: number; message: string } 
  };

  if (payload.error) {
    throw new Error(payload.error.message || 'MCP tool execution failed.');
  }

  if (!payload.result) {
    throw new Error('MCP server returned empty tool payload.');
  }

  return payload.result;
}

/**
 * Queries local selection inside the active Figma Desktop App via Tauri Proxy.
 * Falls back to null if Tauri is disabled.
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
