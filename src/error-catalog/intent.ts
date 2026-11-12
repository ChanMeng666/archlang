/**
 * Error catalogue: the intent family. Checked claims about the plan: `intent` (the brief) and
 * `keep` (invariants, ADR 0033).
 *
 * Merged into `ERROR_CATALOG` by `mergeFamilies` in `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const INTENT_ENTRIES = defineEntries({
  E_INTENT_GROSS_AREA: e(
    "The plan's gross internal area is outside the brief's band.",
    "An intent `grossInternalAreaM2` band (from a number in the brief, ±10% for \"about N\") does not contain the plan's gross internal area: the floor inside the exterior walls' inner faces (`describe().totals.gross_internal_area_m2`), the figure a client means. The centreline `floor_area_m2` runs half a wall past it.",
    "Grow or shrink the shell so the enclosed floor lands in the band; partitions inside the shell do not change the figure. Gating tier: this failure fails `validateIntent`'s `ok`. Assert a band only where the brief states a number.",
    '# brief says "about 70 m²" (band 63–77); the shell encloses 9600 × 6400 = 61.44 m² inside its inner faces',
  ),
  E_INTENT_NOT_ADJACENT: e(
    "Two rooms the brief wants adjacent share no interior door.",
    "An intent `adjacency` edge names two concepts (e.g. hall ↔ bathroom) that are not joined by an interior door or cased opening in the plan's modeled connectivity.",
    "Add a `door` (or `opening`) on the wall the two rooms share so they are directly connected. Advisory tier: this is scored and reported by `validateIntent` but does NOT fail `ok` (gate: false) — one-shot topology is what the loop tools address.",
    "door on wall_hall_bath width 800   # connect the hall to the bathroom",
  ),
  E_INTENT_NO_DOOR: e(
    "The plan has no modeled entrance, so `reachable` cannot hold.",
    "An intent asserts `reachable: true`, but the plan has no door connecting a room to the exterior — nothing is enterable, so no room is reachable.",
    "Add an exterior entrance `door` on a perimeter wall. Advisory tier: reported and scored by `validateIntent` but does NOT fail `ok` (gate: false).",
    "door on exterior at 50% width 900   # a front door",
  ),
  E_INTENT_NO_SITE: e(
    "An intent asserts a SYMBOLIC window facing against a plan with no `site`.",
    "An intent `roomsInclude[].windows.facing` names one of the derived directions (`street`, `back`, `equator_side`, `sunrise_side`, `sunset_side`) but the plan declares no `site` block, so there is nothing to resolve the name against. The question is unanswerable, not answered no.",
    "Declare `site { street … }` in the plan (that is what gives the derived names their letters), or assert a plain compass letter instead. Gating tier: this failure fails `validateIntent`'s `ok` — it is a refusal, never a silent pass and never a silent miss.",
    'plan "H" {\n  units mm\n  site { street south }   # now `facing: "equator_side"` resolves to "S"\n}',
  ),
  E_INTENT_NO_WINDOW: e(
    "A room the brief wants a window in has too few.",
    'An intent `roomsInclude[].windows` requires at least one window in a concept\'s room(s) (e.g. "give the bedroom a window"), but the plan places fewer than the required count.',
    "Add a `window` on one of that room's walls. Gating tier: this failure DOES fail `validateIntent`'s `ok`.",
    "window on north at 40% width 1200   # light the bedroom",
  ),
  E_INTENT_ROOM_AREA: e(
    "A named room's floor area is outside the brief's band.",
    'An intent `roomsInclude[].areaM2` gives a per-room area band (from a number in the brief, ±10% for "about N"), but the matched room\'s area falls outside it.',
    "Resize the room so its floor area lands in the band. Gating tier: this failure fails `validateIntent`'s `ok`. Assert a band only where the brief states a number — qualitative size words license none.",
    'room at (0,0) size 4000x3000 label "Bedroom"   # 12 m²',
  ),
  E_INTENT_ROOM_COUNT: e(
    "The plan's room count does not match the brief.",
    "An intent `rooms` count (asserted only when the brief ENUMERATES its rooms) does not match the plan's room total. A single surplus room passes only when it is pure circulation (a hall/corridor) — policy B.",
    "Add or remove rooms to reach the enumerated count. Gating tier: this failure fails `validateIntent`'s `ok`.",
    "# brief lists 4 rooms; the plan draws 5 (and the extra is a bedroom, not a hall)",
  ),
  E_INTENT_ROOM_DIMENSION: e(
    "A room's width, depth or exact size is not what the brief states.",
    "An intent `roomDimensions[]` entry binds one room (by id or label) to a size the brief states: a `widthMm`/`depthMm` band on its extent along x/y, or an exact `sizeMm` (`w × h` in either orientation, within `tolerance`). Measured on wall centrelines from the room's own rectangle; the residual is reported in mm.",
    "Resize that room's `size` to the stated dimension; every number the brief does not state is free to flex. Gating tier: this failure fails `validateIntent`'s `ok`.",
    'room id=bed1 at (0,0) size 2900x3600 label "Bedroom 1"   # brief: "bedroom at least 3 m wide" → width 2900, residual −100 mm',
  ),
  E_INTENT_ROOM_MISSING: e(
    "A room the brief names is absent from the plan.",
    'An intent `roomsInclude[]` concept (e.g. "bathroom") matched no room by label, `room_type`, or `uses` — the plan is missing a room the brief asked for.',
    "Add a `room` whose label, `uses`, or type matches the concept. Gating tier: this failure fails `validateIntent`'s `ok`.",
    'room at (0,0) size 2000x2000 label "Bathroom" uses bath   # supply the missing room',
  ),
  E_INTENT_TOTAL_AREA: e(
    "The plan's total floor area is outside the brief's band.",
    'An intent `totalAreaM2` band (from a number in the brief, ±10% for "about N") does not contain the plan\'s total floor area.',
    "Grow or shrink rooms so the total lands in the band. Gating tier: this failure fails `validateIntent`'s `ok`. Assert a band only where the brief states a number.",
    '# brief says "about 42 m²" (band 37.8–46.2); the plan totals 52 m²',
  ),
  E_INTENT_UNMEASURED: e(
    "A brief-bound measure has no value on this plan.",
    "An intent `grossInternalAreaM2` or `roomDimensions[]` assertion cannot be measured: the room selector names no room or more than one, the room is a polygon or a circle (no single width), the plan did not resolve, or the plan has no gross internal area (no closed exterior wall ring, an exterior wall dividing the shell, a ring nested in a courtyard, or a counted cap; `describe().totals.gross_internal_area_omitted` names which). The question is unanswerable, not answered no.",
    "Bind the room by its id or a unique label, give it a rectangular `size`, or close the shell with one `exterior` wall ring (`walls from rooms` derives one). Gating tier: this failure fails `validateIntent`'s `ok` — a refusal, never a silent pass.",
    "wall id=n exterior thickness 200 { (0,0) (9000,0) (9000,7000) }   # an open run encloses nothing: gross internal area unmeasured",
  ),
  E_INTENT_UNREACHABLE: e(
    "A room cannot be reached from the entrance through modeled doors.",
    "An intent asserts `reachable: true` and the plan HAS an entrance, but one or more rooms are cut off — no chain of modeled doors reaches them from the exterior — or, on a multi-storey plan, a whole storey has no way in: no exterior door of its own and no stair, lift or escalator from a room you can reach.",
    "Add interior doors so every room connects back to the entrance. Advisory tier: reported and scored by `validateIntent` but does NOT fail `ok` (gate: false).",
    "door on wall_hall_store width 800   # connect the isolated room",
  ),
  E_KEEP_LIMIT: e(
    "Too many keeps, or too many targets in one keep.",
    "A plan declares more than 1,000 `keep` statements (counted as they expand, every storey and loop iteration included), or one keep names more than 64 targets or levels. The cap bounds the size of what a keep reports; the work is bounded by the evaluation-step budget. It is raised once, at the first keep past the cap, and that keep and every later one past it are not checked (their expansion is still counted, so the cap cannot skip work).",
    "Keep fewer: a keep states an invariant an edit must not break, not every coordinate of the plan. Split a long `keep align` into two.",
    'plan "K" {\n  units mm\n  room id=a at (0,0) size 3000x3000\n  for i in 0..1001 { keep fixed a.left at 0 }   # error: more than 1000 keeps\n}',
  ),
  E_KEEP_MEASURE: e(
    "The keep's measure is not defined for what it names.",
    "A `keep` names something its measure cannot read: an edge, centre, width, depth, clear span or footprint of a `polygon` or `circle` room; datums of two orientations in one `align`, `offset` or `on axis` (a vertical line and a horizontal one); a column anywhere but `on axis`, which reads it at its centre; a wall that is not one straight segment (an arc, an oblique run, or a wall of several segments without `segment <n>`); the depth of an opening; an `offset` measured from something that is not a datum; a bare room where a line is needed. The keep is refused rather than approximated (ADR 0033).",
    "Name what the measure reads: a rectangular room's `left`/`right`/`top`/`bottom`/`cx`/`cy`, `axis <label>`, a straight wall or `<wall> segment <n>`; compare widths of openings with `keep equal width`.",
    'plan "K" {\n  units mm\n  room id=a polygon (0,0) (3000,0) (0,3000)\n  keep fixed a.left at 0   # error: a polygon room has no left edge\n}',
  ),
  E_KEEP_PLACEMENT: e(
    "A keep where it cannot be checked.",
    "A `keep` sits inside a `component` (a `place`d instance, a bare call or an imported file), where it would be checked once per instance in the instance's own frame; or a `keep stacked` sits inside a `level` block or in a plan with fewer than two storeys (it compares storeys, so it belongs at the plan's root); or another form sits at the root of a multi-storey plan, where it measures no storey (refused once, with no level).",
    "Move the keep into the plan (or the `level` block) whose geometry it reads; put a `keep stacked` at the root of a multi-storey plan.",
    'plan "K" {\n  units mm\n  component bay() { room id=r at (0,0) size 3000x3000\n    keep min clear r 2800 }\n  place bay() as w at (0,0)   # error: a keep inside a component\n}',
  ),
  E_KEEP_SELF: e(
    "A keep compares something with itself.",
    "One target is named twice in one `keep` (`align a.left a.left`, `offset a.left from a.left 0`, `equal width a a`, or the same level twice in a `stacked` keep; a compass word counts as the frame word it aliases). Such a keep can never be broken, so it checks nothing.",
    "Name each target once; compare the target with the other thing it must stay with.",
    'plan "K" {\n  units mm\n  room id=a at (0,0) size 3000x3000\n  keep align a.left a.left   # error: the same edge twice\n}',
  ),
  E_KEEP_TARGET: e(
    "A keep names something that is not there.",
    "A `keep` target is not an authored id on its storey (or, for `stacked`, on every listed level): an unknown name, an auto id (`room_3`, which renumbers when an earlier element is named), an element that could not be placed, an undeclared `axis <label>`, a wall `segment <n>` past the wall's last segment, or a level the plan does not have. A keep is the statement that must survive edits, so it names only what the author named.",
    "Give the element its own `id=` and name that, declare the axis in `axes`, or list only the levels the plan has.",
    'plan "K" {\n  units mm\n  room id=a at (0,0) size 3000x3000\n  keep fixed b.left at 0   # error: no element b\n}',
  ),
  E_KEEP_VALUE: e(
    "A keep's value is out of its domain.",
    "A `keep`'s length (`offset … <mm>`, `min clear … <mm>`, `fixed … at <mm>`) is outside the modelling range of ±33,554,432 mm, a `min clear` length is zero or negative, or a level in `keep stacked … on levels` is not a whole number.",
    "Give the keep a length within the range (a positive one for `min clear`) and whole storey numbers.",
    'plan "K" {\n  units mm\n  room id=a at (0,0) size 3000x3000\n  keep min clear a 0   # error: a clear span must be positive\n}',
  ),
  W_KEEP_VIOLATED: w(
    "A hard keep does not hold.",
    "A `keep` (grade `hard`, the default) states an invariant the resolved plan breaks: datums that should lie on one line do not, two extents differ, an offset or a fixed position is off, a room's clear span is short, a wall is off its axis, or an element's footprint moves between storeys. The message names what the keep holds and the signed residual in mm (`+` is right of, below, wider or a margin), and the first hint the ids and the measured values. Compile channel: it fails `validate --strict` and every source-rewriting transform's never-worse law counts it, but it never fails plain `validate`, never caps taste and never reaches `lint()`. A `soft` keep that breaks is named by `validate --json`'s `next` (tier `intent`) instead, and an `advisory` one is only reported (`describe`, `validate --json`). **Why:** a keep is checked, never solved: nothing moves to satisfy it (ADR 0033).",
    "Edit the source so the keep holds (move what it names, or derive it from the rooms so it follows them), or remove the keep if the relation no longer applies. There is no machine fix: which side follows is a design decision.",
    'plan "K" {\n  units mm\n  room id=a at (0,0) size 3000x3000\n  keep fixed a.left at 100   # warning: the left edge is at 0, 100 mm left of where the keep holds it\n}',
  ),
});
