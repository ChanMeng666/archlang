# Installing the ArchLang MCP server

ArchLang is a text language for floor plans: `.arch` source compiles to SVG, DXF or PDF. Its MCP
server gives an agent the tools `compile`, `describe`, `lint`, `validate`, `score`, `repair`, `fix`,
`finish`, `suggest`, `complete` and `link`. There are two servers with the same tools; pick one.

| Server | Transport | Needs |
| --- | --- | --- |
| `@chanmeng666/archlang-mcp` | stdio, started with `npx -y @chanmeng666/archlang-mcp` | Node.js 18 or later |
| `https://mcp.archlang.uk/mcp` | Streamable HTTP | nothing: no sign-in, no API key; no PNG output, a size cap and a per-address rate limit |

No environment variables, API keys or arguments are needed for either.

## Configuration

Hosts that read `mcpServers` (Claude Desktop `claude_desktop_config.json`, Cursor `.cursor/mcp.json`, Cline):

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

VS Code (`.vscode/mcp.json`):

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

For the hosted server, use `"url": "https://mcp.archlang.uk/mcp"` in place of `command` and `args`
(in VS Code, `"type": "http"` with that `url`).

## One-line installs

```bash
# Claude Code
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp
claude mcp add --transport http archlang https://mcp.archlang.uk/mcp

# Codex CLI
codex mcp add archlang -- npx -y @chanmeng666/archlang-mcp
codex mcp add archlang --url https://mcp.archlang.uk/mcp

# Gemini CLI (or install the extension: gemini extensions install https://github.com/ChanMeng666/archlang)
gemini mcp add archlang npx -- -y @chanmeng666/archlang-mcp
gemini mcp add --transport http archlang https://mcp.archlang.uk/mcp

# VS Code
code --add-mcp '{"name":"archlang","type":"stdio","command":"npx","args":["-y","@chanmeng666/archlang-mcp"]}'
code --add-mcp '{"name":"archlang","type":"http","url":"https://mcp.archlang.uk/mcp"}'
```

Cursor and VS Code install links for both servers: <https://archlang.uk/mcp#install-the-floor-plan-mcp-server>.
claude.ai: add `https://mcp.archlang.uk/mcp` as a custom connector with no authentication.
OpenClaw: the ArchLang skill is on ClawHub (<https://clawhub.ai/chanmeng666/skills/archlang>); `clawhub install archlang`.

## Verify

Ask the host to list the server's tools, or call `tools/list` yourself. The list holds `compile`,
`describe`, `lint`, `validate`, `score`, `repair`, `fix`, `finish`, `suggest`, `complete` and
`link`; the hosted server adds `read_me`.

```bash
curl -s -X POST https://mcp.archlang.uk/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Before writing any `.arch`, read the `archlang://spec` resource: the whole language on one page.
With a shell, `npx -y @chanmeng666/archlang spec` prints the same text, and the `archlang` CLI runs
the same tools without the server.

More: <https://archlang.uk/mcp> and <https://archlang.uk/agents>.
