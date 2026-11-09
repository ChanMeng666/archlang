/**
 * Error catalogue: the openings family. Doors and windows: sizes, kinds, hosts, heights and
 * swings, and the `openings` lint family.
 *
 * Spread into `ERROR_CATALOG` by `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const OPENINGS_ENTRIES = defineEntries({
  E_DOOR_WIDTH: e(
    "Door must have a positive width.",
    "A door's width evaluated to zero or a negative number.",
    "Give the door a positive `width`.",
    "door at (0,0) width 0   # error",
  ),
  E_DOOR_KIND_CLAUSE: e(
    "That clause is not available on this kind of door.",
    "A `door` statement carries a clause its kind has no meaning for: `hinge` on any of the sliding family (`sliding`/`glazed_sliding`/`barn`/`bifold`/`pocket` — nothing is hinged to a jamb) or on a `double` door (a leaf hangs on each jamb, so there is no side to choose), `swing` on a `sliding`, `glazed_sliding` or `pocket` door (the panel stays in the plane of the wall, or inside it), or `slide`/`open` on a `hinged` or `double` door (nothing travels along the wall). ArchLang refuses rather than draws the statement as if the clause were absent — silently ignoring a written clause is the silent-error design this project rules out (the v1.23 precedent: rectangle-only clauses REFUSE a polygon room rather than approximate it).",
    "Delete the clause (the machine-applicable fix does exactly that), or change the door's kind to one the clause belongs to. `swing` on a `barn` or `bifold` door is legal and means which FACE of the wall the panel hangs on or folds toward — it is not a leaf arc.",
    "door pocket on w1 at 50% width 900 hinge left   # error: a pocket door has no hinge",
  ),
  E_DOOR_KIND_CURVED: e(
    "A sliding-family or garage door cannot sit on a curved wall.",
    "The panel of a `sliding`, `glazed_sliding`, `barn`, `bifold` or `pocket` door is a straight rectangle running along a straight track, and its pocket/track geometry is straight by construction — none of that survives on a wall whose hosting edge is an `arc`. A hinged leaf does survive (its swing is taken from the tangent at the doorway), and so do a `double` door's two (both from the tangent at the doorway's centre), so only the sliding family and `garage` are refused. Refusing is deliberate: drawing a straight panel across a curved reveal would be a wrong drawing with no diagnostic.",
    "Use a `hinged` door on the curve (the default — delete the kind word), or move the door onto one of the wall's straight runs.",
    "wall w1 thickness 200 { (0,0) arc (6000,0) radius 4000 }\ndoor pocket on w1 at 50% width 900   # error: curved host",
  ),
  E_DOOR_OPEN_RANGE: e(
    "`open` must be between 0 and 1.",
    "`open <f>` is the fraction of its travel a sliding-family panel is DRAWN at — 0 is closed, 1 fully open — so a value outside `[0,1]` names a position the panel cannot reach. It is a drawing fact only: nothing measured (`lint`, `describe`, the intent channel) reads it, so a half-open door can never silence a clearance warning.",
    "Give `open` a fraction in `[0,1]`; `archlang fix` clamps it to the nearer end for you. Omit it entirely for the default 0.5.",
    "door sliding on w1 at 50% width 1200 open 1.5   # error: outside [0,1]",
  ),
  E_HEIGHT_RANGE: e(
    "A height is outside the range a storey can be built at.",
    "A `height`, `sill` or `head` clause evaluated to a number no building has: zero or negative, not finite, or above 100 m. A wall or a head at zero is not a low one, it is a missing one. A window `sill` of exactly 0 is the one exception and is legal — it means a floor-length window. **The range guards the ENDS, not the units:** heights are millimetres like every other number in the language, so `height 3` is three millimetres, is inside the range, and is accepted — the compiler will not guess that three metres was meant, because that would put a number in the datum the author never wrote.",
    "Write the height in millimetres, or drop the clause and inherit the default (the fix does exactly that) — 3000 for a storey, 2100 for a door or window head, 900 for a window sill.",
    "wall id=w1 exterior thickness 200 height 0 { (0,0) (4000,0) close }   # error: a wall with no height",
  ),
  E_SILL_ABOVE_HEAD: e(
    "A window's sill sits at or above its head.",
    "A `window`'s `sill` is the bottom of the glazing and its `head` is the top, both measured from this storey's floor. When the sill is not below the head there is no opening between them — the statement describes a window with no glass in it. Refused rather than silently swapped: which of the two numbers is wrong is not something the compiler can know.",
    "Lower the `sill` below the `head`, or raise the `head`. Dropping the `sill` clause (the fix) restores the 900 mm default.",
    "window id=w on wall1 at 50% width 1200 sill 2400 head 2100   # error: sill above head",
  ),
  E_OPENING_ABOVE_WALL: e(
    "An opening's head is above the wall it is cut in.",
    "A `door`/`window`/`opening` whose `head` exceeds its host wall's own `height` would run out through the top of the wall. The wall's height is the authored `wall … height`, else this storey's, else the 3000 mm default — so this fires on a low parapet or a short storey as readily as on a mistyped head.",
    "Lower the `head` to the wall's height (the fix does exactly that), or raise the wall with `wall … height`.",
    "wall id=w1 exterior thickness 200 height 2200 { (0,0) (4000,0) close }\n  door id=d on w1 at 50% width 900 head 2400   # error: head above a 2200 wall",
  ),
  E_OPENING_ON_DEMOLISHED_WALL: e(
    "A door, window or opening stands in a wall marked `status demolish`.",
    "A `wall … status demolish` (or a `walls from rooms … status demolish` statement) is a wall the remodel takes out: it is drawn, but it encloses nothing, hosts nothing and counts in no area. A `door`/`window`/`opening` hosted on it would stand in a wall that is no longer there, so the plan contradicts itself.",
    "Remove the opening (it goes with the wall), host it on a wall that stays, or keep the wall: `status existing` (or no `status` at all).",
    "wall id=p partition thickness 100 status demolish { (4000,0) (4000,5000) }\n  door id=d on p at 50% width 800   # error: the wall is being demolished",
  ),
  E_WINDOW_CORNER: e(
    "A window placed `at corner` does not stand at a true corner of two walls.",
    "`window on <room>.<edge> at corner <room>.<edge>` runs a window to the corner the two edges make, with a window on each of the two walls, and no wall left at the corner between them. So it is refused where that is not what the plan says: on a door or a cased opening; on `on <wall>`, since a corner is read from a room's edges; on two edges that do not meet at an end, or belong to different rooms; where either edge has no exterior wall that stays and ends exactly on the corner (a wall running on past it, a partition, a demolished wall); where a third wall or a column stands at the corner; on a window no wider than the other wall is thick; with no window at the corner on the other wall, or more than one; on two windows with different `sill` or `head`; and on a `hinge` naming the corner end, since a hinge needs a jamb and no wall is left there. A polygon's side words name its outermost runs, which meet only at convex corners, so a re-entrant corner cannot be named. Refused, never approximated: taking away the wall at a corner is a statement about the corner.",
    "Write the other window (the hint quotes it), name two edges of one room that meet at an end, or stand the window clear of the corner with `at <mm> from <room>.<edge>`.",
    "room id=r at (0,0) size 4000x3000\n  walls from rooms exterior 200 partition 100\n  window id=n on r.top at corner r.right width 1500   # error: no window on r.right",
  ),
  E_SWING_SIDE: e(
    "`swing inward` or `swing outward` on a wall with no single inside.",
    "`swing inward|outward` is relative to the building: `inward` opens the leaf towards the one face of the host wall that has floor (probed one wall thickness off each face, against every room's own shape), `outward` away from it. A wall between two rooms (or one free-standing inside a room) has floor on both faces, a garden wall has it on neither, and a door with no host wall has no faces at all, so neither word picks a side, and guessing one would put the leaf where the author did not mean it. The door falls back to its default swing. A door whose placement was refused is not told this as well: the refusal is the report.",
    "Name the room the leaf opens into with `swing into <room>`, or write the wall-relative `swing in|out` (`in` is the right-hand side of the wall's drawn direction on the page, `out` the left).",
    "wall id=w1 partition thickness 100 { (3000,0) (3000,3000) }\nroom id=a at (0,0) size 3000x3000\nroom id=b at (3000,0) size 3000x3000\ndoor on w1 at 50% width 800 swing inward   # error: floor on both faces",
  ),
  E_WINDOW_KIND_CLAUSE: e(
    "That clause is not available on this kind of window.",
    "A `window` statement carries `hinge` on a window that hangs on no jamb: a window with no kind, or a `fixed`, `tilt` or `sliding` one. Only `casement` and `tilt_turn` take it. ArchLang refuses rather than draws the statement as if the clause were absent, as it does for a door (`E_DOOR_KIND_CLAUSE`).",
    "Delete the clause (the machine-applicable fix does exactly that), or change the window's kind to `casement` or `tilt_turn`.",
    "window fixed on w1 at 50% width 1500 hinge left   # error: a fixed window has no hinge",
  ),
  E_WINDOW_WIDTH: e(
    "Window must have a positive width.",
    "A window's width evaluated to zero or a negative number.",
    "Give the window a positive `width`.",
    "window at (0,0) width 0   # error",
  ),
  E_OPENING_DATUM: e(
    "An opening's position names no datum that applies to its run.",
    "A relational opening (`door|opening … between A and B`, `door|window|opening … on <room>.<edge>`) is placed along the shared edge run or the edge by `center`, `<mm> from start|end`, `<mm> from <room>.<edge>` or `axis <label>` (ADR 0028 §5). A door or a cased opening must write one (a door is held to an end or an edge, never centred by default); a plain `at <mm>` or `at <pct>%` names no datum there. `from <room>.<edge>` needs an edge perpendicular to the run through one of its ends (not a parallel edge, a centre line `cx|cy`, or an edge meeting the run elsewhere), and `axis <label>` an axis that crosses the run. On a pair that shares several edges only `from <room>.<edge>` picks one, so the code here means an edge that meets none of them at an end, and any other position is `E_OPENING_HOST_AMBIGUOUS`. On the existing `on <wall> at …` form the same datums are read where the datum line crosses the wall's straight run at exactly one point. Arithmetic on a positioning axis in any of these positions (`at axis.2 + 500`, under `from` or `%` too) is refused here as well: an axis is a plan coordinate and a position along a wall a distance along it, so the result would land on the axis only on a wall that starts at 0. The compiler refuses rather than pick a position (ADR 0005). The span points at the position or the datum.",
    "Write a position the run can read: `at 600 from start`, `at 600 from end`, `at center`, or an edge through one end of the run (`from a.top` on a vertical run). On a pair that shares several edges only the edge will do: write the position the hint quotes. For arithmetic on an axis, write `at axis <label>` to stand on it, or the distance along the wall the hint quotes.",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nwalls from rooms exterior 200 partition 100\ndoor between a and b width 800   # error: a door needs a position",
  ),
  E_OPENING_HOST_AMBIGUOUS: e(
    "A relational opening's run carries more than one wall and its position does not land it on one, its position does not pick one of the edges two rooms share, or an `open between` clause names a pair that shares more than one edge.",
    "`door|opening … between A and B` stands in the one wall body on the pair's shared edge run (ADR 0028 §5). Two authored halves, or an authored span beside a derived remainder (the `~2` pieces coexistence leaves), give more than one, and the compiler does not choose between them (ADR 0005). `… on <room>.<edge>` stands in one exterior wall body on that edge. An edge can carry several, part exterior and part partition, or exterior either side of a narrower neighbouring room: the position, measured along the whole room edge, says where the opening lands, and it stands in an exterior body when its whole span lies on that body and on no other wall. With an exterior body on the edge, a span that crosses from one body to the next, stands on a partition, stands on no body, or lies on two walls at once is refused here; with none it is `E_OPENING_NO_SHARED_WALL`. A `status demolish` wall still takes up the span it lies on, but it is no exterior body. A polygon room wrapped round its neighbour shares several edges with it, and only `at <mm> from <room>.<edge>`, with an edge that meets one of them at an end, picks one: `at center`, `from start|end`, `at axis <label>` or no position would be a choice the author did not write. `open between A and B` derives one opening on one edge, so such a pair has no single answer there either (ADR 0028 §3). The span points at the clause.",
    "On a room's edge with several walls: write the position the hint quotes for the exterior wall you mean, where it quotes one. On a run with more than one wall: make it one wall (drop the authored wall lying on the derived line, or join the halves), or place the opening `on <wall> at …` on the wall you mean. On a pair that shares several edges: write the position the hint quotes, `at <mm> from <room>.<edge>`, or `at (x,y)` where no room edge picks the one you mean. On an `open between` clause: write the two rooms as one room if no boundary should stand between them, or remove the clause and write the statement the hint quotes, `opening id=o between A and B at <mm> from B.<edge> width <mm>`, or `opening at (x,y) width <mm>` where no room edge picks it (a derived wall has no id to name).",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nwall id=half partition thickness 100 { (4000,0) (4000,1500) }\nwalls from rooms exterior 200 partition 100\ndoor between a and b at 600 from end width 800   # error: the authored half beside the derived remainder",
  ),
  E_OPENING_NIB: e(
    "A relational opening leaves too short a nib of wall at a junction; it is refused, never moved.",
    "A relational opening's jamb must stand at least `max(100 mm, host thickness / 2)` from the face of every wall meeting its host, no meeting wall may stand inside its span, and it must lie on its run and on its host wall (ADR 0028 §5). These are the default values and the measure `W_OPENING_AT_JUNCTION` warns with for a hand-placed opening, including its exemption for a cased opening flush (0 mm) with a meeting wall's face; `compile()` reads no lint profile. An `open between` boundary voided over its whole clear span is no meeting wall, unless the host stops at it with nothing carrying on: a jamb there has no wall beside it, and the message names the boundary and, where no wall stands either, the host's free end, because nothing is drawn along it. The author asked for a derived position, so the compiler refuses rather than slide it (ADR 0004, ADR 0005), and names the nearest legal position in the hint. An opening placed `on <wall> at …` is not refused: it warns, as it always did. The span points at the clause.",
    "Use the position the hint names, narrow the opening, or move the wall that meets the run.",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nwalls from rooms exterior 200 partition 100\ndoor between a and b at 500 from start width 800   # error: the jamb is on the ring's face, with no nib",
  ),
  E_OPENING_NO_SHARED_WALL: e(
    "A relational opening's run carries no wall (or, on a room edge, no exterior wall).",
    "`door|opening … between A and B` stands in the wall on the pair's shared edge run, derived or authored, and `… on <room>.<edge>` in the exterior wall on that edge (ADR 0028 §5). With no wall on the run, or with no exterior wall standing on an edge (one partition or several, an `open between` boundary, a `status demolish` wall), there is nothing to stand in; the compiler does not invent one. The span points at the clause.",
    "Add the wall (`walls from rooms` derives every shared edge; or write it by hand on that line), or place the opening `between` the two rooms that share the edge.",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nwall id=shell exterior thickness 200 { (0,0) (7000,0) (7000,3000) (0,3000) close }\ndoor between a and b at 600 from start width 800   # error: no wall on x 4000",
  ),
  E_OPENING_WIDTH: e(
    "Opening must have a positive width.",
    "A cased opening's width evaluated to zero or a negative number.",
    "Give the opening a positive `width`.",
    "opening at (0,0) width 0   # error",
  ),
  W_SWING_ROOM_NOT_ADJACENT: w(
    "`swing into <room>` names a room the door does not border.",
    "A door's `swing into <room>` points the leaf toward a room, but that room does not share the door's host wall (its box does not touch the wall within tolerance), so which side it means is undefined. A door whose placement was refused is not told this as well: the refusal is the report.",
    "Point `swing into` at a room the door actually opens onto, or use explicit `swing in|out`. The door falls back to its default swing.",
    "wall id=w1 partition thickness 100 { (0,0) (4000,0) }\ndoor on w1 at 50% width 800 swing into faraway   # warning: not on this wall",
  ),
  W_DOOR_OFF_WALL: w(
    "Door does not lie on any wall.",
    "A door's position is not within tolerance of any wall segment, so it has no host.",
    "Move the door onto a wall, or name its host with `wall <id|category>`. The diagnostic points at the nearest wall.",
    "door at (9999,9999) width 900   # warning: not on a wall",
  ),
  W_WINDOW_OFF_WALL: w(
    "Window does not lie on any wall.",
    "A window's position is not within tolerance of any wall segment, so it has no host.",
    "Move the window onto a wall, or name its host with `wall <id|category>`. The diagnostic points at the nearest wall.",
    "window at (9999,9999) width 1200   # warning: not on a wall",
  ),
  W_OPENING_OFF_WALL: w(
    "Opening does not lie on any wall.",
    "A cased opening's position is not within tolerance of any wall segment, so it has no host.",
    "Move the opening onto a wall, or name its host with `wall <id|category>`. The diagnostic points at the nearest wall.",
    "opening at (9999,9999) width 1000   # warning: not on a wall",
  ),
  W_OPENING_AT_JUNCTION: w(
    "An opening runs into a wall junction, or leaves too short a nib of wall beside a jamb.",
    "A door, window or cased opening sits on its host run where another wall meets it — a tee, a crossing, a host that itself ends on another wall, or a corner — and either that wall's body stands inside the opening's span, or the nib of wall between a jamb and that wall's FACE is shorter than `max(minJunctionNibMm, host thickness × junctionNibThicknessRatio)` (100 mm and half the thickness by default). The meeting wall's footprint is where its two face lines cross the host's face line, so an angled wall is measured at the face; on a curved host only the two ends are measured. **Why:** a jamb needs a return of wall to carry its frame and architrave or its lining (100-150 mm in trade practice), and a wall inside an opening is a pier standing in it, which also leaves the rooms it serves a guess. The thickness limb is `W_DOOR_NEAR_CORNER`'s threshold read at the face instead of the centreline: for two walls of one thickness, a nib of one thickness to the corner point is a nib of half the thickness to the meeting face. **A door `W_DOOR_NEAR_CORNER` reports is not measured here at its host's corners** (one defect, one warning), only against tees and crossings, and every plan's `W_DOOR_NEAR_CORNER` output is unchanged. A door that rule passes is measured at corners too: on a thin wall its one thickness to the corner's centreline point is less than this rule's nib at the face (a 100 mm partition: 50 mm at the face, against 100). A cased opening whose jamb lands flush (0 mm) on a meeting wall's face is not reported for that jamb: the face is its jamb, and there is no sliver of wall left to carry anything (a hall that opens its full width into a room). A door or a window there still is. An `open between` boundary voided over its whole clear span meets nothing, unless the host stops at it with nothing carrying on: a jamb there has no wall beside it, and the message names the boundary and, where no wall stands either, the host's free end, because nothing is drawn along it.",
    "Move the opening along its run. The hints quote each direction that has a clear position: the span it lands on, the nib it leaves and the `on <wall> at <pos>` or `at (x,y)` clause. Every quoted position was checked: on the run, the nib kept to every meeting wall, a mullion kept to every other opening, `W_DOOR_NEAR_CORNER`'s nib kept at a corner, and the same rooms served, which the hint names. The two leaves of a double door move together, with a clause for each. When no direction has one, the hint gives the longest clear stretch of wall and says to use another wall the same rooms share, or to move the meeting wall. Accept it where the plan means it: glazing running past a junction onto a mullion, a screen stopping short of a cased opening's head, a frame fixed into the meeting wall. There is no machine-applicable fix: every remedy moves something the author placed, and there are always at least two.",
    "wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\nwall partition thickness 100 { (4000,0) (4000,5000) }\nwindow on shell at 4500 width 2000   # lint: the partition stands inside the window's span",
  ),
  W_OPENING_OVERLAP: w(
    "Two openings on one wall run overlap, or leave a pier thinner than a mullion.",
    "Two openings (doors, windows or cased openings) sit on one host run (the same segment, or collinear straight segments of one wall), and their along-run spans intersect or the pier of wall between them is thinner than `minMullionMm` (100 mm by default). Two openings cannot share a length of wall: one cuts through the other's frame, and a pier thinner than a mullion has no room for the two frames that meet on it. One warning per pair, on the LATER-declared opening, naming both by the rooms they serve. The two leaves of one double door (two hinged doors closing onto one shared latch jamb) are one opening and are not reported.",
    "Move one of the two along the run. The hints quote, for each opening and each direction, the nearest position that keeps a mullion to every other opening and the junction nib to every meeting wall and still serves the same rooms, with its source clause, or say that none exists. Where the two are deliberately one framed unit (a door with a sidelight, windows meeting on a slim mullion), accept the pier warning. There is no machine-applicable fix.",
    "wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\ndoor on shell at 4600 width 900\nwindow on shell at 3800 width 1200   # lint: 250 mm of the window's span is the door's",
  ),
  W_CONNECTOR_AMBIGUOUS: w(
    "A door or cased opening does not join two rooms cleanly.",
    "The access graph reads which two spaces a connector joins off the faces of its host wall. This one either cannot be read at all (three or more rooms meet at its point and a face probe lands on a room boundary, or in no room behind an interior wall, so the edge is `ambiguous` and joins nothing), or one face of its clear span covers more than one room (`straddles`, typically a partition meeting the host inside the doorway), so the rooms it opens into are a guess. A straddle counts only when at least two rooms each cover `max(minStraddleCoverMm, host thickness × junctionNibThicknessRatio)` of that face (100 mm by default), net of the body of the wall meeting the host there: a smaller sliver is a jamb set against the meeting wall, which `W_OPENING_AT_JUNCTION` reports alone. The message names the rooms on each side by label, with how much of the span each covers; the ids are in the hints. **Why:** a doorway joins exactly two spaces; when one side spans two rooms, `describe()`'s `between`, reachability and the circulation walk all rest on a reading the plan does not support. A connector at a wall junction usually also raises `W_OPENING_AT_JUNCTION`: that warning is about the wall in the opening, this one about which rooms it serves.",
    "Move the connector so each side lies in one room. The hints quote each direction with a checked position (each side in one of the rooms it touches now, no straddle, no room left unreachable, the junction nib and mullions kept), the two spaces it then opens between, and its source clause. Accept it only if the rooms it spans are one open space with no wall between them, so the doorway serves both. There is no machine-applicable fix.",
    "wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\nwall partition thickness 100 { (4000,0) (4000,5000) }\nroom at (0,0) size 4000x5000\nroom at (4000,0) size 4000x5000\ndoor on shell at 4000 width 900   # lint: its inner side spans both rooms",
  ),
});
