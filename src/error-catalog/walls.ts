/**
 * Error catalogue: the walls family. Walls, partitions, columns and roofs, and the `enclosure`
 * lint family.
 *
 * Merged into `ERROR_CATALOG` by `mergeFamilies` in `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const WALLS_ENTRIES = defineEntries({
  E_COLUMN_SIZE: e(
    "Column must have a positive size.",
    "A column's width or height evaluated to zero or a negative number.",
    "Give the column a positive `size W x H`.",
    "column at (0,0) size 0x300   # error: width is 0",
  ),
  E_PARTITION_TOO_SHORT: e(
    "`walls from rooms`, or a `wall … between`, meets a shared edge shorter than the wall's thickness.",
    "Two rooms share a run of edge shorter than the derived partition (or the `wall … between` written on it) is thick, so the wall would be wider than it is long: almost always two edges that were meant to line up and miss by a few millimetres. The compiler refuses and names the pair and the run rather than draw a sliver of wall (ADR 0028 §3, §4).",
    "Line the two rooms' edges up so they meet at a corner, or make the shared edge at least as long as the wall is thick.",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,2950) size 3000x3000\nwalls from rooms exterior 200 partition 100   # error: a and b share 50 mm\nwall partition thickness 100 between a and b   # error: the same run",
  ),
  E_ROOF_AMBIGUOUS: e(
    "`roof overhang` cannot tell which wall ring to follow.",
    "The `overhang` sugar offsets ONE closed wall ring, and with no `wall <id>` clause it infers that ring as the plan's single closed `exterior` wall. The plan has none (a ring marked `status demolish` is coming out, so it does not count), or has more than one, so there is nothing to infer — and picking the first would silently draw a roof over part of the building.",
    "Name the ring (`roof overhang 600 wall <id>`), or state the outline yourself with `roof polygon (x,y) (x,y) (x,y) …`.",
    'plan "H" {\n  units mm\n  room id=r1 at (0,0) size 4000x3000\n  roof overhang 600   # error: no closed exterior wall to follow\n}',
  ),
  E_ROOF_CURVED: e(
    "`roof overhang` on a wall with a curved edge.",
    "The named ring has an `arc` edge. Offsetting a curve is a different construction from mitring two straight faces (concentric radii, plus the cases where the offset radius passes through zero), and faceting it would put a tessellation in the one place a reader is entitled to read a true parallel.",
    "State the outline explicitly with `roof polygon …`, or follow a straight-edged wall ring instead.",
    "wall id=drum exterior thickness 200 { (0,0) arc (6000,0) radius 4000 (6000,4000) (0,4000) close }\nroof overhang 600 wall drum   # error: arc edge",
  ),
  E_ROOF_OVERHANG: e(
    "`roof overhang` is zero or negative.",
    "An overhang is a distance the roof projects PAST the wall's outer face, so it must be positive. Zero would draw the outline on the wall face (say nothing instead), and a negative value would draw it inside the building.",
    "Give a positive projection in mm, e.g. `roof overhang 600`.",
    "roof overhang 0   # error: must be positive",
  ),
  E_ROOF_PLACEMENT: e(
    "`roof` used inside a component body.",
    "A roof belongs to a building, not to a reusable part of one: `roof overhang` is offset from the plan's closed exterior wall ring, and a component is authored in its own local frame with no such ring. Two `place`d copies would each derive an outline and the plan would draw two roofs.",
    "Move the `roof` line out to the plan body (or into the `level` block it belongs to).",
    "component wing() { roof overhang 600 }   # error: only allowed at plan level",
  ),
  E_ROOF_POLY_DEGENERATE: e(
    "`roof polygon` outline has fewer than 3 effective vertices.",
    "After removing duplicate and straight-through (collinear) points the ring encloses no area, so it is a line or a point rather than a roof outline.",
    "Give at least three vertices that actually turn a corner.",
    "roof polygon (0,0) (4000,0) (8000,0)   # error: all three are collinear",
  ),
  E_ROOF_SELF_INTERSECT: e(
    "The roof outline crosses itself.",
    "Either the `roof polygon` ring was written as a bow-tie, or the derived `overhang` offset is wide enough to swallow a notch in the wall it follows (a 900 mm eave across a 600 mm light well) and the pushed-out faces cross. Neither encloses a single area.",
    "Reorder the vertices, or reduce the overhang — or state the outline explicitly with `roof polygon …`.",
    "roof polygon (0,0) (4000,4000) (4000,0) (0,4000)   # error: bow-tie",
  ),
  E_ROOF_WALL: e(
    "`roof overhang … wall <id>` names a wall that cannot carry a roof.",
    "The named wall is not declared in this plan, it is not a closed ring, or it is marked `status demolish`. An overhang is offset from a loop; an open polyline has no inside to be outside of, and a demolished wall holds no roof.",
    "Check the id, give the wall a `close` so its points form a ring, or name a wall that stays.",
    "wall id=w1 exterior thickness 200 { (0,0) (8000,0) }\nroof overhang 600 wall w1   # error: not a closed ring",
  ),
  E_WALL_THICKNESS: e(
    "Wall must have a positive thickness.",
    "A wall's `thickness` evaluated to zero or a negative number.",
    "Give the wall a positive `thickness`.",
    "wall exterior thickness 0 { (0,0) (1,0) }   # error",
  ),
  E_WALL_BETWEEN_DUP: e(
    "A `walls from rooms` statement names one pair of rooms in two clauses.",
    "Each pair of rooms takes at most one clause: `open between` (the run is voided by an opening) or `between … thickness` (the partition gets its own thickness). A second clause on the same pair, in either order of the rooms, would either contradict the first or repeat it, and the compiler refuses rather than choose (ADR 0028 §3). The span points at the later clause.",
    "Keep one clause per pair.",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nwalls from rooms exterior 200 partition 100 { open between a and b  between b and a thickness 200 }   # error: the pair twice",
  ),
  E_WALL_BETWEEN_NOT_ADJACENT: e(
    "A `walls from rooms` clause, a `wall … between`, or a door or opening placed `between` two rooms, names two rooms that share no edge.",
    "`open between A and B` and `between A and B thickness t` act on the partition the statement derives on the edge run two rooms share, `wall … between A and B` stands on that run, and `door|opening … between A and B` stands in the wall on that run (ADR 0028 §3, §4, §5). Two rooms that do not meet along an edge (apart, or touching only at a corner), or a room named twice, have no such run, so the clause would act on nothing. The span points at the clause.",
    "Name two rooms that meet along an edge, or remove the clause (place the door `on <wall> at …` or `at (x,y)` instead).",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nroom id=c at (0,3000) size 7000x2000\nroom id=d at (7000,0) size 2000x5000\nwalls from rooms exterior 200 partition 100 { open between a and d }   # error: a and d do not meet\nwall partition thickness 100 between a and d   # error: the same pair",
  ),
  E_WALL_BETWEEN_OPEN: e(
    "A wall, door, window or opening is written on an edge a `walls from rooms` clause declares open.",
    "`open between A and B` voids the pair's edge run with a derived opening: the two rooms are one open-plan space there. An authored wall lying on that run (exactly on its line, overlapping it), or an authored door, window or opening hosted by position across the span the derived opening voids, would close or narrow what the clause opened, so the compiler refuses rather than choose between them (ADR 0028 §3); the span points at the clause. A relational `door|opening … between A and B` on that pair is refused the same way, spanned on its own `between` clause with the `open` clause as a related span (§5).",
    "Remove the authored wall or opening on that edge, or remove the `open between` clause and keep the wall (with a door in it).",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nwalls from rooms exterior 200 partition 100 { open between a and b }\ndoor at (4000,1500) width 800 wall partition   # error: the edge is open",
  ),
  E_WALL_BETWEEN_ROOM: e(
    "A `walls from rooms` clause names a room it cannot act on.",
    "`walls from rooms` derives from the rooms of the plan or component it is written in (ADR 0016: a component sees only its own rooms). Its `except` clause can leave out only one of those rooms; an `open between` or `between … thickness` clause can name only one of those rooms that the statement derives walls round: a rectangle or a rectilinear polygon, not left out by `except` (a circle room, or a polygon with a slanted edge, has no edge run to share). A name that is not one of them (a typo, a room of another component, a placed instance's room) would act on nothing (ADR 0028 §3). The span points at the name.",
    "Name a room written beside the statement (a rectangle or a rectilinear polygon, not excepted, in an `open`/`between` clause), or drop the name.",
    "room id=a at (0,0) size 4000x3000\nwalls from rooms exterior 200 partition 100 { except terrace }   # error: no room `terrace`",
  ),
  E_WALL_BETWEEN_WIDTH: e(
    "An `open between` opening does not fit the clear span of its edge.",
    "`open between A and B` derives an opening across the clear span of the pair's edge run: the run less half the thickness of the thickest wall meeting it at each end. With `width`, the opening is centred on that span and must fit in it; without one it spans it whole, which needs a span longer than zero. Narrowing or sliding it to fit would be a choice the author did not make (ADR 0005), so the compiler refuses. The span points at the clause.",
    "Give a `width` no larger than the clear span (the message states it), or leave `width` out.",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (4000,0) size 3000x3000\nwalls from rooms exterior 200 partition 100 { open between a and b width 3000 }   # error: the clear span is 2800",
  ),
  E_WALL_ID_RESERVED: e(
    "An authored wall takes the id the derived exterior ring has in this plan or component.",
    "Beside a `walls from rooms` statement, the exterior ring it derives is named `exterior` internally (the courtyard rings and partitions have names no identifier can spell). An authored wall with that id would make one id name two walls, so a host, a hint and `describe().access` could not tell them apart (ADR 0028 §3). The span points at the id.",
    "Rename the authored wall (`wall id=shell …`), or drop it and let the statement derive it.",
    "room id=a at (0,0) size 4000x3000\nwall id=exterior partition thickness 100 { (2000,0) (2000,3000) }   # error: the derived ring's name\nwalls from rooms exterior 200 partition 100",
  ),
  E_WALLS_FROM_NO_ROOMS: e(
    "A `walls from rooms` statement has no room to derive walls from.",
    "The statement derives walls from the rooms written beside it, in the same plan or component; there is none, or its `except` clause leaves out every one. Deriving nothing silently would leave a plan with no walls where the author asked for them (ADR 0028 §3).",
    "Write the rooms beside the statement, or drop the statement (or the `except` that empties it).",
    "room id=a at (0,0) size 4000x3000\nwalls from rooms exterior 200 partition 100 { except a }   # error: every room is excepted",
  ),
  E_WALLS_FROM_ROOMS_DUP: e(
    "More than one `walls from rooms` statement in one plan or component.",
    "One `walls from rooms` statement already derives every wall of its group's rooms, so a second one would derive the same walls again, possibly with other thicknesses; the compiler refuses the second rather than choose between them (ADR 0028 §3).",
    "Keep one statement per plan, storey or component; put every exclusion in its `except` clause.",
    "room id=a at (0,0) size 4000x3000\nwalls from rooms exterior 200 partition 100\nwalls from rooms exterior 250 partition 100   # error: a second statement",
  ),
  W_WALL_END_SHORT: w(
    "A wall stops a few millimetres short of the wall it runs toward.",
    "A wall's free end, as drawn (the renderer caps it square, half the wall's thickness past its last point), is not inside any other wall's drawn outline, but carrying the wall straight on for at most `wallGapMm` (100 mm by default, at most 500 whatever the figure) would land inside one: the two were meant to meet and leave a slit. Walls are named by kind and place; a free end further off than the figure is a stub or a doorway's jamb and is never judged. A closed wall has no free end, and a curved end segment is not judged. Two walls ending toward each other on one line are reported once. Set `wallGapMm` to `null` to turn the rule off.",
    "Extend the wall to the face of the wall it runs toward, or into it, so they join. If the slit is meant as an opening, draw a door or an `opening` there instead. There is no machine-applicable fix: which wall moves is a design decision.",
    "grid 10\nwall id=a exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\nwall id=p partition thickness 100 { (4000,230) (4000,5000) }   # lint: drawn end at y 180, 80 mm from the top wall's inner face",
  ),
  W_EXTERIOR_RING_OPEN: w(
    "Exterior walls that stand on a room close nothing: the shell has a gap.",
    "The storey's `exterior` walls are read end by end, whatever else closes on the storey. An end is a shell's when nothing meets it, its wall is no lower than a door's head (2100 mm), and the wall's last stretch, up to the first exterior wall that meets it, runs along the edge of a room with floor outside every exterior ring; a closed ring standing inside the room encloses the ring's own floor, not the room. So a closed annex built off the shell (a porch, a garage) or a closed building beside it hides nothing: `describe` gives that ring's gross internal area and lists the rooms the figure leaves out in `gross_internal_area_leaves_out`. Where no ring closes at all it omits the figure (`no-closed-exterior-ring`). The message gives each gap's two ends, in mm between their centrelines; the drawing shows it narrower by the walls' caps and bodies. A wall of any other category that meets an end closes it. A last stretch on no such room is a garden or boundary wall, or a fin; a wall lower than a door's head is a parapet; a room with no `uses` whose label or id ends in a word for a place outdoors (a terrace, a yard, a carport) has no shell; runs that all lie on one straight line are no ring; and a `demolish` wall closes nothing. An open-sided structure with an authored `uses`, such as a carport with `uses garage`, is read as a room and fires: drop the `uses` or give its walls another category. A gap `W_WALL_END_SHORT` reports (up to `wallGapMm`) is left to that rule. A storey with no room or no exterior wall is not judged.",
    "Draw the missing run of exterior wall, or carry one wall on to meet the other. If the gap is a way in, draw the wall across it and put a `door` or an `opening` in that wall. If the run is not the building's shell, give it another category. There is no machine-applicable fix: which wall moves is a design decision.",
    'wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) (0,1000) }   # lint: 1000 mm open on the line x 0\nroom id=a at (0,0) size 6000x4000 label "A" uses living\ndoor on w at 3000 width 900 swing inward',
  ),
  W_BOUNDARY_NO_WALL: w(
    "Two rooms meet with no wall between them.",
    "Two rooms share an edge run, and a stretch of it longer than a doorway (`maxBoundaryGapMm`, 900 mm by default) has no wall, door or cased opening on it. The run is read off the two rooms' own shapes: a pair of parallel edges within `tolMm` of each other, with one room's floor on each side just past them; pieces of one line that meet are one run, so a vertex on a ring cannot split a gap. A straight wall stands on the run when its BODY (its centreline ± half its thickness, plus 50 mm) meets the gap between the two room edges, so a partition a room's depth inside one room is not the boundary, and a thick wall with a face on the line is; a wall body crossing the run splits it; a curved wall's chord backs no straight run. A fixed counter (`counter`, `bar_counter`, `island`) counts only where it straddles the line, and closes an open stretch only when what it leaves open there totals no more than a doorway. Counters and wall stubs are judged differently on purpose: a counter is a declared servery, so a partial one (two counters leaving more than a doorway open in all) still warns, while wall stubs are a real boundary and only the longest stretch they leave is compared with the doorway. Two rooms whose uses (their `uses`, else their labels) are each kitchen, dining or living are an open-plan pair and are never reported. **Why:** without a wall the two rooms are one space that anyone walks through, but the plan does not say how they join, so the access graph, the privacy rules and every enclosure check read them as walled apart. A run with no wall at all reads \"have no wall between them\"; a partial one \"the boundary … is open for N mm\", and the message says no door or opening joins them only when none stands on the run. Rooms are named by label; the ids are in the hints.",
    "Draw the missing partition along the run (the hint quotes a `wall partition` statement over the open stretch) and put a `door` in it if the rooms connect. If they are one space by design, draw that wall with a cased `opening` across the gap so the plan says how they join. Accept it only if something the plan does not draw closes the boundary (a fixed screen, a balustrade, a level change). There is no machine fix.",
    'wall exterior thickness 200 { (0,0) (6000,0) (6000,7000) (0,7000) close }\nroom at (0,0) size 6000x4000 label "Living" uses living\nroom at (0,4000) size 6000x3000 label "Bedroom" uses bedroom   # lint: no wall on y 4000',
  ),
  W_FLOOR_UNASSIGNED: w(
    "Walled floor is in no room.",
    "A closed region of floor the walls enclose (a walled face: a hole of the union of every wall's body, doors and windows not cut, so a room with a door is still closed) is covered by rooms less than `minFaceCoverRatio` (95 % by default), leaving at least `minUnassignedM2` (0.5 m²) in no room. Floor under an `outdoor` surface, a `void` or a stair, lift or escalator counts as assigned. Every area is measured in closed form from the shapes, curved walls and circle rooms included (a partition that stops at the chord of a bowed facade leaves the bow in no room; a round room in a square walled box leaves the corners). A sealed face, with no door, cased opening or window into it and no room on its empty floor, is not reported: it is a duct or a pocket behind a curved wall, not floor anyone forgot (a forgotten room has a window or a door). A storey past any of the face budgets (counts charged before the work: wall contacts, `MAX_ENCLOSURE_FACES` (400) faces, loops per grid cell, and the curves, rooms and point tests its measurements would read) is not measured and gets no warning. **Why:** floor inside the walls that no room claims has no use, no area in the schedule and no route the plan can check. The message gives the area in no room, the face's area and the share covered, and names the rooms that border the empty floor (or those behind its walls).",
    "Extend the bordering rooms over the empty floor, draw a room on it, or move the walls in to the rooms' edges. If the floor is open ground (a courtyard, a light well) draw it as an `outdoor` surface; if it is a shaft, draw its stair or lift. Accept it if the floor is a sealed void, and then draw it as a `void` so the plan says so. There is no machine fix.",
    'wall exterior thickness 200 { (0,0) (3800,0) (3800,2400) (0,2400) close }\nroom circle at (2500,1200) radius 1200 label "Snug" uses living   # lint: the corners are in no room',
  ),
  W_ROOM_OUTSIDE_SHELL: w(
    "A room lies partly outside the building's walls.",
    "At least `minOutsideShellM2` (0.1 m² by default) of the room's floor is off every walled face and every wall body: outside the building. A room drawn on the wall centrelines, or to the outer face, has none outside. The rule judges only a room most of whose floor (half or more, an exact area) lies inside walled faces: a room beside a column ring or a closed WC box, or behind a shell left open at its door, has no closed shell to be outside of, and the rule says nothing rather than invent one. The area is measured in closed form from the room's shape and the joined wall bands; the message also gives how far the farthest corner stands past the walls' outer face. **Why:** a room past the outside wall has floor no wall encloses, usually because the room was resized or moved while its walls stayed put.",
    "Bring the room back inside the walls (resize or move it so its edge meets the outside wall), or move the outside wall out to the room's edge. If that part is meant to be outside (a terrace, a balcony, a porch), it is not a room: draw it as an `outdoor` surface instead and keep the room inside the walls. There is no machine fix.",
    'wall exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\nroom at (4000,0) size 4600x5000 label "Bedroom" uses bedroom   # lint: 600 mm past the east wall',
  ),
});
