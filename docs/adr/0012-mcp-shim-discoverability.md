# 12. An MCP shim as a discoverability channel — amending "distribution over protocol"

- **Status:** Accepted
- **Date:** 2026-07 (v1.13 planning)
- **Amends:** [ADR 0009](0009-ai-first-context-and-distribution.md) (decision 4,
  "distribution over protocol")

## Context

[ADR 0009](0009-ai-first-context-and-distribution.md) decided, in its fourth point, to
invest in **distribution** (live ` ```arch ` fences, a GitHub Action, a bundled
`llms-full.txt`) rather than a **protocol** (an MCP server), and to keep the agent
surface **CLI-first, no MCP**. The reasoning was sound and still holds: *a CLI costs
nothing in an agent's context window until it is called, whereas an MCP tool schema
sits in the window permanently.* That argument is about which interface an agent
should **prefer once it has ArchLang** — and the answer is unchanged: the CLI.

But ADR 0009 conflated two questions. "Which interface is cheapest to *use*?" is one.
"How does an MCP-native host *discover and reach* ArchLang at all?" is another. Since
0009, the MCP **registry** (`registry.modelcontextprotocol.io`) has become a real
discovery surface: hosts like Claude Desktop, Cursor, and VS Code browse it, and a tool
absent from it is simply invisible to that entire class of user — many of whom cannot
invoke a shell command at all. Refusing a server does not make those users reach for
the CLI; it makes them reach for something else.

## Decision

**Ship an optional MCP server as a discoverability channel, without touching the core
or displacing the CLI.**

**1. The CLI remains the primary interface.** Nothing about the token-cost argument
changes. Every doc, the `SKILL.md` loop, and `llms-full.txt` still lead with
`npx @chanmeng666/archlang …`. An agent that already has a shell should use it. The MCP
server's own README opens by telling the reader to prefer the CLI and why.

**2. The MCP server is a thin shim over the library, in its own package.** A new
workspace, **`@chanmeng666/archlang-mcp`** (`packages/mcp/`), exposes a stdio MCP
server whose tools each wrap **one pure exported function** of `@chanmeng666/archlang`
— `compile`, `describe`, `lint`, `validate` (with the optional intent-graph check),
`repair`, `fix`, `suggest`, `complete` — and whose resources serve the existing static
artifacts (`archlang://spec`, `archlang://context`, `archlang://schema`,
`archlang://grammar`). It calls the **library**, never a CLI subprocess.

**3. Zero core impact — the SDK dependency is quarantined.** The
`@modelcontextprotocol/sdk` dependency lives **only** in `packages/mcp`. The core stays
**zero runtime dependencies** and byte-identical: the shim adds a package, not a
coupling. The core does not know the server exists.

**4. The registry entry is the actual deliverable.** A filled-out `server.json`
(registry schema, npm package coordinates, stdio transport) makes ArchLang
*discoverable* from MCP hosts. That — not a new capability — is the whole point: every
tool the server offers already existed on the CLI and in the library.

## Consequences

- ArchLang is now reachable by MCP-native hosts that browse the registry, closing the
  discovery gap ADR 0009 left open, while the CLI stays the recommended, token-cheaper
  interface for agents that can call it.
- The invariant that made 0009's stance safe is preserved literally: **no MCP schema
  sits in a CLI agent's context window** — the server is opt-in per host, and an agent
  using the CLI never loads it.
- The core's zero-dependency guarantee is intact; the SDK is isolated in a leaf
  package that depends on the core, never the reverse.
- This does not reopen 0009's other three decisions (the context bundle, opt-in error
  rendering, derived accessibility) — it amends only the fourth, and only to add a
  channel, not to change what an agent should prefer.
- If a hosted/monetized phase later wants richer server-side behavior, it extends this
  package; the shim is the seam.
