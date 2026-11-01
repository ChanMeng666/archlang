# J9: net area in the room stamp (issue #402)

A written design, measured on `main@90cee401`. Probe plan: a 6000 x 4000 shell, 300 mm exterior and a 100 mm partition,
two 3000 x 4000 rooms, `schedule rooms`. The schedule and `describe()` read 12 m² area and 10.36 m² net per room;
the stamp reads `12.0 m²`. It reproduces as filed.

## 1. Decision

One word on the existing statement: `schedule rooms net`. The room stamp then prints the figure the schedule's NET AREA
column holds (`describe().rooms[].net_area_m2`, rounded to one decimal), followed by ` net`: `10.4 m² net`.
Without the word nothing changes, byte for byte.

| # | Decision | Rejected | Reverse if |
|---|---|---|---|
| 1 | A value on `schedule rooms`, not a new statement | `area net`, or `style room { area net }` | an author needs net stamps without a schedule table; then add a statement and keep this word as a synonym |
| 2 | The stamp reads the schedule's own rows (`roomSchedule`, the memoised `net_area_m2`); no second calculation | calling `roomNetAreaMm2` from the room element | never: a second calculation is how two figures drift |
| 3 | The stamp says ` net`; the default stamp stays bare | an unlabelled swap, or a legend line | a reader tests show the suffix is noise; the legend then names it |
| 4 | A room with no net figure keeps its centreline stamp, unsuffixed | printing nothing, or printing the gross as if net | the rule below ever changes to refuse |
| 5 | The room element learns the figure through an optional `RenderCtx.netAreaOf`; it stays ignorant of walls | giving `room.ts` the walls | an element needs the whole storey for another reason |
| 6 | The figure is the schedule's 2-decimal value formatted to one decimal | formatting the unrounded mm² | the schedule's own rounding changes; the stamp must follow it, never lead |

## 2. When there is no net figure

`net_area_m2` is omitted, never approximated, when a room's box meets more than `MAX_NET_CURVES` edges, when the walk
would cost more than `MAX_NET_PROBE_WORK`, or when the integral leaves `[0, gross]`. Such a room keeps `12.0 m²` and
no suffix, so a sheet that mixes the two is readable: a stamp saying `net` is net, one that does not is the
centreline figure. The schedule shows `-` for the same room.

Added after red-team round 1:

* A room whose net figure equals its centreline figure had nothing deducted (no wall on or in it), so ` net` would claim
  a deduction that did not happen: it keeps the bare stamp, like a room with no figure. Reverse if a sheet of mixed
  stamps proves harder to read than a uniform suffix.
* The one-decimal figure is rounded from the schedule's two-decimal value in integer hundredths (`fmtTenthsOf2dp`, in
  `src/num-format.ts`), a tie up: 9.45 prints `9.5`, as the table's 9.45 reads. `toFixed(1)` printed `9.4`. The
  centreline stamp keeps `toFixed(1)` and does not move.
* `net` is taken after `rooms` only when no `(` follows it, so a next-line macro call `net()` still parses.
* Plan JSON's dropped row for `schedule rooms` carries `text: "schedule rooms net"` when the word is written.

## 3. Shapes, units, fit

* Rectangle, polygon, circle: the net-area module measures all three; the stamp takes whatever it returns.
* There is no area-unit setting in this core; the stamp is m² as before.
* The text is built before `wrapLabels`, `relocateLabels` and `fitLabels`, which read the printed string, so the wider
  stamp is placed and shrunk by the same passes as any other. A test pins a narrow room.
* `outdoor` stamps are untouched: not rooms, not in the schedule.

## 4. Surfaces

* `describe()`: unchanged, no new key. Plan JSON: the clause is drawing-only; it joins `dropped` as part of the
  `schedule rooms` row, as the schedule itself does.
* `lint()`: moves only for plans that write the word, through `W_ANNOTATION_OVERLAP`, which reads the Scene.
* Draw budget: the stamp adds no primitive. The net-area work is already charged by `schedule rooms`.
* Formatter: prints `schedule rooms net`; round-trips.

## 5. Byte law

A plan that does not write `schedule rooms net` is unchanged in SVG, `describe()`, `lint()` and `compile().diagnostics`.
Pinned by `test/net-area-stamp.test.ts` against a `git archive` baseline of `90cee401`, with a fixture that uses
the form.
