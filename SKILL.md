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
6. **Gate on soundness — don't ship a flagged plan.** Run `arch validate plan.arch --strict --json`
   (parse + resolve + lint in one pass). `--strict` makes **every advisory warning fail** too
   (exit `2`), so this is the gate a generation pipeline runs before it ships. If not `ok`, read each
   `diagnostics[].fix`, edit the source, and re-run until it passes — or, if a warning is a deliberate
   choice, tell the user explicitly. The lint flags: a room with no door, a windowless bedroom, an
   implausibly small room, a too-narrow door, no entrance, a bathroom reachable only through a bedroom,
   a bathroom not fully walled in, a door whose swing hits furniture/another door, a bath/kitchen with
   no fixtures, **furniture drawn through a wall (`W_FURNITURE_WALL_COLLISION`)**, **a fixture blocking
   a doorway (`W_DOORWAY_BLOCKED`)**, and **a room packed so you can't step in
   (`W_ROOM_NO_CLEAR_PATH`)**.

## Placement discipline (write it right the first time)

A geometry-blind generator that emits absolute coordinates and ignores lint produces plans that
render but are physically wrong (furniture through walls, fixtures piled in doorways, rooms with no
door). Avoid that by construction:

- **Every room needs a way in.** Put a `door` or a cased `opening` on a wall of *every* room — an
  open-plan space still needs a modeled opening to the space it connects to, or it reads as sealed.
- **Back plumbing/kitchen fixtures onto a wall with `against wall <id>`, not raw `at`.** `against wall`
  is closed-form and fails loudly if ambiguous, so the fixture lands flush against the real wall face
  instead of floating or penetrating. Use `in <roomId>` so the side is inferred.
- **Keep furniture inside the room and out of the walls.** A piece's whole footprint must sit within
  the room rectangle; never let it cross a wall centerline (that's `W_FURNITURE_WALL_COLLISION`).
- **Leave the doorway clear.** Keep furniture out of the straight approach on both sides of every door
  (≥300 mm), and out of the leaf's swing arc — so a person can actually walk in.
- **Verify, then gate.** `arch describe --json` to confirm the intent (rooms, areas, access graph),
  then `arch validate --strict --json` to prove it's sound before you ship.

## Commands

```bash
arch spec                              # the whole language in one page — READ THIS FIRST
arch compile plan.arch -o out.svg --json   # render (also -f dxf|pdf|png)
echo '<source>' | arch compile - -o - -f svg   # compile stdin → SVG on stdout
arch describe plan.arch --json         # semantic facts: rooms, areas, adjacency, door connections
arch lint plan.arch --json             # architectural soundness warnings
arch validate plan.arch --strict --json   # parse + resolve + lint; --strict fails on warnings too (the ship gate)
arch fmt plan.arch --write             # canonical formatting
arch repair plan.arch -o fixed.arch    # emit corrected source (furniture out of walls/doorways, overlaps separated, fixtures into their room + snapped to walls) + change log
arch new -o plan.arch                  # scaffold a starter plan
arch explain E_ROOM_SIZE --json        # look up any diagnostic code
```

## Key rules (full detail in `arch spec`)

- **Units are millimetres** (a 4 m wall is `4000`).
- **Origin is top-left; +x right, +y DOWN** (not math y-up).
- **Doors/windows must sit on a wall segment**, or they warn.
- **Fixtures draw real symbols:** `furniture wc|basin|shower|bathtub|kitchen_sink|counter|fridge|stove …`
  renders a plan symbol (not an empty box); standard sizes are also in `lib/fixtures.arch`. Put fixtures
  in every bath and kitchen so the plan reads professionally and lint stays quiet.
- **`dims auto`** draws dimension strings for you (`overall`, `rooms`, `walls`, or `all`) — no need to
  place each `dim`. `rooms` puts each room's size in the margin (clear of the label); `walls` annotates
  each distinct wall thickness once.
- Edit is cheap: "make the bedroom 1 m wider" is a one-number change, then recompile.

Treat the CLI as the source of truth — author, render, and verify through it rather than reasoning
about SVG by hand.
