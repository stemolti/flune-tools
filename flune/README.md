# flune

Plugin manager and local MCP proxy. `flune` exposes an **OpenAI-compatible endpoint** backed by [OpenRouter](https://openrouter.ai) and transparently injects the tools of locally installed **MCP plugins** into every conversation — so any generic LLM client (Zed, Cursor, Chatbox, plain scripts) gets MCP tool-calling without native MCP support.

```
LLM client ──► flune serve (localhost:4000/v1) ──► OpenRouter
                    │  injects MCP tools as OpenAI `tools`
                    │  intercepts tool_calls
                    ▼
             ~/.flune/plugins/* (local stdio MCP servers)
             remote MCP servers over Streamable HTTP + OAuth
```

> **Which do I need?** This is for generic OpenAI-compatible / OpenRouter clients. If you're
> using **Claude Code** (e.g. via the openflune plugin), you don't need `flune` at all — connect
> Mobbin (or other MCP servers) directly with `claude mcp add`. See
> [`openflune/README.md`](../openflune/README.md) and
> [`openflune/docs/mobbin.md`](../openflune/docs/mobbin.md).

## Install

```bash
npm install -g @stemolti/flune
```

The package publishes as `@stemolti/flune`; the installed command is `flune`.

## Usage

### Install an MCP plugin

```bash
flune install <npm-package>     # e.g. flune install openflune (once published)
flune install ./my-server.tgz   # tarball and git specs work too
flune list
```

Plugins are npm packages that expose a stdio MCP server via their `bin` (or `main`) entry. Each plugin is installed with its dependencies isolated under `~/.flune/plugins/<name>` and registered in `~/.flune/config.json`. Use `--pm pnpm|yarn|bun` to install with a different package manager.

### Connect a remote MCP server (OAuth)

Besides local stdio plugins, flune can proxy **remote MCP servers** that speak the Streamable HTTP transport and authenticate with OAuth. Register one, then authenticate once in the browser:

```bash
flune remote add mobbin https://api.mobbin.com/mcp
flune login mobbin      # opens a browser to sign in; tokens are stored in ~/.flune/auth/
```

`flune login` runs the standard MCP OAuth flow (dynamic client registration + PKCE) against the server and saves the tokens under `~/.flune/auth/<name>.json`; they refresh automatically. Once authenticated, the server's tools are injected like any other plugin's. If a remote server's session expires, `flune serve` skips it and logs a hint to re-run `flune login <name>`. Remote URLs must be `https` (only loopback hosts may use `http`).

> [Mobbin](https://mobbin.com) is a paid example — its MCP server needs a Pro/Team/Enterprise plan. flune stays vendor-neutral: `remote add` works with any OAuth-secured Streamable HTTP MCP server.

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

On each chat request the proxy loads the registered plugins (persistent sessions, spawned lazily — a local stdio child process, or a remote Streamable HTTP connection with OAuth), maps their MCP tool schemas to OpenAI `tools` namespaced as `<plugin>__<tool>`, and forwards the enriched request to OpenRouter. When the model answers with a `tool_call` for a plugin tool, flune executes it over MCP `tools/call`, feeds the result back, and repeats (max 10 rounds) until a final text answer streams back to the client. Tool calls that belong to the client's *own* tools are passed through untouched.

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
