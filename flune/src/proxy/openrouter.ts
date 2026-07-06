import type { ChatCompletionChunk, ChatCompletionResponse } from "../types.js";

export interface UpstreamTarget {
  baseUrl: string;
  /** Full header value, e.g. "Bearer sk-or-...". */
  authorization: string;
}

export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Upstream request failed with status ${status}`);
    this.name = "UpstreamError";
  }
}

const ATTRIBUTION_HEADERS = {
  "HTTP-Referer": "https://github.com/stemolti/flune-tools",
  "X-Title": "flune",
};

function requestHeaders(target: UpstreamTarget): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: target.authorization,
    ...ATTRIBUTION_HEADERS,
  };
}

export async function chatCompletion(
  target: UpstreamTarget,
  body: object,
): Promise<ChatCompletionResponse> {
  const res = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: requestHeaders(target),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new UpstreamError(res.status, await res.text());
  return (await res.json()) as ChatCompletionResponse;
}

export async function* chatCompletionStream(
  target: UpstreamTarget,
  body: object,
): AsyncGenerator<ChatCompletionChunk> {
  const res = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: requestHeaders(target),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new UpstreamError(res.status, await res.text());
  if (!res.body) throw new UpstreamError(res.status, "upstream returned no body");

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const piece of res.body) {
    buffer += decoder.decode(piece as Uint8Array, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let separator: number;
    while ((separator = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      for (const line of event.split("\n")) {
        // Non-data lines are SSE comments/keep-alives (": OPENROUTER PROCESSING").
        if (!line.startsWith("data:")) continue;
        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") return;
        if (data) yield JSON.parse(data) as ChatCompletionChunk;
      }
    }
  }
}

export async function listModels(target: {
  baseUrl: string;
  authorization?: string;
}): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (target.authorization) headers.authorization = target.authorization;
  const res = await fetch(`${target.baseUrl}/models`, { headers });
  const body: unknown = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
