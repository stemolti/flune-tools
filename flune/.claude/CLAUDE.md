# Project: flune

TypeScript CLI (`flune`) — plugin manager + local MCP proxy middleware.
Exposes an OpenAI-compatible endpoint (Fastify) in front of OpenRouter and executes installed MCP plugins over stdio.

## Layout (strict domain separation)

- `src/cli/` — commander wiring only, no business logic
- `src/core/` — plugin install + `~/.flune/config.json` registry (paths, config, package-manager, installer)
- `src/proxy/` — Fastify server, OpenRouter client, tool bridge, MCP session manager, agentic orchestrator
- `tests/` — vitest integration tests; fully offline (fixture stdio MCP server + scripted fake OpenRouter)

## Critical Rules

- Proxy logic must stay decoupled from the CLI router — never import `src/cli/` from `src/core/` or `src/proxy/`.
- Tests must not hit the network: use `FLUNE_HOME` temp dirs, the `tests/fixtures/fake-mcp-server` fixture, and a local fake upstream.
- ESM + NodeNext: relative imports need explicit `.js` extensions.
- Tool names sent upstream are namespaced `<plugin>__<tool>` and must match `^[a-zA-Z0-9_-]{1,64}$`.
- Client-supplied tools are never shadowed or executed locally — only namespaced plugin tool calls are intercepted.

## Build & Test

```bash
npm run build   # tsc → dist/
npm test        # vitest run
```
