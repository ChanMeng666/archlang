---
name: archlang
description: Use when the user wants to create, edit, or inspect an architectural floor plan / building layout as code — e.g. "draw a 2-bedroom apartment", "add a bathroom to this plan", "make the bedroom 1 m wider", "lay out an office floor". ArchLang is a tiny text language that compiles a .arch file to a professional floor-plan drawing (SVG/PNG/PDF/DXF). Drive it entirely through the `arch` CLI; do not hand-render.
---

# ArchLang — author floor plans as code

ArchLang turns a small `.arch` text file into a professional floor-plan drawing. It is built for
agents: deterministic, self-correcting (errors carry a machine code, a prose `fix`, and often a
**machine-applicable** fix `arch fix` can apply), and verifiable without ever looking at an image
(`arch describe`).

## Setup (zero-install)

The CLI runs straight from npm — no clone, no build:

```bash
npx @chanmeng666/archlang help
```

(Or `npm i -g @chanmeng666/archlang` to get a persistent `arch` binary.)

## The loop (always follow this)

1. **Learn the language first.** Run `arch spec` and read it — the entire language in one page
   (~2k tokens). (`arch context` prints *everything*: spec + this workflow + CLI reference + error
   catalog.) Do this before writing any `.arch`.
2. **Write the plan** to a `.arch` file (or pipe via stdin with `-`), preferring the **placement
   sugar** below so you never hand-compute a coordinate.
3. **Render it:** `arch compile plan.arch -o plan.svg --json`. The JSON is `{ ok, diagnostics,
   summary }`.
4. **Auto-fix the mechanical faults:** if `ok` is false, run `arch fix plan.arch --dry-run --json`
   to preview the **machine-applicable** edits (off-wall opening → attachment form, out-of-range
   position clamped, …), then re-run without `--dry-run` to apply. Anything `fix` can't resolve stays
   in `diagnostics[].fix` for you to edit by hand. Exit code `2` means a deterministic user error —
   fix it, don't blindly retry (`1` = IO/internal, `3` = bad usage).
5. **See the plan without an image:** `arch compile plan.arch -f txt` (or `arch preview plan.arch
   --ascii`) prints a zero-dependency ASCII floor plan you can read straight from stdout.
6. **Verify intent:** `arch describe plan.arch --json` returns the rooms (areas, adjacency), what each
   door connects, and totals. Confirm the room count, labels, and areas match what was asked.
7. **Gate on soundness — don't ship a flagged plan.** `arch validate plan.arch --strict --json`
   (parse + resolve + lint). `--strict` makes **every advisory warning fail** (exit `2`) — the gate a
   generation pipeline runs before it ships. Add `--graph g.json` to also assert the intended
   room-to-room adjacency (`{ "living": ["kitchen","hall"], … }`); a mismatch fails. Read each
   `diagnostics[].fix`, edit, and re-run until it passes — or, if a warning is deliberate, say so.
8. **Check the plan against the brief.** Write the user's brief as an `intent.json` — its checkable
   expectations as data (room count, per-room concepts with area/window bands, total area, optional
   adjacency/reachability). Two disciplines keep it brief-grounded: assert an area band only where the
   brief gives a number ("about/~N" → ±10%; "at least N" → `min` only; qualitative words → nothing),
   and assert the top-level room `count` only when the brief **enumerates** the rooms. Gate with
   `arch validate plan.arch --intent intent.json --feedback --json`: a gating miss (room
   count/existence/area/total-area/window) fails (exit `2`) with a per-violation correction prompt —
   iterate on the feedback and re-run. Adjacency/reachability are advisory (reported, never fail the
   gate). Use `arch score plan.arch --brief intent.json --json` as a continuous satisfaction meter
   (always exit `0`) to watch the plan approach the brief across edits. See
   [`/intent.schema.json`](https://archlang.uk/intent.schema.json).
9. **Fix furniture geometry:** `arch repair plan.arch -o fixed.arch` pushes furniture out of
   walls/doorways/swing arcs (the geometric corrector; distinct from `fix`).
10. **Show the user:** `arch preview plan.arch -o plan.png` renders a PNG (`--install` fetches the
   optional renderer if missing).

## Write it right the first time (placement sugar — the preferred path)

A geometry-blind generator that emits absolute coordinates produces plans that render but are
physically wrong (openings off their wall, furniture through walls). Author by **attachment** instead
— the compiler computes the coordinate, and fails loudly if the reference is ambiguous:

- **Attach openings to a wall by position, not `at (x,y)`.** `door on <wall> at <pos> …` /
  `window on <wall> at <pos> …` / `opening on <wall> at <pos> …`, where `<pos>` is millimetres along
  the wall or a percentage (`50%`). `swing into <room>` picks the swing direction toward a named room;
  `hinge near start|end` hinges at the segment end nearer a wall end. (Off-wall/ambiguous →
  `E_ATTACH_WALL_REF`; past the wall → `E_ATTACH_POS_RANGE`.)
- **Lay rooms with `strip`.** `strip right at (0,0) gap 0 height 4000 { room … room … }` places a row
  (or column, with `down`/`up` + `width`) of rooms end to end — no per-room `at`.
- **Place furniture by anchor.** `furniture <kind> in <room> anchor <9-point anchor> [inset <mm>] …`
  snaps a piece flush to a room corner or edge — the anchor is one of `top-left`, `top`, `top-right`,
  `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`; `against wall <id>` backs
  plumbing/kitchen fixtures onto a real wall face. Both are closed-form and never float or penetrate.
- **Every room still needs a way in** — put a `door` or cased `opening` on a wall of *every* room
  (an open-plan space still needs a modeled opening), and keep furniture out of the doorway approach
  (≥300 mm) and the leaf's swing.
- **Absolute `at (x,y)` is the fallback**, not the default — reach for it only when no attachment
  expresses what you mean.

See `examples/attached.arch` for a full one-bedroom authored this way, and `arch spec` for the grammar.

## Self-correct with data, not guesswork

`arch compile --json` returns every problem as a `Diagnostic` with a byte span, `line`/`col`, a
catalogued `E_*`/`W_*` code, and a prose `fix`. Where the correction is a mechanical text edit, the
diagnostic also carries **machine-applicable `fixes`**:

- **`arch fix`** applies them in a bounded, self-checking fixpoint — **only `machine-applicable` by
  default** (`--unsafe` also applies `maybe-incorrect`; `--dry-run` previews; `--force` keeps a pass
  that would otherwise roll back). Use it to clear the syntactic faults before you touch anything by
  hand.
- **`arch fix` is syntactic; `arch repair` is geometric.** `fix` rewrites text where the right text is
  known (e.g. an off-wall door → the attachment form); `repair` *moves furniture* to a position no
  text edit could express. They compose — fix first, then repair.
- **`arch fix` also applies fix-carrying *lint* advisories**, not only compile-stage faults — e.g.
  `W_ALIAS_MATCH` (a room's use inferred from an indirect label alias) fixes by inserting the explicit
  `uses …` it inferred. Before editing, `arch describe --json`'s **`freedom`** block tells you which
  element positions were **hand-authored** (`absolute`) vs **derived** by the resolver
  (relational/strip/attached/anchored/against-wall), so you know which numbers are safe to nudge.

## Fix the topology: add doors & windows the room graph needs

`fix`/`repair` never add a door or a window — *where* to put one is a design choice the compiler must
not make. When lint reports `W_ROOM_UNREACHABLE`, `W_ROOM_DISCONNECTED`, `W_NO_ENTRANCE`,
`W_BATH_VIA_BEDROOM`, or `W_BEDROOM_NO_WINDOW`, ask ArchLang for candidates:

- **`arch suggest plan.arch --json`** returns ready-to-paste `door`/`window` statements (furniture-aware
  — a door candidate never opens onto a wardrobe; each references its wall by a **stable ref** — an
  authored id or a unique category — or absolute coordinates, never a re-bindable positional id) plus a
  rationale for each — for a room with no path back (`W_ROOM_UNREACHABLE`), a building with no way in
  (`W_NO_ENTRANCE`), a bath reachable only through a bedroom (`W_BATH_VIA_BEDROOM`), or a windowless
  bedroom (`W_BEDROOM_NO_WINDOW`). Choose one and insert it, then re-run the loop. This replaces
  hand-computing coordinates.
- **Manual fallback** (if `suggest` offers nothing that fits): from `describe().access`, connect each
  unreachable room in priority — (1) a new **exterior entrance** `door on <exterior wall> at <pos>`
  into a living/kitchen/hall with an exterior edge (avoids routing through a bedroom); else (2) a
  `door on <shared wall> at <pos>` to an adjacent reachable, non-bedroom room; and give a windowless
  bedroom a `window on <its exterior wall> at <pos> width 1200`. Never make a bathroom reachable only
  through a bedroom. Then `arch repair` (a new door may pinch furniture) and re-gate.

> An *existing* opening `validate` reports **off its wall** (`W_DOOR_OFF_WALL` /
> `W_WINDOW_OFF_WALL` / `W_OPENING_OFF_WALL`) is a mis-coordinate, not a missing connector — run
> `arch fix` (it rewrites it to the attachment form) rather than adding a new one.

## Ask the CLI, and read only what you need

The CLI documents itself, and every read can be narrowed at the source — never pull a whole plan's
facts into context just to filter them yourself.

- **`arch <cmd> --help`** (or `arch help <cmd>`) prints that one command's flags *and worked
  examples* — every command carries at least one copy-pasteable invocation. `arch help` lists the
  commands; `arch --version` prints the version. A flag a command doesn't take is a usage error
  (exit `3`) with a did-you-mean, never a silently-swallowed filename — so a typo fails loudly
  instead of compiling the wrong thing.
- **`arch describe --select <keys>`** emits only the named top-level keys (`rooms`, `doors`,
  `windows`, `openings`, `furniture`, `access`, `circulation`, `totals`, `freedom`, `caption`, …);
  the `ok`/`plan`/`units`/`diagnostics` envelope is always kept, so narrowing can't lose the verdict.
  **`arch describe --room <ids>`** keeps only those rooms plus the doors/windows/furniture that touch
  them (whole-plan facts — `bbox`, `totals`, `caption`, each room's `adjacent` — stay whole-plan, so a
  narrowed read never lies about the building). Both mark the result with `filtered: true`.
- **`arch lint|validate --code <CODE,…>` / `--severity error|warning`** show only the diagnostics you
  asked for. These are **display filters only**: `ok` and the exit code are always computed from the
  *unfiltered* set, so reading less can never turn a failing plan green. A filtered result carries
  `filtered: true` + `total_diagnostics`.
- **`arch context --section spec|workflow|cli|errors`** prints one section of the ~50 KB bundle
  instead of all of it — `errors` for the diagnostic catalog, `cli` for the command reference.
- **`arch fix --dry-run`** prints the exact unified diff it would write (to stderr; `--json` also
  carries it as `diff`) and touches nothing. When you do apply in place, **`--backup`** keeps the
  original bytes at `<file>.bak`.

## Structured authoring & constrained generation (optional)

- **Plan JSON.** Author or ingest the machine-native shape and compile it: `arch compile plan.json
  --from-json -o out.svg`. The schema is served at
  [`/plan.schema.json`](https://archlang.uk/plan.schema.json).
- **GBNF.** To force a local model to emit only parseable ArchLang, constrain decoding with
  [`/archlang.gbnf`](https://archlang.uk/archlang.gbnf).

## Commands

```bash
arch spec                              # the whole language in one page — READ THIS FIRST
arch context                           # everything in one call: spec + this workflow + CLI reference + error catalog
arch context --section errors          # just one section of it (spec|workflow|cli|errors)
arch help <cmd>                        # flags + worked examples for one command (same as `arch <cmd> --help`)
arch manifest --json                   # the whole CLI API as data: commands, flags, formats, lint rules, error codes
arch compile plan.arch -o out.svg --json   # render (also -f dxf|txt|pdf|png)
arch compile plan.arch -f txt          # zero-dependency ASCII text plan on stdout (also `preview --ascii`)
arch compile plan.json --from-json -o out.svg   # compile structured Plan JSON (see /plan.schema.json)
echo '<source>' | arch compile - -o - -f svg    # compile stdin → SVG on stdout
arch fix plan.arch --dry-run --json    # preview the machine-applicable fixes as a unified diff (drop --dry-run to apply; --backup keeps <file>.bak)
arch suggest plan.arch --json          # advisory door/window statements: unreachable room / no entrance / bath-via-bedroom / windowless bedroom
arch describe plan.arch --json         # semantic facts: rooms, areas, adjacency, door connections, circulation
arch describe plan.arch --select rooms,totals --room kitchen --json   # narrow the facts to what you actually need
arch lint plan.arch --json             # architectural soundness warnings
arch lint plan.arch --code W_NO_ENTRANCE --json   # display filter only — never changes `ok` or the exit code
arch validate plan.arch --strict --json           # parse + resolve + lint; --strict fails on warnings (the ship gate)
arch validate plan.arch --graph g.json --json     # also check interior-door adjacency against an intended graph
arch repair plan.arch -o fixed.arch    # geometric corrector: furniture out of walls/doorways/swings + change log
arch fmt plan.arch --write             # canonical formatting
arch batch a.arch b.arch -f svg --json # render many plans/variants at once → results[]
arch preview plan.arch -o plan.png     # render a PNG to SHOW the user (--install fetches resvg if missing)
arch new -o plan.arch                  # scaffold a starter plan
arch explain E_ROOM_SIZE --json        # look up any diagnostic code
```

(An optional MCP server, `@chanmeng666/archlang-mcp`, wraps these same library functions for
MCP-native hosts — prefer the CLI when you have a shell; it costs nothing in context until called.)

## Key rules (full detail in `arch spec`)

- **Units are millimetres** (a 4 m wall is `4000`); **origin top-left, +x right, +y DOWN**. An
  optional metric suffix is exact sugar for the same mm value — `4m` = `4000`, `40cm` = `400`,
  `20mm` = `20` — so you can write `4m` instead of hand-multiplying; bare numbers are unchanged.
- **Attach openings to walls** (`on <wall> at <pos>`) so they always sit on a segment; a raw `at`
  that lands off any wall warns (and `arch fix` rewrites it).
- **Fixtures draw real symbols:** `furniture wc|basin|shower|bathtub|kitchen_sink|counter|fridge|stove …`
  renders a plan symbol; put fixtures in every bath and kitchen so lint stays quiet.
- **`dims auto`** draws dimension strings for you (`overall`, `rooms`, `walls`, or `all`).
- Edit is cheap: "make the bedroom 1 m wider" is a one-number change, then recompile.

Treat the CLI as the source of truth — author, render, and verify through it rather than reasoning
about SVG by hand.
