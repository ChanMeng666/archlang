# When the compiler says no, and why

ArchLang reads the plan you wrote and measures it. When something is wrong it says what, where and
what to change, in text a person or an agent can act on. This page shows seven small plans the
checks flag, each with the command and its real output.

Two kinds of answer come back. An error (`E_*`) means the plan cannot be drawn as written. A warning
(`W_*`) is advice about a plan that does draw: `archlang lint` exits `0` with warnings unless you ask
otherwise ([`--strict`](#make-warnings-fail-validate-strict) below). The checks measure the geometry
you stated. They do not decide whether a building is good, and no profile makes that decision.

How to read the output: each JSON block is the command's `--json` output reduced to the fields
shown. A diagnostic keeps its `code`, `message` and position (`line`, `col`); the full output also
carries the byte `span`, a `fix` text, `hints` and a `coverage` block naming the rule families that
ran or were skipped. For `impact`, `keeps_broke` is the full output's `keeps.broke` and `lock` keeps its `violations`
with the code, id, kind, change and message. Run the command on the plan to read all of it. The `# exit` line under each
command is the exit code that run returned.

Every plan below is saved as `plan.arch` and the command is run in the same folder.

## A door that cannot open

```arch static
plan "A bed behind the door" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  room id=r_main at (0,0) size 3000x3000 label "Living" uses living
  room id=r_bed at (3000,0) size 3000x3000 label "Bedroom" uses bedroom
  door id=d_front at (1500,3000) width 900 wall exterior hinge left swing in
  door id=d_bed at (3000,1500) width 800 wall partition hinge left swing into r_bed
  window id=w_1 at (0,1500) width 1200 wall exterior
  window id=w_2 at (6000,1500) width 1200 wall exterior
  furniture bed at (3700,300) size 1500x2000 label "Bed"
}
```

```bash
archlang lint plan.arch --json
# exit 0
```

```json
{
  "summary": "1 warning in 1 code: W_SWING_OBSTRUCTED ×1",
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_SWING_OBSTRUCTED",
      "message": "Door swing is obstructed — the swing needs 800 mm of clear radius but \"Bed\" is 700 mm from the hinge (100 mm short).",
      "line": 8,
      "col": 3
    }
  ]
}
```

The bedroom door needs 800 mm of clear radius to swing and the bed stands 700 mm from the hinge, so
the leaf would hit it; `archlang repair` computes the smallest shift that clears it.
The code is [`W_SWING_OBSTRUCTED`](error-codes.md#w_swing_obstructed).

## A room nobody can reach

```arch static
plan "Two rooms cut off" {
  units mm
  wall exterior thickness 200 { (0,0) (9000,0) (9000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  wall partition thickness 100 { (6000,0) (6000,3000) }
  room id=r_main at (0,0) size 3000x3000 label "Living" uses living
  room id=r_pantry at (3000,0) size 3000x3000 label "Pantry" uses storage
  room id=r_store at (6000,0) size 3000x3000 label "Store" uses storage
  door id=d_front at (1500,3000) width 900 wall exterior hinge left swing in
  door id=d_cut at (6000,1500) width 800 wall partition hinge left swing in
  window id=w_1 at (0,1500) width 1200 wall exterior
}
```

```bash
archlang lint plan.arch --json
# exit 0
```

```json
{
  "summary": "2 warnings in 1 code: W_ROOM_UNREACHABLE ×2",
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_ROOM_UNREACHABLE",
      "message": "Room \"Pantry\" can't be reached from the entrance.",
      "line": 7,
      "col": 3
    },
    {
      "code": "W_ROOM_UNREACHABLE",
      "message": "Room \"Store\" can't be reached from the entrance.",
      "line": 8,
      "col": 3
    }
  ]
}
```

The pantry and the store are joined to each other by a door, but no door joins either to the living
room that holds the entrance, so no route from the entrance reaches them
([`W_ROOM_UNREACHABLE`](error-codes.md#w_room_unreachable)).

## A bedroom with no window

```arch static
plan "A bedroom with no window" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  room id=r_main at (0,0) size 3000x3000 label "Living" uses living
  room id=r_bed at (3000,0) size 3000x3000 label "Bedroom" uses bedroom
  door id=d_front at (1500,3000) width 900 wall exterior hinge left swing in
  door id=d_bed at (3000,1500) width 800 wall partition hinge left swing in
  window id=w_1 at (0,1500) width 1200 wall exterior
}
```

```bash
archlang lint plan.arch --json
# exit 0
```

```json
{
  "summary": "1 warning in 1 code: W_BEDROOM_NO_WINDOW ×1",
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_BEDROOM_NO_WINDOW",
      "message": "Bedroom \"Bedroom\" has no window.",
      "line": 6,
      "col": 3
    }
  ]
}
```

The bedroom has a door but no `window` on any of its walls
([`W_BEDROOM_NO_WINDOW`](error-codes.md#w_bedroom_no_window)); the one window belongs to the living
room.

## A garage too narrow for its car

```arch static
plan "A garage 2.5 m wide" {
  units mm
  wall exterior thickness 200 { (0,0) (2500,0) (2500,6000) (0,6000) close }
  room id=g at (0,0) size 2500x6000 label "Garage" uses garage
  door id=d_side at (1250,6000) width 900 wall exterior hinge left swing in
  furniture car at (350,300) size 1800x4600 in g
}
```

```bash
archlang lint plan.arch --json
# exit 0
```

```json
{
  "summary": "1 warning in 1 code: W_GARAGE_TOO_NARROW ×1",
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_GARAGE_TOO_NARROW",
      "message": "Garage \"Garage\" is 2500 mm across its short side, under the 2700 mm 1 bay need (1 car) — 200 mm short.",
      "line": 4,
      "col": 3
    }
  ]
}
```

One parking bay wants 2700 mm of clear width and this garage is 2500 mm across its short side, so it
is 200 mm short ([`W_GARAGE_TOO_NARROW`](error-codes.md#w_garage_too_narrow)).

## Furniture through a wall

```arch static
plan "A sofa through a wall" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  room id=r_main at (0,0) size 3000x3000 label "Living" uses living
  room id=r_bed at (3000,0) size 3000x3000 label "Bedroom" uses bedroom
  door id=d_front at (1500,3000) width 900 wall exterior hinge left swing in
  door id=d_bed at (3000,2400) width 800 wall partition hinge left swing in
  window id=w_1 at (0,1500) width 1200 wall exterior
  window id=w_2 at (6000,1500) width 1200 wall exterior
  furniture sofa at (1500,300) size 2000x900 label "Sofa"
}
```

```bash
archlang lint plan.arch --json
# exit 0
```

```json
{
  "summary": "1 warning in 1 code: W_FURNITURE_WALL_COLLISION ×1",
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_FURNITURE_WALL_COLLISION",
      "message": "Furniture \"Sofa\" penetrates the partition wall at x 3000 — 100 mm into its 100 mm thickness.",
      "line": 11,
      "col": 3
    }
  ]
}
```

The sofa runs from x 1500 to 3500 and the partition stands at x 3000, so the piece sits inside the
wall ([`W_FURNITURE_WALL_COLLISION`](error-codes.md#w_furniture_wall_collision)).

## An edit that moves what you locked

This is the plan from [Change one room without moving the others](edit-one-room.md), with a `keep`
that holds the living room's bottom edge at y 3000. The edit makes the entry deeper by setting
`hall_d` to 1700, and the command locks the living room, the window and the front door.

```arch static
plan "Sketch Studio" {
  units mm
  grid 100
  scale 1:50
  north up

  let w = 5400
  let d = 4500
  let hall_d = 1500
  let split = 3000

  room id=r_main at (0,0)                size w x (d - hall_d)       label "Living / Bed"
  room id=r_hall at (0,d - hall_d)       size split x hall_d         label "Entry"
  room id=r_bath at (split,d - hall_d)   size (w - split) x hall_d   label "Bath"

  walls from rooms exterior 300 partition 100

  door id=d_front on r_hall.bottom at center width 900 swing into r_hall
  door between r_hall and r_main at 1500 from start width 900 swing into r_main
  door between r_hall and r_bath at center width 800 swing into r_bath
  window id=w_main on r_main.top width 1800

  furniture shower in r_bath anchor right flush size 900x900

  keep fixed r_main.bottom at 3000
}
```

```bash
archlang impact plan.arch --set hall_d=1700 --lock r_main,w_main,d_front --json
# exit 2
```

```json
{
  "keeps_broke": [
    {
      "keep": "fixed r_main.bottom at 3000",
      "grade": "hard",
      "residual_mm": {
        "before": 0,
        "after": -200
      },
      "changed": [
        "r_main"
      ]
    }
  ],
  "lock": {
    "ok": false,
    "locked": [
      "r_main",
      "w_main",
      "d_front"
    ],
    "violations": [
      {
        "code": "E_LOCKED_ELEMENT_CHANGED",
        "id": "r_main",
        "kind": "room",
        "change": "resized",
        "message": "Locked room \"r_main\" resized (16.2 m² → 15.1 m²; bottom edge -200 mm)."
      }
    ]
  }
}
```

The living room shrank by 200 mm at its bottom edge, which the lock reports as
`E_LOCKED_ELEMENT_CHANGED` (exit `2`); the window and the door stayed where they were, and the
`keep` broke by the same 200 mm. The full output also lists everything that moved and why. A lock is
a check you run for one edit; see [Change one room](edit-one-room.md) for the whole loop.

## A keep that does not hold

A `keep` written into the plan states a relation that must hold, and the compiler measures it
without moving anything to make it true.

```arch static
plan "A keep that does not hold" {
  units mm
  room id=r_main at (0,0) size 4000x3000 label "Living" uses living
  walls from rooms exterior 200 partition 100
  door id=d_front on r_main.bottom at center width 900 swing into r_main
  window id=w_main on r_main.top width 1800
  keep fixed r_main.left at 100
}
```

```bash
archlang validate plan.arch --json
# exit 0
```

```json
{
  "summary": "1 warning in 1 code: W_KEEP_VIOLATED ×1",
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_KEEP_VIOLATED",
      "message": "This keep holds the left edge of \"Living\" at x 100; it is at x 0, 100 mm left of that. A keep moves nothing.",
      "line": 7,
      "col": 3
    }
  ],
  "keeps": [
    {
      "keep": "fixed r_main.left at 100",
      "grade": "hard",
      "holds": false,
      "residual_mm": -100
    }
  ]
}
```

The keep holds the left edge at x 100 and the room starts at x 0, so it is 100 mm out
([`W_KEEP_VIOLATED`](error-codes.md#w_keep_violated)); the compiler reports the residual and leaves
the geometry as you wrote it.

## Make warnings fail: `validate --strict`

A warning does not stop a build by itself. `--strict` (alias `--fail-on-warning`) counts advisory
warnings as failures too: the command exits `2` and `ok` is `false`. Errors fail with or without it.
It suits a CI step or a generator pipeline that must not ship a plan with an open warning. It does
not turn a warning into an error in the plan, and it does not change what is measured. Here it is on
the bed-behind-the-door plan from the top of this page:

```arch static
plan "A bed behind the door" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  room id=r_main at (0,0) size 3000x3000 label "Living" uses living
  room id=r_bed at (3000,0) size 3000x3000 label "Bedroom" uses bedroom
  door id=d_front at (1500,3000) width 900 wall exterior hinge left swing in
  door id=d_bed at (3000,1500) width 800 wall partition hinge left swing into r_bed
  window id=w_1 at (0,1500) width 1200 wall exterior
  window id=w_2 at (6000,1500) width 1200 wall exterior
  furniture bed at (3700,300) size 1500x2000 label "Bed"
}
```

```bash
archlang validate plan.arch --strict --json
# exit 2
```

```json
{
  "summary": "1 warning in 1 code: W_SWING_OBSTRUCTED ×1",
  "ok": false,
  "strict": true,
  "diagnostics": [
    {
      "code": "W_SWING_OBSTRUCTED",
      "message": "Door swing is obstructed — the swing needs 800 mm of clear radius but \"Bed\" is 700 mm from the hinge (100 mm short).",
      "line": 8,
      "col": 3
    }
  ]
}
```

`lint` takes the same flag. To fail on an advisory profile's warnings, add `--profile` (next
section).

## Clean under the defaults is not clean under any one jurisdiction's numbers

Without a profile, `lint` uses the default thresholds. A profile swaps in a different set, taken
from one jurisdiction's published guidance, so the same plan can be clean under one set and flagged
under another. Here is `examples/studio.arch` under the defaults:

```bash
archlang lint examples/studio.arch --json
# exit 0
```

```json
{
  "summary": "no warnings",
  "ok": true,
  "strict": false,
  "diagnostics": []
}
```

And under `uk-residential-advisory`:

```bash
archlang lint examples/studio.arch --profile uk-residential-advisory --json
# exit 0
```

```json
{
  "summary": "1 warning in 1 code: W_ROOM_TOO_SMALL ×1",
  "ok": true,
  "strict": false,
  "diagnostics": [
    {
      "code": "W_ROOM_TOO_SMALL",
      "line": 21,
      "col": 3
    }
  ]
}
```

This block leaves out `message` and keeps the code and position. The message says the bedroom
measures 8.12 m² of net floor and that profile asks 11.5 m² of a double bedroom
([`W_ROOM_TOO_SMALL`](error-codes.md#w_room_too_small)). Nothing in the plan changed between the two
runs; the thresholds did. A profile is advice built from one source's numbers. It does not say a
design meets a code, and a clean run under one profile says nothing about another or about the local
rules that apply to a real site.

The numbers each profile sets for a few settings, read from the ruleset in `src/lint/ruleset.ts`
(`—` means that profile sets no number for that row; the generic floor above it then applies, and
`residential-basic` changes how a plan is classified, not these numbers):

<!-- says-no:profiles:start -->

| Setting | default | `residential-basic` | `accessibility-advisory` | `cn-residential-advisory` | `uk-residential-advisory` | `us-residential-advisory` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Least door width (mm) | 700 | 700 | 850 | 700 | 700 | 700 |
| Least room area, generic floor (m²) | 4 | 4 | 5 | 4 | 4 | 4 |
| Least bedroom area, set per use (m²) | — | — | — | 5 | 7.5 | 6.5 |
| Stair riser, at most (mm) | 220 | 220 | 220 | 200 | 220 | 196.85 |
| Stair going, at least (mm) | 220 | 220 | 220 | 220 | 220 | 254 |
| WC centre to side wall, at least (mm) | 400 | 400 | 450 | 400 | 400 | 381 |

<!-- says-no:profiles:end -->

The reasoning behind each number is written beside it in that file, and
[Analysis](analysis.md#profiles) lists the profiles.

## How this page is kept true

Every output above is produced by `scripts/says-no.ts` from the plan or the file shown, through the
same command dispatch the `archlang` binary runs, and `test/docs-says-no.test.ts` fails when the page
differs from what the script renders. Run `npx tsx scripts/says-no.ts --write` after changing a plan
or a threshold. The profile table is read from `LINT_PROFILES` and `DEFAULT_RULESET`, not typed.

## Next

- [Common mistakes](common-mistakes.md): the diagnostics an agent meets most, and how to fix each.
- [Change one room without moving the others](edit-one-room.md)
- [Error catalog](error-codes.md): every code with its cause and fix.
- [Analysis: `describe` and `lint`](analysis.md)
