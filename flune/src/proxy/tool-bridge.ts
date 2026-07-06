import type { OpenAITool } from "../types.js";
import type { McpToolInfo } from "./mcp-executor.js";

export const NAMESPACE_SEPARATOR = "__";

/** OpenAI function names must match ^[a-zA-Z0-9_-]{1,64}$. */
function sanitize(part: string): string {
  return part.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Maps MCP tools to namespaced OpenAI function tools (`<plugin>__<tool>`)
 * and routes tool calls back to the owning plugin. Names already taken by
 * client-supplied tools are never shadowed.
 */
export class ToolRouter {
  private readonly byFunctionName = new Map<string, McpToolInfo>();

  constructor(tools: McpToolInfo[], reservedNames: Iterable<string> = []) {
    const reserved = new Set(reservedNames);
    for (const tool of tools) {
      const base = `${sanitize(tool.pluginName)}${NAMESPACE_SEPARATOR}${sanitize(tool.toolName)}`.slice(0, 64);
      let name = base;
      for (let i = 2; reserved.has(name) || this.byFunctionName.has(name); i++) {
        name = `${base.slice(0, 60)}-${i}`;
      }
      this.byFunctionName.set(name, tool);
    }
  }

  openAiTools(): OpenAITool[] {
    return [...this.byFunctionName.entries()].map(([name, tool]) => ({
      type: "function",
      function: {
        name,
        description: tool.description,
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
      },
    }));
  }

  resolve(functionName: string | undefined): McpToolInfo | undefined {
    if (!functionName) return undefined;
    return this.byFunctionName.get(functionName);
  }
}

export function mergeTools(
  clientTools: OpenAITool[] | undefined,
  pluginTools: OpenAITool[],
): OpenAITool[] {
  return [...(clientTools ?? []), ...pluginTools];
}
