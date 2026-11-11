/**
 * Error catalogue: the furniture family. Furniture and fixture statements: sizes, rooms,
 * `against`/`flush`/`clear` and `facing`.
 *
 * Spread into `ERROR_CATALOG` by `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const FURNITURE_ENTRIES = defineEntries({
  E_FURN_SIZE: e(
    "Furniture must have a positive size.",
    "A furniture item's width or height evaluated to zero or a negative number.",
    "Give the item a positive `size W x H`.",
    "furniture bed at (0,0) size 0x2000   # error",
  ),
  E_FURN_ROOM: e(
    "Furniture placed `in` an unknown room.",
    "A furniture item names a room with `in <roomId>`, but no room has that id.",
    "Use the id of an existing `room id=…`, or drop the `in` clause.",
    "furniture bed at (0,0) size 1500x2000 in bedrm   # error: no room id=bedrm",
  ),
  E_FURN_ROTATE: e(
    "Furniture rotation must be a quarter-turn.",
    "A furniture item's `rotate` is not one of 0, 90, 180, or 270 degrees.",
    "Use a quarter-turn: `rotate 0|90|180|270`.",
    "furniture wc at (0,0) size 400x700 rotate 45   # error: not a quarter-turn",
  ),
  E_FURN_AGAINST: e(
    "Invalid `against wall` or `against <room>.<edge>` fixture placement.",
    'A wall-anchored fixture references an unknown wall, omits `segment` on a multi-segment wall, omits `side`, sits on a non-axis-aligned segment, has an out-of-range offset, or also sets `rotate`. The compiler will not guess which wall/side/segment was meant. A `wall … between`/`wall … around` the rooms refused (its own error, ADR 0028 §4) has no body, so naming it raises this code too, saying the wall "could not be placed (see its own error)": fix that error first. `against <room>.<edge>` (ADR 0029 §2) raises it when the name is not a room edge, the offset is off the edge, `in <room>` names another room, or the wall on the edge is not one body on the line across the piece\'s whole span (a wall beside the line, a part-covered span, two thicknesses, or a run declared `open between`).',
    "Name an existing wall id, add `segment <n>` for multi-segment walls, give `side left|right`, keep the segment axis-aligned, and drop any explicit `rotate`. With `against <room>.<edge>`, keep the offset on the edge and move the piece to a span one wall covers, or place it `at (x,y)`.",
    "furniture wc against wall w1 side left size 400x700   # error if w1 is unknown or multi-segment",
  ),
  E_FURN_AGAINST_DEMOLISHED_WALL: e(
    "A piece of furniture backs onto a wall marked `status demolish`.",
    "A `wall … status demolish` (or a `walls from rooms … status demolish` statement) is a wall the remodel takes out: it is drawn, but it encloses nothing, hosts nothing and counts in no area. A piece placed `against wall <id>` naming it, or `against <room>.<edge>` where it is the only wall on the edge, would back onto a wall that is no longer there, so the plan contradicts itself. `against wall <category>` names only the walls of that category that stay, and raises this code when every one of them is coming out.",
    "Back the piece onto a wall that stays (`against wall <id>` naming it), place it `at (x,y)` or `in <room> anchor <edge>`, or keep the wall: `status existing` (or no `status` at all).",
    "wall id=p partition thickness 100 status demolish { (4000,0) (4000,5000) }\n  furniture wardrobe against wall p side left size 1200x600   # error: the wall is being demolished",
  ),
  E_FURN_FLUSH: e(
    "`flush` on a placement that touches no edge.",
    "`flush` measures `inset` from the inner face of the wall behind an *anchored edge*. A `centered` piece (or the equivalent `anchor center`) is pushed against no edge, so there is no wall face to measure from.",
    "Anchor the piece to the edge you want it flush with (`anchor bottom flush`, `anchor top-left flush`), or drop `flush` and keep it centred.",
    "furniture wc in bath centered flush size 400x700   # error: centred, so nothing to be flush with",
  ),
  E_FURN_CLEAR: e(
    "Invalid `clear` depth.",
    "`clear front <mm>` and `clear sides <mm>` declare a depth the piece needs kept free (ADR 0029 §4). The depth must be a positive number of millimetres within the modelling range, and each zone is written at most once on a piece.",
    "Write one positive depth per zone, e.g. `clear front 600`, or drop the clause.",
    "furniture wardrobe at (0,0) size 1800x600 clear front 0   # error: a clear depth must be positive",
  ),
  E_FACING_TARGET: e(
    "`facing` names no rectangle to face.",
    "`facing <id>` derives a piece's quarter-turn from a target in its own plan or component (ADR 0029 §3): another piece of furniture, a rectangular room, or a door, window or opening on a straight axis-aligned wall. An unknown id, the piece itself, a wall, a polygon or circle room, an element that could not be placed, or an element of another component is refused.",
    "Name a furniture piece, a rectangular room or an opening of the same plan or component, or turn the piece with `rotate`.",
    "furniture chair at (0,0) size 450x450 facing nowhere   # error: no element has that id",
  ),
  E_FACING_MISS: e(
    "No front of the piece points at its `facing` target.",
    "`facing` takes the quarter-turn whose front ray, from the middle of the piece's front edge, first enters the target (ADR 0029 §3). When the piece is diagonal to the target, or its front's middle is not in line with it, no turn's ray enters it, and the compiler will not turn the piece toward a target it does not face.",
    "Move the piece so the middle of its front lines up with the target across x or y, or name a target in line with it.",
    "furniture id=t table at (0,0) size 800x800\nfurniture chair at (2000,2000) size 450x450 facing t   # error: the chair is diagonal to the table",
  ),
  E_FACING_TIE: e(
    "Two fronts of the piece point at its `facing` target equally near.",
    "Two pieces whose footprints do not overlap can have at most one turn whose front ray enters the other, so a tie means the piece overlaps its target (ADR 0029 §3). The compiler will not choose between the turns.",
    "Move the piece off its target so that one side faces it.",
    "furniture id=t table at (0,0) size 800x800\nfurniture chair at (175,175) size 450x450 facing t   # error: the chair stands inside the table",
  ),
  E_FACING_CONFLICT: e(
    "A piece states its turn twice.",
    "`facing <id>` derives the quarter-turn, so it cannot be written beside `rotate`, `against wall …` or `against <room>.<edge>`, which each state or derive the turn too (ADR 0029 §3). One source of truth for the turn.",
    "Keep `facing` and drop `rotate` (or place the piece with `at` or `in <room> …`), or keep the other clause and drop `facing`.",
    "furniture id=t table at (0,0) size 800x800\nfurniture chair at (175,850) size 450x450 rotate 180 facing t   # error: two turns",
  ),
  E_FACING_SYMMETRIC: e(
    "A piece with no front cannot face anything.",
    "The catalogue marks a category `symmetric` when its symbol has no front or back (a table, a stool, a rug), so a derived turn would change nothing anyone could see (ADR 0029 §3).",
    "Drop `facing` from the symmetric piece; put `facing` on the pieces that face it instead.",
    "furniture id=c chair at (0,0) size 450x450\nfurniture table at (0,900) size 800x800 facing c   # error: a table has no front",
  ),
  E_FACING_TRANSPOSED: e(
    "Facing the target would put the piece's back on its short side.",
    "A catalogued piece with a non-square footprint has a back on a long side (a wardrobe is 1800 along x 600 deep). When the turn that faces the target would put the back on a short side, the `size` was written the wrong way round, and the symbol would be drawn stretched (ADR 0029 §3).",
    "Swap the `size` (the message gives it), so that the footprint's long side runs across the direction the piece faces.",
    "furniture id=b bed at (0,0) size 1500x2000\nfurniture tv_unit at (2500,800) size 1500x450 facing b   # error: write size 450x1500",
  ),
  W_UNKNOWN_FURNITURE: w(
    "A furniture word is not a catalogued kind but is close to one.",
    "An unknown furniture word is legal and draws a blank rectangle, so a misspelt kind (`grand_pianno`, `WC`) passed silently. Reported for an unlabelled piece whose word is within two edits of a catalogued kind, or is one in another case; a `label` marks a piece of your own.",
    "Write the kind the message names, or add a `label`.",
    'furniture grand_pianno at (0,0) size 1500x1500   # warning: did you mean "grand_piano"?',
  ),
});
