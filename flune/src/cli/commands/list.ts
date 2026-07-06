import type { Command } from "commander";

import { loadConfig } from "../../core/config.js";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List installed MCP plugins")
    .action(async () => {
      const config = await loadConfig();
      const plugins = Object.values(config.plugins);
      if (plugins.length === 0) {
        console.log('No plugins installed. Run "flune install <package>".');
        return;
      }
      for (const plugin of plugins) {
        console.log(
          `${plugin.name}@${plugin.version}  [${plugin.status}]  ${plugin.entryPoint}`,
        );
      }
    });
}
