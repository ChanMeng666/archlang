/**
 * Error catalogue: the drafting family. The drawing and its sheet: dimensions, the title block,
 * scale, and the render config (themes, styles, materials, fonts, PNG), and the `annotation`
 * lint family.
 *
 * Spread into `ERROR_CATALOG` by `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const DRAFTING_ENTRIES = defineEntries({
  E_DIM_CURVE_REF: e(
    "Invalid `dim radius`/`dim diameter` reference.",
    'A curve call-out references an element that does not exist, is not the right shape (a `diameter` on a rectangular room, a `radius` on a wall with no `arc` edge), matches several walls, or omits `segment <n>` on a wall with more than one arc. The compiler will not guess which curve was meant. A `wall … between`/`wall … around` the rooms refused (its own error, ADR 0028 §4) has no body, so naming it raises this code too, saying the wall "could not be placed (see its own error)": fix that error first.',
    "Name an existing, unique wall id whose edge is an `arc` (adding `segment <n>` when it has several), or an existing `room circle` id for `diameter`.",
    "dim radius w1   # error if w1 is straight, unknown, or has two arc edges",
  ),
  E_PNG_DEPENDENCY: e(
    "PNG/PDF export needs an optional dependency that is not installed.",
    "Rendering to PNG needs `@resvg/resvg-js` (PDF needs `pdfkit`); the optional binary is absent in this environment (it is not bundled, to keep the core zero-dependency).",
    "Install the optional dependency (`npm install @resvg/resvg-js`), or re-run with `--install` to fetch it automatically, or render to SVG/DXF (zero-dependency).",
    "archlang preview plan.arch --install   # fetches @resvg/resvg-js, then renders the PNG",
  ),
  W_CJK_FONT_MISSING: w(
    "PDF/PNG text has CJK characters, but the optional CJK font package is not installed.",
    "PDF and PNG draw text with an embedded font so the output does not depend on the host. The bundled Roboto has no Chinese, Japanese or Korean glyphs; those come from the optional `@chanmeng666/archlang-font-cjk` package, which npm installs by default but which is absent here (e.g. `--omit=optional`). The file still renders; the CJK characters come out as empty boxes.",
    "Install the font package (`npm install @chanmeng666/archlang-font-cjk`), or render to SVG, which uses the viewer's fonts.",
    'room at (0,0) size 4000x3000 label "厨房"   # -f pdf / -f png warns when the CJK font package is absent',
  ),
  W_GLYPH_UNSUPPORTED: w(
    "PDF/PNG text has characters no embedded font can draw.",
    "PDF and PNG draw text with embedded fonts only: Roboto (Latin, Greek, Cyrillic) and the optional CJK face (Chinese, Japanese, Korean). A character outside both — Thai, Arabic, Hebrew, Devanagari, emoji, a rare ideograph — has no glyph. The file still renders; those characters come out as empty boxes.",
    "Render to SVG, which uses the viewer's fonts, or rewrite the label in a covered script.",
    'room at (0,0) size 4000x3000 label "ห้องครัว"   # -f pdf / -f png warns: Thai has no embedded glyphs',
  ),
  W_HATCH_SCALE: w(
    "Hatch scale must be positive; using 1.",
    "A wall material `scale` evaluated to zero or a negative number.",
    "Use a positive `scale`.",
    "wall exterior thickness 200 material brick scale 0 { (0,0) (1,0) }",
  ),
  W_SANITIZED_CONFIG: w(
    "A disallowed config value was stripped.",
    "A theme/style value contained markup or a `data:` URL and was blanked for safety.",
    "Use a plain colour/string value (no `<`, `>`, or `url(data:…)`).",
    'theme { wall: "<script>" }   # warning: stripped',
  ),
  W_UNKNOWN_MATERIAL: w(
    "Unknown wall material or room floor; the wall takes the default hatch, the room none.",
    "A wall `material` name, or a room `floor` word, is not one of the known hatches.",
    "Use a known word (for a wall e.g. brick, concrete, insulation, tile; for a floor tile, paving, deck, concrete) or omit it.",
    "wall exterior thickness 200 material marble { (0,0) (1,0) }   # warning",
  ),
  W_UNKNOWN_STYLE_KEY: w(
    "Unknown style key.",
    "A `style <kind> { … }` block uses a key not valid for that element kind.",
    "Use a valid key (e.g. fill / stroke / label, depending on the kind).",
    'style room { nope: "#000" }   # warning',
  ),
  W_UNKNOWN_THEME_KEY: w(
    "Unknown theme key.",
    "A `theme { … }` block uses a key that is not a theme property or alias.",
    "Use a known theme key (see the language reference / hover).",
    'theme { nope: "#000" }   # warning',
  ),
  W_UNKNOWN_THEME: w(
    "Unknown theme name; the plan is drawn in the default theme.",
    "`theme <name>` names no built-in theme and no theme the compile registers (`compile(src, { themes })`), so it selects nothing: the plan is drawn in the default theme, as it always was. A built-in name in another case is not that theme (`theme Rendered` is not `rendered`; theme names match exactly, as `--theme` does). The hint lists the known names and the message names the nearest one. Only `compile()` raises it, because only the compile knows which themes the call registers.",
    "Write a known theme name (the message names the nearest: the same word in another case first), or register the theme through the compile options.",
    'theme Rendered   # warning: did you mean "rendered"?',
  ),
  W_ROOM_LABEL_OUTSIDE: w(
    "A room's explicit label anchor falls outside the room.",
    '`label "…" at (x,y)` pins the label and area text at a point that is not inside the room\'s floor, so the text will be drawn over whatever is there instead.',
    "Move the anchor inside the room, or drop the `at (…)` — automatic placement uses the rectangle's centre, the circle's centre, or a polygon's area centroid (falling back to the interior point furthest from any edge where a concave ring puts that centroid off its own floor), so it lands inside either way.",
    'room polygon (0,0) (6000,0) (6000,6000) (0,6000) label "Hall" at (9000,9000)   # warning',
  ),
  W_DIM_NO_WALL: w(
    "A `dim faces`/`dim clear` endpoint has no wall to measure to.",
    "The endpoint-projection forms push each endpoint onto the FACE of the wall the measurement runs into, found as the nearest wall segment perpendicular to the dimension's own direction. One (or both) endpoints has no such wall within tolerance — the point is off the wall centerline, the wall is angled, or the plan has no wall there — so there is no face to project onto and the written point is measured as-is.",
    "Put the endpoint on the centerline of the wall the dimension runs into (the room-rectangle corner coordinate), or drop the `faces`/`clear` keyword and write the face coordinate yourself.",
    "wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }\ndim faces (0,9000)->(5000,9000) offset 600   # warning: nothing to project onto at y9000",
  ),
  W_DIM_INSIDE: w(
    "A hand-written dimension line lands inside the building.",
    "A `dim`'s line is drawn at `offset` along the LEFT normal of from→to, so the ENDPOINT ORDER chooses which side it lands on. This dimension's line (not its witness lines) falls inside the room-extents bounding box, where it crosses room labels, furniture and poché instead of reading in the page margin. Almost always the endpoints are simply the wrong way round. Advisory: an interior dimension you actually want (a clear width inside a room) is legitimate — reverse it or leave the warning.",
    "Swap the two endpoints — the machine-applicable fix does it for you, but only when the swap actually moves the line out. Swapping mirrors the line across the segment being measured (negating the `offset` does the same thing), so it reaches the outside only when that segment is at the building's edge. A dimension whose measured run cuts THROUGH the plan reads inside either way and carries no automatic fix: measure along a facade instead, or raise the `offset` until the line clears the building.",
    'dim (0,6000)->(7000,6000) offset -500 text "7000"   # warning: the -500 offset pulls the line back inside',
  ),
  W_DIM_OVERLAP: w(
    "Two hand-written dimensions are drawn on top of each other.",
    "Two `dim` statements measuring PARALLEL runs land in the same chain tier: their drawn bands — the dimension line, its station ticks, and the length text riding above the line — intersect, so on paper one reads through the other. ArchLang never re-staggers a hand-written dimension (the author's `offset` IS the tier control — ADR 0005, no invisible architect), so the collision is reported rather than silently laid out. Adjacent members of one chain that merely SHARE a station tick are not a collision and never warn, and two dims generated by one `for` are skipped — they share an `offset` expression, so no bump could separate them.",
    "Move one of them out a tier: raise the magnitude of its `offset` (keeping its sign, which is the side it reads on). The machine-applicable fix computes the smallest whole number of chain tiers that clears the other dimension's line and text.",
    'dim (0,-100)->(7000,-100) offset -300 text "7000"\ndim (0,-100)->(4000,-100) offset -300 text "4000"   # warning: both in the same tier',
  ),
  W_DIM_TEXT_MISMATCH: w(
    "A hand-written dimension's number is not the span it measures.",
    'A `dim … text "…"` whose text reads as a length states a number that its own line contradicts. Read as a length: the whole text is digits with an optional decimal part and an optional unit `mm`, `cm` or `m` (a bare number is millimetres; thousands may be comma-grouped in threes when no unit is written; one to three digits with exactly three decimals and no unit, such as `4.000` or `12.500`, is not read, since it may be a European thousands dot or metres without the `m`, while `4.000 m` is read), so `4000`, `4,000`, `4000mm`, `3.5 m` and `350cm` are read and `VARIES`, `EQ`, `R9000`, `2300 clear` or `~4000` are not checked at all. **The rounding rule:** the text is read at its own written precision, and it agrees with the line when the span, rounded to the last digit written, is that number: `2 × |span − written| ≤ one unit of the last digit`, decided exactly on the 0.001 mm lattice. So `4000` covers 3999.5–4000.5 mm, `3.5 m` covers 3450–3550 mm and `4 m` covers 3500–4500 mm. A text copied from what the drawing prints when no `text` is given (the span to two decimals) therefore never warns, nor does any coarser rounding of it. The span is the one the line draws: after `faces`/`clear` moved its endpoints onto the walls, and the radius or diameter for a curve call-out. A number written finer than the lattice (more than three decimals in mm) is not checked. `dims auto` chains letter their own spans and are never judged.',
    "Decide which side is wrong. If the number is right, the endpoints are not on what it dimensions (a common cause is endpoints rounded to the grid off a jamb on an angled or curved wall): move them so they span the number. If the line is right, letter it with the measured span, or drop the `text` clause and the drawing prints the measured length. A fix rewrites a literal text to the span in the text's own unit and precision; it is `maybe-incorrect` (`archlang fix --unsafe`), because rewriting the text of a line drawn between the wrong points would bake the error in. No fix is offered for an interpolated text or a statement that draws more than one dimension.",
    'dim (0,-100)->(4000,-100) offset -300 text "4500"   # lint: the line spans 4000 mm',
  ),
  W_ANNOTATION_OVERLAP: w(
    "A label or a `dims auto` number is printed over a symbol, a wall, a door swing or another label, or a label runs off its room.",
    "Read off the drawing itself, after the label placer has moved every room label it could and shrunk what still did not fit: a room's name or area figure lies over a furniture, fixture or stair symbol, over a wall or over the area a door's leaf sweeps, or runs off its own floor; or a number `dims auto` writes (a wall-thickness figure, an `R` or `φ` call-out, a chain figure) lies over such a symbol or over a room's name or area figure. \"Over\" means the text's box (its estimated width at its drawn size, turned with it) shares more than 2 % of its area with one of the symbol's drawn shapes, the same threshold at which the label placer moves a label; against a wall, a swing or the floor's edge the box is taken at the width the text can draw, character by character, the wider of Roboto and Helvetica Bold (an estimate covering those two faces, not a promise for every font), not the generous 0.62 of its size per character, since a label stands right up to them in any small room. The placer never moves a label further off its floor than it started, so a name too wide for its room may slide along the room but not out of it. A room's label that does not fit is drawn smaller, down to the furniture-label size (2 mm on a sheet), and wrapped at a space where that helps; one that still does not fit is reported here (an `outdoor` surface's label is not: this reads rooms only, and it neither shrinks nor wraps). A label pinned off its room is `W_ROOM_LABEL_OUTSIDE`'s report, and a wall or swing under it is not repeated here; a rug is floor finish and does not count. Drafting only: `describe()`, Plan JSON and the drawing are unchanged by it. A `dims auto` number lettered on a room floor is not itself a fault: the thickness figure is written beside its wall on the side with floor, and the `R` and `φ` call-outs inside the curve they measure, by convention.",
    'For a room label: give it a clear point with `label "…" at (x,y)`, move the pinned point if it already has one, or move the piece or the door; a name reported at the smallest height needs a shorter name or a wider room, since the drawing does not draw a leader to it. A pinned label keeps its size. For a `dims auto` number: move the piece or the pinned label clear of it; a wall-thickness figure is lettered on the longest straight wall of its thickness at a run no crossing wall, opening, piece of furniture or stair stands on, so moving the piece off that wall frees one, or use `dims auto rooms` and state the thickness with a hand `dim`. There is no machine-applicable fix: where the label or the piece should go is a drafting decision with no unique answer.',
    'paper A4 landscape\nscale 1:100\nroom id=bed at (0,0) size 3250x3000 label "Bedroom 4" at (2400,1900) uses bedroom\nfurniture bed at (1650,900) size 1500x2000   # lint: the pinned name is printed over the bed',
  ),
  W_TITLE_OVERFLOW: w(
    "A title-block value, or a `sheet text` caption with its value, is wider than its row.",
    "The title block is drawn at a fixed fraction of the drawing's size, each row its caption at the left and its value right-aligned at the right, and it neither wraps nor shrinks a value. This value's estimated width at the size it is drawn (characters × size × 0.62, the one width model the drawing uses) is more than the row holds between its two side pads, so it starts left of its own caption and prints over it, and past the block's frame when it is longer still. Both widths scale with the drawing, so the limit is a character count (about 25) on every sheet and at every scale. Only the authored `title { … }` rows are judged; on a multi-storey plan it is reported once. A caption the plan writes in `sheet text` is judged with its value, on every row, as it is drawn, and the warning sits on the block.",
    'Shorten the value to the number of characters the warning quotes and move the rest to a `notes "…"` line. When the warning names the caption `sheet text` writes, shorten that caption or the value until the two fit their row. There is no machine-applicable fix: what to cut is the author\'s wording.',
    'title {\n  project "742 Evergreen Terrace, Springfield - Ground Floor General Arrangement"   # lint: 69 characters, the row holds about 25\n}',
  ),
  W_OPENING_NOT_DIMENSIONED: w(
    "An opening on the outside of the building is on no `dims auto all` chain.",
    "`dims auto all` draws an openings chain on each facade, and this door, window or cased opening is on none of them, so the drawing states its width nowhere and its position nowhere. The auto-dimensioner cannot place three kinds of opening: one on a CURVED wall (a chain measures along x or y, so a curve has no coordinate to tick; the curve gets an `R` call-out instead), one on an ANGLED wall (the facade chains run along x and y only), and one on a face that is not the building's outer outline, such as a courtyard or a recess another wall stands in front of. The warning reads the same facade model the chains are drawn from, so it fires exactly when the drawing leaves the opening out. Only openings on `exterior` walls that open to the outside are considered: a door joining two rooms is not a facade opening, even on a wall categorised `exterior`. A hand-written `dim` with an endpoint on the opening (a jamb, its centre, anywhere across its void) counts as dimensioning it, and the warning stands down. Until issue #109 a STEPPED facade dropped every opening on that side the same way, silently. Those openings are now chained, and this warning exists so the remaining gaps cannot be silent either.",
    "Dimension the opening by hand: a `dim` from the nearest corner to a jamb states the position the auto chains cannot, and one drawn on the opening itself (`offset 0`, jamb to jamb) states its width. Either clears the warning. There is no machine-applicable fix, because where that dimension reads is a drafting decision.",
    "dims auto all\nwall id=w1 exterior thickness 200 { (0,0) (6000,0) (6000,4000) (2000,6000) (0,4000) close }\nwindow on w1 at 12000 width 1200   # lint: on the angled wall, no chain can measure it",
  ),
  W_SCALE_OVERFLOW: w(
    "The drawing does not fit the declared paper at the declared scale.",
    "The plan declares a `paper` size, so `scale` is operative: the building's outer-face extent has to fit the sheet minus its margins, the `dims auto` dimension bands, the bottom chrome band (scale bar + title block) and the margin-table row that `schedule rooms` / `legend` occupy below it. At the scale in force it does not. Your scale is NEVER silently overridden — a drawing is issued at the scale printed in its own title block — so nothing is clipped: the drawing keeps its sheet margin where it can, and the page grows past the sheet when it cannot. Note that the SHEET FURNITURE counts, not just the building: adding a schedule to a tight sheet can raise this with no change to the plan's geometry. Advisory: an oversize sheet you intend to trim or tile is legitimate.",
    "Pick a coarser scale (a larger denominator draws the building smaller), move up a paper size, drop a margin table you can do without, or drop the `scale` line and let the sheet auto-fit choose the finest scale from 1:50 / 1:100 / 1:200 / 1:500.",
    "paper A4 landscape\nscale 1:50   # warning on a 20 m building: 1:100 or `paper A2` fits, or omit `scale` to auto-fit",
  ),
  W_DRAWING_OVERFLOW: w(
    "The whole drawing does not fit the declared paper, even though the building does.",
    "Same ruler as `W_SCALE_OVERFLOW`, different subject. That rule measures the BUILDING's outer-face extent against the sheet minus its margins, dimension bands, title block and margin tables. This one measures **everything the plan draws** against that same area — and a plan draws more than its building: `outdoor` ground, a `fence`, a `site … boundary`, a `roof` eaves line, a fixture set down outside the shell. None of that is in the building's extent, so none of it can make the fit test say no, and `sheet.fits` stays `true` while the sheet cannot hold the drawing. The two are mutually exclusive by design: the drawn extent CONTAINS the building, so when the building itself overflows you get `W_SCALE_OVERFLOW` instead and this would only repeat it. The warning quotes the whole drawing's extent, the drawing area it is measured against, and the overflow on each axis — a millimetre of eaves and a 40 m yard want different answers. **It does not claim the page grows:** nothing is clipped, the reserved sheet margin gives way first, and only a large overrun pushes the page past the paper. `describe().sheet.drawing_fits` is this fact; `scene.sheet.page` is the page that actually came out. Advisory: a site plan you intend to issue oversize, trim or tile is legitimate.",
    "Move up a paper size or pick a coarser scale — both also shrink the building, so check the drawing still reads — or draw less ground. There is deliberately NO machine fix: every remedy rewrites a decision the author made, and unlike a building overflow there is no defensible default, since re-scaling shrinks a building that was already sized correctly for the sheet (ADR 0005).",
    'paper A4 portrait\nscale 1:100\noutdoor lawn at (0,3500) size 4000x40000 label "Yard"   # warning on a 4 m cottage: the yard is 40 m long',
  ),
});
