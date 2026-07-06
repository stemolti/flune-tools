import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { FluneConfig, PluginEntry } from "../types.js";
import { configPath } from "./paths.js";

export function defaultConfig(): FluneConfig {
  return {
    version: 1,
    openrouter: {
      apiKey: null,
      baseUrl: "https://openrouter.ai/api/v1",
    },
    proxy: {
      port: 4000,
      host: "127.0.0.1",
    },
    plugins: {},
  };
}

export async function loadConfig(): Promise<FluneConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw err;
  }

  let parsed: Partial<FluneConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<FluneConfig>;
  } catch (err) {
    throw new Error(
      `Config at ${configPath()} is not valid JSON: ${(err as Error).message}`,
    );
  }

  const defaults = defaultConfig();
  return {
    ...defaults,
    ...parsed,
    openrouter: { ...defaults.openrouter, ...parsed.openrouter },
    proxy: { ...defaults.proxy, ...parsed.proxy },
    plugins: parsed.plugins ?? {},
  };
}

export async function saveConfig(config: FluneConfig): Promise<void> {
  const target = configPath();
  await mkdir(dirname(target), { recursive: true });
  // Atomic write: never leave a half-written config behind.
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
  await rename(tmp, target);
}

export async function upsertPlugin(entry: PluginEntry): Promise<FluneConfig> {
  const config = await loadConfig();
  config.plugins[entry.name] = entry;
  await saveConfig(config);
  return config;
}
