# ArchLang plugin

ArchLang is a text language for floor plans (`.arch` files) and a deterministic compiler that turns
them into SVG, DXF and PDF drawings and checks them. This plugin gives the agent:

- five skills (`skills/`): the `archlang` workflow and four task skills (brief to plan, edit,
  export, review). They drive the `archlang` command line tool through `npx -y @chanmeng666/archlang`,
  which runs on your machine and sends nothing.
- the ArchLang MCP server, the hosted one at `https://mcp.archlang.uk/mcp` (Streamable HTTP, no
  sign-in, rate-limited).

## Install

In Claude Code:

```text
/plugin install archlang --marketplace ChanMeng666/archlang
```

On a version before 2.1.275, `/plugin marketplace add ChanMeng666/archlang` and then
`/plugin install archlang@archlang`.

## What it sends

When the agent calls one of the MCP server's tools, the plan text and the drawing options it passes
are sent to `mcp.archlang.uk`, compiled in memory and returned. The server keeps no request log and
no account; the one thing it keeps is a rendered drawing in the edge cache when a tool returns an
`/svg/` link. The sender's IP address is used only as a rate-limit key. The full policy:
<https://archlang.uk/privacy>.

## Using the local server instead

The local server, `@chanmeng666/archlang-mcp`, sends nothing and also renders PNG. In Claude Code:

```bash
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp
```

then disable the plugin's `archlang` server in `/mcp`.

Source, issues and the security policy: <https://github.com/ChanMeng666/archlang>. MIT licence
(`LICENSE.txt`).
