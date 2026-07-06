import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { PluginEntry, PluginStatus } from "../types.js";

export interface McpToolInfo {
  pluginName: string;
  toolName: string;
  description?: string;
  inputSchema: unknown;
}

/**
 * Owns one persistent stdio MCP session per plugin. Sessions are spawned
 * lazily on first use and reused across requests; a plugin that fails to
 * start is excluded from tool listings instead of taking the proxy down.
 */
export class McpSessionManager {
  private readonly plugins = new Map<string, PluginEntry>();
  private readonly clients = new Map<string, Client>();
  private readonly failed = new Set<string>();
  private toolCache: McpToolInfo[] | null = null;

  constructor(plugins: PluginEntry[]) {
    for (const plugin of plugins) {
      if (plugin.status === "installed") this.plugins.set(plugin.name, plugin);
    }
  }

  private async getClient(pluginName: string): Promise<Client> {
    const existing = this.clients.get(pluginName);
    if (existing) return existing;

    const plugin = this.plugins.get(pluginName);
    if (!plugin) throw new Error(`Unknown plugin "${pluginName}"`);

    const transport = new StdioClientTransport({
      command: plugin.command,
      args: plugin.args,
    });
    const client = new Client({ name: "flune-proxy", version: "0.1.0" });
    await client.connect(transport);
    this.clients.set(pluginName, client);
    return client;
  }

  async listAllTools(): Promise<McpToolInfo[]> {
    if (this.toolCache) return this.toolCache;

    const all: McpToolInfo[] = [];
    for (const pluginName of this.plugins.keys()) {
      if (this.failed.has(pluginName)) continue;
      try {
        const client = await this.getClient(pluginName);
        const result = await client.listTools();
        for (const tool of result.tools) {
          all.push({
            pluginName,
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });
        }
      } catch (err) {
        this.failed.add(pluginName);
        this.clients.delete(pluginName);
        console.warn(
          `[flune] plugin "${pluginName}" failed to start, excluding its tools: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.toolCache = all;
    return all;
  }

  async callTool(
    pluginName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const client = await this.getClient(pluginName);
    const result = await client.callTool({ name: toolName, arguments: args });
    return renderToolResult(result);
  }

  statuses(): Array<{ name: string; status: PluginStatus }> {
    return [...this.plugins.values()].map((plugin) => ({
      name: plugin.name,
      status: this.failed.has(plugin.name) ? "error" : plugin.status,
    }));
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled(
      [...this.clients.values()].map((client) => client.close()),
    );
    this.clients.clear();
    this.toolCache = null;
  }
}

function renderToolResult(result: unknown): string {
  const record = result as {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  const content = Array.isArray(record?.content) ? record.content : [];
  const texts = content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string);
  const text = texts.length > 0 ? texts.join("\n") : JSON.stringify(result);
  return record?.isError ? `Tool error: ${text}` : text;
}
