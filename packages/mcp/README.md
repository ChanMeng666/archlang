# @chanmeng666/archlang-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[ArchLang](https://github.com/chanmeng666/archlang) — author, inspect, and repair
architectural floor plans written as code, from any MCP-speaking host.

It is a **thin stdio shim over the `@chanmeng666/archlang` library** (no subprocess,
no re-implementation): each tool wraps one pure, exported function. The core stays
**zero-dependency** — the MCP SDK lives only in this package.

## When to prefer the CLI

ArchLang's primary agent interface is the agent-native **`arch` CLI**, not this
server. A CLI costs **nothing in an agent's context window until it is called**,
whereas an MCP tool schema sits in the window permanently. If your agent already has
a shell, prefer:

```bash
npx @chanmeng666/archlang context     # the whole language + workflow + CLI + errors, one call
npx @chanmeng666/archlang compile plan.arch -o out.svg --json
```

This MCP server exists so MCP-native hosts can **discover** ArchLang through the
registry and drive it without a shell. It is listed on the official MCP registry as
**`io.github.ChanMeng666/archlang-mcp`**. It is the discoverability channel, not a
replacement. See [ADR 0012](https://github.com/chanmeng666/archlang/blob/main/docs/adr/0012-mcp-shim-discoverability.md)
(which amends [ADR 0009](https://github.com/chanmeng666/archlang/blob/main/docs/adr/0009-ai-first-context-and-distribution.md)'s distribution-over-protocol stance).

## Tools

Every tool takes ArchLang `source` (a `plan "…" { … }` string) and returns
structured JSON. `compile` also accepts `plan_json` (the Plan-JSON / RPLAN shape).

| Tool | What it does |
|------|--------------|
| `compile` | Render source (or `plan_json`) to SVG, or to zero-dep ASCII (`format:"txt"`). `accessible`, `overlay:"circulation"` opt-ins. Returns output + diagnostics. |
| `describe` | Semantic facts (rooms, areas, adjacency, doors, circulation, and a `freedom` report of which positions are hand-authored vs resolver-derived) — verify intent without an image. |
| `lint` | Advisory `W_*` soundness warnings (may include the fix-carrying `W_ALIAS_MATCH` for a room use inferred from an indirect label alias); `profile` selects a ruleset. |
| `validate` | Parse + resolve + lint, the ship gate. `strict` fails on warnings; `graph` checks interior-door adjacency against an intended room graph. |
| `repair` | Explicit corrector: furniture out of walls/doorways/swings → new `.arch` source + change log. Never adds doors/windows. |
| `fix` | Apply the machine-applicable fixes on a plan's diagnostics (syntactic corrector; bounded fixpoint). `unsafe` widens to `maybe-incorrect`. |
| `suggest` | Advisory door/window statements (attachment form) to resolve unreachable rooms / windowless bedrooms — data, never applied. |
| `complete` | LSP completion items in scope at a source byte offset. |

## Resources

| URI | Content |
|-----|---------|
| `archlang://spec` | The whole language in one page (`spec.llm.md`). |
| `archlang://context` | Full agent context: spec + workflow + CLI reference + error catalog (`llms-full.txt`). |
| `archlang://schema` | JSON Schema (2020-12) for the Plan-JSON compile input. |
| `archlang://grammar` | GBNF constrained-decoding grammar for guaranteed-parseable generation. |

## Install

### Claude Code

```bash
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "archlang": {
      "command": "npx",
      "args": ["-y", "@chanmeng666/archlang-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "archlang": {
      "command": "npx",
      "args": ["-y", "@chanmeng666/archlang-mcp"]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "archlang": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chanmeng666/archlang-mcp"]
    }
  }
}
```

## License

MIT © Chan Meng
