# Mobbin design references

Mobbin's MCP server lets AI agents search 600k+ real-world, **shipped** UI screens and flows
using natural language, so designs can be grounded in patterns that ship in production apps
instead of invented from scratch. openflune uses it in `/openflune:design` behind an explicit
`--mobbin` flag.

The `/openflune:design` skill reads this doc during **Phase 2.7 — Mobbin Reference Gathering**.

## What it is

| | |
|---|---|
| Endpoint | `https://api.mobbin.com/mcp` |
| Transport | Streamable HTTP |
| Auth | OAuth 2.0 (Dynamic Client Registration + PKCE `S256`, `openid` scope). Browser-based. **No API key.** |
| Plans | **Paid** — Pro, Team, or Enterprise |
| Rate limit | 60 requests / 60 seconds **per user** → HTTP `429` + `Retry-After` header |
| Discovery | `https://api.mobbin.com/.well-known/oauth-protected-resource/mcp` |

Because Mobbin is paid, OAuth-gated, and remote, openflune **never bundles it** in an
`.mcp.json` (that would prompt every user to authenticate). It is opt-in on two levels:

1. **Per project** — `mobbin.enabled: true` in `.claude/config.json` (set by `/openflune:configure`).
2. **Per invocation** — the `--mobbin` flag on `/openflune:design`.

Both must be true for Mobbin to be queried. Without `--mobbin`, no Mobbin call is ever made.

## Setup

1. Enable it for the project: run `/openflune:configure` and turn on **Mobbin design references**
   (only offered when a frontend framework is detected). This writes `mobbin.enabled: true`.
2. Register and authenticate the server once per machine (user scope, persists across projects):
   ```bash
   claude mcp add mobbin --scope user --transport http https://api.mobbin.com/mcp
   ```
   Then in Claude Code run `/mcp` → select **mobbin** → **Authenticate**. A browser window opens;
   sign in with your paid Mobbin account. When `/mcp` shows `mobbin: connected`, you're ready.

## Tool names are discovered at runtime

Mobbin does **not** publish stable tool names (its docs are a JS SPA). openflune therefore
grants the whole server — `mcp__mobbin` in the design skill's `allowed-tools` — and discovers
the available tools with a probe call at the start of Phase 2.7. **Never hardcode Mobbin tool
names** anywhere in skills or agents.

## Prompting best practices

- **Be context-rich and specific.** Combine design type + feature area + visual direction +
  platform. "Mobile onboarding flow with progressive step indicators for a fintech KYC screen"
  returns far better references than "onboarding screen".
- **Ask for the links.** Always surface each reference's Mobbin link so the user can review it
  directly rather than trusting a name-drop.
- **Iterate like a design critique.** If results repeat or drift off-target, add more context
  and re-query — don't accept the first batch uncritically.
- **Respect the rate limit.** Keep to a couple of batched queries per design; never loop tool
  calls tightly. On `429`, honor `Retry-After` before a single retry, then fall back to
  designing without Mobbin.

## How it flows through the design skill

1. `/openflune:design --mobbin <ticket>` sets `$MOBBIN_MODE = true`.
2. Phase 2 classifies the design and settles the visual direction as usual.
3. **Phase 2.7** gates on `mobbin.enabled`, verifies the server is connected/authenticated,
   builds a query from the Phase 2 outputs, queries Mobbin, and lets the user pick which
   references to adopt (`$MOBBIN_REFERENCES`).
4. **Phase 3** grounds the layout and component structure in the selected references (the style
   guide still governs the visual aesthetic).
5. **Phase 5.5** records a `## Design References (Mobbin)` section in `DESIGN.md`, so the
   downstream planner/implementer subagents see which real-world patterns the design followed.
