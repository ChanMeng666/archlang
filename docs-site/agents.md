# Use ArchLang from an AI agent

ArchLang is built to be driven by an AI agent end-to-end — **through its CLI**, with no server and
nothing to configure. An agent can learn the whole language, author a plan, render it, and **verify
it matches intent without ever looking at an image** — token-cheap and in any harness.

> **Why a CLI and not an MCP server?** A CLI costs nothing in an agent's context until it is called;
> an MCP server's tool schemas sit in the context window permanently. So ArchLang's agent interface
> is the `arch` CLI plus a filesystem [Skill](https://github.com/chanmeng666/archlang/blob/main/SKILL.md)
> — not an MCP server. (MCP remains an option for a future hosted/multi-tenant offering.)

## Zero-install

```bash
npx @chanmeng666/archlang help
```

## The loop

1. **Learn the language** — run `arch spec` (or read the [one-page spec](/spec)). It is the entire
   language in ~2k tokens: grammar, gotchas, elements, worked examples.
2. **Write** a `.arch` file (or pipe source via stdin with `-`).
3. **Render** — `arch compile plan.arch -o plan.svg --json`. The JSON is `{ ok, diagnostics, summary }`.
4. **Self-correct** — if `ok` is false (exit code `2`), read each `diagnostics[].fix` (with
   `line`/`col`), edit, and recompile.
5. **Verify intent without an image** — `arch describe plan.arch --json` returns rooms (areas,
   adjacency), what each door connects, windows, and totals. Confirm the room count, labels, and
   areas match the brief.
6. **Check soundness** — `arch lint plan.arch --json` flags habitability problems (a room with no
   door, a windowless bedroom, an implausibly small room, a too-narrow door, no entrance).

## Commands

Every command takes `--json` (structured result on **stdout**, human messages on **stderr**) with
deterministic exit codes: `0` ok · `2` user-source error (fix it, don't blindly retry) · `1`
IO/internal · `3` bad usage. Every JSON diagnostic carries the catalog **`fix`**.

```bash
arch spec                              # the whole language in one page — read first
arch compile plan.arch -o out.svg --json   # render (also -f dxf|pdf|png)
echo '<source>' | arch compile - -o - -f svg   # compile stdin → SVG on stdout
arch describe plan.arch --json         # semantic facts: rooms, areas, adjacency, door connections
arch lint plan.arch --json             # architectural soundness warnings
arch validate plan.arch --json         # parse + resolve + lint, no render
arch fmt plan.arch --write             # canonical formatting
arch new -o plan.arch                  # scaffold a starter plan
arch explain E_ROOM_SIZE --json        # look up any diagnostic code
```

## Example: `describe` as a verification channel

For the [studio example](/examples), `arch describe --json` returns (abridged):

```json
{
  "ok": true,
  "plan": "Studio 1BR",
  "bbox": { "w": 7000, "h": 6000 },
  "rooms": [
    { "id": "r_living", "label": "Living / Kitchen", "area_m2": 24, "adjacent": ["r_bed", "r_bath"] },
    { "id": "r_bed", "label": "Bedroom", "area_m2": 12, "adjacent": ["r_living", "r_bath"] }
  ],
  "doors": [ { "id": "d_bed", "between": ["r_living", "r_bed"], "width": 900 } ],
  "totals": { "rooms": 3, "floor_area_m2": 42 }
}
```

A text-only agent can read this and confirm "3 rooms, 42 m², a bedroom adjacent to the living area,
a door between them" — no rendering required.

## Also

- The same functions are exported from the library: `import { compile, describe, lint } from "@chanmeng666/archlang"`.
- These power the live preview, **Describe**, and **Lint** tabs in the
  [playground](https://archlang-playground.vercel.app).
- See [`SKILL.md`](https://github.com/chanmeng666/archlang/blob/main/SKILL.md) and
  [`llms.txt`](https://github.com/chanmeng666/archlang/blob/main/llms.txt) in the repo.
