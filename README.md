# flune-tools

Claude Code plugins and tooling.

## Tools

### [flune](./flune)

CLI plugin manager and local MCP proxy. Exposes an OpenAI-compatible endpoint in front of OpenRouter and injects installed MCP plugins as native tools — MCP tool-calling for any generic LLM client (Zed, Cursor, Chatbox, scripts).

```bash
npm install -g @stemolti/flune
flune install <mcp-plugin-package>
flune serve
```

## Plugins

### [openflune](./openflune)

Ticket refinement and automated implementation pipeline for GitHub. Provides skills for planning, TDD implementation, code review, and PR creation.

```bash
claude plugin marketplace add stemolti/flune-tools
claude plugin install openflune
```

Prefer to drive it from your phone? See [Working from your phone](./openflune/README.md#working-from-your-phone) — mobile UI via [Happier](https://github.com/happier-dev/happier) (no tmux) or an SSH + tmux fallback.

## License

MIT
