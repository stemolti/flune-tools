import type { Command } from "commander";

import { loadConfig, upsertPlugin } from "../../core/config.js";
import { loginFlow } from "../../core/oauth.js";
import type { HttpPluginEntry } from "../../types.js";

function parseServerUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  const isLoopback =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (parsed.protocol !== "https:" && !isLoopback) {
    throw new Error(
      `Remote MCP servers must use https (got "${parsed.protocol}//"). Only loopback hosts may use http.`,
    );
  }
  return parsed;
}

export function registerRemoteCommand(program: Command): void {
  const remote = program
    .command("remote")
    .description("Manage remote (Streamable HTTP) MCP servers");

  remote
    .command("add")
    .description("Register a remote MCP server (authenticate later with 'flune login')")
    .argument("<name>", "local name for the server (e.g. mobbin)")
    .argument("<url>", "server URL (e.g. https://api.mobbin.com/mcp)")
    .action(async (name: string, url: string) => {
      const parsed = parseServerUrl(url);
      const entry: HttpPluginEntry = {
        name,
        version: "0.0.0",
        status: "installed",
        transport: "http",
        url: parsed.toString(),
        installedAt: new Date().toISOString(),
      };
      await upsertPlugin(entry);
      console.log(`Registered remote MCP server "${name}" → ${parsed.toString()}`);
      console.log(`Authenticate with: flune login ${name}`);
    });

  // `flune login <name>` is a top-level convenience alongside `remote add`.
  program
    .command("login")
    .description("Authenticate with a registered remote MCP server (opens a browser)")
    .argument("<name>", "name of a registered remote server")
    .action(async (name: string) => {
      const config = await loadConfig();
      const entry = config.plugins[name];
      if (!entry) {
        throw new Error(
          `No server named "${name}". Add it first: flune remote add ${name} <url>`,
        );
      }
      if (entry.transport !== "http") {
        throw new Error(`"${name}" is a local plugin, not a remote server.`);
      }
      console.log(`Authenticating with "${name}" — a browser window will open...`);
      await loginFlow(name, entry.url);
      console.log(`Authenticated. "${name}" is ready — run "flune serve".`);
    });
}
