---
title: Model Context Protocol (MCP) Roadmap Architecture
description: Planned specifications for SyncBoard as an MCP Client (Lovable/Stitch) and MCP Server exposing sync tools to AI agents.
---

# Model Context Protocol (MCP) Roadmap Architecture

> **PLANNED FEATURE / FUTURE ROADMAP SPECIFICATION**
> **Overview:** SyncBoard's proposed Model Context Protocol (MCP) layer defines future capabilities for acting as an **MCP client** to consume design-source MCP servers (Lovable, Stitch) and as an **MCP server** to expose SyncBoard tools to AI agents. *Note: Neither the MCP client nor the MCP server are implemented in the v0.13.3 production build.*

---

## SyncBoard as MCP Client (Planned)

> **Status:** draft / planned — transport design verified with `@modelcontextprotocol/sdk` v1.29.0+ (*not installed in v0.13.3 package.json*).

SyncBoard can act as a **remote MCP client** using the official `@modelcontextprotocol/sdk` (v1.29.0+). This enables SyncBoard (running on Vercel serverless) to call MCP servers over HTTP like any REST API — no subprocess management required for remote MCP endpoints.

### Supported MCP Transports
| Transport | SDK Transport Class | Used For | Serverless Compatible? |
|---|---|---|---|
| **Streamable HTTP** | `StreamableHttpClientTransport` | Lovable MCP (`mcp.lovable.dev`) | Plain `fetch()` |
| **stdio** | `StdioClientTransport` | Stitch MCP (`stitch-mcp`) | Requires hosted subprocess manager |
| **SSE** | `SseClientTransport` | Future MCP servers | Long-lived connection |
| **WebSocket** | `WebSocketClientTransport` | Future real-time MCP servers | Connection management required |

### Lovable MCP Integration Pattern
HTTP-based MCP integration uses standard JSON-RPC calls over HTTPS:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHttpClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function callLovableTool(accessToken: string, tool: string, args: object) {
  const transport = new StreamableHttpClientTransport({
    url: new URL("https://mcp.lovable.dev"),
    auth: { bearerToken: accessToken },
  });

  const client = new Client(
    { name: "syncboard", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  return client.callTool({ name: tool, arguments: args });
}
```

---

## SyncBoard as MCP Server (Planned)

> **NOT AVAILABLE YET (PLANNED FEATURE / FUTURE ROADMAP SPECIFICATION)**

SyncBoard can act as an **MCP server** — exposing its own tools to AI agents (Claude Desktop, Cursor, pi, custom scripts).

### Exposed Tools
| Tool | Description | Example Agent Prompt |
|---|---|---|
| **`sync_frame`** | Fetch latest from source (Figma/Stitch/Lovable) and push to Miro widget | "Sync the login screen to the board" |
| **`list_widgets`** | List all synced widgets on a board with source metadata | "What's on the board right now?" |
| **`get_status`** | Check sync freshness of a specific widget | "Is the home screen up to date?" |
| **`batch_sync`** | Sync multiple frames in one call | "Sync all Figma frames to Miro" |
| **`list_projects`** | List connected source projects | "What designs are available?" |
| **`list_sources`** | Show design accounts linked to SyncBoard | "Which Figma account is connected?" |

### Symmetric Architecture Diagram
```mermaid
graph TD
  agents["AI Agents<br/>(Claude / Cursor / pi)"]
  server["SyncBoard MCP Server<br/>Exposes: sync_frame, list_*, get_status"]
  figma["Figma REST API"]
  lovable["Lovable MCP HTTP"]
  stitch["Stitch MCP stdio"]

  agents -->|"MCP Client (stdio / HTTP)"| server
  server -->|"Internal Adapters"| figma
  server -->|"Internal Adapters"| lovable
  server -->|"Internal Adapters"| stitch
```
