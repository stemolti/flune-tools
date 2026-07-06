import { randomUUID } from "node:crypto";

import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  OpenAITool,
  ToolCall,
} from "../types.js";
import type { McpSessionManager } from "./mcp-executor.js";
import {
  chatCompletion,
  chatCompletionStream,
  type UpstreamTarget,
} from "./openrouter.js";
import { mergeTools, ToolRouter } from "./tool-bridge.js";

export const MAX_TOOL_ROUNDS = 10;

export class ToolRoundLimitError extends Error {
  constructor() {
    super(
      `Model kept requesting tools after ${MAX_TOOL_ROUNDS} rounds; aborting to avoid an infinite loop`,
    );
    this.name = "ToolRoundLimitError";
  }
}

interface Prepared {
  messages: ChatMessage[];
  tools: OpenAITool[];
  router: ToolRouter;
}

async function prepare(
  request: ChatCompletionRequest,
  sessions: McpSessionManager,
): Promise<Prepared> {
  const mcpTools = await sessions.listAllTools();
  const clientToolNames = (request.tools ?? [])
    .map((tool) => tool.function?.name)
    .filter((name): name is string => typeof name === "string");
  const router = new ToolRouter(mcpTools, clientToolNames);
  return {
    messages: [...request.messages],
    tools: mergeTools(request.tools, router.openAiTools()),
    router,
  };
}

function upstreamBody(
  request: ChatCompletionRequest,
  messages: ChatMessage[],
  tools: OpenAITool[],
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...request, messages, stream };
  if (tools.length > 0) body.tools = tools;
  else delete body.tools;
  return body;
}

async function executeLocalToolCalls(
  router: ToolRouter,
  sessions: McpSessionManager,
  toolCalls: ToolCall[],
): Promise<ChatMessage[]> {
  const results: ChatMessage[] = [];
  for (const call of toolCalls) {
    const info = router.resolve(call.function.name);
    let text: string;
    if (!info) {
      text = `Tool execution failed: unknown tool "${call.function.name}"`;
    } else {
      try {
        const args = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {};
        text = await sessions.callTool(info.pluginName, info.toolName, args);
      } catch (err) {
        text = `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`;
        console.warn(`[flune] ${call.function.name}: ${text}`);
      }
    }
    results.push({ role: "tool", tool_call_id: call.id, content: text });
  }
  return results;
}

/**
 * Non-streaming agentic loop: forward the request with plugin tools injected,
 * execute any local tool calls, feed results back, and return the first
 * response that is either plain text or owned by the client's own tools.
 */
export async function completeChat(
  request: ChatCompletionRequest,
  target: UpstreamTarget,
  sessions: McpSessionManager,
): Promise<ChatCompletionResponse> {
  const { messages, tools, router } = await prepare(request, sessions);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatCompletion(
      target,
      upstreamBody(request, messages, tools, false),
    );
    const message = response.choices?.[0]?.message;
    const toolCalls = message?.tool_calls ?? [];
    const localCalls = toolCalls.filter((call) =>
      router.resolve(call.function.name),
    );

    if (toolCalls.length === 0 || localCalls.length < toolCalls.length) {
      // Plain answer, or tool calls the client must handle itself.
      if (localCalls.length > 0) {
        console.warn(
          "[flune] response mixes local and client tool calls; passing through to the client",
        );
      }
      return response;
    }

    messages.push(message as ChatMessage);
    messages.push(...(await executeLocalToolCalls(router, sessions, toolCalls)));
  }
  throw new ToolRoundLimitError();
}

export interface SseSink {
  write(event: ChatCompletionChunk | Record<string, unknown> | "[DONE]"): void;
  end(): void;
}

interface AccumulatedCall {
  id: string;
  name: string;
  args: string;
}

/**
 * Streaming agentic loop. Rounds that only contain local tool calls are
 * buffered and executed silently; content deltas are piped through to the
 * client in real time; tool calls owned by the client are re-emitted verbatim.
 */
export async function streamChat(
  request: ChatCompletionRequest,
  target: UpstreamTarget,
  sessions: McpSessionManager,
  sink: SseSink,
): Promise<void> {
  const { messages, tools, router } = await prepare(request, sessions);
  const streamId = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let roleEmitted = false;

  const synthChunk = (
    delta: Record<string, unknown>,
    finish: string | null = null,
  ): ChatCompletionChunk => ({
    id: streamId,
    object: "chat.completion.chunk",
    created,
    model: request.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  const emit = (chunk: ChatCompletionChunk): void => {
    if (!roleEmitted) {
      if (!chunk.choices[0]?.delta?.role) {
        sink.write(synthChunk({ role: "assistant" }));
      }
      roleEmitted = true;
    }
    sink.write(chunk);
  };

  const finishStream = (): void => {
    sink.write("[DONE]");
    sink.end();
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const calls = new Map<number, AccumulatedCall>();
    let content = "";
    let finish: string | null = null;
    let passthrough = false;

    for await (const chunk of chatCompletionStream(
      target,
      upstreamBody(request, messages, tools, true),
    )) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;

      if (passthrough) {
        emit({ ...chunk, id: streamId, created });
        continue;
      }

      const delta = choice.delta ?? {};

      if (typeof delta.content === "string" && delta.content.length > 0) {
        content += delta.content;
        emit(synthChunk({ content: delta.content }));
      }

      if (delta.tool_calls?.length) {
        for (const fragment of delta.tool_calls) {
          const slot = calls.get(fragment.index) ?? { id: "", name: "", args: "" };
          if (fragment.id) slot.id = fragment.id;
          if (fragment.function?.name) slot.name += fragment.function.name;
          if (fragment.function?.arguments) slot.args += fragment.function.arguments;
          calls.set(fragment.index, slot);
        }
        // Providers send the complete function name in the first fragment of
        // each call, so routing can be decided as soon as a name appears.
        const foreign = [...calls.values()].some(
          (call) => call.name && !router.resolve(call.name),
        );
        if (foreign) {
          passthrough = true;
          // Re-synthesize what was accumulated so far so the client sees the
          // complete tool-call stream, then switch to verbatim forwarding.
          emit(
            synthChunk({
              role: "assistant",
              tool_calls: [...calls.entries()].map(([index, call]) => ({
                index,
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: call.args },
              })),
            }),
          );
        }
      }
    }

    if (passthrough) {
      finishStream();
      return;
    }

    const toolCalls: ToolCall[] = [...calls.values()].map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.args },
    }));

    if (toolCalls.length === 0) {
      emit(synthChunk({}, finish ?? "stop"));
      finishStream();
      return;
    }

    messages.push({
      role: "assistant",
      content: content.length > 0 ? content : null,
      tool_calls: toolCalls,
    });
    messages.push(...(await executeLocalToolCalls(router, sessions, toolCalls)));
  }
  throw new ToolRoundLimitError();
}
