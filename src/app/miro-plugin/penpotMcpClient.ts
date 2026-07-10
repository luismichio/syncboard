export interface PenpotMcpResponse {
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  isError?: boolean;
}

/**
 * Pure-JS client-side wrapper to communicate with the local Penpot MCP Server
 * using the modern, streamable HTTP connection protocol (/mcp).
 * Implements the standard JSON-RPC initialization handshake over stateless HTTP fetch.
 * Bypasses the EventSource (SSE) mixed content blocking issues in secure HTTPS iframe contexts.
 */
export async function callPenpotMcpTool(toolName: string, toolArgs: Record<string, unknown>): Promise<PenpotMcpResponse> {
  if (typeof window === 'undefined') {
    throw new Error('Window context is required.');
  }

  // Use localhost directly to bypass secure context and mixed content restrictions in iframe sandboxes
  const mcpHost = 'http://localhost:4401';
  const mcpUrl = `${mcpHost}/mcp`;

  // --- STEP 1: Send the initialize handshake request ---
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

  // Read the session ID returned in the exposed headers
  const sessionId = initResponse.headers.get('mcp-session-id');
  if (!sessionId) {
    throw new Error('MCP server failed to return session configuration header (mcp-session-id). Make sure CORS header exposing is active.');
  }

  // --- STEP 2: Send the notifications/initialized notification ---
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

  // --- STEP 3: Execute the tool call ---
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
    throw new Error('MCP server returned an empty tool response payload.');
  }

  return payload.result;
}
