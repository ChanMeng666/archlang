/**
 * Error catalogue: the layout family. Placement and relations: `place`, datums, layout references,
 * alignment, attachment, strips and segment selectors.
 *
 * Merged into `ERROR_CATALOG` by `mergeFamilies` in `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e } from "./entry.js";

export const LAYOUT_ENTRIES = defineEntries({
  E_SEGMENT_SELECT: e(
    "A segment selector (`segment north`, `segment containing <room>.<edge>`) does not name exactly one segment.",
    "A selector stands for the `segment <n>` it resolves to, so it must pick exactly one segment. `segment north|south|east|west` picks the straight segment of a CLOSED wall whose outward face (the side away from the floor the ring encloses) looks that way; an open wall has no floor side, so it is refused. `segment containing <room>.<edge>` picks the straight segment lying on that room edge's line with a positive overlap; a centre line (`cx`, `cy`) or a name that is not a room edge is refused. No match, or several, is refused rather than guessed. `dim radius` measures an arc, which no selector picks, so a selector there is refused too.",
    "Type one of the `segment <n>` numbers the message lists, or name a different edge or direction.",
    "wall id=w exterior thickness 200 { (0,0) (3000,0) (3000,1000) (6000,1000) (6000,4000) (0,4000) close }\nfurniture wardrobe against wall w segment north side right   # error: segments 0 and 2 both face north",
  ),
  E_ATTACH_WALL_REF: e(
    "Opening attached to an unknown or ambiguous wall.",
    'A `door`/`window`/`opening … on <wall> at <pos>` names a wall id (or category) that no wall has, or one that matches more than one wall — so the compiler cannot pick the polyline to walk. A `wall … between`/`wall … around` the rooms refused (its own error, ADR 0028 §4) has no body, so naming it raises this code too, saying the wall "could not be placed (see its own error)": fix that error first.',
    "Reference an existing, unique wall id (add `id=` to the wall if needed).",
    "door on w1 at 40% width 900   # error if no wall id=w1 (or several match)",
  ),
  E_ATTACH_POS_RANGE: e(
    "Opening attachment position is out of range.",
    "The `at <pos>` of an attached opening is outside the host wall: a percentage outside 0–100%, a millimetre distance outside `0 … wall length`, or — since the position may be an expression — a value that is not a finite number at all.",
    "Use a percentage in 0–100%, a millimetre distance within the wall's run, or `center`. The non-finite case carries no fix: there is no nearest legal value to clamp to, so check the expression that produced it.",
    "door on w1 at 150% width 900   # error: 150% is past the wall end",
  ),
  E_PLACE_REF: e(
    "Furniture placed in an unknown or unplaced room.",
    "A `furniture … in <room> centered|anchor …` names a room that does not exist, or a relationally placed room (`right-of`/…) that could not be placed (its own `E_LAYOUT_*` error says why). A relational room that IS placed works: rooms are placed before any furniture.",
    "Reference an existing room, and fix the placement error of the room it names.",
    "furniture bed in bedrm centered size 1500x2000   # error: no room id=bedrm",
  ),
  E_PLACE_POLY: e(
    "A placement clause aimed at a polygon room that has no one edge or corner to stand on.",
    "Relational room placement (`right-of`/`left-of`/`below`/`above`) and room-relative furniture placement (`in <room> centered|anchor …`) are closed-form arithmetic on a room's edges. A polygon whose every edge is horizontal or vertical has them: a side is the ring's run on its outermost line, a corner anchor is a vertex of the ring on two such lines, and a side anchor centres on the run. The rest is refused, because a bounding box is not a floor and the compiler does not guess (ADR 0005): a circle or a slanted polygon, a side that is several runs (the prongs of a U), a corner in a notch, `centered` or `anchor center` (the middle of the outline may not be floor), and a footprint that would leave the ring.",
    "Name a side with one run or a corner that is a vertex of the ring, or give the room or the fixture explicit `at (x,y)` coordinates (a fixture may add `rotate`).",
    "room id=L polygon (0,0) (6000,0) (6000,4000) (3000,4000) (3000,6000) (0,6000)\nfurniture wc in L anchor bottom-right size 400x700   # error: that corner is in the L's notch",
  ),
  E_DATUM_BEFORE_ROOMS: e(
    "A room-edge datum is read before any room is placed.",
    "A datum (`hall.top`, `hall.cx`, …) reads the frozen table of placed rooms, which exists only once every room of the group is placed (ADR 0028 §1). A `let` is evaluated once, when the plan expands, as are loop bounds, conditions, `set`, `place` and component arguments, and the plan settings (`height`, `axes`, the site boundary); a room's own `at`/`size` and relational placement run while the rooms are being placed. None of them can read a datum. A positioning axis (`axis.3`) is known once the plan has expanded, so a room's `at` and `size` can read one; what expands first cannot, because the axes read the plan's `let`s. Nor can the body of a user function (`let f() = hall.top`): it has no room of its own, so the edge is passed as an argument (`f(hall.top)`), which the caller evaluates.",
    "Write the datum in the statement that uses it (a wall point, an opening or furniture position, a dimension), or give the room numbers or a relational placement (`right-of|left-of|above|below`) instead of another room's edge.",
    "room id=hall at (0,0) size 4000x3000\nlet x = hall.right   # error: read when the plan expands",
  ),
  E_DATUM_COMPASS: e(
    "A compass word is used as a room-edge datum where it would mean two things.",
    "`north|south|east|west` alias `top|bottom|right|left` only in the root of a plan whose `north` is `up` (the default). Inside a `place`d component a datum names the component's own frame, which a turn or a mirror carries anywhere on the page, and with any other `north` (a direction or a bearing) the page's top is not north. One word must not carry both meanings, so the compiler refuses (ADR 0028 §2).",
    "Write the frame word the message names (`top`, `bottom`, `left` or `right`).",
    "north right\nroom id=hall at (0,0) size 4000x3000\nwall interior thickness 100 { (0, hall.north) (4000, hall.north) }   # error: write hall.top",
  ),
  E_DATUM_NAME: e(
    "A dotted name reads both as a room-edge datum and as an element inside an instance.",
    "The last segment of a dotted name is read as the datum word (`west.main.top` is the `top` edge of room `west.main`). When the whole path is also the id of an element inside a `place`d instance (an instance `west` holding an element `top`), the name could mean either, and the compiler refuses rather than choose (ADR 0028 §2).",
    "Rename the element inside the component so its id is no datum word (`top`, `bottom`, `left`, `right`, `cx`, `cy` or a compass word).",
    "component wing() { room id=top at (0,0) size 3000x3000 }\nplace wing() as west at (0,0)\nwall interior thickness 100 { (0, west.top) (3000, west.top) }   # error: `west.top` is also an element",
  ),
  E_DATUM_UNPLACED: e(
    "A room-edge datum names a room that has no position or no size.",
    "A datum reads the room's placed rectangle, and so does an opening placed `between` two rooms. A relationally placed room that could not be placed (its own `E_LAYOUT_*` error says why) has no position, and a room of zero or negative size has no edge to read.",
    "Fix the named room's placement or size first; the datum then reads it.",
    "room id=a right-of ghost size 3000x3000\nwall interior thickness 100 { (a.left, 0) (a.left, 3000) }   # error: a could not be placed",
  ),
  E_STRIP_SIZE: e(
    "Room in a `strip` is missing a size.",
    "A room inside a `strip { … }` gives no main-axis extent, or gives none while the strip supplies no cross-axis `height`/`width` for it to inherit — so its rectangle is undetermined.",
    "Give the room a `size <main>` (main-axis extent) plus either a strip `height`/`width` or its own `size <main>x<cross>`.",
    "strip right at (0,0) gap 100 { room size }   # error: no extent",
  ),
  E_STRIP_NEST: e(
    "Illegal `strip` nesting.",
    "A `strip` block appears inside a component, a control-flow block, or another `strip`. Strips place rooms and are only legal as direct plan-level statements.",
    "Move the `strip` to the plan body, alongside the other elements.",
    "component c() { strip right at (0,0) gap 0 { … } }   # error: nested strip",
  ),
  E_LAYOUT_CYCLE: e(
    "Relational room placement forms a cycle.",
    "Rooms placed with `right-of`/`below`/… reference each other in a loop, so no order resolves them.",
    "Break the cycle by giving one of the rooms absolute `at (x,y)` coordinates.",
    "room id=a right-of b size 100x100\nroom id=b left-of a size 100x100   # error: a ↔ b cycle",
  ),
  E_LAYOUT_UNPLACED: e(
    "A relational room depends on a room that could not be placed.",
    "The room's reference chain ends at a room that failed (unknown or polygon reference) or runs into a placement cycle, so there is no resolved position to place it against. Only the root cause carries the original error.",
    "Fix the room it names (give it a valid reference or absolute `at (x,y)`), or place this room with `at (x,y)`.",
    "room id=e right-of ghost size 100x100\nroom id=f below e size 100x100   # error: e could not be placed",
  ),
  E_LAYOUT_REF: e(
    "Relational placement references an unknown room.",
    "A `right-of`/`below`/… clause names a room id that does not exist in the plan.",
    "Reference an existing room id, or fix the typo.",
    'room id=k right-of ghost size 100x100   # error: no room "ghost"',
  ),
  E_ROOM_ALIGN: e(
    "Unknown relational alignment edge.",
    "A relationally-placed room's `align <word>` names something that is not an alignment edge. The set is closed (`top`, `middle`, `bottom` for `right-of`/`left-of`; `left`, `center`, `right` for `below`/`above`), and an unrecognised word used to fall through to the leading edge silently — drawing the plan as if `align` had never been written.",
    "Use one of the six edges; the diagnostic suggests the nearest one and carries a fix that rewrites just that word.",
    "room id=b right-of a align sideways size 3000x3000   # error: not an edge (did you mean `bottom`?)",
  ),
  E_ROOM_ALIGN_AXIS: e(
    "Relational alignment edge belongs to the other axis.",
    "A relationally-placed room's `align <edge>` names a real edge, but not one of the axis that direction aligns on. A horizontal relation (`right-of`/`left-of`) offsets its room vertically, so it takes `top|middle|bottom`; a vertical relation (`below`/`above`) offsets horizontally, so it takes `left|center|right`. (`middle` and `center` are honoured on both — they are the same instruction spelled twice.) A cross-axis edge used to be ignored in silence, drawing the room against the leading edge exactly as if `align` had never been written — distinct from `E_ROOM_ALIGN`, where the word is not an edge at all.",
    "Use the edge of the correct axis; the diagnostic names its exact counterpart (leading stays leading, trailing stays trailing) and carries a fix that rewrites just that word.",
    "room id=b right-of a align right size 3000x3000   # error: `right` is horizontal (did you mean `bottom`?)",
  ),
});
