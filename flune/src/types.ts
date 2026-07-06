// --- flune registry (~/.flune/config.json) ---

export type PackageManagerName = "npm" | "pnpm" | "yarn" | "bun";

export type PluginStatus = "installed" | "error" | "disabled";

export interface PluginEntry {
  name: string;
  version: string;
  status: PluginStatus;
  installPath: string;
  entryPoint: string;
  command: string;
  args: string[];
  packageManager: PackageManagerName;
  installedAt: string;
}

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
