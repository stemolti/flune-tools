import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { PluginEntry } from "../types.js";
import { upsertPlugin } from "./config.js";
import {
  installCommand,
  resolvePackageManager,
  type InstallCommand,
} from "./package-manager.js";
import { pluginInstallDir, pluginsRoot } from "./paths.js";

export interface InstallOptions {
  packageManager?: string;
}

/**
 * Installs an MCP plugin from the npm registry (or a tarball/git spec) into
 * an isolated prefix under ~/.flune/plugins/<name> and records it in
 * ~/.flune/config.json.
 */
export async function installPlugin(
  pkgSpec: string,
  options: InstallOptions = {},
): Promise<PluginEntry> {
  const pm = resolvePackageManager(options.packageManager);
  const registryName = parseRegistryName(pkgSpec);

  // Registry specs install straight into plugins/<name>. Path/URL specs go
  // through a staging dir first, because the package name is only known
  // after the package manager has resolved them.
  const targetDir = registryName
    ? pluginInstallDir(registryName)
    : join(pluginsRoot(), `.staging-${randomUUID().slice(0, 8)}`);

  await mkdir(targetDir, { recursive: true });
  // Seed a manifest so the package manager saves the dependency, which is how
  // we discover the installed package's name for non-registry specs.
  await writeFile(
    join(targetDir, "package.json"),
    JSON.stringify({ name: "flune-plugin-host", private: true }, null, 2) + "\n",
    "utf8",
  );

  try {
    await run(installCommand(pm, targetDir, pkgSpec));

    const name = await installedDependencyName(targetDir, registryName);
    let installPath = targetDir;
    if (!registryName) {
      installPath = pluginInstallDir(name);
      await rm(installPath, { recursive: true, force: true });
      await mkdir(dirname(installPath), { recursive: true });
      await rename(targetDir, installPath);
    }

    const packageDir = join(installPath, "node_modules", ...name.split("/"));
    const manifest = JSON.parse(
      await readFile(join(packageDir, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    const entryPoint = resolveEntryPoint(packageDir, manifest);

    const entry: PluginEntry = {
      name,
      version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
      status: "installed",
      installPath,
      entryPoint,
      command: "node",
      args: [entryPoint],
      packageManager: pm,
      installedAt: new Date().toISOString(),
    };
    await upsertPlugin(entry);
    return entry;
  } catch (err) {
    if (!registryName) {
      await rm(targetDir, { recursive: true, force: true });
    }
    throw err;
  }
}

/**
 * Extracts the package name from a registry-style spec ("pkg", "pkg@1.2.3",
 * "@scope/pkg@^2"). Returns null for anything else (paths, tarballs, URLs,
 * git specs) — those need an install before the name is known.
 */
export function parseRegistryName(spec: string): string | null {
  if (/\.(tgz|tar\.gz|tar)$/i.test(spec)) return null;
  if (/[\\:]/.test(spec)) return null; // windows paths, URLs, git+ssh specs
  if (spec.startsWith(".") || spec.startsWith("/")) return null;
  const match = /^(@[^/@]+\/)?([^/@]+)(@.+)?$/.exec(spec);
  if (!match) return null;
  return (match[1] ?? "") + match[2];
}

async function installedDependencyName(
  targetDir: string,
  expected: string | null,
): Promise<string> {
  if (expected) return expected;
  const manifest = JSON.parse(
    await readFile(join(targetDir, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const deps = Object.keys(manifest.dependencies ?? {});
  if (deps.length !== 1) {
    throw new Error(
      `Could not determine the installed plugin name (found ${deps.length} dependencies: ${deps.join(", ") || "none"})`,
    );
  }
  return deps[0];
}

function resolveEntryPoint(
  packageDir: string,
  manifest: Record<string, unknown>,
): string {
  let relative: string | undefined;
  const bin = manifest.bin;
  if (typeof bin === "string") {
    relative = bin;
  } else if (bin && typeof bin === "object") {
    const entries = bin as Record<string, string>;
    relative =
      entries[manifest.name as string] ?? Object.values(entries)[0];
  }
  if (!relative && typeof manifest.main === "string") relative = manifest.main;
  if (!relative) {
    throw new Error(
      `Package "${String(manifest.name)}" has no "bin" or "main" entry point; cannot register it as an MCP plugin.`,
    );
  }
  return resolve(packageDir, relative);
}

function run(cmd: InstallCommand): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const isWindows = process.platform === "win32";
    // npm/pnpm/yarn are .cmd shims on Windows and must run through a shell;
    // compose a single quoted command line because spawn() does not escape
    // args in shell mode (DEP0190).
    const child = isWindows
      ? spawn([cmd.command, ...cmd.args.map(quoteForCmd)].join(" "), {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn(cmd.command, cmd.args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(
          new Error(
            `"${cmd.command}" exited with code ${code}:\n${output.trim()}`,
          ),
        );
      }
    });
  });
}

function quoteForCmd(arg: string): string {
  return /[\s^&|<>()"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}
