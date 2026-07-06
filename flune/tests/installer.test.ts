import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/core/config.js";
import { installPlugin } from "../src/core/installer.js";
import { FIXTURE_DIR, makeTempFluneHome, removeTempFluneHome } from "./helpers.js";

describe("installer", () => {
  let home: string;
  let scratch: string;
  let tarball: string;

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), "flune-pack-"));
    execSync(`npm pack "${FIXTURE_DIR}" --pack-destination "${scratch}"`, {
      stdio: "pipe",
    });
    const files = await readdir(scratch);
    const tgz = files.find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error("npm pack produced no tarball");
    tarball = join(scratch, tgz);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  beforeEach(async () => {
    home = await makeTempFluneHome();
  });

  afterEach(async () => {
    await removeTempFluneHome(home);
  });

  it("installs a plugin tarball into ~/.flune/plugins/<name> and registers it", async () => {
    const entry = await installPlugin(tarball);

    expect(entry.name).toBe("fake-mcp-server");
    expect(entry.version).toBe("1.0.0");
    expect(entry.status).toBe("installed");
    expect(entry.installPath).toBe(join(home, "plugins", "fake-mcp-server"));
    expect(entry.entryPoint.endsWith("server.js")).toBe(true);
    expect(existsSync(entry.entryPoint)).toBe(true);
    expect(entry.command).toBe("node");
    expect(entry.args).toEqual([entry.entryPoint]);

    const cfg = await loadConfig();
    expect(cfg.plugins["fake-mcp-server"]).toMatchObject({
      name: "fake-mcp-server",
      version: "1.0.0",
      status: "installed",
    });
  });

  it("fails loudly when the package cannot be installed", async () => {
    await expect(
      installPlugin(join(scratch, "does-not-exist.tgz")),
    ).rejects.toThrow();

    const cfg = await loadConfig();
    expect(cfg.plugins).toEqual({});
  });
});
