/**
 * Error catalogue: the furniture-checks family. The `furniture` lint family: overlaps, clearances,
 * fixtures against walls, windows, stairs and voids.
 *
 * Spread into `ERROR_CATALOG` by `src/error-catalog.ts`; each code is written once, as its key.
 */

import { CANONICAL_FIXTURES } from "../elements/fixtures-glyphs.js";
import { defineEntries, w } from "./entry.js";
import { fixtureSpec } from "../fixtures-catalog.js";

/**
 * The canonical fixture families carrying catalogue flag `flag`, as prose: "`a`, `b` and `c`".
 * DERIVED from the catalogue, so a cause that names the families a rule reads cannot go stale
 * when a family gains or loses the flag.
 */
const familiesWith = /* @__NO_SIDE_EFFECTS__ */ (flag: "tall" | "fixedAspect" | "wallMounted"): string => {
  const words = CANONICAL_FIXTURES.filter((c) => fixtureSpec(c)?.[flag] === true).map((c) => `\`${c}\``);
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
};

export const FURNITURE_CHECKS_ENTRIES = defineEntries({
  W_FURNITURE_OVERLAP: w(
    "Two pieces of furniture overlap.",
    "Two furniture/fixture rectangles occupy the same floor area, so they would physically collide — usually a coordinate or size mistake.",
    "Move or resize one so they no longer intersect; leave a walkway between them.",
    "furniture sofa at (300,300) size 2000x900\nfurniture bed  at (1000,500) size 1500x2000   # lint: overlaps the sofa",
  ),
  W_FIXTURE_FLOATING: w(
    "A plumbing/kitchen fixture is not against a wall.",
    "A fixture that conventionally needs a wall behind it (WC, basin, shower, sink, counter, stove, fridge…) sits with no wall backing any edge — it appears to float in the middle of the room.",
    "Move the fixture so one edge is against a wall (supply/waste/venting runs in the wall), or remove it.",
    "furniture wc at (3000,3000) size 400x700   # lint: no wall behind it",
  ),
  W_FIXTURE_BACK_TO_ROOM: w(
    "A fixture stands against a wall but faces the wrong way.",
    "A fixture whose symbol has a distinct back — a plumbed one (a WC's cistern, a basin's tap, a counter's nosing) or a piece of furniture that simply has a front (a bed's headboard, a wardrobe's door line, a bookshelf's open face) — is touching a wall, but its back is turned to the room instead of to that wall: the drawing shows the WC's tank, or the headboard, sticking into the floor space. Position right, quarter-turn wrong: fixture symbols are drawn with their back on the TOP edge, so `rotate` is what aims them (0 = back to the north, 90 = east, 180 = south, 270 = west). A rotation-symmetric symbol (a shower tray, a round stool) never trips this, nor does arranged seating whose back to the room is a legitimate layout. A fixture that touches no wall at all is `W_FIXTURE_FLOATING` instead — and only where the piece genuinely needs one for services, which furniture does not. A piece that touches a wall only with a side or an end its catalogued footprint rules out as a back, its drawn front off the wall too (a bed lengthwise along a wall, a wardrobe end-on to one), is a layout, not a back to the room, and is not judged; a piece whose front is on a wall is, and so is a plumbed or vented fixture or a wall-mounted one (the catalogue's `wallMounted` families: " +
      familiesWith("wallMounted") +
      "), because its back must reach any wall it touches.",
    "Get the plan `size` right first, then the `rotate`. `size` is W×H in plan axes, and a fixture's catalogued depth runs AWAY from the wall it backs onto, so the size decides which walls it can back onto: a WC (400 along × 700 deep) is `size 400x700` against a north or south wall and `size 700x400` against an east or west one. With the size right, add the `rotate` that puts the back on the walled edge (0 = back to the north, 90 = east, 180 = south, 270 = west); the machine-applicable fix inserts it when exactly one walled edge fits the size. Or let it be derived: `in <room> anchor <edge>` derives the rotation once the size fits that edge, and `against wall <id>` takes `size` as along×depth and derives both. A `rotate` on a size the wrong way round silences this warning but draws the symbol squashed. A square size, or a family whose catalogued footprint is square (`counter`, `stove`), can back onto any edge.",
    "furniture wc at (5200,5200) size 400x700   # warning: south wall behind it, cistern facing north",
  ),
  W_FURN_CLEARANCE: w(
    "A fixture's use-space is blocked.",
    "The activity clearance directly in front of a fixture (WC, basin, sink, counter, stove…) is intruded by a free-standing piece of furniture, so the fixture can't be used comfortably. Other plumbing/kitchen fixtures are ignored, so a compact bathroom/kitchen run does not trip this. The warning states the catalogued clearance, the depth actually left, and the shortfall.",
    "Move or shrink the obstructing furniture by the shortfall the warning quotes, turn the fixture so its front faces clear floor (its back must stay on a wall), or move the fixture to a wall run with the clearance free in front of it.",
    "furniture stove at (0,0) size 600x600\nfurniture sofa at (0,650) size 2000x900   # lint: sofa blocks the stove front",
  ),
  W_FURN_CLEAR_FRONT: w(
    "A declared `clear front` is not free.",
    "The piece declares `clear front <mm>` (ADR 0029 §4) and something stands inside that depth in front of it: a solid piece of furniture, a wall body, or a hinged door's swing. The warning states the declared depth, the depth measured free and what stands there. Only a piece that declares the zone is judged, never by a catalogue default. An obstacle that only touches the zone at a point or along a line leaves it clear. A catalogued clearance is a floor: a shallower declared `clear front` does not silence `W_FURN_CLEARANCE`, and both are measured.",
    "Move the obstruction or the piece apart by the shortfall the warning quotes, or lower the declared depth if less will do.",
    "furniture wardrobe at (0,0) size 1800x600 clear front 600\nfurniture bed at (0,900) size 1500x2000   # lint: the bed leaves 300 mm",
  ),
  W_FURN_CLEAR_SIDES: w(
    "A declared `clear sides` is not free.",
    "The piece declares `clear sides <mm>` (ADR 0029 §4): that depth must be free along both edges beside its back (a bed's long sides). A solid piece, a wall body or a door swing stands inside it on at least one side. The warning names the narrower side's free depth.",
    "Move the obstruction or the piece apart by the shortfall, or declare only the zones the piece needs.",
    "furniture bed at (0,0) size 1500x2000 clear sides 500\nfurniture wardrobe at (1700,0) size 600x1800   # lint: 200 mm on the right side",
  ),
  W_SEAT_FACING_AWAY: w(
    "A chair at a table faces away from it.",
    "A chair, office chair or outdoor chair stands within reach of a table or desk in the same room (600 mm on both axes, `seatTableReachMm`), but its front ray, from the middle of its front edge, enters no such table within that reach: it is drawn with its back to the table it is sat at. At `rotate 0` a symbol's back is to the north. A chair that declares `facing` is not judged.",
    "Add `facing <table id>` to the chair (the hint names the nearest table and the turn it derives), or give it the `rotate` that turns its front to the table.",
    "furniture table at (0,0) size 800x800\nfurniture chair at (175,850) size 450x450   # lint: south of the table, facing south",
  ),
  W_WC_SIDE_CLEARANCE: w(
    "A WC's centreline is too close to a wall or fixture at its side.",
    "A `wc` (or `toilet`) has its centreline nearer than the ruleset's `wcSideClearanceMm` to a side obstacle: the face of a straight wall, or a fixture or piece of furniture beside the pan (a mirror or wall cabinet above it, a rug under it and a door's swing do not count, and a doorway or cased opening in the wall beside it is a gap, measured to its jamb). Its sides are the two edges beside its back (its `rotate`), measured square to the centreline over the pan's depth, from the drawn footprint to the drawn shape beside it, never from bounding boxes. A WC beside a curved wall is not judged (a `curved-wc-wall` coverage skip). The figure is 400 mm by default (the low end of the 400–500 mm of Approved Document M4(2) Diagram 2.5), 381 mm under `us-residential-advisory` (IRC P2705.1, 15 in), 400 under `uk-residential-advisory` and 450 under `accessibility-advisory` (Approved Document M Vol 1's 450–500 mm for a wheelchair user's WC), as advice, never compliance (ADR 0005). Set `wcSideClearanceMm: null` to turn it off.",
    "Slide the pan along its back wall away from the obstacle by the shortfall (the hint says whether its other side then still keeps the figure), move the obstacle, or move the pan to a run wide enough for twice the figure. There is no machine fix: the edit depends on how the pan was placed.",
    "furniture wc at (0,0) size 400x700\nfurniture basin at (500,0) size 600x450   # lint: centreline 300 mm from the basin",
  ),
  W_ACCESSIBLE_WC_SIDE_WALL: w(
    "An accessible WC's pan stands too far from every side wall.",
    'A `wc` (or `toilet`) in a room whose label says "accessible", "wheelchair" or "disabled" (as a whole word, not negated: "Non-accessible" and "Inaccessible" are not) has its centreline farther than the ruleset\'s `wcAccessibleSideWallMaxMm` (500 mm) from the face of the straight wall on either side of it, so no grab rail can be fixed within reach of the pan and there is no wall to transfer against. Its sides are the two edges beside its back (its `rotate`), measured as `W_WC_SIDE_CLEARANCE` measures, square to the centreline over the pan\'s depth, from the drawn footprint to the drawn wall body; a fixture beside the pan does not count, and a doorway is a gap measured to its jamb. A WC beside a curved wall is not judged (a `curved-wc-wall` coverage skip), nor is one more than twice the figure wide (`wide-wc-pan`). The figure is the high end of the 400–500 mm WC centreline to the adjacent wall of Approved Document M Vol 1 (2015) M4(2) Diagram 2.5 and of the 450–500 mm of its M4(3) Diagrams 3.11 and 3.16; the ADA 2010 Standards 604.2\'s 16–18 in (406–457 mm) lies inside it. Advice, never compliance (ADR 0005). Set `wcAccessibleSideWallMaxMm: null` to turn it off.',
    "Slide the pan along its back wall toward the nearer side wall until its centreline stands 400–500 mm from that wall's face (the hint gives the slide), or move it into a corner. There is no machine fix: the edit depends on how the pan was placed.",
    'wall id=w exterior thickness 200 { (0,0) (3000,0) (3000,2500) (0,2500) close }\nroom id=r at (0,0) size 3000x2500 label "Accessible WC" uses wc\nfurniture wc against wall w segment 0 offset 1500 in r   # lint: centreline 1400 mm from either side wall',
  ),
  W_FURNITURE_OVER_WINDOW: w(
    "A tall unit stands in front of a window, or a low piece against a floor-length one.",
    "A tall unit (the catalogue's `tall` families: " +
      familiesWith("tall") +
      ") has a footprint that overlaps a window's span on its straight host wall, within the ruleset's `fixtureWallTolMm` (300 mm) of the wall's centreline on either side: it stands against the wall, across the glass, blocking the window's light and view. Measured from the drawn footprint and the window's span, never from bounding boxes. A window whose sill is at or above 2100 mm (a door head) is a high window over full-height storage and is not judged; a window on a curved wall is not measured (a `curved-window-host` coverage skip). A window with `sill 0` has no sill to stand a low unit under, so any other piece at the cut plane warns too when it overlaps that span and stands on the wall's face (not a rug or an overhead piece, and not a cooking surface, which is `W_HOB_UNDER_WINDOW`'s). A window with no `sill` clause takes the 900 mm default and is not read this way.",
    "Slide the unit along the wall clear of the window's span (the hint gives the shorter slide), move the window, or stand a unit no higher than the sill there instead: a worktop, a chest of drawers or a washer goes under a window, a fridge or a wardrobe beside it.",
    "wall id=w exterior thickness 200 { (0,0) (4000,0) }\nwindow at (2000,0) width 1200 wall w\nfurniture fridge at (1700,100) size 600x650   # lint: in front of 600 mm of the window",
  ),
  W_FIXTURE_WRONG_ROOM: w(
    "Fixture is not inside its declared room.",
    "A furniture item declared `in <roomId>` has part of its FOOTPRINT off that room's floor, so it is drawn partly (or mostly) in the wrong space. A 100 mm overhang is allowed on every side, because a room's outline runs down wall centrelines and a piece pushed against a room edge legitimately shares that band. Measured against the room's true floor, so a `polygon` or `circle` room is judged by its own shape and not by a bounding box.",
    "Move the fixture inside the named room, or correct the `in <roomId>`.",
    'furniture wc at (100,100) size 400x700 in bath   # lint: not inside "bath"',
  ),
  W_FURNITURE_WALL_COLLISION: w(
    "Furniture penetrates a wall.",
    "A furniture/fixture rectangle intrudes into a wall's solid (it crosses the wall's thickness band rather than sitting flush against its face), so it would physically pass through the wall — a coordinate or size mistake. A piece merely touching the wall face is fine. Measured in the wall's own frame, so a wall at any angle is checked; a CURVED wall edge (`arc`) is not checked at all.",
    "The message names the wall the piece crosses by its kind and the line it runs on, and how far into its thickness; the hint names it by id. For a piece placed `against wall <id>`, `offset` is the distance along that wall to the piece's CENTRE, not its edge (omitted, it is the segment's midpoint): a 600 mm fridge at `offset 4100` spans 3800–4400 along the wall, so it crosses a 100 mm partition standing at 4000; the hint gives the `offset` that clears it. Otherwise move or resize the piece so it sits fully inside the room, against the wall face rather than through it, or place it with `against wall <id>` or `in <room> anchor <edge> flush`.",
    "furniture sofa at (350,2300) size 2000x900   # lint: crosses the partition at y3000",
  ),
  W_FOOTPRINT_TRANSPOSED: w(
    "A piece is drawn turned a quarter: its long side is on the wrong axis.",
    "A piece's symbol is drawn back-on-top in a frame `size` gives (its two sides swapped under `rotate 90` or `270`; along × depth for `against`), and this frame has its long side where the catalogue footprint has its short one, by at least 5:4 (`4 × long ≥ 5 × short`, exact). A `sofa_l` (2600 × 1600, wider than deep) written `size 900x2400` with no `rotate` draws a thin L one seat deep, its long side become its depth; a `bed` (1500 × 2000, deeper than wide) written `size 1900x700` draws a bed lying across its own length, its long side along its back. Judged only for the families that come in one shape, which the catalogue marks `fixedAspect`: " +
      familiesWith("fixedAspect") +
      ". A chaise longue is not: its back is at a short end or along a long side, by model. A family sold in both shapes (a wardrobe, a filing cabinet, a locker, a shed, a sink, a desk) is never judged, nor is a piece with no catalogued footprint (a plain `sofa`).",
    "Swap the two sides of `size`, or keep it and turn the symbol a quarter (add 90 to `rotate` or take 90 from it, whichever puts its back where it belongs; an `against` piece takes its turn from the wall, so only the swap applies there, and a piece meant side-on to a wall, a crib or a treadmill with its long side along it, is placed `at (x,y)` or `in <room> anchor <edge> flush` with a `rotate` instead; the hint gives the numbers). When `size` is one literal (`900x2400`) and the swapped size, as drawn on the plan's grid, is exactly the catalogue footprint, a fix swaps it; it is `maybe-incorrect` (`archlang fix --unsafe`), because the swap changes which floor the piece covers.",
    'room id=lounge at (0,0) size 5000x4000 label "Lounge"\nfurniture sofa_l at (500,500) size 900x2400   # lint: a sofa_l is 2600 wide and 1600 deep; this one is drawn 900 wide and 2400 deep',
  ),
  W_HOB_UNDER_WINDOW: w(
    "A hob stands under a window.",
    "A cooking surface (`stove`, `hob`, `cooktop`) stands against a window's wall across part of its span, on either side of the wall: its footprint overlaps, with positive area, the window's span within `fixtureWallTolMm` (300 mm) of the wall's centreline, the band `W_FURNITURE_OVER_WINDOW` reads for a tall unit. A curtain or blind then hangs over the flames, and opening the window means reaching across the burners: the NKBA Kitchen Planning Guidelines (guideline 20, cooking surface safety) say not to locate the cooking surface under an operable window. Every window is judged, whatever its kind, because a curtain hangs in front of a pane that does not open too; one whose sill is at or above 2100 mm is out of reach and is not, and one on a curved wall is not measured. Every plan is read, a café's kitchen as a dwelling's.",
    "Slide the hob along its wall past the window's nearer end (the hint gives the distance) and stand the sink or a worktop under the window, or move the window. There is no machine-applicable fix: which one moves is the author's choice.",
    "wall id=w exterior thickness 200 { (0,0) (4000,0) }\nwindow at (2000,0) width 1200 wall w\nfurniture stove at (1700,100) size 600x600   # lint: under 600 mm of the window",
  ),
  W_HOB_FRIDGE_GAP: w(
    "A fridge or other tall unit stands too close beside a hob.",
    "A cooking surface (`stove`, `hob`, `cooktop`) has a fridge or other tall unit (a wardrobe, bookcase or locker) beside it nearer than `hobLandingMm` (305 mm by default): measured from the hob's side face, over its depth, to the unit's drawn footprint. The hob's sides are the two edges beside its back (its `rotate`). The NKBA Kitchen Planning Guidelines (guideline 17) ask for 12 in (305 mm) of landing area on one side of a cooking surface and 15 in on the other, so a tall unit inside 12 in leaves either side short. A wall between them ends the measure (a fridge behind a partition is not beside the hob); rooms do not, so a dining room's fridge across an open-plan join counts. A wall beside the hob is not judged by this rule. Every plan is read. Set `hobLandingMm: null` to turn it off.",
    "Move the hob or the tall unit apart by the shortfall the warning quotes and stand a worktop between them, or stand the tall unit at the far end of the run. There is no machine-applicable fix.",
    'room id=k at (0,0) size 4000x2400 label "Kitchen"\nfurniture stove at (1600,100) size 600x600\nfurniture fridge at (2300,100) size 600x650   # lint: 100 mm from the hob, 200 mm short',
  ),
  W_FURNITURE_ON_STAIR: w(
    "Furniture stands on a stair or on the landing it owes.",
    "A piece's footprint overlaps the part of a `stair` a person cannot stand under, or the landing beyond the end the flight is entered from on this storey: as wide as the flight, as deep as the flight is wide (at least 1200 mm in a building other than a dwelling), and only as deep as the floor stands clear, as `W_STAIR_NO_LANDING` measures it. Approved Document K (2013) 1.21b keeps a landing clear of permanent obstructions. On a storey the flight rises from, that part is the run with less than 2 m of headroom, read against the storey height (3000 mm when the plan authors none), so a wardrobe under the high end of a flight is not reported. A block stair rises over its flights alone, so a landing with less than 2 m beneath it is read whole. A stairwell, where a flight comes down or arrives from below, is a hole: all of its footprint is read. `finish` keeps off the whole footprint either way. On the landing a rug, which is walked on, and a wall cabinet, which hangs above it, are not. A landing a curved wall stands near is not judged, and an `elevator` or `escalator` is not read here (`W_FURNITURE_ON_VOID` reads them).",
    "Move or resize the piece so it clears the span the hint quotes, or move the stair. There is no machine-applicable fix: where the piece goes instead is a design decision.",
    'room id=liv at (0,0) size 5000x4000 label "Living"\nstair id=s1 at (3000,500) size 1000x3000 dir up\nfurniture sofa at (2500,1000) size 900x2000 rotate 90   # lint: stands on the flight',
  ),
  W_FURNITURE_ON_VOID: w(
    "Furniture stands on a void, a lift shaft or an escalator.",
    "A piece's footprint covers more than 1 mm both ways of a `void` of its own storey (a hole in that floor: a stairwell, an atrium, a double-height room), an `elevator`'s shaft or an `escalator`'s footprint. There is no floor there to stand on, so whatever stands there is read, a rug as much as a wardrobe. A `void` on the storey above is headroom, not a hole in this floor, and is not read. A `stair` itself is not read here (its flights and landings are `W_FURNITURE_ON_STAIR`'s), but a `void` is read whatever else stands on it, so a stairwell drawn as a `stair` and a `void` on one rectangle can raise both codes for one piece. `finish` keeps every piece off the same rectangles. One warning per piece and void or shaft.",
    "Move or resize the piece so it clears the span the hint quotes, or move the void, lift or escalator. There is no machine-applicable fix: where the piece goes instead is a design decision.",
    'room id=liv at (0,0) size 6000x5000 label "Living"\nvoid id=v at (0,0) size 3000x2500\nfurniture sofa at (1000,500) size 2000x900   # lint: stands on the void',
  ),
  W_BED_UNDERSIZED: w(
    "A bed is drawn smaller than the smallest standard bed.",
    "A `bed`, `double_bed` or `bunk_bed` is drawn shorter than `bedMinLengthMm` along its longer side (1900 mm by default) or narrower than `bedMinWidthMm` across its shorter side (750 mm by default). The defaults are the smallest standard UK bed, the small single of 75 × 190 cm, whose length every standard UK size below a king shares (Which?, *UK mattress sizes: bed and mattress size guide*, 2026: a consumer magazine, not a standard). They are mattress sizes, so a real bed's frame is at least that. The usual case is a bed cut short to clear another piece, or a piece that is not a bed (an examination couch) drawn as one. The longer side is read as the length whichever way `size` is written; a bed lying across its own length is `W_FOOTPRINT_TRANSPOSED`. A `crib` or `cot` is short by design and is never judged. Set either figure to `null` to turn its finding off, or to another value for another market.",
    "Draw the bed at least the length and width the warning quotes, and move whatever it was cut short to clear. There is no machine-applicable fix: lengthening a bed moves it into its neighbours. A piece that is not a bed has no catalogue family yet; the warning stands until it does.",
    'room id=b at (0,0) size 3000x3000 label "Bedroom"\nfurniture bed at (200,200) size 900x1500   # lint: 1500 mm long, 400 mm under the 1900 mm of a UK single',
  ),
});
