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

export function authDir(): string {
  return join(fluneHome(), "auth");
}

/** OAuth token store for a remote server. The name is sanitised for use as a filename. */
export function authPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join(authDir(), `${safe}.json`);
}
