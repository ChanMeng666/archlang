---
name: archlang
description: Use when the user wants to create, edit, or inspect an architectural floor plan / building layout as code — e.g. "draw a 2-bedroom apartment", "add a bathroom to this plan", "make the bedroom 1 m wider", "lay out an office floor". ArchLang is a tiny text language that compiles a .arch file to a professional floor-plan drawing (SVG/PNG/PDF/DXF). Drive it entirely through the `arch` CLI; do not hand-render.
---

# ArchLang — author floor plans as code

ArchLang turns a small `.arch` text file into a professional floor-plan drawing. It is built for
agents: deterministic, self-correcting (errors carry a machine code and a `fix`), and verifiable
without ever looking at an image (`arch describe`).

## Setup (zero-install)

The CLI runs straight from npm — no clone, no build:

```bash
npx @chanmeng666/archlang help
```

(Or `npm i -g @chanmeng666/archlang` to get a persistent `arch` binary.)

## The loop (always follow this)

1. **Learn the language first.** Run `arch spec` and read it. It is the entire language in one page
   (~2k tokens): the grammar, the gotchas, the elements, and worked examples. Do this before writing
   any `.arch`.
2. **Write the plan** to a `.arch` file (or pipe via stdin with `-`).
3. **Render it:** `arch compile plan.arch -o plan.svg --json`. The JSON is `{ ok, diagnostics,
   summary }`.
4. **If `ok` is false** (exit code `2`): read each `diagnostics[].fix` (with `line`/`col`), edit the
   source, and recompile. Exit code `2` means a deterministic user error — fix it, don't blindly
   retry. Exit `1` is an IO/internal problem; `3` is bad CLI usage.
5. **Verify intent without an image:** `arch describe plan.arch --json` returns the rooms (with
   areas and adjacency), what each door connects, and totals. Confirm the room count, labels, and
   areas match what was asked.
6. **Check soundness:** `arch lint plan.arch --json` flags habitability problems (a room with no
   door, a windowless bedroom, an implausibly small room, a too-narrow door, no entrance). Fix the
   warnings or tell the user about them.

## Commands

```bash
arch spec                              # the whole language in one page — READ THIS FIRST
arch compile plan.arch -o out.svg --json   # render (also -f dxf|pdf|png)
echo '<source>' | arch compile - -o - -f svg   # compile stdin → SVG on stdout
arch describe plan.arch --json         # semantic facts: rooms, areas, adjacency, door connections
arch lint plan.arch --json             # architectural soundness warnings
arch validate plan.arch --json         # parse + resolve + lint, no render (fast check)
arch fmt plan.arch --write             # canonical formatting
arch new -o plan.arch                  # scaffold a starter plan
arch explain E_ROOM_SIZE --json        # look up any diagnostic code
```

## Key rules (full detail in `arch spec`)

- **Units are millimetres** (a 4 m wall is `4000`).
- **Origin is top-left; +x right, +y DOWN** (not math y-up).
- **Doors/windows must sit on a wall segment**, or they warn.
- Edit is cheap: "make the bedroom 1 m wider" is a one-number change, then recompile.

Treat the CLI as the source of truth — author, render, and verify through it rather than reasoning
about SVG by hand.
