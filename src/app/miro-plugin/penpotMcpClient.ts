export interface PenpotMcpResponse {
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  isError?: boolean;
}

/**
 * Pure-JS client-side wrapper to communicate with the local Penpot MCP Server
 * using standard Model Context Protocol (MCP) Server-Sent Events (SSE) transport.
 * Bypasses the need for external SDK dependencies inside the browser sandbox.
 */
export function callPenpotMcpTool(toolName: string, toolArgs: Record<string, unknown>): Promise<PenpotMcpResponse> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window context is required.'));
      return;
    }

    const mcpHost = 'http://localhost:4401';
    const eventSource = new EventSource(`${mcpHost}/sse`);
    let postUrl = '';
    const requestId = Math.floor(Math.random() * 1000000);

    const cleanup = () => {
      eventSource.close();
    };

    // Set a timeout of 10 seconds to avoid hanging indefinitely if server is unresponsive
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Penpot MCP request timed out.'));
    }, 10000);

    eventSource.addEventListener('endpoint', async (event: MessageEvent) => {
      postUrl = `${mcpHost}${event.data}`;
      
      try {
        const response = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: toolArgs,
            },
            id: requestId,
          }),
        });

        if (!response.ok) {
          cleanup();
          clearTimeout(timeout);
          reject(new Error(`Failed to post MCP message: HTTP ${response.status}`));
        }
      } catch (err) {
        cleanup();
        clearTimeout(timeout);
        reject(err);
      }
    });

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        // Listen specifically for the response with matching request ID
        if (payload.id === requestId) {
          cleanup();
          clearTimeout(timeout);
          if (payload.error) {
            reject(new Error(payload.error.message || 'MCP tool execution failed.'));
          } else {
            resolve(payload.result as PenpotMcpResponse);
          }
        }
      } catch {
        // Ignore JSON parse errors for non-JSON lines or heartbeat lines
      }
    };

    eventSource.onerror = () => {
      cleanup();
      clearTimeout(timeout);
      reject(new Error('Penpot MCP connection failed. Make sure your local Penpot MCP server is running on port 4401 and CORS is enabled.'));
    };
  });
}
