#!/usr/bin/env node
// Minimal MCP server over stdio: newline-delimited JSON-RPC 2.0.
// Zero dependencies so the packed tarball installs without registry access.

import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "add",
    description: "Add two numbers and return the sum",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number", description: "First addend" },
        b: { type: "number", description: "Second addend" },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "echo",
    description: "Echo a message back to the caller",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo" },
      },
      required: ["message"],
    },
  },
];

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function callTool(name, args) {
  switch (name) {
    case "add":
      return String(Number(args.a) + Number(args.b));
    case "echo":
      return String(args.message);
    default:
      return null;
  }
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  // Notifications (no id) need no response.
  if (msg.id === undefined || msg.id === null) return;

  switch (msg.method) {
    case "initialize":
      respond(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-mcp-server", version: "1.0.0" },
      });
      break;
    case "ping":
      respond(msg.id, {});
      break;
    case "tools/list":
      respond(msg.id, { tools: TOOLS });
      break;
    case "tools/call": {
      const { name, arguments: args = {} } = msg.params ?? {};
      const text = callTool(name, args);
      if (text === null) {
        respondError(msg.id, -32602, `Unknown tool: ${name}`);
      } else {
        respond(msg.id, { content: [{ type: "text", text }] });
      }
      break;
    }
    default:
      respondError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
});
