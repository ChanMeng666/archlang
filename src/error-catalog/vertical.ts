/**
 * Error catalogue: the vertical family. Storeys (`level` blocks), stairs, voids and shafts, and
 * the `stairs` and `vertical` (storey-matching) lint families.
 *
 * Merged into `ERROR_CATALOG` by `mergeFamilies` in `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const VERTICAL_ENTRIES = defineEntries({
  E_VERT_SIZE: e(
    "Vertical circulation must have a positive size.",
    "A `stair`, `elevator` or `escalator` footprint's width or height evaluated to zero or a negative number, so there is no run to draw.",
    "Give it a positive `size W x H` — the footprint the run occupies on this storey.",
    "stair id=s at (0,0) size 900x0 dir up   # error: zero depth",
  ),
  E_STAIR_WIDTH: e(
    "Stair flight `width` is outside the footprint.",
    "A `stair`'s optional `width` is the FLIGHT width measured across the run, so it has to be positive and no wider than the footprint's cross-axis extent (the short side — the flight always runs along the long one). This value is not.",
    "Drop `width` to fill the footprint, or give a value between 0 and the footprint's short side.",
    "stair id=s at (0,0) size 900x2600 dir up width 1200   # error: cross extent is 900",
  ),
  E_STAIR_PIECES: e(
    "A stair's flights and landings do not make one stair.",
    "The block form of `stair` is one stair of authored rectangles in climbing order. It alternates `flight` and `landing`, starts and ends on a flight, has at least two flights and needs `width`, the flight width. Each piece touches the next along an edge that holds the whole flight, no two pieces overlap, and a flight between two landings leaves by the edge opposite the one it is entered by, because a flight is straight. A flight's direction comes from what it touches, never from its long side. A landing with `winders` is refused unless the count is a whole number from 2 to 8, the landing is exactly `width` × `width`, and it turns a quarter (entered and left across two adjacent sides); `winders` on a flight is a parse error.",
    "Check the order of the pieces and that each one ends exactly where the next begins. A landing may be wider or longer than the flights it joins.",
    "stair id=s dir up width 1000 { flight at (0,1000) size 1000x1000 flight at (0,0) size 1000x1000 }   # error: two flights with no landing between",
  ),
  E_RUN_TOO_LONG: e(
    "A stair or escalator run is longer than any run the plan draws.",
    "A `stair` or `escalator` is drawn with one tread line (or chevron) per 280 mm going along its footprint's long side, and at most 1,100 of them: a run longer than about 308 m — past the longest built escalator and moving walkway — would be drawn as tens of thousands of lines, so it is refused instead of drawn thinned. It holds at any size, inside the modelling range or not. Usually a size in the wrong unit (`size 2000x1200` meant, `size 2000000x1200` written).",
    "Check the footprint's long side; a real run is a few metres. Model a long concourse as a `room` with several runs in it.",
    "escalator id=e at (0,0) size 400000x1200 dir up   # error: a 400 m run",
  ),
  E_VOID_SIZE: e(
    "A floor void must have a positive size.",
    "A `void`'s width or height evaluated to zero or a negative number, so there is no opening in the floor plate to draw or to route circulation around.",
    "Give it a positive `size W x H` — the hole's extent in plan.",
    "void id=well at (2000,1000) size 0x3000   # error: zero width",
  ),
  E_VOID_POLY: e(
    "A `void … polygon` ring must run only horizontally and vertically, without crossing itself.",
    "A void's ring is cut into the rectangles it is made of, because the walking grid, the stair and furniture checks and `finish` read a hole as rectangles. A ring with a slanted edge, one that crosses itself, or one with fewer than four effective vertices (after duplicate and straight-through points are removed) has no such cut, so it is refused rather than read as its bounding box.",
    "Write the ring with horizontal and vertical edges only (an L, a U, a notch), each corner once, or split a slanted hole into rectangle `void`s.",
    "void id=well polygon (0,0) (3000,0) (2000,2000) (0,2000)   # error: a slanted edge",
  ),
  E_VOID_RAIL: e(
    "A void's `rail` clause names an edge the void does not have.",
    "A rectangle `void` names its railed edges by side (`top|bottom|left|right`, or `all`/`none`); a `polygon` void numbers them, edge n running from point n to point n+1, counted from 0 like a wall's `segment <n>`. A side word on a ring (an L has two edges facing the same way), a number on a rectangle, or a number that is not one of the ring's edges is refused rather than guessed.",
    "On a rectangle write side words; on a ring write `all`, `none` or edge numbers from 0 to one less than its point count.",
    "void id=well polygon (0,0) (3000,0) (3000,1000) (1000,1000) (1000,3000) (0,3000) rail 6   # error: edges are 0 to 5",
  ),
  E_LEVEL_DUP: e(
    "Two `level` blocks declare the same storey number.",
    "Level numbers identify the storeys of one building, so each may be declared once; two `level 1` blocks would produce two pages both claiming to be level 1.",
    "Renumber one of them, or merge the two bodies into a single `level` block.",
    "level 1 { room at (0,0) size 3000x3000 }\nlevel 1 { room at (0,0) size 3000x3000 }   # error: level 1 twice",
  ),
  E_LEVEL_MIX: e(
    "A drawable statement sits beside `level` blocks.",
    "A plan is either single-storey (no `level` block) or entirely made of them: anything that draws belongs to exactly one storey, so a room/wall/door/`for`/`strip`/component call at plan level next to a `level` block has no storey to belong to.",
    "Move the statement inside the `level` block it belongs to. Only settings (`units`/`grid`/`paper`/`scale`/`north`/`site`/`dims`/`title`/`axes`/`schedule`/`legend`), `component`/`import` declarations, and the plan-global `let`/`set` stay outside — they apply to every level.",
    'plan "H" {\n  room at (0,0) size 3000x3000   # error: move it into a level\n  level 1 { wall exterior thickness 200 { (0,0) (3000,0) close } }\n}',
  ),
  E_LEVEL_NEST: e(
    "`level` used inside a block or component.",
    "A `level` block is a plan-level statement: it partitions the whole plan into storeys, so it cannot be nested inside another `level`, a `for`/`if`/`while` body, a `strip`, or a component definition.",
    "Move the `level` block out to the plan body. To draw the same content on several storeys, put it in a `component` and call it from each level.",
    "component c() { level 1 { } }   # error: only allowed at plan level",
  ),
  W_SWING_OVER_STAIR: w(
    "A door's swing sweeps a stair or the landing at its end.",
    "A hinged door's quarter-disc (the one the drawing shows) overlaps a `stair`'s footprint, or the landing a flight is stepped off onto at its head, or, at its foot, the 400 mm Approved Document K (2013) 1.24 and Diagram 1.8 ask a dwelling's door to leave clear across the flight's width (in a building other than a dwelling, 1.23b, the whole foot landing). A person stepping off the flight walks into the leaf, or the leaf strikes someone on the treads. The landing is the square beyond the end as wide as the flight and as deep as it is wide (AD K 1.20; at least 1200 mm long outside a dwelling, 1.23a). On a storey where the flight goes `up` its foot is here; where it comes `down`, its head; a storey a flight from below arrives on and continues up from owes both. On a storey the flight rises from, only the part of the footprint lower than the door's head counts (the treads climb the storey height over the run, so a leaf swings under the high end); that height is the storey's `height`, or 3000 mm when the plan authors none, a default that can only quiet the rule. A block stair rises over its flights alone, its landings level, and its pieces are read one by one, so the floor it wraps round is floor. A touch is not an overlap.",
    "Open the door to the other side of its wall (flip its `swing`) or hang it on the other jamb (flip its `hinge`); the hint says when either clears the stair. Otherwise move the door or the stair, or use a `sliding` or `pocket` door, which sweeps nothing. There is no machine-applicable fix: which way a door opens is a design decision.",
    'wall id=w partition thickness 100 { (0,2600) (8000,2600) }\nroom id=land at (0,2600) size 8000x1900 label "Landing"\ndoor id=d at (4900,2600) width 700 wall w hinge near start swing into land   # lint: its leaf sweeps the top of the flight\nstair id=s at (4900,2700) size 2200x1000 dir down',
  ),
  W_STAIR_NO_LANDING: w(
    "A flight has no landing at its foot or head, or a landing between two flights is too short.",
    "Beyond the end a flight is entered from on this storey (its foot where it goes `up`, its head where it comes `down`, and the head of a flight from below that continues upward), a wall stands, a `void` opens (at a foot), or the floor ends, nearer than the landing the flight needs: as long as the flight is wide (Approved Document K (2013) 1.20, \"At the top and bottom of every flight, provide landings the width and length at least as great as the smallest width of the flight\"; at least 1200 mm in a building other than a dwelling, 1.23a). The depth is measured across the middle half of the flight's width, from the wall's drawn body (a cased opening is passable and cut out; a door's closed leaf is not), so a wall drawn along the flight's flank is not read as standing across its end. A person stepping off walks into the wall, or must turn on the last step. A curved wall is not measured. On a block stair the foot is the first flight's and the head the last's, and another part of the same stair standing past that end cuts the landing short, as it does for the walking grid. A landing between its flights must run that length along each flight that meets it, from that flight's step, because a flight is stepped off straight ahead: the walking line is read leg by leg, never as its whole length, which a half-turn landing 500 mm deep would pass. Each flight meets its landing along its whole `width` (`E_STAIR_PIECES`), so a landing at a corner is never shorter than that: there only a wall across it, or the 1200 mm of a building other than a dwelling, reports. A wall counts only on a stop the flights rise from, as far up as it stands, because the landing stands above that floor, and one drawn on the landing's edge is half in it. A `dir down` stop with no matching block below reads the landing's own length and no wall, because its walls stand above its floor and the landing below it. A `void` or the lack of a room under a landing does not count. Such a landing is read on the stop its flights climb from, so a shaft reports it once; lengthen it, with the flights moved so they still touch it.",
    "Move the stair, shorten it, or move the wall until the quoted depth stands clear beyond the end. There is no machine-applicable fix: moving a stair moves the rooms around it.",
    "wall id=p partition thickness 100 { (0,3000) (4000,3000) }\nstair id=s at (500,200) size 900x2350 dir up   # lint: the partition stands 400 mm past the bottom step, where 900 mm is needed",
  ),
  W_STAIR_SIDE_ENTRY: w(
    "A doorway opens onto the side of a flight.",
    "A door or cased opening in a wall along a `stair`'s flight, beside it with less than a doorway's width (`minDoorWidthMm`, or its own width if narrower) past either end, stands nearer to the flight than the ruleset's least clear path width (`minPathClearWidthMm`, 700 mm): stepping through, a person meets the flight's side partway up its rise, with no landing to turn on. A flight is entered at its foot or head, from a landing (Approved Document K (2013) 1.20). Measured from the wall's face to the footprint's side. Only the part of a rising flight under 2 m of rise is beside a person (AD K 1.11's headroom), read against the storey's `height`, or 3000 mm when the plan authors none, a default that can only quiet the rule. A block stair rises over its flights alone, its landings level, each flight read on its own, and a landing has no side to enter by. A doorway past either end of the flight is the landing rules' question, not this one's.",
    "Move the doorway along its wall past the foot or head of the flight, or move the stair so at least the quoted width stands between them. There is no machine-applicable fix.",
    "wall id=w partition thickness 100 { (4000,0) (4000,3000) }\ndoor id=d at (4000,1450) width 800 wall w\nstair id=s at (4200,300) size 1100x2400 dir up   # lint: the doorway is 150 mm from the flight",
  ),
  W_STAIR_HEAD_VOID: w(
    "A void opens on the landing at the head of a flight.",
    "On the storey a flight arrives at (the `dir down` stop of its id, or the head of a flight from below that continues upward), a `void` overlaps the landing a person steps off the flight onto: the square beyond the head as wide as the flight and as deep (Approved Document K (2013) 1.20; 1200 mm deep outside a dwelling, 1.23a). The top step meets a hole. The stairwell itself may be a void; only the floor beyond the head is judged.",
    "Move the void beside the flight or past its foot end, or shrink it, so the landing beyond the head is floor. There is no machine-applicable fix.",
    'level 2 "First" {\n  stair id=s at (100,1500) size 900x2600 dir down\n  void id=g at (100,200) size 900x1100   # lint: the floor ends 200 mm past the top step\n}',
  ),
  W_STAIR_TOO_STEEP: w(
    "A stair is too short to climb its storey.",
    "A `stair` going `up` climbs its storey's floor-to-floor `height`, and its run (a straight flight's long side, or the sum of a block stair's flights) is shorter than the least run that climb needs: the fewest risers no higher than `stairMaxRiseMm`, and one going fewer, each at least `stairMinGoingMm` (and, under a pitch cap, the riser over `stairMaxPitchRatio`). A block stair owes one going fewer again per landing, because a flight ends on its landing as the top flight ends on the floor above, and its flights must hold those goings whole: a flight's remainder is no use to the next, so 1210 + 1210 mm sums to the 2420 mm that 11 goings of 220 mm need and holds 5 + 5. Under a pitch cap each riser count is tried while the going still shrinks. The default, 220 mm risers and 220 mm goings with no pitch cap, is the most generous of the figures read (Approved Document K (2013) Table 1.1, private stair): a flight that fails it fails every code cited. `uk-residential-advisory` adds AD K's 42° pitch, `us-residential-advisory` IRC R311.7.5's 7¾ in riser and 10 in tread, `cn-residential-advisory` GB 50096-2011 5.7.4's 0.20 m riser and 0.22 m tread. Judged only where the plan authors a height (`describe().heights`); otherwise the coverage report says the stair checks skipped it. Judged on the storey the flight climbs from.",
    "Lengthen the flight (its `size` along the run, on every storey the shaft is drawn) to the quoted run, correct the storey `height` if it is wrong, or draw one block stair, `stair dir up width 1000 { flight … landing … flight … }`, where a landing replaces one going. A winder landing counts only the whole goings of `stairMinGoingMm` that fit on the quarter arc of radius `width / 2` round its inner corner, never more than it has winders, so adding winders past that does not clear the warning. Splitting the climb into separate stairs does not clear the warning: each is still judged against the whole storey. There is no machine-applicable fix: a longer flight moves the rooms around it.",
    "height 2800\nstair id=s at (200,200) size 1000x2000 dir up   # lint: 13 risers and 12 goings of 220 mm need a 2640 mm run",
  ),
  W_AXES_DIFFER: w(
    "The plan's one `axes` block comes out as different grids on two storeys.",
    "A multi-storey plan declares `axes` once, outside the levels, and each storey evaluates the block against its own bindings. A `let` written inside a `level` is one of them, so the same label stands at another position on that storey, and `keep on axis` holds there against that storey's own axis. The drawing shows both grids; the storeys just do not share one.",
    "Move the `let` the block reads to the plan, so every storey reads one value. There is no per-storey grid: a storey that really is set out differently is a different plan.",
    'plan "G" {\n  axes { x at 0, BAY }\n  level 1 { let BAY = 6000 }\n  level 2 { let BAY = 7000 }   # warning: axis 2 stands at two positions\n}',
  ),
  W_SHAFT_FOOTPRINT_MISMATCH: w(
    "A shaft's runs on two neighbouring storeys do not stand over each other.",
    "The same `id` on two `level` blocks is one shaft. On two neighbouring stops of it, the runs do not line up: a lift car is not in exactly the same footprint (a shaft is plumb), or a stair or escalator runs along the other axis, or its two footprints overlap by less than half of the smaller one, or one stop draws a different kind of run. The flight climbed on one page then arrives somewhere else on the next. Reported on the upper stop. Half is the programme's threshold, not a code's: a footprint redrawn a little longer or shifted by a wall's thickness passes. A block stair is the same block on both stops, with no share of overlap: the same flights and landings in the same climbing order, each at the same `at` and `size`, at the same `width`, and with the same `winders` on each landing: copy the block and change only `dir`. A straight flight over or under a block always mismatches, because those are two stairs, and two stairs take two ids. Only the id joins two stops: nothing is inferred from where they stand.",
    "Draw the run with the same `at` and `size` on both storeys (the hint quotes both), or give two unrelated runs different ids. There is no machine-applicable fix: which storey is right is the author's call.",
    'level 1 "G" { stair id=s at (0,0) size 900x2600 dir up }\nlevel 2 "1" { stair id=s at (3000,0) size 900x2600 dir down }   # lint: the footprints do not overlap',
  ),
  W_STAIR_UNMATCHED: w(
    "A run of vertical circulation appears on only one storey.",
    "In a multi-storey plan the ONLY thing that joins two floors is identity: a `stair`/`elevator`/`escalator` with the same `id` in two `level` blocks is one shaft. This id appears on exactly one storey, so it connects nothing — usually a typo in the id, or the matching run was never drawn on the floor above or below. **Known limitation:** a top-floor stair that genuinely goes only to a roof hatch, and a lift that stops short of a storey it passes, both trip this rule; it is advisory, so leave it.",
    "Draw the same run with the SAME `id` on the neighbouring storey (each storey declares its own `dir` — `up` on the lower floor, `down` on the upper one), or fix the id.",
    'level 1 "G" { stair id=s at (0,0) size 900x2600 dir up }\nlevel 2 "1" { }   # warning: "s" is on level 1 only',
  ),
});
