# Floor plan MCP server

ArchLang is an open-source language for floor plans, created by
[Chan Meng](https://github.com/ChanMeng666): you write `.arch` text and compile it to SVG, DXF or
PDF.

## No install

- In ChatGPT: [ArchLang app in ChatGPT](https://chatgpt.com/plugins/plugin_asdk_app_6acf8381cca08191bfb3eb7305fb6970).
- In claude.ai: add `https://mcp.archlang.uk/mcp` as a custom connector.

Its MCP server lets an AI agent in an MCP host (Claude Desktop, Claude Code, Cursor, VS Code,
claude.ai and others) draw a floor plan: the model writes `.arch` text, and the server's tools
compile it, describe it, lint it and fix it. There are two ways to connect, the same tools in both:

| Server | How it runs |
| --- | --- |
| [`@chanmeng666/archlang-mcp`](https://www.npmjs.com/package/@chanmeng666/archlang-mcp) | A local stdio server, run with `npx`. Listed on the official MCP registry as `io.github.ChanMeng666/archlang-mcp`. |
| `https://mcp.archlang.uk/mcp` | A hosted Streamable HTTP server. No sign-in and no install; plan sources up to a size cap, rate-limited per address, no PNG output. |

If the agent can run shell commands, the [CLI](/agents) does the same work and costs nothing in
the context window until it is called; an MCP server's tool list sits in the context all the time.
The MCP server is for hosts without a shell, and for people who prefer to install a server.

## Install the floor plan MCP server

One-click install links. Each opens the host, which shows the server's configuration before it adds
anything.

| Server | VS Code | VS Code Insiders | Cursor |
| --- | --- | --- | --- |
| Local, `npx -y @chanmeng666/archlang-mcp` | [Install in VS Code](vscode:mcp/install?%7B%22name%22%3A%22archlang%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40chanmeng666%2Farchlang-mcp%22%5D%7D) | [Install in VS Code Insiders](vscode-insiders:mcp/install?%7B%22name%22%3A%22archlang%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40chanmeng666%2Farchlang-mcp%22%5D%7D) | [Install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=archlang&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjaGFubWVuZzY2Ni9hcmNobGFuZy1tY3AiXX0=) |
| Hosted, `https://mcp.archlang.uk/mcp` | [Install in VS Code](vscode:mcp/install?%7B%22name%22%3A%22archlang%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.archlang.uk%2Fmcp%22%7D) | [Install in VS Code Insiders](vscode-insiders:mcp/install?%7B%22name%22%3A%22archlang%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.archlang.uk%2Fmcp%22%7D) | [Install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=archlang&config=eyJ1cmwiOiJodHRwczovL21jcC5hcmNobGFuZy51ay9tY3AifQ==) |

Or by hand:

Claude Code:

```bash
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp
```

Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`):

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

claude.ai, or any host that takes a remote server: add `https://mcp.archlang.uk/mcp` as a custom
connector, with no authentication. In claude.ai, and other hosts that support MCP Apps, the
`compile` result is shown in a viewer you can pan and zoom.

## What the tools do

| Tool | What it does |
| --- | --- |
| `compile` | Source to SVG (or ASCII, Plan JSON, or PNG on the local server), with diagnostics. |
| `describe` | Rooms, areas, adjacency, what each door connects, reachability from the entrance. |
| `lint` | Advisory warnings: a windowless bedroom, a bathroom reached through a bedroom, a narrow door. |
| `validate` | The ship gate: parse, resolve and lint, optionally strict or against a brief. |
| `score` | How much of a written brief a plan satisfies, as a number. |
| `fix` | Applies the machine-applicable fixes the diagnostics carry. |
| `repair` | Moves furniture out of walls, doorways and door swings. |
| `finish` | Furnishes empty rooms and adds paper, scale, dimensions, title, schedule and legend. |
| `suggest` | Door and window statements that would fix an unreachable room or a windowless bedroom. |
| `complete` | Completion items at a position in the source. |
| `link` | A playground URL that opens the plan in a browser. |

The hosted server adds `read_me`, which says what the server is and what it keeps. Both servers
also expose the language as resources: `archlang://spec` (the whole language on one page),
`archlang://context`, the Plan JSON and intent schemas, and the GBNF grammar.

## An AI agent drawing a floor plan

Asked for *"a garden studio with a shower room, entered from the south"*, an agent reads
`archlang://spec`, then writes something like this and passes it to `compile`:

```arch
plan "Garden studio" {
  units mm
  grid 50
  room id=studio at (0,0)        size 5000x3600 label "Studio" uses living
  room id=shower right-of studio size 1800x3600 label "Shower room" uses bath
  walls from rooms exterior 200 partition 100
  door on studio.bottom at center width 900 swing into studio
  door between studio and shower at 1800 from start width 800 swing into shower
  window on studio.top width 1800
  furniture shower in shower anchor top flush size 900x900
  furniture basin against shower.right
  furniture wc against shower.bottom
}
```

`describe` then confirms two rooms, 18 m² and 6.48 m², both reachable from the entrance, and
`lint` returns no warnings. An earlier draft put the basin beside the shower-room door, and `lint`
returned four warnings, among them `W_SWING_OBSTRUCTED`: the door needs 800 mm of clear swing and
the basin stood 206 mm from the hinge. That loop — write, compile, read the facts and warnings, edit — is what
the tools are for, and it needs no image.

## FAQ

### Is there an MCP server for floor plans?

Yes. `@chanmeng666/archlang-mcp` is an MCP server for ArchLang floor plans. Run it locally with
`npx -y @chanmeng666/archlang-mcp`, or connect to the hosted one at `https://mcp.archlang.uk/mcp`.

### Can an AI agent draw a floor plan?

Yes, by writing it as text. The agent writes ArchLang source, the `compile` tool draws it as SVG,
and `describe` and `lint` tell the agent the room areas, what each door connects and what is wrong,
so it can check the plan against the brief without looking at the drawing. The
[agent gallery](/gallery) shows plans agents wrote from one-paragraph briefs.

### Does the hosted MCP server need an account or an API key?

No. `https://mcp.archlang.uk/mcp` has no sign-in. It keeps no plan source and no request logs; the
[privacy page](/privacy) says what it does keep.

### Should I use the MCP server or the CLI?

Use the CLI when the agent has a shell: `npx -y @chanmeng666/archlang context` gives it the whole
language in one call, and nothing sits in its context until it runs a command. Use the MCP server
when the host has no shell, or when you want the tools listed in the host's UI.

## Next

- [Use it from an agent](/agents): the CLI loop, exit codes and JSON output.
- [The intent contract](/intent): write the brief down as data and check the plan against it.
- [ADR 12](/adr/0012-mcp-shim-discoverability) and [ADR 26](/adr/0026-hosted-mcp-worker): why the
  servers exist and how the hosted one is built.
