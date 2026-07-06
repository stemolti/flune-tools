import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig, saveConfig, upsertPlugin } from "../src/core/config.js";
import { configPath } from "../src/core/paths.js";
import { fixturePluginEntry, makeTempFluneHome, removeTempFluneHome } from "./helpers.js";

describe("config registry", () => {
  let home: string;

  beforeEach(async () => {
    home = await makeTempFluneHome();
  });

  afterEach(async () => {
    await removeTempFluneHome(home);
  });

  it("returns defaults when no config file exists", async () => {
    const cfg = await loadConfig();
    expect(cfg.version).toBe(1);
    expect(cfg.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(cfg.openrouter.apiKey).toBeNull();
    expect(cfg.proxy.port).toBe(4000);
    expect(cfg.plugins).toEqual({});
  });

  it("round-trips through saveConfig/loadConfig", async () => {
    const cfg = await loadConfig();
    cfg.openrouter.apiKey = "sk-or-test";
    cfg.proxy.port = 5555;
    await saveConfig(cfg);

    expect(existsSync(configPath())).toBe(true);
    const again = await loadConfig();
    expect(again.openrouter.apiKey).toBe("sk-or-test");
    expect(again.proxy.port).toBe(5555);
  });

  it("upsertPlugin adds and replaces entries persistently", async () => {
    const entry = fixturePluginEntry();
    await upsertPlugin(entry);

    let cfg = await loadConfig();
    expect(cfg.plugins["fake-mcp-server"]).toMatchObject({
      name: "fake-mcp-server",
      version: "1.0.0",
      status: "installed",
    });

    await upsertPlugin({ ...entry, version: "2.0.0" });
    cfg = await loadConfig();
    expect(cfg.plugins["fake-mcp-server"].version).toBe("2.0.0");
    expect(Object.keys(cfg.plugins)).toHaveLength(1);
  });
});
