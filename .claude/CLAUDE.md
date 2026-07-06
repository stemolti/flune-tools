# flune-tools

Monorepo for Claude Code plugins and development tooling.
GitHub Issues for tracking. GitHub for code and PRs.

## Projects

- `openflune/` — Claude Code plugin: markdown skills, agents, shell hooks
- `flune/` — TypeScript CLI: plugin manager + OpenAI-compatible MCP proxy (Fastify, OpenRouter)

Each project has its own `.claude/CLAUDE.md` with project-specific context.

## Critical Rules
- ALWAYS read the relevant project's `.claude/rules/` files before working on any layer.
- Test-first: integration tests that assert behavior, not implementation details.
- Keep tickets well-scoped. 1 ticket = 1 PR.
- Use git worktrees for all feature work. Never modify code in main worktree.

## Build & Test

### openflune
- No build step (markdown/shell plugin)

### flune
- `cd flune && npm run build` (tsc) and `npm test` (vitest integration suite, offline)

## Versioning

- openflune: auto-bumped on push to main (paths: `openflune/**`), tags: `openflune/v*`
- flune: auto-bumped + npm-published on push to main (paths: `flune/**`), tags: `flune/v*` (requires `NPM_TOKEN` secret)
