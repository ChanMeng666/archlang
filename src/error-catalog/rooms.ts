/**
 * Error catalogue: the rooms family. Room geometry, and the lint families that judge a room
 * (`rooms`, `classification`, `contents`, `orientation`, `daylight`).
 *
 * Spread into `ERROR_CATALOG` by `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const ROOMS_ENTRIES = defineEntries({
  E_ARC_RADIUS: e(
    "Arc radius too small for its chord.",
    "An `arc (x,y) radius R` edge asks for a circle of radius R through the previous vertex and this one, but R is less than half the straight-line distance between them (or is not positive) — no such circle exists.",
    "Raise the radius to at least half the chord (the message states the minimum), or move the endpoints closer together. `archlang fix` applies the minimum for you.",
    "wall exterior thickness 200 { (0,0) arc (10000,0) radius 3000 }   # error: needs R >= 5000",
  ),
  E_ROOM_RADIUS: e(
    "Circular room needs a positive radius.",
    "A `room circle at (cx,cy) radius R` has R of zero or less, so it encloses no floor — there is no area, no centroid and no containment test to compute.",
    "Give the room a positive radius in millimetres.",
    "room circle at (5000,5000) radius 0   # error: no floor",
  ),
  E_ROOM_NOT_RECTANGLE: e(
    "A room-edge datum meets a circle, a slanted polygon, a polygon side of several runs or a polygon's centre; a `wall … between`/`wall … around` meets a polygon or circle room; or `walls from rooms` or a door or opening placed `between` two rooms meets a circle or a polygon with a slanted edge.",
    "Datums (`top`, `bottom`, `left`, `right`, `cx`, `cy`) are the four edges and the centre of a RECTANGULAR room. A rectilinear polygon (every edge horizontal or vertical) has edges too: `top`, `bottom`, `left` and `right` are the ring's run on its outermost line, one run or a refusal (the prongs of a U do not say which), and `cx`, `cy` are refused, since the middle of the outline may not be floor. The pairwise `wall … between`/`wall … around` derive their walls from a rectangle's edges. A circle or a slanted polygon has no such edges, and its bounding box is not its floor, so the compiler refuses instead of guessing (ADR 0028 §2, §4). `walls from rooms` and `door|opening … between` read the ring as well, so a rectilinear polygon is legal there; a circle, or a polygon with any other edge, shares no edge run, and is refused the same way (§3, §5). For a pairwise wall or a `between` the span points at the room's name.",
    "Write the coordinate as a number, or read a side the room has. For `walls from rooms`, leave the room out with `{ except <room> }` and draw its walls by hand, or make its edges horizontal and vertical; for a pairwise wall, type its points; for a door or opening, place it `on <wall> at …` or `at (x,y)`.",
    "room id=T polygon (0,0) (6000,0) (3000,4000)\nwall interior thickness 100 { (T.left, 0) (T.left, 4000) }   # error: T has a slanted edge",
  ),
  E_ROOMS_NOT_TILING: e(
    "`walls from rooms`, or a `wall … around`, meets rooms that do not tile one connected floor.",
    "`walls from rooms` draws the exterior ring on the outline of the rooms' union and a partition on every shared edge, so the rooms must form one edge-connected floor: two rooms touching only at a corner, a union pinched at a single point, or a gap between rooms (a hole, or a corridor left as 'the leftover') has no single outline to wall. A hole is legal only when `outdoor` surfaces (a courtyard, which gets an inner ring) or a `void` (no wall) of the same plan or component cover it exactly. `wall … around [<rooms>]` draws the same outline as one wall, so the same rule holds, except that it refuses every hole: one wall is one ring, and a courtyard needs `walls from rooms`. The compiler refuses and names the rooms rather than guess where the missing floor is (ADR 0028 §3, §4, ADR 0005).",
    "Write the leftover floor as a room of its own (a corridor, a lobby), move the rooms so they meet edge to edge, or cover a courtyard exactly with an `outdoor` surface (under `walls from rooms`; round a hole, type the rings' points).",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (5000,0) size 3000x3000\nwalls from rooms exterior 200 partition 100   # error: a and b do not touch\nwall exterior thickness 200 around [a b]   # error: the same, as one ring",
  ),
  E_ROOMS_OVERLAP: e(
    "`walls from rooms`, a `wall … between`/`wall … around`, or a door or opening `between` a polygon and a room, meets two rooms that overlap.",
    "Two rooms of the set share floor with positive area, so the edge between them is not one line and no partition (nor a `wall … between` the pair, nor one outline `around` them, nor a door on a polygon's edge) can be derived on it. A room listed twice in `around [ … ]` would overlap itself and is refused the same way, on the repeated name. The compiler refuses and names every overlapping pair rather than choose which room owns the shared floor (ADR 0028 §3, §4).",
    "Move or resize the rooms so they meet edge to edge; the shared edge becomes the partition. Name each room once.",
    "room id=a at (0,0) size 4000x3000\nroom id=b at (3000,0) size 3000x3000\nwalls from rooms exterior 200 partition 100   # error: a and b overlap by 1000 mm\nwall partition thickness 100 between a and b   # error: the same pair",
  ),
  E_ROOM_POLY_DEGENERATE: e(
    "Polygon room has fewer than three effective vertices.",
    "After removing duplicate and straight-through (collinear) points, the ring encloses no area — so it has no floor, no centroid and no containment test.",
    "Give the room at least three vertices that actually turn a corner.",
    "room polygon (0,0) (4000,0) (8000,0)   # error: all three are collinear",
  ),
  E_ROOM_POLY_SELF_INTERSECT: e(
    "Polygon room intersects itself.",
    "Two of the ring's edges cross (or run along each other), so the polygon is not simple and which side is 'inside' is undefined — area, containment and adjacency would all be meaningless.",
    "Reorder the vertices so the ring is traced once around the room without crossing itself (a bow-tie usually means two vertices are swapped).",
    "room polygon (0,0) (4000,4000) (4000,0) (0,4000)   # error: bow-tie",
  ),
  E_ROOM_SIZE: e(
    "Room must have a positive size.",
    "A room's width or height evaluated to zero or a negative number.",
    "Give the room a positive `size W x H`.",
    "room at (0,0) size 0x4000   # error: width is 0",
  ),
  W_ROOM_OVERLAP: w(
    "Rooms overlap.",
    "Two room rectangles intersect. At most the first 200 overlapping pairs are listed; one final warning counts the rest (`…and N more room pairs overlap`).",
    "Adjust positions/sizes if the overlap is unintended (it is allowed).",
    "room at (0,0) size 2000x2000\nroom at (1000,0) size 2000x2000   # warning",
  ),
  W_BEDROOM_NO_WINDOW: w(
    "Bedroom has no window.",
    "A room labelled as a bedroom has no window on its perimeter (natural light / egress).",
    "Add a `window` on an exterior wall of the room.",
    'room at (0,0) size 3000x4000 label "Bedroom"   # lint: no window',
  ),
  W_ROOM_DISCONNECTED: w(
    "Room has no door — it can't be entered.",
    "No door lies on any of the room's walls, so there is no way into the room.",
    "Add a `door` on one of the room's walls.",
    "room id=r at (0,0) size 3000x3000   # lint: no door on its perimeter",
  ),
  W_ROOM_TOO_SMALL: w(
    "Room is implausibly small.",
    "A room's floor area is below the minimum for its use. A room is held to the generic minimum (default 4 m²) unless every use it has (its `uses`, or its label when it has none) has a floor of its own: a WC 1.1 m² and a bathroom 2.0 m² (GB 50096-2011 5.4.2, read as advice), while a store, utility room, hall, circulation space or entry has no area floor at all (a passage is judged by its width, `W_PATH_TOO_NARROW`). A room with several uses takes the highest floor among them, and a room with no classified use keeps the generic minimum. The per-use floors are the `minRoomAreaByUseM2` ruleset setting, merged per use, so a profile or a caller can change one and keep the rest. A profile or caller that sets the generic minimum itself holds every room to at least it (`accessibility-advisory`: 5 m²), since no researched accessible per-use floors exist yet. Under a residential-advisory profile (`cn-`, `uk-`, `us-residential-advisory`) the per-use floors are read on the room's net floor inside the walls, as their sources measure a room, and a bedroom whose bed makes it a double is held to the profile's double-bedroom floor.",
    "Increase its `size`, or merge it into an adjacent space.",
    'room at (0,0) size 1000x1000 label "Nook"     # lint: 1 m²',
  ),
  W_ROOM_NOT_ENCLOSED: w(
    "Bathroom is not fully enclosed.",
    "A run of this bathroom/WC's perimeter is not backed by a wall, so it is open to the adjacent space — a privacy problem for a wet room (a partition that stops short is the usual cause).",
    "Extend the partition so the room's perimeter is walled on all sides (a door/window in the wall is fine — only a missing wall counts).",
    "wall partition thickness 100 { (4000,0) (4000,4000) }   # lint: stops short, bath left open",
  ),
  W_ROOM_NO_FIXTURE: w(
    "Bathroom or kitchen has no fixtures.",
    "A room labelled as a bathroom or kitchen contains no plumbing/kitchen fixture (WC, basin, shower, sink, counter…), so it is drawn as an empty box.",
    "Place a fixture inside the room; the categories are built in, so nothing needs importing. A bathroom or WC takes a `wc`, `basin`, `shower` or `bathtub` (e.g. `furniture wc in bath anchor top flush size 400x700`); a kitchen takes a `kitchen_sink`, `counter`, `stove` or `fridge` (e.g. `furniture kitchen_sink in kitchen anchor top flush size 800x600`). A bare `sink` counts for either. A `circle` or slanted `polygon` room cannot take `anchor`: place the piece `at (x,y)` with `in <roomId>` instead. The hint quotes the pieces that make the room what it is, checked together: a `bathtub` or `shower` for a bathroom, a `wc` for a WC, a sink and a hob for a kitchen, and the defining piece of any other use the room has. One fixture alone would leave a furnished room still missing its defining piece, which `W_ROOM_MISSING_DEFINING` reports.",
    'room at (4000,4000) size 3000x2000 label "Bath"   # lint: no fixtures inside',
  ),
  W_ALIAS_MATCH: w(
    "A room's use was inferred from an indirect alias, not stated.",
    "A room has no authored `uses`, and its function was guessed from its label (or, when it has no label, from its id) via a non-canonical alias (an indirect term like `powder` → WC, `foyer` → entry) rather than a direct word (`wc`, `entrance`). A room with no label is named in the message by where it stands, never by its id; the id and the term taken from it are in the hint. The guess is reasonable but the intent is implicit, so a reader (or agent) cannot tell the classification was assumed.",
    "Add an explicit `uses …` to the room stating the inferred function — the machine-applicable fix inserts it for you. This pins the classification without changing the room's `describe()` type.",
    'room at (0,0) size 2000x1500 label "Powder"   # warning: WC inferred from the alias "powder"; add `uses wc`',
  ),
  W_ROOM_NOT_EQUATOR_FACING: w(
    "A habitable room has windows, but none faces the equator side.",
    "The plan declares `site`, so the equator-facing side is known (`S` in the northern hemisphere, `N` in the southern), and a habitable room — a bedroom, living or dining space — has at least one window with none of them on that aspect. **This is a drafting heuristic, not a measured daylight outcome:** it says the room's windows do not face the equator, and nothing more. A south window in Reykjavík and one in Singapore are not the same daylight, and this rule does not distinguish them (there is no sun model, latitude or date anywhere in ArchLang). The rule cannot fire at all in a plan with no `site`, and a room with NO window is `W_BEDROOM_NO_WINDOW`'s report, not this one.",
    "Move a window onto the room's equator-facing facade, or accept the aspect — an urban plot often has no equator-facing wall to spare. There is deliberately NO machine fix: the remedy is a geometric decision (which facade, which wall, what else it displaces) and the compiler does not make those (ADR 0005).",
    'site { street north }   # equator side is S\nroom id=liv at (0,0) size 4000x3000 label "Living"\nwindow on north_wall at 50% width 1200   # warning: the only window faces N',
  ),
  W_GARAGE_TOO_NARROW: w(
    "A garage is too narrow, or too shallow, to park in.",
    'A room classified as a garage (an authored `uses garage`, or a label the use vocabulary reads as one — "Garage", or the aliases "carport" / "parking") measures less across its short side than the cars in it need: 2700 mm of clear width per bay, which is a body plus the room to open a door on each side. A garage with no `car` fixture drawn is measured against ONE bay — a room you could not park in does not become sound by having no car in it — and `bicycle`/`motorcycle` do not count toward the bay total. The warning states the width required, the width the room actually has, and the shortfall. **The rule declines a POLYGON room** rather than measuring its bounding box: a box\'s short side is not a concave floor\'s clear width, and a measurement taken from a shape\'s box instead of the shape is a defect class this compiler has shipped before. **A second finding judges its DEPTH** (plan-soundness PS2.70): a rectangular garage measures less, between the inner faces of the walls on the edge holding its vehicle door and the edge opposite, than `garageDepthMm` along the line of its `door garage`: 5000 mm by default, the length of a parking bay or a car port (Buckinghamshire parking guidance 2022, Table 9; Monmouthshire SPG Domestic Garages 2013 ¶21), and 6000 mm under `uk-residential-advisory`, the clear internal length of a garage (Monmouthshire ¶12 and ¶25, citing Manual for Streets; Buckinghamshire Table 11). The depth asked is the same whatever the bay count. A garage with several vehicle doors is measured along the deepest axis; one with no `door garage` is not measured and files a `no-vehicle-door` coverage skip. Set `garageDepthMm: null` to turn the depth finding off. It is advisory and has no machine fix: widening or lengthening a room moves every wall and opening around it, which is a geometric decision the compiler does not make (ADR 0005).',
    "Widen the room, or lengthen it along the line of its vehicle door, to the figure the warning quotes, park fewer cars in it, or drop the `uses garage` tag if the room is not one (a store that happens to be called a garage classifies as one from its label alone — an explicit `uses storage` overrides that).",
    'room id=g at (0,0) size 2500x6000 label "Garage" uses garage\nfurniture car at (300,300) size 1800x4600 in g   # lint: 2500 mm across, one bay wants 2700',
  ),
  W_GARAGE_OPENING_UNDERSIZED: w(
    "A garage's vehicle door is too narrow to drive a car through.",
    "A rectangular room classified as a garage has a `door garage` on its perimeter too narrow for the cars drawn in it. One car, or none drawn (measured as one), wants a vehicle door at least 2400 mm wide; two or more cars want one door at least 4200 mm wide, or two doors each at least 2400 mm (a door per bay). The cars are counted as `W_GARAGE_TOO_NARROW` counts its bays (`car` fixtures only). **The figures are common practice for a sectional or roller door, not a published standard:** no citable code source for them was found, and the rule does not pretend to one. It judges the OPENING only; the room's width, which already budgets the room to open a car door on each side of every bay, stays `W_GARAGE_TOO_NARROW`'s, and this adds no second clearance. A garage with no `door garage` on its perimeter, and a polygon or circle garage, is not judged. It is advisory and has no machine fix: widening a door moves what stands beside it in the wall, a geometric decision the compiler does not make (ADR 0005).",
    "Widen the vehicle door to the figure the warning quotes, add a second vehicle door for a double garage, park fewer cars in the room, or drop the `uses garage` tag if the room is not one.",
    'wall id=shell exterior thickness 200 { (0,0) (6400,0) (6400,3800) (0,3800) close }\nroom id=g at (0,0) size 6400x3800 label "Garage" uses garage\ndoor id=d garage at (0,1900) width 2000 wall shell   # lint: 2000 mm wide, one car wants 2400',
  ),
  W_ROOM_TOO_NARROW: w(
    "A room is narrower than its profile asks of its use.",
    "Raised only under a residential-advisory lint profile (`cn-`, `uk-`, `us-residential-advisory`); the default ruleset asks no room a width. A rectangular room's short side, measured CLEAR between the inner faces of the walls along it (the drawn edge where no wall backs it), is under the least width the profile gives: for a use (a bedroom 2150 mm under `uk`, a habitable room 2134 mm and a hall 914 mm under `us`), for a double bedroom (2550 mm under `uk`; one double bedroom of a home 2750 mm, held on the widest when none is that wide), or for a passage by the rooms it opens onto (under `cn`: 1200 mm for the entry passage, 1000 mm to a bedroom or living room, 900 mm to a kitchen, bathroom, WC or store). A bedroom is a double from its bed, never its label: a `double_bed`, a `bed` wider than 1200 mm, or two beds; a bedroom with no bed files a `no-bed` coverage skip. A polygon or circle room is not measured (`non-rectangular-room`). The figures are read from the sources each profile cites, as advice, never as compliance (ADR 0005).",
    "Widen the room until the quoted width stands clear between the walls' inner faces; the drawn size runs to the wall centrelines, so add half of each wall's thickness.",
    'room id=b at (0,0) size 2100x4000 label "Bedroom" uses bedroom   # lint --profile uk-residential-advisory: 2100 mm, under the 2150 mm a bedroom is asked',
  ),
  W_HABITABLE_NO_WINDOW: w(
    "A living room, dining room or kitchen has no window.",
    'A room whose use is `living`, `dining` or `kitchen` (its `uses`, or its label when it has none: "Living", "Living Room" and "Kitchen / Living" all classify) has no window on any of its walls. A room people live in needs daylight. The window test is the one `W_BEDROOM_NO_WINDOW` uses, a window centred on the room\'s own perimeter, which is also how `describe().windows[].room` attributes a window, so lint and describe agree. A window on a curved wall edge is on no room\'s straight edge, so it is attributed from the shape instead: to the room whose floor lies one wall thickness behind it, or, for a bay drawn outside a room that stops at the curve\'s chord, to the room the chord bounds when no wall closes the bay off. Where neither finds a room, describe reports its `room` as null, and a room bounded by a curved wall edge that carries such a window is skipped rather than reported, because whether that window lights it is not known. A bedroom is never reported by this code (that is `W_BEDROOM_NO_WINDOW`), and a bath, WC, hall or room with no classified use is never asked. A room whose only such use is `kitchen` is asked only on a plan that reads as a dwelling: on one that reads as non-residential (a café, restaurant or clinic label; or, with no bedroom or living room, a room whose use is `office` or a shop, lobby, reception, waiting or meeting label) an office kitchenette has no daylight duty, so it is declared to the lint coverage report (`non-dwelling`) instead; the `residential-basic` profile asks it on every plan. The hint names the `exterior` walls that run along an outside edge of the room (one with no room beyond it), or says that none does.',
    "Add a `window` on an exterior wall of the room; the hint names those walls. Accept the warning if the room is lit in a way the plan cannot draw, such as a roof light or a light well. There is no machine fix: where a window goes on a facade is a design decision.",
    'room id=liv at (0,0) size 4000x4000 label "Living"   # lint: no window on its walls',
  ),
  W_ROOM_MISSING_DEFINING: w(
    "A furnished room is missing the piece that defines it.",
    "The room holds at least one piece of furniture, so it has been furnished, but not the piece its use is defined by: a bedroom with no bed, a bathroom with no bathtub or shower, a WC with no WC, a kitchen with no sink, no hob or no worktop (a `counter`), a dining room with no dining table. A bathroom that holds a `wc` also needs a `basin` to wash hands at, in the room or in a room a door or opening joins it to directly that is not a kitchen (England's Approved Document G, G4); a WC room is defined by its WC alone. The defining pieces are read from the furnish table `finish` furnishes from (`FURNISH_TABLE`), so `finish` never writes a room this rule reports. A piece counts when its footprint centre is on the room's floor (its polygon when it has one), and a piece does the job of its own family and of the one the catalogue says it serves (a `double_bed` is a bed, a `table` is a dining table, a `hob` is a stove). An EMPTY room is never reported (an empty bathroom or kitchen is `W_ROOM_NO_FIXTURE`'s report), living rooms and studies are not checked (no single piece defines them), and a room with no classified use is skipped.",
    "Add the missing piece; the hint quotes statements checked together, clear of the room's walls, doors and furniture, when they fit. If the room is not what its use says, change its `uses`. There is no machine fix: where the piece goes is a design decision.",
    'room id=r_bed at (0,0) size 4000x4000 label "Bedroom 2" uses bedroom\nfurniture wardrobe in r_bed anchor top flush size 1800x600   # lint: furnished, but no bed',
  ),
});
