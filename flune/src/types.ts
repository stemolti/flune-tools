// --- flune registry (~/.flune/config.json) ---

export type PackageManagerName = "npm" | "pnpm" | "yarn" | "bun";

export type PluginStatus = "installed" | "error" | "disabled";

export type PluginTransport = "stdio" | "http";

interface BasePluginEntry {
  name: string;
  version: string;
  status: PluginStatus;
  installedAt: string;
}

/** A local plugin executed as a child process and spoken to over stdio (the default). */
export interface StdioPluginEntry extends BasePluginEntry {
  // Absent transport means "stdio" — keeps pre-existing config entries valid.
  transport?: "stdio";
  installPath: string;
  entryPoint: string;
  command: string;
  args: string[];
  packageManager: PackageManagerName;
}

/** A remote MCP server reached over Streamable HTTP, authenticated with OAuth. */
export interface HttpPluginEntry extends BasePluginEntry {
  transport: "http";
  url: string;
}

export type PluginEntry = StdioPluginEntry | HttpPluginEntry;

export interface FluneConfig {
  version: 1;
  openrouter: {
    apiKey: string | null;
    baseUrl: string;
  };
  proxy: {
    port: number;
    host: string;
  };
  plugins: Record<string, PluginEntry>;
}

// --- OpenAI chat-completions wire format (the subset the proxy touches) ---

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: string;
  content?: unknown;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  [key: string]: unknown;
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: OpenAITool[];
  stream?: boolean;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
  }>;
  [key: string]: unknown;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: ToolCallDelta[];
      [key: string]: unknown;
    };
    finish_reason: string | null;
  }>;
  [key: string]: unknown;
}
