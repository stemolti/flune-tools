import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { PluginEntry } from "../src/types.js";

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-mcp-server",
);

export const FIXTURE_SERVER_JS = join(FIXTURE_DIR, "server.js");

/** Creates an isolated ~/.flune for the test and points FLUNE_HOME at it. */
export async function makeTempFluneHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "flune-test-"));
  process.env.FLUNE_HOME = dir;
  return dir;
}

export async function removeTempFluneHome(dir: string): Promise<void> {
  delete process.env.FLUNE_HOME;
  await rm(dir, { recursive: true, force: true });
}

/** A registry entry pointing straight at the fixture server (no install step). */
export function fixturePluginEntry(): PluginEntry {
  return {
    name: "fake-mcp-server",
    version: "1.0.0",
    status: "installed",
    installPath: FIXTURE_DIR,
    entryPoint: FIXTURE_SERVER_JS,
    command: process.execPath,
    args: [FIXTURE_SERVER_JS],
    packageManager: "npm",
    installedAt: new Date().toISOString(),
  };
}
