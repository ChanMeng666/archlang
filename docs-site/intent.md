> _This page is generated from [`docs/intent.md`](https://github.com/chanmeng666/archlang/blob/main/docs/intent.md) — edit it there._

# The intent contract

ArchLang can read a plan back as [facts](analysis.md) — rooms, areas, adjacencies,
access. The **intent contract** goes one step further: it lets you write down *what a
brief asked for* as data, then checks that data against those facts. A brief like
"a two-bedroom flat, one bathroom about 6 m², around 55 m² total" becomes an
`intent.json`; `arch validate --intent` measures a plan against it and tells you, code by
code, which expectations the drawing meets and which it misses — **without ever rendering
an image**.

> **One judge, two places.** The same checker runs here and in the project's offline
> authorability eval. Lifting the eval's scoring core into the package (`src/intent.ts`)
> means the contract a brief is *measured* against during research is the identical
> contract you can check while *authoring*. There is no second, drifting definition of
> "does this plan satisfy the brief".

## What it is

An `Intent` is a brief's checkable expectations, as structured data. Every field is
**brief-grounded** — derived from the prompt's words, not from any one reference drawing's
labels or geometry. You give it room concepts, optional count/area/window bands, and
optional adjacency/reachability, and the checker lowers that to a flat list of
predicates, evaluates each against `describe()`'s facts, and returns typed, catalogued
violations.

Two entry points, a gate and a meter:

- **`arch validate --intent intent.json`** is the **gate** — it fails (exit `2`) when any
  *gating* expectation is missed, the same way `--strict` gates on lint warnings.
- **`arch score --brief intent.json`** is a **continuous meter** — it always succeeds
  (exit `0`) and reports a satisfaction fraction and per-dimension subscores, so you can
  watch a plan get closer to the brief across edits.

## The shape

An intent is a small JSON object. The machine-readable schema is served at
[`/intent.schema.json`](https://archlang-docs.vercel.app/intent.schema.json); a
representative, annotated example:

```json
{
  "rooms": 4,
  "roomsInclude": [
    {
      "concept": "bathroom",
      "count": { "min": 1 },
      "areaM2": { "min": 5.4, "max": 6.6, "source": "a bathroom of about 6 m²" }
    },
    {
      "concept": "bedroom",
      "count": { "min": 2 },
      "windows": { "min": 1, "facing": "S" }
    }
  ],
  "totalAreaM2": { "min": 49.5, "max": 60.5, "source": "around 55 m² total" },
  "adjacency": {
    "requiredEdges": { "kitchen": ["living-room"] },
    "source": "an open kitchen off the living room"
  },
  "reachable": true
}
```

| Field | Meaning |
|-------|---------|
| `rooms` | exact expected room count — assert it **only when the brief enumerates the rooms** (see the count discipline below) |
| `roomsInclude[].concept` | a room concept the plan must contain, matched against produced rooms by label → `room_type` → `uses` |
| `roomsInclude[].count` | how many rooms of the concept (`{ min, max }`; default at least 1) |
| `roomsInclude[].areaM2` | a per-room floor-area band, with a `source` quote from the brief that licensed the number |
| `roomsInclude[].windows` | a required window count for the concept's rooms; optional `facing` (`N`/`S`/`E`/`W`) restricts the count to windows whose host wall faces that way (`describe().windows[].facing`) |
| `totalAreaM2` | a total floor-area band, again with a `source` quote |
| `adjacency` | interior-door adjacency the brief licenses, `{ conceptA: [conceptB, …] }` — **advisory** |
| `reachable` | assert every room is reachable from a modeled entrance — **advisory** |

Every quantitative band carries a `source`: the brief phrase that justified the number.
When a band fails, the failure message cites it back, so a reader sees both the measured
value and the words that set the target.

## Two normative disciplines

The whole point of a brief-grounded contract is that it does not invent expectations the
brief never stated. Two rules — carried verbatim in the schema's field descriptions —
keep it honest.

**Area band conventions.** Turn a brief's words about size into a band the same way
everywhere:

- "about / around / ~N m²", or a bare "N m²" → set both bounds to **±10% of N**.
- "at least N m²" → set `min` only (an open top).
- Qualitative size words (compact, generous, large, spacious) → **assert nothing** — omit
  the band rather than invent bounds.

**Count discipline.** Assert the top-level `rooms` count **only when the brief enumerates
the rooms**. Do not derive a count from under-determined wording ("a few rooms", "some
bedrooms"). A single surplus room is tolerated only when it is pure circulation — see
policy B below.

These are the two requirements Gate G1 cleared for the intent channel before it shipped:
an NL→intent generator that follows them produces per-assertion judgments faithful to the
brief. If you author intents by hand, following them keeps your checks measuring the brief
and not a particular drawing.

## Concept matching

`roomsInclude` names **concepts**, not literal labels, so "bathroom" matches a room
labelled "Bath", "WC", or "Ensuite" without you enumerating synonyms. A small vocabulary
maps common concept keys (`bathroom`, `bedroom`, `living-room`, `hall`, …) to the labels,
`room_type`s, and `uses` tags that satisfy them. An **unknown** concept falls back to a
literal match — the plan's room `id` → `label` → `uses` → `room_type` — so a niche concept
still works, it just matches by name.

Matching is a **greedy, one-room-one-concept assignment** in predicate order: each concept
claims its still-unclaimed matching rooms, and a claimed room is unavailable to later
concepts. A single "WC" room cannot clear both a `bathroom` and a separate `wc`
expectation, and a concept's area/window checks score over exactly the rooms it was
credited with.

The room-count check applies **policy B**: an exact count passes; a count one over the
target passes *only* when the surplus room is pure circulation (a hall or corridor) beyond
what the brief's own circulation named. A surplus *bedroom* in a plan that already has its
hall still fails — the extra room is not circulation.

## Gating vs. advisory

Not every expectation gates. The split mirrors what the deterministic tools can and cannot
resolve on their own.

**Gating** (a real deliverable miss — these fail `validate --intent`, exit `2`):

| Code | Fires when |
|------|-----------|
| `E_INTENT_ROOM_COUNT` | the room count is off (subject to policy B) |
| `E_INTENT_ROOM_MISSING` | no room matches a required concept |
| `E_INTENT_ROOM_AREA` | a concept's rooms fall outside their area band |
| `E_INTENT_TOTAL_AREA` | total floor area is outside its band |
| `E_INTENT_NO_WINDOW` | a room the brief said needs a window (optionally facing a direction) doesn't have one |

**Advisory** (`gate: false` — listed and scored as subscores, but they **never** drive the
exit code):

| Code | Fires when |
|------|-----------|
| `E_INTENT_NOT_ADJACENT` | a required interior-door adjacency is absent |
| `E_INTENT_NO_DOOR` | `reachable` was asserted but the plan has no modeled entrance |
| `E_INTENT_UNREACHABLE` | `reachable` was asserted but some room is cut off |

Adjacency and reachability are advisory on purpose. One-shot topology — which rooms open
onto which — is exactly what v1.13's loop tools (`arch fix`, `arch suggest`,
`arch validate --graph`) exist to repair after the fact, not something a single generation
pass is expected to nail. Whether iterating with those tools beats simply resampling the
same generator under an equal token budget is a question this project has chosen to leave
**permanently unmeasured** — no experiment answers it, and nothing here decides or claims
it either way. So these checks report and score the miss, but they do not fail the gate.

## From the CLI

Author the intent JSON, then check a plan against it.

**Gate — `arch validate --intent` (exit `2` on a gating miss).** Against
`examples/studio.arch` (four rooms, 42 m²) with an intent that over-asks — five rooms, a
~10 m² bathroom, a garage, ~80 m² total:

```jsonc
// arch validate examples/studio.arch --intent wrong.json --json   → exit 2
{
  "ok": false,
  "intent": {
    "ok": false,
    "satisfied": 1,
    "total": 5,
    "subscores": { "rooms": 0.5, "labels": 0.5, "area": 0, "adjacency": null },
    "violations": [
      { "code": "E_INTENT_ROOM_COUNT", "message": "intent /rooms: expected 5, got 4", "gate": true },
      { "code": "E_INTENT_ROOM_AREA",  "message": "intent /roomsInclude/0/areaM2: only 0 room(s) matching \"bathroom\" within [9, 11] m² (needed 1) (about 10 m² bathroom)", "gate": true },
      { "code": "E_INTENT_ROOM_MISSING", "message": "intent /roomsInclude/1: no room matching concept \"garage\" (needed 1, found 0)", "gate": true },
      { "code": "E_INTENT_TOTAL_AREA", "message": "intent /totalAreaM2: total 42 m² outside [72, 88] (around 80 m²)", "gate": true }
    ]
  }
}
```

Each violation names the path into the intent (`/roomsInclude/0/areaM2`), the measured
fact, and — for a band — the `source` phrase that set the target. `subscores` grades the
four dimensions (`rooms`, `labels`, `area`, `adjacency`); a dimension the brief never
asserts is `null`, not a zero.

**`--feedback` — deterministic correction prompts.** Add `--feedback` to append one
actionable prompt per violation (advisory data in the sense of
[ADR 0005](adr/0005-no-invisible-architect.md) — never auto-applied):

```jsonc
"feedback": [
  "Room count is off (expected 5, got 4). Add or remove rooms to hit the target; one extra circulation room (a hall/corridor) is allowed (policy B).",
  "Resize the \"bathroom\" room(s) so their floor area falls in the target band (…).",
  "Add a room for \"garage\" — a `room` whose label, `uses`, or type matches the concept (…).",
  "Adjust room sizes so the total floor area lands in the target band (…)."
]
```

**Advisory misses don't gate.** An intent whose gating expectations all pass but whose
adjacency is unmet still exits `0` — the miss is reported and drags the `adjacency`
subscore to zero, but `ok` stays true:

```jsonc
// requiredEdges { bathroom: [bedroom] } — studio's bath opens off the hall, not the bedroom
{
  "ok": true,
  "intent": {
    "ok": true,
    "satisfied": 3,
    "total": 4,
    "subscores": { "rooms": 1, "labels": 1, "area": null, "adjacency": 0 },
    "violations": [
      { "code": "E_INTENT_NOT_ADJACENT", "message": "intent /adjacency: \"bathroom\" not connected to \"bedroom\" (bathroom off the bedroom)", "gate": false }
    ]
  }
}
```

**Meter — `arch score --brief` (always exit `0`).** Where `validate --intent` is the gate,
`score` is the continuous reading — a satisfaction fraction and the same subscores, so you
can watch a plan approach the brief as you edit. It reports; it never fails:

```jsonc
// arch score examples/studio.arch --brief wrong.json --json   → exit 0
{
  "ok": false,
  "satisfied": 1,
  "total": 5,
  "score": 0.2,
  "subscores": { "rooms": 0.5, "labels": 0.5, "area": 0, "adjacency": null }
}
```

`validate --intent` composes with the rest of the ship gate — it layers onto
`--strict` and `--graph`, each contributing its own block and its own exit condition.

## The library API

Everything the CLI does is exported from the package for programmatic use:

- **`validateIntent(source, intent)`** → `IntentCheckResult` — compile the intent to
  predicates, check them against `describe(source)`, and return `{ ok, satisfied, total,
  subscores, violations, assertions, diagnostics }`.
- **`intentFromJson(value)`** → `{ intent, errors }` — a zero-dependency, no-throw walker
  that validates an untrusted intent shape and returns pathed error strings (e.g.
  `/roomsInclude/0/concept: expected a string`).
- **`feedbackForResult(result)`** → `string[]` — the deterministic per-violation correction
  prompts `--feedback` prints.
- **`INTENT_JSON_SCHEMA`** — the description-rich JSON Schema (2020-12) the generator is
  prompted with; the single source of `schemas/intent.schema.json` (drift-tested).

```ts
import { validateIntent, intentFromJson } from "@chanmeng666/archlang";

const { intent, errors } = intentFromJson(JSON.parse(raw));
if (intent) {
  const res = validateIntent(source, intent);
  // res.ok, res.subscores, res.violations[{ code, message, gate }]
}
```

Like `describe` and `lint`, `validateIntent` is pure, synchronous, and deterministic — it
renders nothing, so a text-only agent can hold a plan to a brief with no image in the loop.
