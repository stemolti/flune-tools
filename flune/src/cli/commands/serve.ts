import type { Command } from "commander";

import { startServer } from "../../proxy/server.js";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description(
      "Start the local OpenAI-compatible MCP proxy in front of OpenRouter",
    )
    .option("--port <port>", "port to listen on", (v) => Number.parseInt(v, 10))
    .option("--host <host>", "host to bind to")
    .action(async (options: { port?: number; host?: string }) => {
      const { app, url } = await startServer({
        port: options.port,
        host: options.host,
        logger: true,
      });
      console.log(`flune proxy listening at ${url}/v1`);
      console.log(
        "Point any OpenAI-compatible client at this base URL to use your MCP plugins.",
      );

      const shutdown = () => {
        void app.close().then(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
}
