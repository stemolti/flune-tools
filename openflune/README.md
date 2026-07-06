# openflune — Claude Code Workflow Plugin

Ticket refinement and automated implementation pipeline for GitHub.

## What it does

| Skill | Description |
|-------|-------------|
| `/openflune:configure` | Interactive project setup: tech stack, sandboxing, MCP/LSP servers |
| `/openflune:refine <ticket-id>` | Iterative ticket refinement until it's ready for planning |
| `/openflune:design [--mobbin] <ticket-id \| description>` | Interactive design reasoning and `.pen` file creation using Pencil. Add `--mobbin` to pull real-world UI references from Mobbin first (paid Mobbin plan; opt-in) |
| `/openflune:implement <ticket-id>` | Full pipeline: plan, test, implement, refactor, security review, code review, lessons, PR |
| `/openflune:address-review <pr-number>` | Address PR review comments — fetch, evaluate, fix, reply, push, re-request review |
| `/openflune:sync` | Pull latest main, rebase active worktrees, prune stale remotes, clean up merged branches |

## Prerequisites

### Required
- **Claude Code** CLI installed and authenticated
- **GitHub CLI** (`gh`): for GitHub Issues and PRs — [install](https://cli.github.com/)
- **Node.js**: only required if using Context7 (MCP server for live documentation lookup)

### Optional: LSP Servers

LSP servers provide real-time diagnostics (type errors, unused variables, dead code) during implementation. Install any that match your stack:

| Stack | Server | Install Command |
|-------|--------|----------------|
| TypeScript / JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript` |
| Python | pyright | `pip install pyright` or `npm install -g pyright` |
| Rust | rust-analyzer | See [rust-analyzer docs](https://rust-analyzer.github.io/manual.html#installation) |
| C# / .NET | csharp-ls | `dotnet tool install --global csharp-ls` |
| Go | gopls | `go install golang.org/x/tools/gopls@latest` |

Run `/openflune:configure` to detect and enable LSP servers for your project.

### Authentication

```bash
gh auth login
```
The `gh` CLI stores credentials in `~/.config/gh/hosts.yml`. It also respects `GITHUB_TOKEN`/`GH_TOKEN` env vars as a fallback for non-interactive environments.

### Sandbox support (Linux / WSL2)
Sandboxing provides OS-level filesystem and network isolation for autonomous execution. If Claude Code reports missing sandbox dependencies when you enable it, install the packages it names.

macOS sandbox support is built into Claude Code and requires no extra packages.

## Installation

### Via marketplace (recommended)

```bash
# Register the repo as a marketplace (works with private repos too)
claude plugin marketplace add stemolti/flune-tools

# Install the plugin (persists across sessions)
claude plugin install openflune
```

To update later: `claude plugin update openflune`

### Manual (per-session)

```bash
claude --plugin-dir /path/to/openflune
```

## Quick Start

```bash
# 1. Start Claude Code (plugin loads automatically if installed via marketplace)
claude

# 2. Configure the project (one-time setup)
/openflune:configure

# 3. Refine a ticket (optional but recommended)
/openflune:refine 12345

# 4. Design a ticket (optional — for frontend/UI tickets)
/openflune:design 12345
#    ...or ground it in real-world UI references first (paid Mobbin plan, opt-in):
/openflune:design --mobbin 12345

# 5. Implement a ticket
/openflune:implement 12345
```

## Working from your phone

openflune skills (`/openflune:refine`, `/openflune:implement`, `/openflune:design`) are **interactive** — they ask clarifying questions and iterate. One-shot triggers (GitHub Actions, webhooks, `claude --print`) drop conversation state after each turn, which defeats their whole design. What you need is a **persistent session** you can attach to and detach from — not a bot.

Nothing in the plugin changes for this: both options below run your normal Claude Code session (with openflune already installed) on your laptop and give you a way to drive it from your phone.

### Option A — Happier (recommended: mobile UI, no tmux)

[Happier](https://github.com/happier-dev/happier) is an open-source, end-to-end-encrypted mobile/web/desktop client that wraps your existing agent CLI. The session runs on your laptop — your `gh` auth, your files, your hooks — and the phone is just a UI. No terminal skills required.

1. **On laptop** (inside your project, with openflune already installed):
   ```bash
   # Install the Happier CLI — macOS/Linux:
   curl -fsSL https://happier.dev/install | bash
   # …or  npm install -g @happier-dev/cli
   # Windows (PowerShell):  iwr https://happier.dev/install.ps1 -useb | iex

   happier auth login   # link this machine to your account
   happier              # launches Claude Code + openflune, wrapped for mobile
   ```
2. **On phone**: install the Happier app and sign in with the same account. It connects through Happier's hosted relay (`api.happier.dev`) — no VPN needed — or you can self-host the relay / use Tailscale Serve to keep traffic on your own network. Everything is end-to-end encrypted (zero-knowledge: the relay can't read your code).
3. **From phone**: type `/openflune:refine 42`. The skill's clarifying questions arrive as chat messages you answer inline, with push notifications when it needs input or hits a permission prompt. Close the app; the session keeps running on your laptop; reconnect anytime.

### Option B — SSH + tmux (terminal-native fallback)

If you already live in a terminal and don't want another app:

1. **On laptop**: keep Claude Code in a named tmux window — `tmux new -As openflune`.
2. **Expose the laptop** via [Tailscale](https://tailscale.com) or any SSH-reachable network.
3. **On phone**: an SSH client — [Blink](https://blink.sh) (iOS), [Termius](https://termius.com) (iOS/Android), or [Termux](https://termux.dev) (Android).
4. **From phone**: SSH in, `tmux attach -t openflune`, run `/openflune:refine 42`. Detach anytime; tmux keeps the session alive.

Both approaches preserve real conversation state — the skills ask, you answer, they proceed — and every Claude Code feature (`/clear`, `/compact`, …) works normally. No GH-comment bot, no webhook infra, no session-resume plumbing. Browse issues in the GitHub mobile app, drive the skills from Happier or SSH.

### Looking ahead: other LLMs

openflune's skills are Claude Code–specific today (they use Claude Code's skill format and interactive tools), so the phone flow runs Claude Code. Happier is the future-proof choice here: the same app also drives Codex, Gemini, and **OpenCode** via the Agent Client Protocol — and OpenCode can point at open-source / self-hosted models (through Ollama or any compatible endpoint). When openflune becomes agent-agnostic, you swap `happier` for `happier opencode` and keep the exact same mobile setup.

### What `/openflune:configure` creates

```
your-project/
├── CLAUDE.md              # (or in .claude/ — user's choice during configure)
├── .claudeignore          # Files tracked by git but excluded from Claude's context
├── docs/
│   └── git-workflow.md    # On-demand reference: branching, commits, PRs
├── .claude/
│   ├── config.json        # openflune configuration (includes claudeMdLocation)
│   └── settings.json      # Sandbox, permissions, and allowed domains
└── .worktrees/            # Git worktrees for feature branches (gitignored)
```

**Where reference docs live**

- `docs/<topic>.md` — on-demand reference docs read by skills/agents when their topic intersects the work. The lessons-collector also routes new topic-specific lessons here.
- `CLAUDE.md` — always loaded. Holds critical rules and project-wide invariants.
- `.claude/rules/` — reserved for files explicitly `@`-imported by `CLAUDE.md` (auto-loaded at session start). Configure does not create files here today.

**Backward compatibility**

If your project already has `.claude/rules/lessons-learned.md` (or `lessons-learned-<slug>.md`) from an earlier openflune setup, openflune leaves it in place and skills still read it as a legacy fallback. New lessons go to `docs/` or `CLAUDE.md` only.

### Monorepo Support

For monorepos, `/openflune:configure` detects projects automatically and creates a **progressive disclosure** structure — project-specific context only loads when Claude accesses files in that subtree, saving tokens.

**Three-tier strategy:**

| Tier | Mechanism | Loading | Content |
|------|-----------|---------|---------|
| Root | `CLAUDE.md` at repo root | Eager | Repo-wide conventions, projects table, critical rules |
| Project | `packages/api/CLAUDE.md` etc. | Lazy (on file access) | Stack, build/test commands, project conventions |
| Reference docs | `docs/<topic>.md` at repo root | On-demand | Git workflow + topic-specific lessons routed by the collector |

**Monorepo file structure:**

```
your-project/
├── CLAUDE.md                  # Root — projects table + critical rules (eager)
├── .claudeignore              # Files tracked by git but excluded from Claude's context
├── docs/
│   └── git-workflow.md        # On-demand reference (read by skills as needed)
├── packages/
│   ├── api/
│   │   └── CLAUDE.md          # Per-project — stack, build/test (lazy)
│   └── web/
│       └── CLAUDE.md          # Per-project — stack, build/test (lazy)
├── .claude/
│   ├── config.json            # openflune configuration (includes isMonorepo + projects)
│   └── settings.json          # Sandbox, permissions, and allowed domains
└── .worktrees/
```

Lessons are routed by topic (`docs/caching.md`, `docs/migrations.md`, …) rather than dumped into a single growing log. Project-wide invariants land in `CLAUDE.md` directly.

## Implementation Pipeline

When you run `/openflune:implement <ticket-id>`, the pipeline executes these phases:

1. **Plan** — Context-gatherer agent bundles the ticket, design, and project context into a file (only a short digest enters the main context); planner agent reads the bundle, analyzes the codebase, and proposes an implementation plan (waits for your approval).
2. **Worktree Setup** — Creates an isolated git worktree for the feature branch
3. **Test First (Red)** — Implementer agent writes failing tests
4. **Implement (Green)** — Implementer agent makes tests pass
5. **Refactor** — Implementer agent simplifies and cleans up
6. **Security Review** — Security reviewer agent checks for OWASP vulnerabilities
7. **Code Review** — Code reviewer agent does a final PR-style review
8. **Capture Lessons** — Lessons collector routes genuine mistakes into the relevant `docs/<topic>.md` or `CLAUDE.md` (opt-in; most sessions capture nothing)
9. **Create PR** — Rebases on latest main, commits, pushes, and creates a pull request

### Usage controls

For lower limit pressure without removing quality gates, add optional settings to `.claude/config.json`:

```json
{
  "openflune": {
    "compactImplementation": false,
    "reviewConcurrency": "parallel",
    "diffContextMode": "inline"
  }
}
```

- `compactImplementation: true` lets small, low-risk tickets combine red/green/refactor into one implementer turn while still requiring red failures, green implementation, refactor, and final build/test reporting.
- `reviewConcurrency: "sequential"` runs the same security, code, and silent-failure reviewers one after another instead of in parallel.
- `diffContextMode: "file"` passes reviewers a patch file path and changed-file list for large diffs instead of duplicating the full diff in every prompt.

### Optional: RTK command-output compression

openflune also benefits from external command-output compression tools such as [RTK](https://github.com/rtk-ai/rtk). RTK is a CLI proxy that filters common development command output before it enters the LLM context, with claimed 60-90% reductions on commands such as `git diff`, `rg`, test runners, build tools, Docker, and GitHub CLI.

RTK is especially useful for openflune phases that run command-heavy verification and review:

- Phase 3-5: test, build, lint, and type-check output
- Phase 6-7: `git diff`, changed-file lists, and reviewer context
- Phase 9: `git status`, `git log`, `gh`, push/rebase diagnostics

Install and initialize RTK separately:

```bash
# Linux/macOS quick install
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Initialize for Claude Code
rtk init -g
```

After restarting Claude Code, Bash commands are rewritten through RTK automatically where supported. Claude Code built-in tools such as `Read`, `Grep`, and `Glob` do not pass through RTK hooks, so keep using openflune's lazy phase files and concise agent outputs for context reduction inside the plugin itself.

## Ticket Splitting

When a ticket is sized M or L during `/openflune:refine`, the skill suggests splitting it into numbered child tickets (e.g., "(1/3)", "(2/3)", "(3/3)") with explicit dependency ordering — which children can be implemented in parallel and which are sequential. Each child references the parent in its body and the parent tracks all children in a "Child Tickets" checklist with dependencies. When `/openflune:implement` creates a PR for the last open child, it auto-closes the parent alongside the child.

## Architecture

The plugin uses specialized agents with isolated contexts:

| Agent | Role | Model | Permission Mode |
|-------|------|-------|-----------------|
| **context-gatherer** | Bundles ticket, design, and project context into a file for the planner | sonnet | acceptEdits |
| **planner** | Analyzes tickets, produces implementation plans | inherit | plan (read-only) |
| **implementer** | TDD: writes tests first, then implementation | inherit | acceptEdits |
| **security-reviewer** | OWASP-focused security review | sonnet | plan (read-only) |
| **code-reviewer** | PR-style quality review | sonnet | plan (read-only) |
| **lessons-collector** | Routes genuine mistakes to `docs/<topic>.md` or `CLAUDE.md` | haiku | acceptEdits |

**Model tiering**: Opus where judgment is concentrated — `/openflune:refine` and `/openflune:design` pin `model: opus` because scope, acceptance criteria, splits, and UX structure drive everything downstream. Sonnet for pipeline orchestration and implementation (`/openflune:implement` pins `model: sonnet`). Haiku for mechanical collection (lessons-collector). These pins are visible in each skill's frontmatter and override the session model for that skill only.

External integrations use the `gh` CLI rather than MCP servers, keeping permissions simple and avoiding token overhead. Optional MCP servers: Context7 (live documentation lookup), Pencil (design file creation via `/openflune:design`), and Mobbin (real-world UI references via `/openflune:design --mobbin` — a paid, OAuth-gated remote server that is fully opt-in and never bundled). See [`docs/mobbin.md`](docs/mobbin.md).

## Known Limitations

- **SSH git remotes + sandbox**: The sandbox uses `allowedDomains` for network filtering, which works with HTTPS but not SSH. If you have an SSH remote (`git@github.com:...`), `git push` will fail inside the sandbox. **Recommended**: switch to HTTPS remotes (`git remote set-url origin https://github.com/<owner>/<repo>.git`), or push manually when prompted.
- **New repos with no commits**: `git worktree add` requires at least one commit. The pipeline handles this automatically by creating an initial commit if needed.

## Troubleshooting

### `git push` fails inside sandbox
The sandbox blocks SSH connections. Options:
1. Switch to HTTPS: `git remote set-url origin https://github.com/<owner>/<repo>.git`
2. Push manually when the pipeline prompts you
3. Disable sandbox in `.claude/settings.json` (not recommended)

### `git worktree add` fails with "not a valid reference"
Your repo has no commits. The pipeline should handle this automatically. If it doesn't, create an initial commit: `git add -A && git commit -m "chore: initial commit" --allow-empty`

### Sandbox permissions errors on Linux
Ensure the sandbox dependencies Claude Code reports as missing are installed via your distro's package manager, then re-enable sandboxing.

### GitHub CLI not authenticated
Run `gh auth login` and follow the prompts. Verify with `gh auth status`.

### Agent prompts for file edit permissions
This should not happen with the default settings. Verify `.claude/settings.json` includes `Write(*)` and `Edit(*)` in `permissions.allow`. Running `/openflune:implement` will auto-detect missing permissions and offer to fix them, or you can re-run `/openflune:configure` to regenerate settings.

### Subagent reviews blocked: "Usage credits required for 1M context"
The pipeline ran inline and skipped the dedicated reviewer agents (security-reviewer, code-reviewer, silent-failure-hunter). This happens when your session runs a **1M-context** model (model ID ends in `[1m]`, e.g. `claude-opus-4-8[1m]`).

The `[1m]` flag is session-level: every subagent inherits it but **not** the session's extra-usage entitlement, so `Task` delegation is gated — even with a `model: sonnet` override and even with usage credits enabled (Claude Code bug [#51060](https://github.com/anthropics/claude-code/issues/51060) / [#57249](https://github.com/anthropics/claude-code/issues/57249)). openflune's reviewers need the standard 200K context.

- **Permanently (keeps your main session on 1M):** run `/openflune:configure` and answer **Yes** to "Pin subagents to 200K" — it sets `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-6` in `~/.claude/settings.json` so every subagent runs on Sonnet 200K while your main session keeps 1M. Restart for it to take effect. (Pin Sonnet, not Opus: Opus auto-upgrades to 1M on Max/Team/Enterprise plans and would re-trigger the gate.)
- **Now (this session), or if pinning doesn't clear the gate:** run `/model sonnet` to put the whole session on 200K, then re-invoke the skill. Note `/model opus` will *not* drop you to 200K on a plan that auto-upgrades Opus to 1M.

## Project Structure

```
openflune/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── .lsp.json              # LSP server configuration (generated by configure)
├── agents/
│   ├── context-gatherer.md
│   ├── planner.md
│   ├── implementer.md
│   ├── security-reviewer.md
│   ├── code-reviewer.md
│   └── lessons-collector.md
├── skills/
│   ├── configure/SKILL.md
│   ├── refine/SKILL.md
│   ├── design/SKILL.md
│   ├── sync/SKILL.md
│   ├── implement/
│   │   ├── SKILL.md
│   │   └── phases/
│   ├── address-review/SKILL.md
│   ├── worktrees/SKILL.md
│   ├── testing/SKILL.md
│   ├── stack-dotnet/SKILL.md
│   └── stack-angular/SKILL.md
├── hooks/
│   └── hooks.json
├── templates/
│   ├── claudeignore
│   ├── claude-md-root.md
│   ├── claude-md-root-monorepo.md
│   ├── claude-md-project.md
│   ├── settings.json
│   └── docs/
│       └── git-workflow.md
└── README.md
```
