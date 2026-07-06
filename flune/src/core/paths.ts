import { homedir } from "node:os";
import { join } from "node:path";

/** Root of the flune home directory. FLUNE_HOME overrides ~/.flune. */
export function fluneHome(): string {
  return process.env.FLUNE_HOME ?? join(homedir(), ".flune");
}

export function configPath(): string {
  return join(fluneHome(), "config.json");
}

export function pluginsRoot(): string {
  return join(fluneHome(), "plugins");
}

export function pluginInstallDir(name: string): string {
  return join(pluginsRoot(), name);
}
