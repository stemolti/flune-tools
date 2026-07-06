import { afterEach, describe, expect, it } from "vitest";

import { McpSessionManager } from "../src/proxy/mcp-executor.js";
import { fixturePluginEntry } from "./helpers.js";

describe("mcp-executor", () => {
  let mgr: McpSessionManager;

  afterEach(async () => {
    await mgr?.closeAll();
  });

  it("lists tools from a live stdio session", async () => {
    mgr = new McpSessionManager([fixturePluginEntry()]);
    const tools = await mgr.listAllTools();

    const names = tools.map((t) => t.toolName).sort();
    expect(names).toEqual(["add", "echo"]);
    for (const tool of tools) {
      expect(tool.pluginName).toBe("fake-mcp-server");
    }
    const add = tools.find((t) => t.toolName === "add")!;
    expect(add.inputSchema).toMatchObject({
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
    });
  });

  it("calls a tool and returns its text output", async () => {
    mgr = new McpSessionManager([fixturePluginEntry()]);
    const result = await mgr.callTool("fake-mcp-server", "add", { a: 2, b: 3 });
    expect(result).toBe("5");

    const echoed = await mgr.callTool("fake-mcp-server", "echo", {
      message: "hi there",
    });
    expect(echoed).toBe("hi there");
  });

  it("skips broken plugins instead of failing the whole listing", async () => {
    const broken = {
      ...fixturePluginEntry(),
      name: "broken-plugin",
      entryPoint: "Z:/definitely/not/a/real/entrypoint.js",
      args: ["Z:/definitely/not/a/real/entrypoint.js"],
    };
    mgr = new McpSessionManager([broken, fixturePluginEntry()]);

    const tools = await mgr.listAllTools();
    const plugins = new Set(tools.map((t) => t.pluginName));
    expect(plugins).toEqual(new Set(["fake-mcp-server"]));
  });
});
