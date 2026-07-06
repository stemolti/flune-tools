import type { PackageManagerName } from "../types.js";

const SUPPORTED: ReadonlySet<string> = new Set(["npm", "pnpm", "yarn", "bun"]);

export function resolvePackageManager(explicit?: string): PackageManagerName {
  if (!explicit) return "npm";
  if (!SUPPORTED.has(explicit)) {
    throw new Error(
      `Unsupported package manager "${explicit}". Use one of: npm, pnpm, yarn, bun.`,
    );
  }
  return explicit as PackageManagerName;
}

export interface InstallCommand {
  command: string;
  args: string[];
}

/**
 * Command that installs `pkgSpec` with its dependencies isolated inside
 * `targetDir` (the per-plugin prefix under ~/.flune/plugins).
 */
export function installCommand(
  pm: PackageManagerName,
  targetDir: string,
  pkgSpec: string,
): InstallCommand {
  switch (pm) {
    case "npm":
      return {
        command: "npm",
        args: [
          "install",
          "--prefix",
          targetDir,
          "--no-audit",
          "--no-fund",
          "--loglevel",
          "error",
          pkgSpec,
        ],
      };
    case "pnpm":
      return { command: "pnpm", args: ["add", "--dir", targetDir, pkgSpec] };
    case "yarn":
      return { command: "yarn", args: ["add", "--cwd", targetDir, pkgSpec] };
    case "bun":
      return { command: "bun", args: ["add", "--cwd", targetDir, pkgSpec] };
  }
}
