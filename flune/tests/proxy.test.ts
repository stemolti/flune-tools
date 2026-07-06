import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig, saveConfig } from "../src/core/config.js";
import { startServer } from "../src/proxy/server.js";
import { fixturePluginEntry, makeTempFluneHome, removeTempFluneHome } from "./helpers.js";

type Responder = (body: any, reply: FastifyReply) => unknown;

interface FakeUpstream {
  app: FastifyInstance;
  baseUrl: string;
  requests: Array<{ body: any; auth: string | undefined }>;
  script: (responders: Responder[]) => void;
}

async function makeFakeOpenRouter(): Promise<FakeUpstream> {
  const requests: FakeUpstream["requests"] = [];
  let responders: Responder[] = [];

  const app = Fastify();
  app.post("/v1/chat/completions", async (req, reply) => {
    requests.push({ body: req.body, auth: req.headers.authorization });
    const responder = responders.shift();
    if (!responder) {
      return reply.code(500).send({ error: { message: "no responder scripted" } });
    }
    return responder(req.body, reply);
  });
  app.get("/v1/models", async () => ({ data: [{ id: "fake/model" }] }));

  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    script: (r) => {
      responders = r;
    },
  };
}

function toolCallResponse(name: string, args: object) {
  return {
    id: "gen-upstream-1",
    object: "chat.completion",
    created: 1,
    model: "fake/model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };
}

function textResponse(text: string) {
  return {
    id: "gen-upstream-2",
    object: "chat.completion",
    created: 2,
    model: "fake/model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
  };
}

function sseResponder(chunks: object[]): Responder {
  return (_body, reply) => {
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    reply.raw.write(": OPENROUTER PROCESSING\n\n");
    for (const chunk of chunks) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  };
}

function chunk(id: string, delta: object, finish: string | null = null) {
  return {
    id,
    object: "chat.completion.chunk",
    created: 1,
    model: "fake/model",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

const STREAM_TOOL_ROUND = [
  chunk("gen-1", {
    role: "assistant",
    tool_calls: [
      {
        index: 0,
        id: "call_1",
        type: "function",
        function: { name: "fake-mcp-server__add", arguments: "" },
      },
    ],
  }),
  chunk("gen-1", { tool_calls: [{ index: 0, function: { arguments: '{"a":2,' } }] }),
  chunk("gen-1", { tool_calls: [{ index: 0, function: { arguments: '"b":3}' } }] }),
  chunk("gen-1", {}, "tool_calls"),
];

const STREAM_FINAL_ROUND = [
  chunk("gen-2", { role: "assistant", content: "" }),
  chunk("gen-2", { content: "The result is " }),
  chunk("gen-2", { content: "5" }),
  chunk("gen-2", {}, "stop"),
];

describe("proxy server", () => {
  let home: string;
  let upstream: FakeUpstream;
  let proxy: { app: FastifyInstance; url: string };
  let savedKey: string | undefined;

  beforeEach(async () => {
    savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    home = await makeTempFluneHome();
    upstream = await makeFakeOpenRouter();

    const cfg = await loadConfig();
    cfg.openrouter.baseUrl = upstream.baseUrl;
    cfg.openrouter.apiKey = "test-key";
    cfg.plugins["fake-mcp-server"] = fixturePluginEntry();
    await saveConfig(cfg);

    proxy = await startServer({ port: 0, host: "127.0.0.1" });
  });

  afterEach(async () => {
    await proxy?.app.close();
    await upstream?.app.close();
    await removeTempFluneHome(home);
    if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
  });

  async function postChat(body: object, headers: Record<string, string> = {}) {
    return fetch(`${proxy.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("injects plugin tools, executes local tool calls, and returns the final answer", async () => {
    upstream.script([
      (_body, _reply) => toolCallResponse("fake-mcp-server__add", { a: 2, b: 3 }),
      (_body, _reply) => textResponse("The result is 5"),
    ]);

    const res = await postChat({
      model: "fake/model",
      messages: [{ role: "user", content: "add 2 and 3" }],
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.choices[0].message.content).toBe("The result is 5");
    expect(body.choices[0].finish_reason).toBe("stop");

    // Round 1: plugin tools were injected and the proxy key was used.
    expect(upstream.requests).toHaveLength(2);
    const round1 = upstream.requests[0];
    expect(round1.auth).toBe("Bearer test-key");
    const toolNames = round1.body.tools.map((t: any) => t.function.name).sort();
    expect(toolNames).toEqual(["fake-mcp-server__add", "fake-mcp-server__echo"]);

    // Round 2: the tool result was fed back to the upstream.
    const round2 = upstream.requests[1];
    const toolMsg = round2.body.messages.find((m: any) => m.role === "tool");
    expect(toolMsg).toMatchObject({ tool_call_id: "call_1", content: "5" });
    const assistantMsg = round2.body.messages.find((m: any) => m.tool_calls);
    expect(assistantMsg.tool_calls[0].function.name).toBe("fake-mcp-server__add");
  });

  it("streams the final answer as SSE and hides local tool-call rounds", async () => {
    upstream.script([sseResponder(STREAM_TOOL_ROUND), sseResponder(STREAM_FINAL_ROUND)]);

    const res = await postChat({
      model: "fake/model",
      stream: true,
      messages: [{ role: "user", content: "add 2 and 3" }],
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const raw = await res.text();
    expect(raw).not.toContain("fake-mcp-server__add");
    expect(raw.trimEnd().endsWith("data: [DONE]")).toBe(true);

    const deltas = raw
      .split("\n")
      .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
      .map((l) => JSON.parse(l.slice("data: ".length)));
    const text = deltas
      .map((d) => d.choices?.[0]?.delta?.content ?? "")
      .join("");
    expect(text).toBe("The result is 5");
    const finish = deltas.at(-1)?.choices?.[0]?.finish_reason;
    expect(finish).toBe("stop");
  });

  it("passes through tool calls that belong to client-supplied tools", async () => {
    upstream.script([
      (_body, _reply) => toolCallResponse("client_weather", { city: "Rome" }),
    ]);

    const res = await postChat({
      model: "fake/model",
      messages: [{ role: "user", content: "weather in Rome?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "client_weather",
            description: "Client-side weather tool",
            parameters: { type: "object", properties: { city: { type: "string" } } },
          },
        },
      ],
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.choices[0].message.tool_calls[0].function.name).toBe("client_weather");
    // Only one upstream round: the proxy must not try to execute client tools.
    expect(upstream.requests).toHaveLength(1);
    // Client tool and plugin tools coexist in the forwarded payload.
    const names = upstream.requests[0].body.tools.map((t: any) => t.function.name);
    expect(names).toContain("client_weather");
    expect(names).toContain("fake-mcp-server__add");
  });

  it("returns 401 when no API key is available anywhere", async () => {
    const cfg = await loadConfig();
    cfg.openrouter.apiKey = null;
    await saveConfig(cfg);
    await proxy.app.close();
    proxy = await startServer({ port: 0, host: "127.0.0.1" });

    const res = await postChat({
      model: "fake/model",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error.message).toMatch(/api key/i);
  });

  it("falls back to the client Authorization header when no key is configured", async () => {
    const cfg = await loadConfig();
    cfg.openrouter.apiKey = null;
    await saveConfig(cfg);
    await proxy.app.close();
    proxy = await startServer({ port: 0, host: "127.0.0.1" });

    upstream.script([(_body, _reply) => textResponse("hello")]);
    const res = await postChat(
      { model: "fake/model", messages: [{ role: "user", content: "hi" }] },
      { authorization: "Bearer client-key" },
    );

    expect(res.status).toBe(200);
    expect(upstream.requests[0].auth).toBe("Bearer client-key");
  });

  it("exposes /v1/models passthrough and /healthz", async () => {
    const models = await fetch(`${proxy.url}/v1/models`);
    expect(models.status).toBe(200);
    const modelsBody: any = await models.json();
    expect(modelsBody.data[0].id).toBe("fake/model");

    const health = await fetch(`${proxy.url}/healthz`);
    expect(health.status).toBe(200);
    const healthBody: any = await health.json();
    expect(healthBody.status).toBe("ok");
    expect(healthBody.plugins).toMatchObject([{ name: "fake-mcp-server" }]);
  });
});
