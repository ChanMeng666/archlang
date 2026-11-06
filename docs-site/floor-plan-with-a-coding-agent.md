# Generate a floor plan with a coding agent

To get a floor plan from Claude Code, Cursor, Codex or Gemini CLI, give the agent ArchLang: either
its skills, its MCP server, or its command-line compiler, which any agent with a shell can run
through `npx`. Then ask for the plan in plain language. The agent writes `.arch` text, compiles it,
reads the errors and warnings that come back as JSON, fixes the source and compiles again, until
the plan compiles and lints clean. You get a `.arch` file you can keep in git and an SVG, DXF or PDF
drawing.

ArchLang is an open-source language for floor plans, created by
[Chan Meng](https://github.com/ChanMeng666), under the MIT licence.

## Install it in your agent

**Claude Code.** The skills, the MCP server, or both as one plugin:

```bash
npx skills add ChanMeng666/archlang                           # the ArchLang skills
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp   # or the MCP server
```

Inside Claude Code, `/plugin marketplace add ChanMeng666/archlang` followed by
`/plugin install archlang@archlang` installs the skills and the MCP server together.

**Cursor.** Add the MCP server to `.cursor/mcp.json`:

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

To install the plugin locally (skills, MCP server and a rule for `*.arch` files), copy the
repository's `plugins/archlang/` folder to `~/.cursor/plugins/local/archlang` and reload the window.

**Codex.** Open the Plugins tab and search for ArchLang. Without the directory, copy the skill
folders from the repository's `plugins/archlang/skills/` into your project's `.agents/skills/`, or
into `~/.agents/skills/` for every project.

**Gemini CLI, or any agent with a shell.** No install step is needed: the agent runs the compiler
through `npx`. One command gives it the whole language, the workflow, the CLI reference and the
error catalogue:

```bash
npx -y @chanmeng666/archlang context
```

`npx skills add ChanMeng666/archlang` installs the same skills for the hosts the `skills` CLI
supports. For a host without a shell, the hosted MCP server at `https://mcp.archlang.uk/mcp` needs
no sign-in. Setup for more hosts is on the [MCP server page](/mcp).

## The loop: write, compile, lint, fix

1. **Write** the plan as a `.arch` file.
2. **Compile** it: `npx -y @chanmeng666/archlang compile plan.arch -o plan.svg --json`. The JSON is
   `{ ok, diagnostics, summary }`, and the exit code is `2` when `ok` is false.
3. **Fix** each error from its `line`, `col` and `fix` fields. `npx -y @chanmeng666/archlang fix plan.arch`
   applies the fixes that are machine-applicable.
4. **Describe and lint**: `describe --json` returns rooms, areas, what each door connects and which
   rooms are reachable from the entrance; `lint --json` returns advisory warnings, each with a fix.
5. **Repeat** until `lint` reports no warnings and the `describe` facts match the brief.

## What the agent gets back

Suppose the agent misspells a room id, writing `door between hall and livng`. Compile fails with
exit code `2` and this JSON (output trimmed):

```json
{
  "ok": false,
  "diagnostics": [
    {
      "code": "E_UNKNOWN_REF",
      "severity": "error",
      "message": "Door \"door_2\" names \"livng\", which is not a room this plan or component can see",
      "line": 11,
      "col": 25,
      "fix": "Declare it with `let`, pass it as a parameter, or fix the typo (for a datum, the room id before the last dot; for an axis, the label the plan's `axes` give it).",
      "hints": ["did you mean \"living\"?"]
    }
  ]
}
```

The agent changes `livng` to `living` and compiles again. This is the corrected plan, a flat with a
shower room; edit it below and it recompiles in your browser:

```arch
plan "Flat with a shower room" {
  units mm
  grid 50
  north up
  room id=living at (0,0)         size 5000x4000 label "Living and kitchen" uses living kitchen
  room id=bed    right-of living  size 3500x4000 label "Bedroom" uses bedroom
  room id=hall   below living     size 5000x1500 label "Hall" uses hall
  room id=shower right-of hall    size 3500x1500 label "Shower room" uses bath
  walls from rooms exterior 200 partition 100
  door on hall.left at center width 900 swing into hall
  door between hall and living at 2500 from start width 900 swing into living
  door between living and bed at 2000 from start width 800 swing into bed
  door between hall and shower at 700 from start width 800 swing into shower
  window on living.top width 1800
  window on bed.top width 1500
  furniture kitchen_sink against living.top
  furniture stove against living.left
  furniture counter against living.left offset 2600
  furniture shower in shower anchor top-right flush size 900x900
}
```

For this source, `describe` reports 4 rooms, 4 doors and 2 windows; 46.75 m² measured on the wall
centrelines (living and kitchen 20 m², bedroom 14 m², hall 7.5 m², shower room 5.25 m²) and
42.64 m² net; and every room reachable from the front door, the shower room from the hall rather
than through the bedroom. `lint` reports no warnings. To show you the plan with nothing to install,
the agent can run `npx -y @chanmeng666/archlang link plan.arch`, which prints a playground link; the
bundled [two-bedroom example](https://playground.archlang.uk/examples/two-bed.html) is a larger plan
of the same kind.

## Prompts to try

- *"Design a one-bedroom flat of about 45 m² with a shower room off the hall, entered from the
  west. Check it with describe and lint."*
- *"Add a window to the bedroom and give me the plan as DXF."*

## FAQ

### Can Claude Code draw a floor plan?

Yes, by writing ArchLang text. With the skills or the MCP server installed, or with the CLI through
`npx`, Claude Code writes the `.arch` source, compiles it to SVG, and checks it with `describe` and
`lint`.

### Should the agent use the CLI or the MCP server?

The CLI when the agent has a shell: nothing sits in its context until it runs a command. The MCP
server when the host has no shell, or when you want the tools listed in the host's UI. The checks
are the same; DXF and PDF come from the CLI or the playground.

### Does it need an API key?

No. The npm packages run locally, and the hosted MCP server at `https://mcp.archlang.uk/mcp` has no
sign-in. Your agent's own subscription or API terms still apply.

### Is the plan ready to build from?

No. It is a concept or scheme-stage drawing with exact room areas, to discuss a layout;
take it to a professional for anything that needs approval.

## Next

- [Use it from an agent](/agents): every step of the loop, with exit codes and flags.
- [Floor-plan tools for AI agents](/floor-plan-tools-for-ai-agents): the other tools an agent can be given.
- [Check a floor plan's reachability and room areas](/check-a-floor-plan): what `describe` and `lint` report.
