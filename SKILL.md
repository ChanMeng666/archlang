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
6. **Show the user the result.** Run `arch preview plan.arch -o plan.png` to render a PNG you can
   surface to the user (or inspect yourself). It defaults to a 2× raster; it works out of the box
   where the optional renderer is installed, and if it reports `E_PNG_DEPENDENCY`, re-run with
   `--install` to fetch it. (SVG from `compile` is always available with zero deps.)
7. **Gate on soundness — don't ship a flagged plan.** Run `arch validate plan.arch --strict --json`
   (parse + resolve + lint in one pass). `--strict` makes **every advisory warning fail** too
   (exit `2`), so this is the gate a generation pipeline runs before it ships. If not `ok`, read each
   `diagnostics[].fix`, edit the source, and re-run until it passes — or, if a warning is a deliberate
   choice, tell the user explicitly. The lint flags: a room with no door, a windowless bedroom, an
   implausibly small room, a too-narrow door, no entrance, a bathroom reachable only through a bedroom,
   a bathroom not fully walled in, a door whose swing hits furniture/another door, a bath/kitchen with
   no fixtures, **furniture drawn through a wall (`W_FURNITURE_WALL_COLLISION`)**, **a fixture blocking
   a doorway (`W_DOORWAY_BLOCKED`)**, **a room packed so you can't step in
   (`W_ROOM_NO_CLEAR_PATH`)**, **a walk that squeezes below a passable width
   (`W_PATH_TOO_NARROW`)**, and **a room reached the long way round (`W_CIRCUITOUS_PATH`)**.

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

## Fix the topology: add doors & windows from the access graph

`arch repair` corrects **furniture** placement, but it never adds a door or a window — *where* to put
one is a design choice the compiler must not make (it would be guessing among valid options). That is
**your** job, and `arch describe --json` gives you the facts to do it deterministically. Do this when
lint reports `W_ROOM_UNREACHABLE`, `W_ROOM_DISCONNECTED`, `W_NO_ENTRANCE`, `W_BATH_VIA_BEDROOM`, or
`W_BEDROOM_NO_WINDOW`.

1. **Read the facts.** From `describe()`: `access.rooms[]` gives each room's `reachable` +
   `depthFromEntrance`; `rooms[]` gives each room's `bbox {x,y,w,h}`, `uses`, and `adjacent` ids;
   `doors[]`/`openings[]` give `between`. The building extent is `minX = min(room.x)`,
   `maxX = max(room.x + room.w)` (same for y) — a room edge lying on it is an **exterior** wall.

2. **Connect every unreachable room**, choosing in priority:
   1. If the room (or its open-plan group) has an exterior edge and reads as **living / kitchen / hall /
      entry**, add a new exterior **entrance** `door` there. Best for the main space — and it avoids
      routing circulation through a bedroom.
   2. Else add a `door` (or cased `opening`) on the **shared wall** with an adjacent **reachable,
      non-bedroom** room.
   3. Never make a bathroom reachable *only* through a bedroom (`W_BATH_VIA_BEDROOM`) — prefer (1) for
      the whole cut-off group.

3. **Coordinates** — the `at` must sit on the wall centerline:
   - **Exterior door** on room R: on its left edge (`R.x == minX`) → `door at (R.x, R.y + R.h/2) …
     wall exterior`; right → `x = R.x + R.w`; top (`R.y == minY`) → `at (R.x + R.w/2, R.y)`; bottom →
     `y = R.y + R.h`. Slide it along the wall to clear existing windows/doors. `width 900`.
   - **Shared-wall door** between A and B: vertical shared edge at `x = X` over y-overlap `[lo,hi]` →
     `door at (X, (lo+hi)/2)`; horizontal at `y = Y` over x-overlap → `door at ((lo+hi)/2, Y)`.
     `width ≥ 800`.
   - **Bedroom window**: pick an exterior edge of the bedroom and centre a `window … width 1200` on it,
     clear of any door on that wall.

4. **Re-repair, then gate.** A new door may now have furniture in its swing/landing — run
   `arch repair` again, then `arch validate --strict --json`. Repeat until `ok: true`.

> An *existing* door/window/opening that `validate` reports **off any wall**
> (`W_DOOR_OFF_WALL` / `W_WINDOW_OFF_WALL` / `W_OPENING_OFF_WALL`) is a different fault — a
> generator mis-coordinate, not a missing connector. Move its `at` onto the nearest wall
> centerline (or delete it if your new doors already make the room reachable).

**Worked example.** A studio where the bathroom + living were a cut-off pair (only a `living↔bath`
door) and the bedroom held the sole entrance. `describe` shows `r_living`/`r_bath` `reachable:false`.
One exterior entrance into the living/kitchen + a bedroom window makes the whole plan sound:

```
door   at (0,1500) width 900 wall exterior hinge left swing in   # entrance into Living/Kitchen (left exterior wall)
window at (0,4500) width 1200 wall exterior                      # bedroom window (left exterior wall, below the door)
```

→ `arch repair` → `arch validate --strict` → `ok: true` (all rooms reachable, bedroom lit).

## Commands

```bash
arch spec                              # the whole language in one page — READ THIS FIRST
arch manifest --json                   # the whole CLI API as data: commands, flags, formats, lint rules, error codes
arch compile plan.arch -o out.svg --json   # render (also -f dxf|pdf|png)
echo '<source>' | arch compile - -o - -f svg   # compile stdin → SVG on stdout
arch preview plan.arch -o plan.png --json  # render a PNG to SHOW the user (--install fetches resvg if missing)
arch compile plan.arch -o walk.svg --overlay circulation   # opt-in: draw the entrance→room walks + pinch markers (default output unchanged)
arch describe plan.arch --json         # semantic facts: rooms, areas, adjacency, door connections, + circulation (walk distance/bottleneck/detour)
arch lint plan.arch --json             # architectural soundness warnings
arch validate plan.arch --strict --json   # parse + resolve + lint; --strict fails on warnings too (the ship gate)
arch fmt plan.arch --write             # canonical formatting
arch repair plan.arch -o fixed.arch    # emit corrected source (furniture out of walls/doorways/swings, overlaps separated, fixtures into their room + snapped to walls) + change log; a circulation guard declines any move that would newly pinch a walk below the threshold
arch batch a.arch b.arch -f svg --json # render many plans/variants at once → results[]
arch md notes.md -o out.md -f svg      # render fenced arch blocks in a Markdown file → image links
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
