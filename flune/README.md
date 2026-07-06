# flune

Plugin manager and local MCP proxy. `flune` exposes an **OpenAI-compatible endpoint** backed by [OpenRouter](https://openrouter.ai) and transparently injects the tools of locally installed **MCP plugins** into every conversation — so any generic LLM client (Zed, Cursor, Chatbox, plain scripts) gets MCP tool-calling without native MCP support.

```
LLM client ──► flune serve (localhost:4000/v1) ──► OpenRouter
                    │  injects MCP tools as OpenAI `tools`
                    │  intercepts tool_calls
                    ▼
             ~/.flune/plugins/* (stdio MCP servers)
```

## Install

```bash
npm install -g flune
```

## Usage

### Install an MCP plugin

```bash
flune install <npm-package>     # e.g. flune install openflune (once published)
flune install ./my-server.tgz   # tarball and git specs work too
flune list
```

Plugins are npm packages that expose a stdio MCP server via their `bin` (or `main`) entry. Each plugin is installed with its dependencies isolated under `~/.flune/plugins/<name>` and registered in `~/.flune/config.json`. Use `--pm pnpm|yarn|bun` to install with a different package manager.

### Start the proxy

```bash
export OPENROUTER_API_KEY=sk-or-...
flune serve            # http://127.0.0.1:4000/v1
flune serve --port 8080 --host 0.0.0.0
```

The API key can also live in `~/.flune/config.json` (`openrouter.apiKey`); as a last resort the client's own `Authorization` header is forwarded upstream.

### Point a client at it

Any OpenAI-compatible client works — set the base URL to `http://127.0.0.1:4000/v1` and pick any OpenRouter model id:

```bash
curl -N http://127.0.0.1:4000/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{"model":"openrouter/auto","stream":true,"messages":[{"role":"user","content":"add 2 and 3 with the add tool"}]}'
```

- **Zed** — `settings.json` → `language_models.openai_compatible` with `api_url: "http://127.0.0.1:4000/v1"`.
- **Chatbox** — Settings → Model Provider → *OpenAI API Compatible*, API host `http://127.0.0.1:4000/v1`.
- Endpoints: `POST /v1/chat/completions` (streaming and non-streaming), `GET /v1/models` (OpenRouter passthrough), `GET /healthz`.

## How it works

On each chat request the proxy loads the registered plugins (persistent stdio sessions, spawned lazily), maps their MCP tool schemas to OpenAI `tools` namespaced as `<plugin>__<tool>`, and forwards the enriched request to OpenRouter. When the model answers with a `tool_call` for a plugin tool, flune executes it over MCP `tools/call`, feeds the result back, and repeats (max 10 rounds) until a final text answer streams back to the client. Tool calls that belong to the client's *own* tools are passed through untouched.

`FLUNE_HOME` overrides the default `~/.flune` location.

## Development

```bash
cd flune
npm install
npm run build   # tsc → dist/
npm test        # vitest integration suite (offline: fixture MCP server + scripted fake OpenRouter)
```

## License

MIT
