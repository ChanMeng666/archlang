# Analysis: `describe` & `lint`

ArchLang compiles a plan to a drawing — but it can also **read the plan back as
facts**. Two pure functions turn source into machine-readable, image-free output:

- **`describe(source)`** — a semantic summary: rooms, areas, adjacencies, what every
  door/window/opening connects, the furniture, a modelled **access graph**, and a
  **circulation** model (how far you walk to each room and the pinch on the way).
- **`lint(source)`** — advisory `W_*` warnings about habitability, against a chosen
  profile.

Both are exported from the package (`import { describe, lint } from "@chanmeng666/archlang"`)
and surfaced on the CLI as `arch describe` / `arch lint` (add `--json` for the
structured form). They power the **Describe** and **Lint** tabs in the
[playground](https://archlang-playground.vercel.app). Neither renders anything, so a
text-only agent can author a plan and **verify it matches intent without ever
looking at an image**.

> **Philosophy.** This is the line ArchLang draws on purpose: it reports *facts* and
> gives *advice*, but it never silently re-arranges your geometry. The compiler stays
> a faithful, deterministic renderer; the intelligence ships as data you read, not as
> an invisible architect that moves walls behind your back. See
> [ADR 0005 — no invisible architect](adr/0005-no-invisible-architect.md).

## `describe` — the semantic summary

`arch describe plan.arch --json` returns a `SceneSummary`. For
[`examples/studio.arch`](../examples/studio.arch) (abridged to the shapes that
matter — run it yourself for the full object):

```json
{
  "ok": true,
  "plan": "Studio 1BR",
  "units": "mm",
  "scale": "1:50",
  "caption": "\"Studio 1BR\" — a 4-room floor plan, 42 m² total: Living / Kitchen (24 m²), Bath (4.8 m²), …; 3 doors, 3 windows, entrance via d_main.",
  "bbox": { "w": 7000, "h": 6000 },
  "rooms": [
    {
      "id": "r_living",
      "label": "Living / Kitchen",
      "uses": ["living", "kitchen"],
      "area_m2": 24,
      "bbox": { "x": 0, "y": 0, "w": 4000, "h": 6000 },
      "adjacent": ["r_bed", "r_hall", "r_bath"]
    },
    {
      "id": "r_bath",
      "label": "Bath",
      "uses": ["bath"],
      "area_m2": 4.8,
      "bbox": { "x": 4000, "y": 4400, "w": 3000, "h": 1600 },
      "adjacent": ["r_living", "r_hall"]
    }
  ],
  "doors": [
    { "id": "d_main", "between": ["exterior", "r_living"], "width": 1000 },
    { "id": "d_bath", "between": ["r_hall", "r_bath"], "width": 800 }
  ],
  "windows": [
    { "id": "window_1", "room": "r_living", "width": 1500 }
  ],
  "openings": [
    { "id": "o_living", "between": ["r_living", "r_hall"], "width": 900 }
  ],
  "furniture": [
    { "id": "kitchen_sink_1", "category": "kitchen_sink" },
    { "id": "sofa_5", "category": "sofa", "label": "Sofa" }
  ],
  "access": { "…": "see below" },
  "totals": { "rooms": 4, "doors": 3, "windows": 3, "floor_area_m2": 42 }
}
```

| Field | Meaning |
|-------|---------|
| `caption` | one deterministic sentence summarising the whole plan (room count, total area, the rooms and their areas, door/window counts, entrance) — **always present**, composed only from the fields above so it never diverges from them |
| `rooms[].uses` | the room's [`uses` tags](language-reference.md#room) (or the inferred kind when none were authored) |
| `rooms[].area_m2` | floor area, `w × h ÷ 1 000 000`, rounded to 2 dp |
| `rooms[].adjacent` | ids of rooms whose walls touch this one within tolerance (a shared corner alone doesn't count) |
| `doors[].between` / `openings[].between` | the two spaces the connector joins — a room id or the literal `"exterior"` |
| `windows[].room` | the room the window lights |
| `totals` | room / door / window counts and total floor area |
| `accTitle` / `accDescr` | the plan's declared [accessible metadata](language-reference.md#accessible-metadata-acctitle-accdescr) — **present only when the source declares them** |

A text-only agent reads this and confirms "4 rooms, 42 m², a bath adjacent to the
hall (not the bedroom), a 1000 mm front door" — no rendering required.

The **`caption`** is the same sentence the accessible SVG puts in its `<desc>`
(`compile(src, { accessible: true })` — see the
[language reference](language-reference.md#accessible-metadata-acctitle-accdescr)); it is
computed here, from facts, so the two can never disagree. When the source declares
`accDescr`, that authored string overrides the derived caption in the SVG `<desc>` — but
`describe().caption` always reports the *derived* sentence, and the declared strings are
surfaced separately as `accTitle` / `accDescr`.

## The access graph

`describe().access` models the building as a **graph of connectors** (doors and
openings) and walks it from the exterior. For the studio:

```json
"access": {
  "entrances": ["d_main"],
  "hasEntrance": true,
  "edges": [
    {
      "doorId": "d_main", "kind": "door", "between": ["exterior", "r_living"],
      "nominalWidth": 1000, "estimatedClearWidth": 940,
      "hostCategory": "exterior", "hostWallId": "exterior_1",
      "exterior": true, "ambiguous": false
    },
    {
      "doorId": "o_living", "kind": "opening", "between": ["r_living", "r_hall"],
      "nominalWidth": 900, "estimatedClearWidth": 900,
      "exterior": false, "ambiguous": false
    }
  ],
  "rooms": [
    { "id": "r_living", "depthFromEntrance": 1, "reachable": true, "bottleneckClearWidth": 940 },
    { "id": "r_hall",   "depthFromEntrance": 2, "reachable": true, "bottleneckClearWidth": 900 },
    { "id": "r_bath",   "depthFromEntrance": 3, "reachable": true, "bottleneckClearWidth": 740 }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `entrances` / `hasEntrance` | the door(s) that connect the exterior to a room, and whether any exist at all |
| `edges[].nominalWidth` | the connector's drawn width |
| `edges[].estimatedClearWidth` | the usable opening: a **door** loses ~60 mm to its leaf and stop, an **opening** keeps its full width |
| `edges[].exterior` | whether this connector reaches the outside |
| `rooms[].depthFromEntrance` | how many connectors you pass through from the nearest entrance (`1` = opens straight off it); `null` if you can't get there |
| `rooms[].reachable` | can this room be reached from the exterior at all? |
| `rooms[].bottleneckClearWidth` | the **narrowest clear width** along the widest path in from the entrance — the real constraint for moving furniture or a wheelchair (a widest-path search, so it reports the best route's worst pinch) |

This is what makes a sealed-off room or a wheelchair-impassable corridor visible as
*data* — the playground's Describe tab draws it as a reachability diagram.

## Circulation — how a person walks the plan

Where the access graph counts *connectors*, `describe().circulation` measures the
actual **walk**. It floods a nav grid whose free cells are eroded by a body radius,
so a route only passes where a person really fits — through doors and cased openings,
never through a furniture pinch. It is `null` when the plan has no modelled exterior
entrance. For the studio:

```json
"circulation": {
  "entranceId": "d_main",
  "cellSizeMm": 100,
  "bodyRadiusMm": 300,
  "rooms": [
    { "roomId": "r_living", "walkDistanceMm": 4000, "bottleneckClearWidthMm": 940, "detourRatio": 1.29 },
    { "roomId": "r_bath",   "walkDistanceMm": 5300, "bottleneckClearWidthMm": 700, "detourRatio": 2.74 }
  ],
  "routes": [
    { "fromRoomId": "r_bed", "toRoomId": "r_bath", "walkDistanceMm": 6000, "bottleneckClearWidthMm": 700, "detourRatio": 1.53 }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `entranceId` | the door the walk is measured from (first entrance in source order) |
| `cellSizeMm` / `bodyRadiusMm` | the nav-grid quantum (distances are rounded to it, so they're coarse) and the radius obstacles were inflated by |
| `rooms[].walkDistanceMm` | walking distance from the entrance to the room, over the eroded grid |
| `rooms[].bottleneckClearWidthMm` | the narrowest unavoidable clear width on the way in (a door width, or a furniture pinch) |
| `rooms[].detourRatio` | `walkDistance ÷ straight-line` — how far the route wanders from a beeline (`≥ ~1`) |
| `routes[]` | key functional routes (kitchen → nearest living/dining, bedroom → nearest bath), same three metrics |

Two advisory lint rules read this model, and the same model backs the opt-in
`arch compile --overlay circulation` render overlay (see
[ADR 0008 — circulation as facts](adr/0008-circulation-as-facts.md)).

## Freedom — how constrained the plan is

`describe().freedom` is a **degrees-of-freedom report**: for every placed element,
whether its position was authored **absolutely** (a literal `at (x,y)`) or **derived**
by the resolver from a higher-level clause. It is the "how much of this plan is
pinned down vs computed" fact an agent reads before editing — moving a `relational`
room shifts everything placed off it, while an `absolute` room moves alone. Facts
only: no advice, no scoring, no thresholds.

Each family carries counts plus one `elements` row per member, in `describe`'s own
emission order (rooms, doors, windows, openings, furniture). For the strip-and-attach
`examples/attached.arch`:

```json
"freedom": {
  "rooms":     { "total": 2, "absolute": 0, "relational": 0, "strip": 2 },
  "openings":  { "total": 4, "attached": 4, "absolute": 0 },
  "furniture": { "total": 2, "anchored": 2, "againstWall": 0, "absolute": 0 },
  "elements": [
    { "id": "r_living", "kind": "room",      "placement": "strip" },
    { "id": "d_main",   "kind": "door",      "placement": "attached" },
    { "id": "sofa_1",   "kind": "furniture", "placement": "anchored" }
  ]
}
```

| Family | Placement values | Meaning |
|--------|------------------|---------|
| `rooms` | `absolute` · `relational` · `strip` | a literal `at`; a `right-of`/`below`/… clause; a `strip` block row |
| `openings` (doors + windows + cased openings) | `attached` · `absolute` | `on <wall> at <pos>`; a literal `at (x,y)` |
| `furniture` | `anchored` · `against-wall` · `absolute` | `in <room> anchor\|centered`; `against wall …`; a literal `at` |

Every derived placement is still resolved to concrete coordinates in the rest of the
summary — `freedom` only records *how* each coordinate was arrived at. On a plan that
failed to resolve, `freedom` is present with all-zero counts and an empty `elements`.

## `lint` — architectural soundness

`arch lint plan.arch --json` returns advisory `W_*` diagnostics, each with a byte
`span`, a `line`/`col`, and a `fix`. Warnings never block rendering — they flag
*habitability*, not *validity*. The rules, grouped by what they watch:

| Family | Example codes |
|--------|---------------|
| Room | `W_ROOM_TOO_SMALL`, `W_ROOM_DISCONNECTED`, `W_BEDROOM_NO_WINDOW`, `W_ROOM_OVERLAP` |
| Placement | `W_DOOR_OFF_WALL`, `W_WINDOW_OFF_WALL`, `W_OPENING_OFF_WALL` |
| Door / circulation | `W_DOOR_CLEARANCE`, `W_SWING_OBSTRUCTED`, `W_NO_ENTRANCE` |
| Reachability | `W_ROOM_UNREACHABLE`, `W_BATH_VIA_BEDROOM` |
| Wet rooms | `W_ROOM_NOT_ENCLOSED`, `W_ROOM_NO_FIXTURE` |
| Furniture / fixtures | `W_FIXTURE_FLOATING`, `W_FIXTURE_WRONG_ROOM`, `W_FURNITURE_OVERLAP`, `W_FURN_CLEARANCE` |
| Circulation quality | `W_ROOM_NO_CLEAR_PATH`, `W_PATH_TOO_NARROW`, `W_CIRCUITOUS_PATH` |

Every code is documented — with cause, fix, and example — in the
[error catalog](error-codes.md), or run `arch explain W_SWING_OBSTRUCTED`.

### Profiles

A **profile** is a named bundle of thresholds, applied with `--profile` (CLI) or
`lint(src, { profile })`. The names come from `LINT_PROFILES` (`src/lint.ts`):

| Profile | Thresholds |
|---------|-----------|
| `residential-basic` *(default)* | doors ≥ 700 mm, rooms ≥ 4 m², walk clear ≥ 700 mm, detour ≤ 3.0×, no swing-clearance buffer |
| `accessibility-advisory` | doors ≥ 850 mm, rooms ≥ 5 m², walk clear ≥ 900 mm, detour ≤ 3.0×, 150 mm swing clearance |

```
arch lint plan.arch                                  # residential-basic
arch lint plan.arch --profile accessibility-advisory
```

The flagship studio is **clean under the default profile**, but the stricter profile
surfaces advisory notes — its 800 mm internal doors and ~4–5 m² hall and bath fall
under the accessibility thresholds:

```json
{
  "ok": true,
  "diagnostics": [
    {
      "code": "W_DOOR_CLEARANCE",
      "message": "Door is 800 mm wide (under the 850 mm minimum nominal width).",
      "line": 30, "col": 3,
      "fix": "Widen the door to at least the minimum clear width.",
      "hints": ["Widen it to at least 850 mm."]
    },
    {
      "code": "W_ROOM_TOO_SMALL",
      "message": "Room \"Hall\" is only 4.2 m² (under 5 m²).",
      "line": 22, "col": 3,
      "fix": "Increase its `size`, or merge it into an adjacent space."
    }
  ]
}
```

> Profiles are **advisory soundness checks, never a building-code compliance
> guarantee.** Real accessibility and code review depend on jurisdiction; treat these
> as a helpful nudge, not a sign-off.

## The agent loop

Together, `describe` and `lint` close the author → render → **verify** loop for an AI
agent with no eyes on the drawing — see [Use ArchLang from an agent](agents.md):

1. `arch compile` — render and get errors as data.
2. `arch describe --json` — confirm the room count, labels, areas, and access match
   the brief.
3. `arch lint --json` — clear the habitability warnings (each carries a `fix`).

### Diagnostics as data, and seeing a failure

The two feedback channels an agent relies on are both public, structured API:

- **`diagnosticToJson(source, d)`** (exported; type `DiagnosticJson`) is the canonical
  projection the CLI's `--json` output already uses for every diagnostic. It resolves the
  byte `span` to 1-based `line`/`col` (via `offsetToLineCol`) and attaches the catalogued
  `fix` for the code, so a self-correcting agent has the location and the remedy without a
  docs lookup:

  ```ts
  import { compile, diagnosticToJson } from "@chanmeng666/archlang";
  const { diagnostics } = compile(src);
  const asJson = diagnostics.map((d) => diagnosticToJson(src, d));
  // → { code, severity, message, line, col, span: [start,end], fix?, hints? }
  ```

- **The opt-in error card.** By default a plan that fails to compile produces **no image** —
  correct for a pipeline, but blind for an agent watching the drawing. `compile(src, { onError:
  "svg" })` / `--error-svg` (on `arch compile`, `arch preview`, and `arch md`) instead renders
  a deterministic, self-describing SVG card — severity, code, `line:col`, message, and the
  catalogued fix — so the failure is visible, not just returned. Errors, diagnostics, and exit
  codes are unchanged; without the opt-in the failing plan still yields no bytes. The renderer
  is exported as `renderErrorSvg`. See
  [ADR 0009](adr/0009-ai-first-context-and-distribution.md).

For a full cold start, `arch context` (and the shipped `llms-full.txt`) bundle this loop —
the language spec, the `SKILL.md` workflow, the CLI reference, and the whole error catalog — into
one system-prompt-ready document.
