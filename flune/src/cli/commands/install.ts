import type { Command } from "commander";

import { installPlugin } from "../../core/installer.js";

export function registerInstallCommand(program: Command): void {
  program
    .command("install")
    .description(
      "Install an MCP plugin from the npm registry into ~/.flune/plugins",
    )
    .argument("<package>", "npm package name (or tarball/git spec)")
    .option("--pm <manager>", "package manager to use (npm|pnpm|yarn|bun)")
    .action(async (pkgSpec: string, options: { pm?: string }) => {
      console.log(`Installing ${pkgSpec} ...`);
      const entry = await installPlugin(pkgSpec, {
        packageManager: options.pm,
      });
      console.log(`Installed ${entry.name}@${entry.version}`);
      console.log(`  path:  ${entry.installPath}`);
      console.log(`  entry: ${entry.entryPoint}`);
      console.log(`Run "flune serve" to expose it to your LLM clients.`);
    });
}
