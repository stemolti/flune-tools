import Fastify, { type FastifyInstance } from "fastify";

import { loadConfig } from "../core/config.js";
import type { ChatCompletionRequest } from "../types.js";
import { McpSessionManager } from "./mcp-executor.js";
import { listModels, UpstreamError } from "./openrouter.js";
import {
  completeChat,
  streamChat,
  ToolRoundLimitError,
  type SseSink,
} from "./orchestrator.js";

export interface ServeOptions {
  port?: number;
  host?: string;
  logger?: boolean;
}

export async function startServer(
  options: ServeOptions = {},
): Promise<{ app: FastifyInstance; url: string }> {
  const config = await loadConfig();
  const sessions = new McpSessionManager(Object.values(config.plugins));
  const app = Fastify({ logger: options.logger ?? false });

  app.addHook("onClose", async () => {
    await sessions.closeAll();
  });

  function resolveAuthorization(
    clientHeader: string | undefined,
  ): string | null {
    if (process.env.OPENROUTER_API_KEY) {
      return `Bearer ${process.env.OPENROUTER_API_KEY}`;
    }
    if (config.openrouter.apiKey) return `Bearer ${config.openrouter.apiKey}`;
    if (clientHeader) return clientHeader;
    return null;
  }

  app.post("/v1/chat/completions", async (request, reply) => {
    const body = request.body as ChatCompletionRequest | null;
    if (!body || !Array.isArray(body.messages)) {
      return reply.code(400).send({
        error: {
          message: "messages array is required",
          type: "invalid_request_error",
        },
      });
    }

    const authorization = resolveAuthorization(request.headers.authorization);
    if (!authorization) {
      return reply.code(401).send({
        error: {
          message:
            "No OpenRouter API key available. Set OPENROUTER_API_KEY, add it to ~/.flune/config.json, or send an Authorization header.",
          type: "authentication_error",
        },
      });
    }

    const target = { baseUrl: config.openrouter.baseUrl, authorization };

    if (body.stream) {
      // Headers are deferred to the first write so upstream failures that
      // happen before any output can still produce a proper JSON error.
      let started = false;
      const sink: SseSink = {
        write(event) {
          if (!started) {
            reply.raw.writeHead(200, {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache",
              connection: "keep-alive",
            });
            started = true;
          }
          reply.raw.write(
            event === "[DONE]"
              ? "data: [DONE]\n\n"
              : `data: ${JSON.stringify(event)}\n\n`,
          );
        },
        end() {
          reply.raw.end();
        },
      };
      reply.hijack();
      try {
        await streamChat(body, target, sessions, sink);
      } catch (err) {
        const { status, payload } = errorToPayload(err);
        if (!started) {
          reply.raw.writeHead(status, { "content-type": "application/json" });
          reply.raw.end(JSON.stringify(payload));
        } else {
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
          reply.raw.write("data: [DONE]\n\n");
          reply.raw.end();
        }
      }
      return reply;
    }

    try {
      return await completeChat(body, target, sessions);
    } catch (err) {
      const { status, payload } = errorToPayload(err);
      return reply.code(status).send(payload);
    }
  });

  app.get("/v1/models", async (request, reply) => {
    const authorization =
      resolveAuthorization(request.headers.authorization) ?? undefined;
    const { status, body } = await listModels({
      baseUrl: config.openrouter.baseUrl,
      authorization,
    });
    return reply.code(status).send(body);
  });

  app.get("/healthz", async () => ({
    status: "ok",
    plugins: sessions.statuses(),
  }));

  await app.listen({
    port: options.port ?? config.proxy.port,
    host: options.host ?? config.proxy.host,
  });

  const address = app.server.address();
  const url =
    address && typeof address === "object"
      ? `http://${address.address}:${address.port}`
      : String(address);
  return { app, url };
}

function errorToPayload(err: unknown): {
  status: number;
  payload: Record<string, unknown>;
} {
  if (err instanceof UpstreamError) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(err.body);
    } catch {
      parsed = undefined;
    }
    const payload =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : { error: { message: err.body || err.message, type: "upstream_error" } };
    return { status: err.status, payload };
  }
  if (err instanceof ToolRoundLimitError) {
    return {
      status: 500,
      payload: { error: { message: err.message, type: "tool_loop_error" } },
    };
  }
  return {
    status: 502,
    payload: {
      error: {
        message: err instanceof Error ? err.message : String(err),
        type: "proxy_error",
      },
    },
  };
}
