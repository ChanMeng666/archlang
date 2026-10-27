# Use ArchLang from an AI agent

ArchLang is built to be driven by an AI agent end-to-end — **through its CLI**, with no server and
nothing to configure. An agent can learn the whole language, author a plan, render it, and **verify
it matches intent without ever looking at an image** — token-cheap and in any harness.

> **CLI first — but there is an MCP server too.** A CLI costs nothing in an agent's context until it
> is called; an MCP server's tool schemas sit in the context window permanently. So the CLI (plus a
> filesystem [Skill](https://github.com/chanmeng666/archlang/blob/main/skills/archlang/SKILL.md)) stays the
> **primary** interface, and an agent with a shell should use it. But an MCP-native host that
> *cannot* run a shell command needs a way to reach ArchLang at all, so an optional stdio shim —
> **[`@chanmeng666/archlang-mcp`](https://www.npmjs.com/package/@chanmeng666/archlang-mcp)**, listed
> on the MCP registry — wraps the same pure library functions. It is a discoverability channel, not
> a replacement; the core stays zero-dependency. See
> [ADR 0012](/adr/0012-mcp-shim-discoverability).

## Install into your coding agent

```bash
npx skills add ChanMeng666/archlang                      # the ArchLang skills, for any agent that reads skills
claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp   # or the MCP server (Claude Code shown)
/plugin marketplace add ChanMeng666/archlang                # or, inside Claude Code: the skill + MCP server as one plugin
/plugin install archlang@archlang
```

`npx skills add ChanMeng666/archlang` offers five skills (add `--yes` to install them all without
asking). Start from `archlang`, the full workflow; the other four are task skills, short checklists
for one job each. The Claude Code plugin loads all five.

- `archlang-brief-to-plan`: write a new plan from a written brief and check it against the brief.
- `archlang-edit-plan`: change an existing `.arch` with the smallest edit, then re-verify.
- `archlang-export`: deliver SVG, PNG, PDF or DXF files, with paper size, scale and storeys.
- `archlang-review-plan`: check a plan (lint profiles, the intent gate, suggestions) without editing it.

To see what agents produce from a one-paragraph brief, open the [agent gallery](/gallery).

Then ask in plain language; the agent writes the `.arch`, compiles it, and checks it with `lint` and `describe`:

- *"Design a one-bedroom flat of about 54 m²: a 32 m² living/kitchen, a 10 m² bedroom and a 10 m² bathroom, with the front door on the north wall."*
- *"Draw a two-storey, two-bedroom house, 8 m × 6 m, with a stair linking the floors, and give me one SVG per storey."*
- *"Export that plan as DXF."*

## Zero-install

```bash
npx -y @chanmeng666/archlang help
```

The recommended forms are `npx -y @chanmeng666/archlang <cmd>`, or `npm i -g @chanmeng666/archlang`
followed by `archlang <cmd>`; this page writes the short one. Two names look shorter and
are wrong: the unscoped npm package `archlang` belongs to someone else, and a bare `arch` runs the
coreutils command on Linux, macOS and Git Bash. (The package installs `arch` as an alias too.)

## Cold start

One call gives a fresh agent everything — the language spec, the authoring workflow, the CLI
reference and the error catalog, as a single system-prompt-ready bundle:

```bash
archlang context          # == llms-full.txt
```

Take one slice of it when that is all you need: `archlang context --section errors` prints just the
diagnostic catalog: the catalog alone is about 60 KB, where the bundle is about 145 KB in all. The
sections are `spec` (the language), `workflow` (the agent loop), `cli` (every command) and
`errors`. If you only need the language, `archlang spec` prints the [one-page spec](/spec).

## Discovery

Ask the CLI, don't guess at it. `archlang help` lists every command; **`archlang <cmd> --help`** (or `archlang
help <cmd>`) prints that one command's flags and worked examples — cheaper than pulling the whole
manifest into your context. `archlang --version` prints the version, and `archlang manifest --json` still
serves the entire CLI as data when you'd rather parse than read. Help and the reference are both
rendered from that one manifest, so neither can drift from the tool.

## The loop

1. **Learn the language** — `archlang spec` (or `archlang context` for spec + workflow + CLI + errors).
2. **Write** a `.arch` file (or pipe source via stdin with `-`).
3. **Render** — `archlang compile plan.arch -o plan.svg --json`. The JSON is `{ ok, diagnostics, summary }`.
4. **Self-correct** — if `ok` is false (exit code `2`), read each `diagnostics[].fix` (with
   `line`/`col`). Many diagnostics also carry **machine-applicable** fixes: `archlang fix plan.arch`
   applies them, rewriting the file **in place** (`--backup` keeps the original as `plan.arch.bak`;
   `-o out.arch` writes elsewhere), and `archlang fix plan.arch --dry-run --json` previews them without
   touching disk. Either way `fix` prints the **unified diff it would write** to stderr, so you see
   the edit before you trust it — and the mechanical edits don't cost you a turn.
5. **Verify intent without an image** — `archlang describe plan.arch --json` returns rooms (`uses`,
   areas, adjacency), what each door/window/**opening** connects, the furniture, an **access graph**
   (entrances, per-room reachability and depth), and totals. Confirm the room count, labels, and
   areas match the brief. On a big plan, read only what you're checking: `--select rooms,totals`
   keeps just those top-level keys, and `--room kitchen,bath` keeps just those rooms plus the
   doors/windows/furniture touching them. `archlang compile -f txt` will even print a zero-dependency
   ASCII plan if you want to "look" without a raster.
6. **Check soundness** — `archlang lint plan.arch --json` flags habitability problems (a room with no
   door, a windowless bedroom, an implausibly small room, a too-narrow door, no entrance, a fixture
   floating off the wall). Tighten the bar with `--profile accessibility-advisory`, or narrow the
   read with `--code W_ROOM_UNREACHABLE` / `--severity error` (both also on `validate`). For the
   faults lint can't fix on its own (an unreachable room, a windowless bedroom), `archlang suggest
   --json` returns the `door`/`window` statements that would resolve them — as data, for you to
   choose from.
7. **Gate on the brief** — write the brief down as an [intent contract](/intent) and
   `archlang validate plan.arch --intent brief.json --feedback --json` fails (exit `2`) when the plan
   misses a gating expectation. `archlang score --brief brief.json --json` gives the continuous
   `satisfied/total` reading instead — it measures, it never gates.
8. **Finish the drawing** — once lint is clean, `archlang finish plan.arch --dry-run --json` lists
   the furniture and sheet statements (paper, scale, dimensions, title, room schedule, legend) it
   would add, and `archlang finish plan.arch` adds them. Read `unresolved`: every room it left
   empty and every statement it left out is named there with the reason.
9. **Show the user the result** — `archlang preview plan.arch -o plan.png` renders a viewable PNG
   (~1600px, legible enough for your own vision *and* small enough to ingest). If it reports
   `E_PNG_DEPENDENCY`, re-run with `--install`. To give a person the plan itself, rendered and with
   nothing to install, `npx -y @chanmeng666/archlang link plan.arch` prints a playground URL that opens it.

> **A display filter never changes gating.** `--select`, `--room`, `--code` and `--severity` narrow
> what you *read*; `ok` and the exit code are always computed from the **unfiltered** diagnostic set,
> and a narrowed result says so (`filtered: true`, `total_diagnostics: n`). Bounding your context can
> never hide a failure from you.

Every command and flag is on the **[CLI reference](/cli)** — generated from the same manifest
`archlang manifest --json` serves, so it cannot fall behind the tool.

## Exit codes & JSON

Every command takes `--json` (structured result on **stdout**, human messages on **stderr**) with
deterministic exit codes: `0` ok · `2` user-source error (fix it, don't blindly retry) · `1`
IO/internal · `3` bad usage. Every JSON diagnostic carries the catalogued **`fix`** — in human mode
it prints as a `= fix:` line, so you never need a second call to `archlang explain` to know the remedy.

A mistyped flag or verb is a **usage error (`3`)**, never a silently ignored argument: `archlang lint
plan.arch --jsn` exits 3 with a did-you-mean (`--json`) and a `usage:` echo, and `archlang comple`
suggests `compile`. Treat a `3` as "read the help" (`archlang <cmd> --help`), not "retry".

## Example: `describe` as a verification channel

For the [studio example](/examples), `archlang describe --json` returns (abridged):

```json
{
  "ok": true,
  "plan": "Studio 1BR",
  "bbox": { "w": 7000, "h": 6000 },
  "rooms": [
    { "id": "r_living", "label": "Living / Kitchen", "uses": ["living", "kitchen"], "area_m2": 24, "net_area_m2": 22.33, "adjacent": ["r_bed", "r_hall", "r_bath"] },
    { "id": "r_bed", "label": "Bedroom", "uses": ["bedroom"], "area_m2": 9, "net_area_m2": 8.12, "adjacent": ["r_living", "r_hall"] }
  ],
  "doors": [ { "id": "d_bath", "between": ["r_hall", "r_bath"], "width": 800 } ],
  "openings": [ { "id": "o_living", "between": ["r_living", "r_hall"], "width": 900 } ],
  "access": {
    "entrances": ["d_main"], "hasEntrance": true,
    "rooms": [ { "id": "r_bath", "depthFromEntrance": 3, "reachable": true, "bottleneckClearWidth": 740 } ]
  },
  "totals": { "rooms": 4, "floor_area_m2": 42, "gross_internal_area_m2": 39.44, "net_floor_area_m2": 38.29 }
}
```

A text-only agent can read this and confirm "4 rooms, 42 m² on wall centrelines (39.44 m² inside the shell,
38.29 m² net of every wall), the bath reached off the hall (not through the bedroom), every room reachable
from the front door" — no rendering required. See the [full schema](/analysis).

`describe --json` also reports **`freedom`**: for every placed element, whether its coordinates were
hand-authored or derived by the resolver. Read it before nudging a number — it tells you which
positions are yours to move and which fall out of the layout.

## Machine-readable artifacts

Served at this site's root, so a tool can fetch them directly:

| Artifact | What it is |
| --- | --- |
| [`/llms.txt`](/llms.txt) | the project map (USE vs CONTRIBUTE) |
| [`/llms-full.txt`](/llms-full.txt) | the full agent context — same bytes as `archlang context` |
| [`/plan.schema.json`](/plan.schema.json) | Plan JSON schema — emit it and `archlang compile --from-json` |
| [`/intent.schema.json`](/intent.schema.json) | the [intent contract](/intent) schema |
| [`/archlang.gbnf`](/archlang.gbnf) | GBNF grammar for constrained decoding |

Every top-level docs page also serves its raw markdown at `/<route>.md` (e.g. [`/cli.md`](/cli.md); the home page's copy is `/index.md`). The `/adr/…` pages have no raw copy.

## Show a plan on a web page

A page can compile a plan in the reader's browser, with no server. Import `compile` from the
core's pinned jsDelivr `+esm` URL and set the SVG yourself; that form works in a Claude Code
artifact. Or load `https://archlang.uk/arch-plan.js` and write
`<arch-plan src="https://archlang.uk/examples/studio.arch"></arch-plan>`. Both are on
[Embed a floor plan in a web page](/embed).

## Also

- The same functions are exported from the library — `compile`, `describe`, `lint`, `validate`,
  `score`, `repair`, `applyFixes`, `suggestTopology`, `renderAscii` and more:
  `import { compile, describe, lint } from "@chanmeng666/archlang"`.
- These power the live preview, **Describe**, **Lint** and **Intent** tabs in the
  [playground](https://playground.archlang.uk).
- See [`SKILL.md`](https://github.com/chanmeng666/archlang/blob/main/skills/archlang/SKILL.md) and
  [`llms.txt`](https://github.com/chanmeng666/archlang/blob/main/llms.txt) in the repo.
