# Use ArchLang from an AI agent

ArchLang is built to be driven by an AI agent end-to-end — **through its CLI**, with no server and
nothing to configure. An agent can learn the whole language, author a plan, render it, and **verify
it matches intent without ever looking at an image** — token-cheap and in any harness.

> **CLI first — but there is an MCP server too.** A CLI costs nothing in an agent's context until it
> is called; an MCP server's tool schemas sit in the context window permanently. So the CLI (plus a
> filesystem [Skill](https://github.com/chanmeng666/archlang/blob/main/SKILL.md)) stays the
> **primary** interface, and an agent with a shell should use it. But an MCP-native host that
> *cannot* run a shell command needs a way to reach ArchLang at all, so an optional stdio shim —
> **[`@chanmeng666/archlang-mcp`](https://www.npmjs.com/package/@chanmeng666/archlang-mcp)**, listed
> on the MCP registry — wraps the same pure library functions. It is a discoverability channel, not
> a replacement; the core stays zero-dependency. See
> [ADR 0012](/adr/0012-mcp-shim-discoverability).

## Zero-install

```bash
npx @chanmeng666/archlang help
```

## Cold start

One call gives a fresh agent everything — the language spec, the authoring workflow, the CLI
reference and the error catalog, as a single system-prompt-ready bundle:

```bash
arch context          # == llms-full.txt
```

Take one slice of it when that is all you need: `arch context --section errors` prints just the
diagnostic catalog — 13 KB instead of the whole bundle's 60 KB. The sections are `spec` (the
language), `workflow` (the agent loop), `cli` (every command) and `errors`. If you only need the
language, `arch spec` prints the [one-page spec](/spec) (~2k tokens).

## Discovery

Ask the CLI, don't guess at it. `arch help` lists every command; **`arch <cmd> --help`** (or `arch
help <cmd>`) prints that one command's flags and worked examples — cheaper than pulling the whole
manifest into your context. `arch --version` prints the version, and `arch manifest --json` still
serves the entire CLI as data when you'd rather parse than read. Help and the reference are both
rendered from that one manifest, so neither can drift from the tool.

## The loop

1. **Learn the language** — `arch spec` (or `arch context` for spec + workflow + CLI + errors).
2. **Write** a `.arch` file (or pipe source via stdin with `-`).
3. **Render** — `arch compile plan.arch -o plan.svg --json`. The JSON is `{ ok, diagnostics, summary }`.
4. **Self-correct** — if `ok` is false (exit code `2`), read each `diagnostics[].fix` (with
   `line`/`col`). Many diagnostics also carry **machine-applicable** fixes: `arch fix plan.arch`
   applies them, rewriting the file **in place** (`--backup` keeps the original as `plan.arch.bak`;
   `-o out.arch` writes elsewhere), and `arch fix plan.arch --dry-run --json` previews them without
   touching disk. Either way `fix` prints the **unified diff it would write** to stderr, so you see
   the edit before you trust it — and the mechanical edits don't cost you a turn.
5. **Verify intent without an image** — `arch describe plan.arch --json` returns rooms (`uses`,
   areas, adjacency), what each door/window/**opening** connects, the furniture, an **access graph**
   (entrances, per-room reachability and depth), and totals. Confirm the room count, labels, and
   areas match the brief. On a big plan, read only what you're checking: `--select rooms,totals`
   keeps just those top-level keys, and `--room kitchen,bath` keeps just those rooms plus the
   doors/windows/furniture touching them. `arch compile -f txt` will even print a zero-dependency
   ASCII plan if you want to "look" without a raster.
6. **Check soundness** — `arch lint plan.arch --json` flags habitability problems (a room with no
   door, a windowless bedroom, an implausibly small room, a too-narrow door, no entrance, a fixture
   floating off the wall). Tighten the bar with `--profile accessibility-advisory`, or narrow the
   read with `--code W_ROOM_UNREACHABLE` / `--severity error` (both also on `validate`). For the
   faults lint can't fix on its own (an unreachable room, a windowless bedroom), `arch suggest
   --json` returns the `door`/`window` statements that would resolve them — as data, for you to
   choose from.
7. **Gate on the brief** — write the brief down as an [intent contract](/intent) and
   `arch validate plan.arch --intent brief.json --feedback --json` fails (exit `2`) when the plan
   misses a gating expectation. `arch score --brief brief.json --json` gives the continuous
   `satisfied/total` reading instead — it measures, it never gates.
8. **Show the user the result** — `arch preview plan.arch -o plan.png` renders a viewable PNG
   (~1600px, legible enough for your own vision *and* small enough to ingest). If it reports
   `E_PNG_DEPENDENCY`, re-run with `--install`.

> **A display filter never changes gating.** `--select`, `--room`, `--code` and `--severity` narrow
> what you *read*; `ok` and the exit code are always computed from the **unfiltered** diagnostic set,
> and a narrowed result says so (`filtered: true`, `total_diagnostics: n`). Bounding your context can
> never hide a failure from you.

Every command and flag is on the **[CLI reference](/cli)** — generated from the same manifest
`arch manifest --json` serves, so it cannot fall behind the tool.

## Exit codes & JSON

Every command takes `--json` (structured result on **stdout**, human messages on **stderr**) with
deterministic exit codes: `0` ok · `2` user-source error (fix it, don't blindly retry) · `1`
IO/internal · `3` bad usage. Every JSON diagnostic carries the catalogued **`fix`** — in human mode
it prints as a `= fix:` line, so you never need a second call to `arch explain` to know the remedy.

A mistyped flag or verb is a **usage error (`3`)**, never a silently ignored argument: `arch lint
plan.arch --jsn` exits 3 with a did-you-mean (`--json`) and a `usage:` echo, and `arch comple`
suggests `compile`. Treat a `3` as "read the help" (`arch <cmd> --help`), not "retry".

## Example: `describe` as a verification channel

For the [studio example](/examples), `arch describe --json` returns (abridged):

```json
{
  "ok": true,
  "plan": "Studio 1BR",
  "bbox": { "w": 7000, "h": 6000 },
  "rooms": [
    { "id": "r_living", "label": "Living / Kitchen", "uses": ["living", "kitchen"], "area_m2": 24, "adjacent": ["r_bed", "r_hall", "r_bath"] },
    { "id": "r_bed", "label": "Bedroom", "uses": ["bedroom"], "area_m2": 9, "adjacent": ["r_living", "r_hall"] }
  ],
  "doors": [ { "id": "d_bath", "between": ["r_hall", "r_bath"], "width": 800 } ],
  "openings": [ { "id": "o_living", "between": ["r_living", "r_hall"], "width": 900 } ],
  "access": {
    "entrances": ["d_main"], "hasEntrance": true,
    "rooms": [ { "id": "r_bath", "depthFromEntrance": 3, "reachable": true, "bottleneckClearWidth": 740 } ]
  },
  "totals": { "rooms": 4, "floor_area_m2": 42 }
}
```

A text-only agent can read this and confirm "4 rooms, 42 m², the bath reached off the hall (not
through the bedroom), every room reachable from the front door" — no rendering required. See the
[full schema](/analysis).

`describe --json` also reports **`freedom`**: for every placed element, whether its coordinates were
hand-authored or derived by the resolver. Read it before nudging a number — it tells you which
positions are yours to move and which fall out of the layout.

## Machine-readable artifacts

Served at this site's root, so a tool can fetch them directly:

| Artifact | What it is |
| --- | --- |
| [`/llms.txt`](/llms.txt) | the project map (USE vs CONTRIBUTE) |
| [`/llms-full.txt`](/llms-full.txt) | the full agent context — same bytes as `arch context` |
| [`/plan.schema.json`](/plan.schema.json) | Plan JSON schema — emit it and `arch compile --from-json` |
| [`/intent.schema.json`](/intent.schema.json) | the [intent contract](/intent) schema |
| [`/archlang.gbnf`](/archlang.gbnf) | GBNF grammar for constrained decoding |

Any docs page also serves its raw markdown at `/<route>.md` (e.g. [`/cli.md`](/cli.md)).

## Also

- The same functions are exported from the library — `compile`, `describe`, `lint`, `validate`,
  `score`, `repair`, `applyFixes`, `suggestTopology`, `renderAscii` and more:
  `import { compile, describe, lint } from "@chanmeng666/archlang"`.
- These power the live preview, **Describe**, **Lint** and **Intent** tabs in the
  [playground](https://archlang-playground.vercel.app).
- See [`SKILL.md`](https://github.com/chanmeng666/archlang/blob/main/SKILL.md) and
  [`llms.txt`](https://github.com/chanmeng666/archlang/blob/main/llms.txt) in the repo.
