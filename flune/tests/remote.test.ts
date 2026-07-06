import { afterEach, describe, expect, it } from "vitest";

import { McpSessionManager } from "../src/proxy/mcp-executor.js";
import type { HttpPluginEntry } from "../src/types.js";
import {
  startFakeHttpMcpServer,
  type FakeHttpMcp,
} from "./fixtures/fake-http-mcp-server.js";

function httpEntry(url: string): HttpPluginEntry {
  return {
    name: "fake-http",
    version: "0.0.0",
    status: "installed",
    transport: "http",
    url,
    installedAt: new Date().toISOString(),
  };
}

describe("remote http mcp", () => {
  let server: FakeHttpMcp | undefined;
  let mgr: McpSessionManager | undefined;

  afterEach(async () => {
    await mgr?.closeAll();
    await server?.close();
    server = undefined;
    mgr = undefined;
  });

  it("lists tools from a remote server over Streamable HTTP", async () => {
    server = await startFakeHttpMcpServer();
    mgr = new McpSessionManager([httpEntry(server.url)]);

    const tools = await mgr.listAllTools();
    expect(tools.map((t) => t.toolName)).toEqual(["search"]);
    expect(tools[0].pluginName).toBe("fake-http");
  });

  it("calls a tool over Streamable HTTP and returns its text output", async () => {
    server = await startFakeHttpMcpServer();
    mgr = new McpSessionManager([httpEntry(server.url)]);

    const result = await mgr.callTool("fake-http", "search", {
      query: "onboarding",
    });
    expect(result).toBe("results for: onboarding");
  });

  it("excludes an unreachable remote server instead of failing the listing", async () => {
    // Port 1 is unbound; the connection fails and the plugin is skipped.
    mgr = new McpSessionManager([httpEntry("http://127.0.0.1:1/mcp")]);

    const tools = await mgr.listAllTools();
    expect(tools).toEqual([]);
    expect(mgr.statuses()).toEqual([{ name: "fake-http", status: "error" }]);
  });
});
