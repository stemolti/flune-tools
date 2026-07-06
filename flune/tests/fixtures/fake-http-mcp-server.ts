// In-process remote MCP server over Streamable HTTP, used to exercise flune's
// http transport fully offline (localhost only). Built on the SDK's own server
// transport so it speaks the exact protocol the client transport expects.
// Uses the SDK's stateful session pattern: an initialize request spins up a
// transport keyed by a generated session id that later requests reuse.

import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface FakeHttpMcp {
  url: string;
  close: () => Promise<void>;
}

function buildMcpServer(): McpServer {
  const mcp = new McpServer(
    { name: "fake-http-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search",
        description: "Search fake UI references",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ],
  }));

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const query =
      (request.params.arguments as { query?: string } | undefined)?.query ?? "";
    return { content: [{ type: "text", text: `results for: ${query}` }] };
  });

  return mcp;
}

export async function startFakeHttpMcpServer(): Promise<FakeHttpMcp> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer: HttpServer = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      void handle(req, res, chunks);
    });
  });

  async function handle(
    req: Parameters<Parameters<typeof createServer>[1]>[0],
    res: Parameters<Parameters<typeof createServer>[1]>[1],
    chunks: Buffer[],
  ): Promise<void> {
    const raw = Buffer.concat(chunks).toString("utf8");
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let transport = sessionId ? transports.get(sessionId) : undefined;

    const isInitialize =
      !Array.isArray(body) &&
      typeof body === "object" &&
      body !== null &&
      (body as { method?: string }).method === "initialize";

    if (!transport && isInitialize) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => transports.set(id, transport!),
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await buildMcpServer().connect(transport);
    }

    if (!transport) {
      res.writeHead(400, { "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "No valid session" },
          id: null,
        }),
      );
      return;
    }

    await transport.handleRequest(req, res, body);
  }

  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const address = httpServer.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const transport of transports.values()) void transport.close();
        httpServer.close(() => resolve());
      }),
  };
}
