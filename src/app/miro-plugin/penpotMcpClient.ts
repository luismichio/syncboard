export interface PenpotMcpResponse {
  content: { type: string; text?: string; data?: string; mimeType?: string; name?: string }[];
  isError?: boolean;
}

type RelayJson = null | boolean | number | string | RelayJson[] | { [key: string]: RelayJson };

interface RelayRequestBody {
  pairingId: string;
  action: 'select' | 'export';
  shapeId?: string;
  format?: 'svg' | 'png';
  scale?: number;
  timeoutMs?: number;
}

interface RelayResponse {
  error?: string;
  data?: RelayJson;
}

function getOrCreatePairingId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('syncboard_pairing_id');
  if (!id) {
    // Generate a new ID only if one doesn't exist at all.
    // An empty string means the user explicitly cleared it — don't override.
    if (id === null) {
      id =
        'sb_' +
        Math.random().toString(36).substring(2, 11) +
        Math.random().toString(36).substring(2, 11);
      localStorage.setItem('syncboard_pairing_id', id);
    }
  }
  return id || '';
}

function isTauriEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('syncboard_use_tauri') === 'true';
}

async function callRelay(body: RelayRequestBody): Promise<RelayJson> {
  const res = await fetch('/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as RelayResponse;

  if (!res.ok || payload.error) {
    throw new Error(payload.error || `Relay request failed with HTTP ${res.status}`);
  }

  return payload.data ?? null;
}

async function callTauri(toolName: string, toolArgs: Record<string, unknown>, pairingId: string): Promise<PenpotMcpResponse> {
  const tauriHost = 'https://local-syncboard.luiskobayashi.com:4401';

  if (toolName === 'execute_code') {
    const res = await fetch(`${tauriHost}/detect-penpot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingId }),
      targetAddressSpace: 'loopback',
    } as unknown as RequestInit);

    if (!res.ok) {
      throw new Error(`SyncBridge connection failed: HTTP ${res.status}`);
    }

    const payload = (await res.json()) as {
      error?: string;
      data?: { id: string; name: string; fileId?: string } | null;
    };

    if (payload.error) {
      throw new Error(payload.error);
    }

    return {
      content: [{
        type: 'text',
        text: payload.data ? JSON.stringify(payload.data) : 'null',
      }],
    };
  }

  if (toolName === 'export_shape') {
    const shapeId = toolArgs.shapeId as string;
    const format = (toolArgs.format as string) || 'svg';
    const scale = (toolArgs.scale as number) || 2;

    const res = await fetch(`${tauriHost}/export-penpot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingId, shapeId, format, scale }),
      targetAddressSpace: 'loopback',
    } as unknown as RequestInit);

    if (!res.ok) {
      throw new Error(`SyncBridge export failed: HTTP ${res.status}`);
    }

    const payload = (await res.json()) as {
      error?: string;
      data?: { svg?: string; base64?: string };
    };

    if (payload.error) {
      throw new Error(payload.error);
    }

    if (format === 'svg') {
      const svgText = payload.data?.svg;
      if (!svgText) throw new Error('SyncBridge returned empty SVG vector data.');
      return { content: [{ type: 'text', text: svgText }] };
    }

    const base64Data = payload.data?.base64;
    if (!base64Data) throw new Error('SyncBridge returned empty PNG render data.');
    return {
      content: [{ type: 'image', data: base64Data, mimeType: 'image/png' }],
    };
  }

  throw new Error(`Tool "${toolName}" is not supported in SyncBridge mode.`);
}

/**
 * Penpot bridge abstraction:
 * - SyncBridge mode (local HTTPS + Tauri), when enabled in settings.
 * - Cloud relay mode (default), routed through /api/relay/* endpoints.
 */
export async function callPenpotMcpTool(
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<PenpotMcpResponse> {
  if (typeof window === 'undefined') {
    throw new Error('Window context is required.');
  }

  const pairingId = getOrCreatePairingId();

  if (isTauriEnabled()) {
    return callTauri(toolName, toolArgs, pairingId);
  }

  if (toolName === 'execute_code') {
    const data = await callRelay({
      pairingId,
      action: 'select',
      timeoutMs: 8_000,
    });

    return {
      content: [{
        type: 'text',
        text: data ? JSON.stringify(data) : 'null',
      }],
    };
  }

  if (toolName === 'export_shape') {
    const shapeId = toolArgs.shapeId as string;
    const format = (toolArgs.format as 'svg' | 'png' | undefined) ?? 'svg';
    const scale = (toolArgs.scale as number | undefined) ?? 2;

    if (!shapeId) {
      throw new Error('shapeId is required for export_shape.');
    }

    const data = await callRelay({
      pairingId,
      action: 'export',
      shapeId,
      format,
      scale,
      timeoutMs: 18_000,
    });

    const payload = data as { svg?: string; base64?: string; name?: string } | null;

    if (format === 'svg') {
      const svgText = payload?.svg;
      if (!svgText) {
        throw new Error('Penpot relay returned empty SVG export data.');
      }
      return { content: [{ type: 'text', text: svgText, name: payload?.name }] };
    }

    const base64Data = payload?.base64;
    if (!base64Data) {
      throw new Error('Penpot relay returned empty PNG export data.');
    }
    return {
      content: [{ type: 'image', data: base64Data, mimeType: 'image/png', name: payload?.name }],
    };
  }

  throw new Error(`Tool "${toolName}" is not supported.`);
}

/**
 * Queries local selection inside the active Figma Desktop App via SyncBridge.
 */
export async function callFigmaSelectionTauri(): Promise<{ id: string; name: string; fileKey: string } | null> {
  if (!isTauriEnabled()) return null;

  try {
    const res = await fetch('https://local-syncboard.luiskobayashi.com:4401/detect-figma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      targetAddressSpace: 'loopback',
    } as unknown as RequestInit);
    if (!res.ok) return null;
    const payload = (await res.json()) as { error?: string; data?: { id: string; name: string; fileKey: string } | null };
    return payload.data || null;
  } catch {
    return null;
  }
}
