#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { Command } from "commander";

import { registerInstallCommand } from "./commands/install.js";
import { registerListCommand } from "./commands/list.js";
import { registerRemoteCommand } from "./commands/remote.js";
import { registerServeCommand } from "./commands/serve.js";

const pkg = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

const program = new Command();

program
  .name("flune")
  .description(
    "Plugin manager and local MCP proxy — an OpenAI-compatible endpoint that gives any LLM client MCP tool-calling via OpenRouter",
  )
  .version(pkg.version);

registerInstallCommand(program);
registerListCommand(program);
registerRemoteCommand(program);
registerServeCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
