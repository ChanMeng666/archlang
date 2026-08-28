/**
 * Generate `spec.llm.md` — the learn-the-whole-language-in-one-prompt spec.
 *
 * This is the single artifact an AI agent ingests (via `arch spec`, or by reading
 * the file) to write valid ArchLang first-try. It is deliberately tiny: the full
 * grammar, the handful of gotchas models trip on, the CLI loop, two complete
 * worked examples, and a common-mistakes table — sized to drop into a system
 * prompt, not the 500-line human reference.
 *
 * Like `scripts/gen-grammars.ts`, the dynamic parts are pulled from the single
 * sources of truth so the spec can never drift: keyword lists come from
 * `src/grammar/tokens.ts`, and the worked examples are the real files under
 * `examples/`. {@link renderLlmSpec} is pure (examples passed in) so the drift
 * test (`test/llm-spec-drift.test.ts`) can regenerate it in-memory. Run
 * `npm run gen:spec` after editing; CI asserts no drift.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  ARC_DIRS,
  AUTO_DIMS_MODES,
  COMPASS_DIRECTIONS,
  DIM_REFS,
  FURNITURE_ANCHORS,
  HEMISPHERES,
  AXIS_ALIGNS,
  FENCE_STYLES,
  NORTH_DIRS,
  OUTDOOR_KINDS,
  RAIL_EDGES,
  REL_DIRS,
  REL_DIR_AXIS,
  SCHEDULE_SUBJECTS,
  STRIP_DIRS,
  USE_KINDS,
  VERTICAL_DIRS,
} from "../src/ast.js";
import { BUILTIN_NAMES } from "../src/builtins.js";
import { CANONICAL_FIXTURES } from "../src/elements/fixtures-glyphs.js";
import { defaultFootprint } from "../src/fixtures-catalog.js";
import { DOOR_ENUMS, DOOR_HINGE_NEAR, DOOR_KINDS, KEYWORDS } from "../src/grammar/tokens.js";
import { KNOWN_MATERIALS } from "../src/hatches.js";
import { buildManifest } from "../src/manifest.js";
import { STYLE_KINDS, THEMES } from "../src/theme.js";
import { AUTO_SCALE_DENOMINATORS, PAPER_ORIENTATIONS, PAPER_SIZES } from "../src/sheet.js";

/** The auto-fit scale ladder as the spec prints it (`1:50 / 1:100 / …`). */
const SCALE_LADDER = AUTO_SCALE_DENOMINATORS.map((d) => `1:${d}`);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** The example files embedded verbatim, in order (attachment-first flagship leads). */
export const SPEC_EXAMPLES = ["attached.arch", "parametric.arch"] as const;

/** The relational directions that align on each cross axis, derived from
 *  {@link REL_DIR_AXIS} so the spec's axis rule and the compiler's cannot diverge.
 *  Rendering the pairing (rather than the flat six-word list) is what teaches an agent
 *  that `right-of … align left` is `E_ROOM_ALIGN_AXIS` and not a placement. */
const dirsOn = (axis: "v" | "h"): string => REL_DIRS.filter((d) => REL_DIR_AXIS[d] === axis).join("|");

/**
 * The fixture categories a `furniture … against wall` may omit `size` for — one name per
 * family, and only the families that actually have a catalogued footprint.
 *
 * The furniture line used to spell eight of these out by hand, ending in an ellipsis. That
 * is a fact about the language retyped into a generator, which `check:drift` is structurally
 * blind to: it proves the generator reproduces its own output, never that the output is
 * true (the v1.26.0 defect class). Derived from the two owning tables, the sentence is true
 * by construction — the predicate is exactly the one `furniture.resolve()` applies, so a
 * footprint added or removed moves this list with it.
 */
const SIZE_OPTIONAL_FIXTURES: readonly string[] = CANONICAL_FIXTURES.filter((c) => defaultFootprint(c) !== null);

/**
 * One-line grammar for each built-in element, keyed by element keyword. Keys MUST
 * match `KEYWORDS.element` exactly — {@link renderLlmSpec} throws otherwise, so a
 * new element can't ship without a spec line (the drift guard).
 */
export const ELEMENT_GRAMMAR: Record<string, string> = {
  wall: `wall [id=<name>] <category> thickness <mm> [material ${KNOWN_MATERIALS.join("|")} [scale <n>] [angle <deg>]] { (x,y) (x,y) … [arc (x,y) radius <mm> [${ARC_DIRS.join("|")}] [major]] … [close] }   # category e.g. exterior/partition. NAME IT (\`id=\`) if any \`door on\`/\`window on\`/\`furniture against wall\`/\`dim radius\` will reference it. An unlisted material is W_UNKNOWN_MATERIAL + the default hatch; \`scale\`/\`angle\`: either order, each once. \`close\` makes a loop. An \`arc\` clause makes THAT edge a circular arc from the PREVIOUS vertex (default: the minor arc turning \`ccw\` AS DRAWN, bulging left of travel; \`cw\`/\`major\` pick the other circle / the long way round; R < chord/2 = E_ARC_RADIUS + a fix supplying the minimum). A closed curve is two arcs. Faces draw as TRUE arcs. Openings work: \`on <wall> at <pos>\` walks RUN length (an arc contributes R·θ, not its chord) and a door's leaf/swing take the TANGENT there; \`furniture … against wall\` on an arc = E_FURN_AGAINST (use at+rotate)`,
  room: `room [id=<name>] at (x,y) size <W>x<H> [label "…" [at (x,y)]] [uses ${USE_KINDS.join("|")} …]   # OR relational: room [id=…] (${REL_DIRS.join("|")}) <roomId> [align <edge>] [gap <mm>] size <W>x<H> — align is CROSS-axis: ${AXIS_ALIGNS.v.join("|")} after ${dirsOn("v")}, ${AXIS_ALIGNS.h.join("|")} after ${dirsOn("h")} (middle=center, both OK); wrong axis = E_ROOM_ALIGN_AXIS +fix, non-edge = E_ROOM_ALIGN. OR POLYGONAL: room [id=…] polygon (x,y) (x,y) (x,y) … — an implicitly-closed SIMPLE polygon (>=3 vertices) instead of at+size: exact shoelace area, label at the CENTROID (override: \`label "…" at (x,y)\`). A crossing or all-collinear ring errors (E_ROOM_POLY_SELF_INTERSECT/E_ROOM_POLY_DEGENERATE); rectangle-only clauses (relational placement, \`furniture … in <poly> anchor|centered\`) REFUSE it with E_PLACE_POLY — use \`at (x,y)\` [+ rotate]. OR CIRCULAR: room [id=…] circle at (cx,cy) radius <mm> — area is EXACT πR² (never the tessellation), reported as \`floor_circle\`; grids/overlap use a 48-gon ring`,
  // The two value lists are INTERPOLATED from `DOOR_ENUMS` (+ `DOOR_HINGE_NEAR`), never
  // typed out: this line is prose inside a generator, so a retyped list would document a
  // language that no longer exists while `check:drift` stayed green. `assertDoorEnumsRendered`
  // below is the guard that keeps it interpolated.
  door: `door [id=<name>] [${DOOR_KINDS.join("|")}] (at (x,y) | on <wall> at <pos>) width <mm> [wall <id|category>] [hinge ${DOOR_ENUMS.hinge.join("|")}|${DOOR_HINGE_NEAR.map((v) => `near ${v}`).join("|")}] [swing ${DOOR_ENUMS.swing.join("|")}|into <roomId>] [slide ${DOOR_ENUMS.slide.join("|")}] [open <0..1>]   # \`at (x,y)\` must sit on a wall; \`on <wall> at <pos>\` pins it BY CONSTRUCTION (<pos> = an EXPRESSION: mm along the wall, \`<expr>%\`, or \`center\`; a \`%\` ENDS it — parenthesise a modulo) and can never be reported off-wall — prefer it. The trailing \`wall <id|category>\` pairs with the \`at\` form ONLY — after \`on <wall>\` the host is already named, so writing it is a PARSE ERROR. KIND leads; \`hinged\` (default) is identical to omitting it and is the ONLY kind with a swing arc — the rest sweep nothing, so W_SWING_OBSTRUCTED cannot apply to them. \`swing\` DIFFERS BY KIND: hinged = which side the leaf sweeps; barn/bifold = which FACE the panel hangs on / folds toward; sliding/pocket/garage take none. \`garage\` (a sectional/roller door) takes NO clause at all: it parks OVERHEAD, so there is no intermediate \`open\` position to draw and its projection side is DERIVED from which face has floor, never written. That projection is DASHED, the drawing convention for anything above the cut plane. \`hinge\` is hinged-only and \`slide\`/\`open\` sliding-family-only; a wrong pairing REFUSES (E_DOOR_KIND_CLAUSE), as does any non-hinged kind on an \`arc\` wall (E_DOOR_KIND_CURVED). \`slide\` reads along the wall like \`hinge\`; \`open\` is DRAWING-only (nothing measured reads it), [0,1] or E_DOOR_OPEN_RANGE. A \`pocket\` needs its own width + clearance of wall past the slide-side jamb, or W_POCKET_RUN`,
  window:
    "window [id=<name>] (at (x,y) | on <wall> at <pos>) width <mm> [wall <id|category>]   # placement + `wall` clause exactly as door",
  opening:
    "opening [id=<name>] (at (x,y) | on <wall> at <pos>) width <mm> [wall <id|category>]   # a leaf-less cased opening that still connects the two spaces in the access graph; placement + `wall` clause exactly as door",
  furniture: `furniture [id=<name>] <category> (at (x,y) | against wall <id|category> [segment <n>] [offset <mm>] [side left|right] | in <roomId> (centered | anchor <a> [flush] [inset <mm>])) [size <W>x<H>] [label "…"] [rotate 0|90|180|270] [in <roomId>]   # \`at\` size is plan W×H; \`against\` size is wall-relative along×depth and derives position+rotation (\`side\` inferred from \`in <roomId>\`); \`rotate\` is \`at\`/\`in\`-only — an \`against\` piece's comes FROM the wall (E_FURN_AGAINST; multi-segment wall ⇒ \`segment <n>\`). These + aliases may omit \`size\` when \`against wall\` (catalogued footprint): ${SIZE_OPTIONAL_FIXTURES.join("/")}. \`anchor <a>\` is ${FURNITURE_ANCHORS.join("|")}; \`inset\` (default 0) pulls it in from that edge, measured from the room rectangle (a wall CENTERLINE); \`flush\` measures from the backing wall's inner FACE instead, so \`anchor bottom flush\` sits on the plaster (it needs an anchored edge: E_FURN_FLUSH on \`centered\`/\`anchor center\`)`,
  dim: `dim [${DIM_REFS.join("|")}] (x,y)->(x,y) [offset <mm>] [text "…"]   # a dimension line; \`offset\` is OPTIONAL (default 300; 0 on the curve forms). Endpoint ORDER + the offset sign choose which side it lands on (the offset runs along the LEFT normal of from→to), so a reversed pair draws it INSIDE the building — \`W_DIM_INSIDE\`. \`faces\` pushes each endpoint out onto the wall it runs into (outside-to-outside); \`clear\` pulls both in to the inner faces (a clear width). Or skip hand dims entirely with the plan-level \`dims auto\` setting — its \`all\` mode draws the GB/T openings + axis + overall chains outside every dimensioned facade. CURVES: \`dim radius <wallId> [segment <n>]\` (an R leader) and \`dim diameter <roomId>\` (a φ call-out) DERIVE both geometry and text from the named element and also take \`[offset <mm>] [text "…"]\`; \`dims auto\` adds one R per distinct arc + one φ per circular room; chains stay off curved facades`,
  column: "column [id=<name>] at (x,y) size <W>x<H>",
  stair: `stair [id=<name>] at (x,y) size <W>x<H> dir ${VERTICAL_DIRS.join("|")} [width <mm>]   # a flight: treads, a mid-flight break line, an UP/DN arrow. \`at\` = footprint TOP-LEFT; the flight runs along the LONG axis; \`dir up\` is entered at that axis's larger-coordinate end (arrow points N/W), \`dir down\` at the opposite end (arrow reversed). \`dir\` is declared per storey. MULTI-STOREY: the SAME id on two \`level\` blocks is ONE SHAFT — it becomes a \`describe().vertical\` connection and makes the upper storey reachable with no front door of its own (an id on one storey only = \`W_STAIR_UNMATCHED\`)`,
  elevator:
    "elevator [id=<name>] at (x,y) size <W>x<H>   # a lift shaft: car rectangle + crossed diagonals. No `dir`. Same same-id-on-two-levels shaft identity as `stair`",
  escalator: `escalator [id=<name>] at (x,y) size <W>x<H> dir ${VERTICAL_DIRS.join("|")}   # a moving stair: chevrons along the run + an UP/DN arrow; both narrow ends are entries. Same shaft identity as \`stair\``,
  roof: `roof (overhang <mm> [wall <id>] | polygon (x,y) (x,y) (x,y) …)   # the eaves line: ONE dashed outline of what oversails. DRAWING-ONLY — no \`describe()\` key, no lint rule — though it does grow the page. \`overhang\` offsets a CLOSED wall ring outward by thickness/2 + <mm>, mitred: the named \`wall\`, else the plan's one closed \`exterior\` wall (none/several = E_ROOF_AMBIGUOUS, unknown/unclosed = E_ROOF_WALL, <= 0 = E_ROOF_OVERHANG). REFUSES rather than approximating — an \`arc\` edge is E_ROOF_CURVED, an offset that crosses itself E_ROOF_SELF_INTERSECT — so write \`polygon\` instead: the ring verbatim, implicitly closed, >= 3 effective vertices (E_ROOF_POLY_DEGENERATE). Not inside a \`component\` (E_ROOF_PLACEMENT)`,
  void: `void [id=<name>] at (x,y) size <W>x<H>   # a hole in THIS storey's floor (stair well, atrium, double-height room): dashed rectangle + both diagonals, \`at\` = TOP-LEFT. It OBSTRUCTS circulation — you cannot walk across it, though you may stand at its edge — and does NOT reduce the containing room's area; \`describe --json\`'s \`voids[]\` gives the extent to subtract. Rectangle-only (E_VOID_SIZE)`,
  outdoor: `outdoor [id=<name>] ${OUTDOOR_KINDS.join("|")} (at (x,y) size <W>x<H> | polygon (x,y) (x,y) (x,y) …) [label "…"] [rail ${RAIL_EDGES.join("|")} …]   # GROUND outside the building: a scale-aware material hatch over a tint (L-PLNT/L-SITE/A-FLOR-BALC). NOT a room — absent from \`rooms[]\`, \`totals.floor_area_m2\`, \`schedule rooms\`, the access graph and Plan JSON — and it obstructs NOTHING (you may walk on any of it, water included). Its facts are \`describe --json\`'s \`outdoor[]\` + \`totals.outdoor_area_m2\`, area by exact shoelace on the ring form. \`label\` draws the name AND the m²; unlabelled ground draws neither. \`rail\` is \`balcony\`-only (E_OUTDOOR_RAIL) and rectangle-only (E_OUTDOOR_POLY_DEGENERATE); omitted, it is DERIVED — every edge with no wall one thickness behind it. W_OUTDOOR_OVERLAPS_ROOM covers a surface over a room's floor, W_BALCONY_NO_DOOR a balcony with no opening within a wall thickness. It grows the page, so a site plan wants \`paper\` (E_OUTDOOR_SIZE, E_OUTDOOR_POLY_SELF_INTERSECT)`,
  fence: `fence [id=<name>] [${FENCE_STYLES.join("|")}] { (x,y) (x,y) … [close] }   # a posted boundary line on L-SITE — dense ticks / a double line / sparse ticks; the style word LEADS and defaults to the first. NOT a thin wall: no thickness, no poché, hosts NO opening, absent from \`describe().walls\` and the access graph (a gate is deferred by name). It draws, it measures (\`fences[]\`: \`length_mm\` + \`closed\`) and it grows the page. An \`arc\` edge is E_FENCE_CURVED — write short straight runs`,
};

/**
 * Statement keywords from `KEYWORDS.control` that introduce drawable content and so
 * need their own grammar line next to the elements (as opposed to the scripting /
 * structural keywords, which the Structure + Scripting sections cover).
 */
export const STATEMENT_GRAMMAR: Record<string, string> = {
  axes: "axes { x at <mm>, <mm>, … y at <mm>, <mm>, … }   # GB/T 50001 positioning axes (定位轴线): dash-dot datum lines with a labelled bubble. `x` are vertical (numbered 1,2,3… left-to-right), `y` horizontal (lettered A,B,C… BOTTOM-to-top, skipping I/O/Z). Positions are expressions; labels are DERIVED from sorted position, never authored. With `dims auto rooms|all` the middle chain measures the AXES instead of room boundaries. Plan-level block only",
  level:
    'level <int> ["Name"] { … }   # ONE STOREY = one whole drawing. A plan is single-storey or ALL levels (a drawable statement beside them = E_LEVEL_MIX); settings/`component`/`import`/plan-global `let`/`set` stay OUTSIDE, applying to every level. Integers, unique, 0/negative legal, ASCENDING — lowest = page 1. Ids unique WITHIN a level (see `stair`). `arch compile` writes plan.L1.svg, plan.L2.svg … (`--level <n>` = one); `describe --json` adds `levels[]`. Plan-level only',
  strip: `strip <${STRIP_DIRS.join("|")}> at (x,y) gap <mm> [height|width <mm>] { room [id=<id>] size <main>[x<cross>] [label "…"] [uses …] … }   # a row/column of rooms laid end to end: each room's offset is the running sum of the previous extents + gap, and the shared cross dimension is the strip's height (right/left) or width (down/up). Pure sugar — expands to absolute rooms. Plan-level block only`,
  zone: 'zone <id> ["Label"] { … }   # a WING/DEPARTMENT grouping: pure metadata, ZERO geometry — every statement inside resolves as if the wrapper were deleted (same coordinates, same ids; a zone is NOT a scope), so the SVG is byte-identical. Membership is DECLARED, never inferred from position. Nests (`zone west { zone galleries { … } }` → path `west.galleries`, innermost wins) and is legal wherever a statement is, incl. inside `level`. `describe --json` adds `zones[]` (path/rooms/floor_area_m2; nested rooms roll UP, so summing zones double-counts) + `describe --zone <path>` to read one wing',
  schedule: `schedule ${SCHEDULE_SUBJECTS.join("|")}   # draw the ROOM SCHEDULE table below the title block: NO. (01, 02, … source order) · NAME (label, else id) · AREA (m²) + a TOTAL row, all derived from the rooms. \`rooms\` is the only subject (anything else is a parse error). Same rows as \`describe --json\`'s \`schedule[]\`. With \`zone\` blocks the rows group by zone, each closed by a SUBTOTAL row`,
  legend:
    "legend   # draw the LEGEND table beside the schedule: a row per wall hatch material used and per placed fixture category that has a plan symbol, each with a real swatch. Fully derived; nothing to configure. Pure rendering — no `describe()` field",
  site: `site { street ${COMPASS_DIRECTIONS.join("|")} [hemisphere ${HEMISPHERES.join("|")}] [boundary (x,y) (x,y) (x,y) …] }   # \`street\`/\`hemisphere\` are semantics only and draw NOTHING; \`boundary\` is the LOT LINE and is the one part that draws (a dash-dot property line on C-PROP) and grows the page, adding \`site.lot_area_m2\` (exact shoelace) + \`site.lot_bbox\` (E_SITE_BOUNDARY_DEGENERATE, E_SITE_BOUNDARY_SELF_INTERSECT). \`street\` is a TRUE compass direction (read WITH \`north\`, not instead of it) and names five on \`describe --json\`'s \`site\`: \`street\`, \`back\` (opposite), \`equator_side\` (S north of the equator, N south of it), \`sunrise_side\` (E), \`sunset_side\` (W). An intent's \`windows.facing\` may assert those NAMES instead of a letter (no \`site\` = E_INTENT_NO_SITE). They are a DRAFTING HEURISTIC for an aspect, NOT daylight — there is no sun model. \`street\` required (E_SITE_NO_STREET), one block (E_SITE_DUP), plan-level only`,
  place:
    'place <component>(<args>) as <name> at (x,y) [rotate 0|90|180|270] [mirror x|y]   # instantiate a component as an ADDRESSABLE instance, authored in LOCAL coords from (0,0); `as`+`at` required. Ids inside become `<name>.<id>` (auto-ids restart per instance) and the plan addresses them dotted — `door on west.perimeter at 50%`, `furniture bed in west.main centered`, `describe --room west.main`. `mirror x` flips left↔right, `y` top↔bottom: a real reflection, so door swings mirror. `import "wing.arch" as wing` makes a WHOLE FILE a zero-arg component. Bare `<component>(<args>)` stays the old INLINE macro — caller\'s coords and id space, no namespace',
};

/**
 * Plan-level SETTINGS — the `KEYWORDS.attribute` entries that lead a STATEMENT rather
 * than sitting as a clause of an element line. One line each, printed in the Structure
 * block.
 *
 * ## Why a third table exists (the D12 hole)
 *
 * The two guards above check `ELEMENT_GRAMMAR` against `KEYWORDS.element` and
 * `STATEMENT_GRAMMAR` against `KEYWORDS.control`. `dims` is neither: it is a
 * `KEYWORDS.attribute` entry that the parser dispatches as a plan statement
 * (`case "dims": this.parseDimsSetting(…)`), so it fell BETWEEN the two set-equality
 * guards and neither could notice that the spec never gave it a line of its own — the
 * same structural hole that let `strip` ship unspecced for three releases. Auditing the
 * parser's statement switch found `accTitle`/`accDescr` in exactly the same position:
 * both appeared in the spec only as bare words in the `**Attributes:**` bullet, with
 * their syntax written down nowhere.
 *
 * The membership test is the parser's plan-statement `switch`, not a judgement call: an
 * attribute keyword belongs here iff a `case` for it leads a statement. Everything else
 * in `KEYWORDS.attribute` is a CLAUSE of an element line ({@link CLAUSE_ATTRIBUTES}),
 * already documented by that element's grammar line — and {@link renderLlmSpec} asserts
 * the two exactly PARTITION `KEYWORDS.attribute`, so a keyword that changes category, or
 * a new one that appears at all, cannot slip between the tables again.
 *
 * Each entry is `<concrete form>   # <note>`, the same `\s{3,}#` convention the other two
 * tables use (so `clauseAtoms` reads them identically). The form is CONCRETE and
 * compilable rather than a placeholder grammar, because this block is rendered into an
 * ```arch fence that the docs site compiles live in the reader's browser; alternations
 * therefore live in the note, exactly as `north up   # up|down|…` already did.
 */
export const SETTING_GRAMMAR: Record<string, string> = {
  units: "units mm   # required-ish settings come first",
  grid: "grid 50   # snap grid in mm",
  paper: `paper A3 landscape   # OPTIONAL sheet: ${PAPER_SIZES.join("|")}, ${PAPER_ORIENTATIONS.join("|")} (${PAPER_ORIENTATIONS[0]} default)`,
  scale: "scale 1:50   # drawing scale — OPERATIVE with `paper`, annotation-only without it",
  north: `north up   # ${NORTH_DIRS.join("|")}`,
  dims: `dims auto all   # OPTIONAL auto-dimensioning instead of hand \`dim\` lines: ${AUTO_DIMS_MODES.join("|")}`,
  accTitle: `accTitle "…"   # OPTIONAL a11y name → SVG <title> under \`compile --accessible\``,
  accDescr: `accDescr "…"   # …and description → <desc>, replacing the derived caption. Both plan-level only (E_ACC_PLACEMENT)`,
};

/**
 * The other half of the {@link SETTING_GRAMMAR} partition: `KEYWORDS.attribute` entries
 * that are CLAUSES of an element line, not statements. Each is already taught by the
 * grammar line of the element that takes it, so it needs no line of its own — but it
 * must be named here, because a partition asserted against a list is only as good as the
 * list being exhaustive. Derived as "everything the parser's statement switch does not
 * lead with"; {@link renderLlmSpec} throws if it and `SETTING_GRAMMAR` do not exactly
 * cover `KEYWORDS.attribute`.
 */
/*
 * It used to ALSO be printed, whole, as the `## Keyword reference` section's **Element
 * clauses** bullet — 48 bare words a few lines below the element lines that already
 * spell each one out. That bullet is gone (v1.29), and the reason it could go is
 * structural rather than editorial: `assertScriptingKeywordsTaught` is now run over this
 * list too, so every entry is PROVED to appear in a code span or fence elsewhere in the
 * document. Before that guard, the partition check only established that each attribute
 * was CLASSIFIED as a clause — never that the classification was true — so the bullet was
 * the only thing keeping an unrendered clause on the page at all.
 *
 * ~475 characters of a hard, per-request token budget came back with it (see
 * test/llm-spec-drift.test.ts's cap, whose standing instruction is TRIM DUPLICATION
 * BEFORE RAISING). If the new guard goes red, render the clause in its element's grammar
 * line — do not bring the bullet back.
 */
export const CLAUSE_ATTRIBUTES: readonly string[] = [
  "material",
  "angle",
  "at",
  "size",
  "polygon",
  "circle",
  "arc",
  "radius",
  "width",
  "thickness",
  "label",
  "hinge",
  "swing",
  "slide",
  "open",
  "offset",
  "text",
  "close",
  "id",
  "project",
  "drawn_by",
  "date",
  "from",
  "as",
  "right-of",
  "left-of",
  "below",
  "above",
  "align",
  "gap",
  "uses",
  "rotate",
  "against",
  "segment",
  "side",
  "on",
  "into",
  "near",
  "anchor",
  "inset",
  "flush",
  "mirror",
  "height",
  "faces",
  "clear",
  "dir",
  // Clauses of the `site { … }` block rather than of an element line, but the same
  // argument applies: both are already taught, concretely, by `STATEMENT_GRAMMAR.site`,
  // so neither needs a line of its own — it only has to be named here so the partition
  // against `KEYWORDS.attribute` stays exhaustive.
  "street",
  "hemisphere",
  // The `roof overhang <mm>` clause introducer — taught by `ELEMENT_GRAMMAR.roof`, which
  // is where both of its spellings live, so it needs no line of its own.
  "overhang",
  // v1.31. `rail` is a clause of `ELEMENT_GRAMMAR.outdoor`; `boundary` is a clause of the
  // `site` BLOCK rather than of an element line, exactly as `street`/`hemisphere` above
  // are — same argument, same table: `STATEMENT_GRAMMAR.site` teaches it concretely, so
  // it needs no line of its own and only has to be named here for the partition against
  // `KEYWORDS.attribute` to stay exhaustive.
  "rail",
  "boundary",
];

/**
 * `KEYWORDS.control` entries the Structure / Scripting sections document in prose, so
 * they need no grammar line. Every control keyword must appear either here or in
 * {@link STATEMENT_GRAMMAR} — {@link renderLlmSpec} throws otherwise. This is the guard
 * that `strip` slipped past when it only checked `KEYWORDS.element`: a new statement
 * keyword now cannot ship unspecced.
 *
 * The membership claim used to stop there, and "the prose sections cover these" is not a
 * claim a reader can check — it is a comment. It was also FALSE: `theme` and `style`
 * appeared nowhere in the document except as bare words in the `**Keyword reference**`
 * bullet, which is generated from `KEYWORDS.control` itself and so can never disagree
 * with this list. {@link assertScriptingKeywordsTaught} turns the claim into a check.
 */
export const SCRIPTING_KEYWORDS = [
  "plan",
  "component",
  "let",
  "theme",
  "title",
  "style",
  "import",
  "for",
  "if",
  "while",
  "else",
  "set",
];

const bullet = (items: readonly string[]): string => items.map((k) => `\`${k}\``).join(", ");

/**
 * Drift guard for the door clause vocabularies — the softer half of the same hazard
 * `gen-gbnf.ts` guards. `ELEMENT_GRAMMAR.door` is a prose string, so guard #1 (every
 * element has *an entry*) cannot tell whether the entry is still CORRECT: that is how a
 * v1.12 CLI reference survived three releases. This asserts the door line spells each
 * clause followed by that clause's full alternation, so a value added to the table but
 * not rendered here throws instead of shipping a spec that documents a language the
 * compiler no longer speaks. Exported so `test/door-enums.test.ts` can prove it fires.
 */
export function assertDoorEnumsRendered(
  doorLine: string,
  enums: Record<string, readonly string[]>,
  hingeNear: readonly string[],
  kinds: readonly string[] = DOOR_KINDS,
): void {
  const kindForm = kinds.join("|");
  if (!doorLine.includes(kindForm)) {
    throw new Error(
      `ELEMENT_GRAMMAR.door does not render the door KIND alternation as \`${kindForm}\` — ` +
        `interpolate it from DOOR_KINDS instead of typing it out.`,
    );
  }
  for (const [clause, values] of Object.entries(enums)) {
    const rendered = `${clause} ${values.join("|")}`;
    if (!doorLine.includes(rendered)) {
      throw new Error(
        `ELEMENT_GRAMMAR.door does not render the "${clause}" clause as \`${rendered}\` — ` +
          `interpolate the value set from the enum table instead of typing it out.`,
      );
    }
  }
  const nearForm = hingeNear.map((v) => `near ${v}`).join("|");
  if (!doorLine.includes(nearForm)) {
    throw new Error(`ELEMENT_GRAMMAR.door does not render the \`hinge near\` vertex form as \`${nearForm}\`.`);
  }
}

/**
 * The generalised form of {@link assertDoorEnumsRendered}, for every OTHER closed value
 * set the spec spells out.
 *
 * Same hazard, same shape: a set retyped into a grammar string is prose inside a
 * generator, so `check:drift` reproduces it — right or wrong — forever. The fix is to
 * interpolate it from its source array; this is what keeps it interpolated. Given the
 * text that is supposed to teach a set, it asserts the text still contains that set
 * rendered from the array, joined the way the spec prints it (`|` for an alternation,
 * a space for the built-in list, ` / ` for the scale ladder).
 *
 * So: add a value to `USE_KINDS` / `PAPER_SIZES` / `KNOWN_MATERIALS` / … and either the
 * spec grows the value (because the line interpolates) or `npm run gen:spec` THROWS
 * (because someone typed the list out again). It is the exact inverse of
 * `test/spec-forms.test.ts`'s `clauseAtoms` coverage: this asserts a table entry has a
 * rendering, that asserts a rendering has an exercise.
 */
export function assertVocabRendered(line: string, label: string, values: readonly string[], sep = "|"): void {
  const form = values.join(sep);
  if (!line.includes(form)) {
    throw new Error(
      `The ${label} value set is not rendered as \`${form}\` in the text that documents it — ` +
        `interpolate it from its source array instead of typing it out. Text was:\n  ${line.slice(0, 200)}…`,
    );
  }
}

/**
 * Turn {@link SCRIPTING_KEYWORDS}'s membership claim into a CHECK.
 *
 * The list's meaning is "this keyword needs no grammar line because the prose sections
 * teach it". Nothing verified that, and it was quietly false: `theme` and `style` had no
 * syntax anywhere in the document. An agent reading the page learned only that two words
 * called `theme` and `style` exist — which is worse than silence, because it invites a
 * guess.
 *
 * The check: every listed keyword must appear inside a CODE context — an inline
 * `` `…` `` span or a fenced block — somewhere in the rendered body. Two scoping
 * decisions carry the weight:
 *
 *  - **The `## Keyword reference` section is CUT FIRST.** It is generated by
 *    `bullet(KEYWORDS.control)` from the very list this is checking, so leaving it in
 *    would make every keyword pass by construction — the check would test itself.
 *  - **A fenced block counts, not only an inline span.** `plan "Title" {` and
 *    `title { project "…" … }` teach their syntax perfectly well inside the Structure
 *    fence, and demanding a second, inline restatement of each would buy nothing but
 *    characters in a document with a hard size budget.
 *
 * Word boundaries are hyphen-aware, so `set` never matches inside `offset` and `if`
 * never inside `if`-containing identifiers. Exported so `test/spec-forms.test.ts` can
 * prove it fires.
 *
 * `what`/`remedy` parameterise the failure message, because {@link CLAUSE_ATTRIBUTES} is
 * now held to this same check — which is what let the `## Keyword reference` section's
 * **Element clauses** bullet be deleted. That bullet re-listed 48 attribute words as bare
 * names a few lines below the element line that already spells each one out, and the
 * partition guard in {@link renderLlmSpec} only proved every attribute was CLASSIFIED,
 * never that it was RENDERED — so the bullet was categorically redundant and not provably
 * so. It is provably so now, and the ~475 characters went back into the size budget.
 */
export function assertScriptingKeywordsTaught(
  doc: string,
  keywords: readonly string[],
  what = "SCRIPTING_KEYWORDS",
  remedy = "Either write the syntax into the Scripting section, or give the keyword a STATEMENT_GRAMMAR line.",
): void {
  // Cut the generated keyword-reference bullets: they are rendered FROM the list being
  // checked, so they are not evidence of anything.
  const body = doc.replace(/\n## Keyword reference\n[\s\S]*?(?=\n## )/, "\n");
  const code = [
    ...[...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] ?? ""),
    ...[...body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1] ?? ""),
  ].join("\n");
  const missing = keywords.filter((k) => !new RegExp(`(?<![\\w-])${k}(?![\\w-])`).test(code));
  if (missing.length > 0) {
    throw new Error(
      `${what} claims the document teaches ${missing.join(", ")}, but ` +
        `${missing.length === 1 ? "it appears" : "they appear"} in no code span or fence outside the ` +
        `generated keyword-reference bullet — which is rendered from this very list and so proves ` +
        `nothing. ${remedy}`,
    );
  }
}

/**
 * The clause vocabulary one grammar line TEACHES — the literal words a reader is
 * expected to type after the leading keyword.
 *
 * Pure and exported so `test/spec-forms.test.ts` can hold every rendered clause to an
 * exercised one. Reads ONLY the syntax half (the generator separates syntax from prose
 * with three spaces and a `#`), then drops everything that is not a literal:
 * `<placeholders>`, quoted strings, `(x,y)` coordinate templates, `->`, brackets/braces
 * /parens, ellipses, bare digits, and a three-word allowlist — the leading `keyword`
 * itself, `id` (from `[id=<name>]`, universal and already ruled by rule 6) and the `x`
 * of `WxH`.
 *
 * An alternation survives as ONE atom carrying its arms (`left|right`, `up|down`), so
 * the caller may treat it as satisfied when ANY arm is exercised — the spec teaches the
 * clause, not a duty to demonstrate every value (`DOOR_ENUMS` and friends already have
 * their own per-value tests). Order is first appearance; duplicates collapse.
 */
export function clauseAtoms(line: string, keyword: string): string[] {
  const syntax = line.split(/\s{3,}#/)[0] ?? line;
  const stripped = syntax
    .replace(/"[^"]*"/g, " ") // quoted string literals (`label "…"`)
    .replace(/<[^>]*>/g, " ") // <placeholders>, incl. <id|category> and <0..1>
    .replace(/\(\s*c?x\s*,\s*c?y\s*\)/g, " ") // (x,y) / (cx,cy) coordinate templates
    .replace(/->/g, " ")
    .replace(/[{}[\]()…]/g, " ");
  const allow = new Set([keyword, "id", "x"]);
  const atoms: string[] = [];
  for (const raw of stripped.split(/\s+/)) {
    const atom = raw.replace(/^[,.;=]+/, "").replace(/[,.;=]+$/, "");
    if (!atom || !/^[A-Za-z]/.test(atom) || allow.has(atom)) continue;
    if (!atoms.includes(atom)) atoms.push(atom);
  }
  return atoms;
}

/**
 * Render `spec.llm.md` from the token source + the given example file contents
 * (a map of filename → source). Pure: no fs, no clock — safe for the drift test.
 */
export function renderLlmSpec(examples: Record<string, string>): string {
  // Drift guard: every element keyword must have a grammar line, and vice-versa.
  const elementKeys = [...KEYWORDS.element].sort();
  const grammarKeys = Object.keys(ELEMENT_GRAMMAR).sort();
  if (JSON.stringify(elementKeys) !== JSON.stringify(grammarKeys)) {
    throw new Error(
      `ELEMENT_GRAMMAR is out of sync with KEYWORDS.element.\n` +
        `  elements: ${elementKeys.join(", ")}\n  grammar:  ${grammarKeys.join(", ")}`,
    );
  }

  // Drift guard #2: every CONTROL keyword must be accounted for — either it introduces
  // drawable content (STATEMENT_GRAMMAR) or the prose sections cover it
  // (SCRIPTING_KEYWORDS). Without this, `strip` shipped for a whole release with no
  // syntax line anywhere in the spec (it is control, not element, so guard #1 missed it).
  const controlKeys = [...KEYWORDS.control].sort();
  const coveredControl = [...Object.keys(STATEMENT_GRAMMAR), ...SCRIPTING_KEYWORDS].sort();
  if (JSON.stringify(controlKeys) !== JSON.stringify(coveredControl)) {
    throw new Error(
      `KEYWORDS.control is not fully covered by the spec.\n` +
        `  control: ${controlKeys.join(", ")}\n  covered: ${coveredControl.join(", ")}\n` +
        `  Add each new keyword to STATEMENT_GRAMMAR (it draws something) or SCRIPTING_KEYWORDS (prose covers it).`,
    );
  }

  // Drift guard #2b: the same shape for `KEYWORDS.attribute`, which the two guards above
  // cannot see between them. An attribute keyword is either a plan-level STATEMENT (it
  // gets a `SETTING_GRAMMAR` line) or a CLAUSE of an element line (it is taught by that
  // element's line, and is named in `CLAUSE_ATTRIBUTES`) — never neither. `dims` was
  // exactly "neither" and had no syntax on the page at all; so were `accTitle`/`accDescr`.
  const attributeKeys = [...KEYWORDS.attribute].sort();
  const coveredAttributes = [...Object.keys(SETTING_GRAMMAR), ...CLAUSE_ATTRIBUTES].sort();
  if (JSON.stringify(attributeKeys) !== JSON.stringify(coveredAttributes)) {
    throw new Error(
      `KEYWORDS.attribute is not exactly partitioned by the spec.\n` +
        `  attributes: ${attributeKeys.join(", ")}\n  covered:    ${coveredAttributes.join(", ")}\n` +
        `  Add each new keyword to SETTING_GRAMMAR (the parser's statement switch leads with it) ` +
        `or CLAUSE_ATTRIBUTES (it is a clause of an element line, taught by that line).`,
    );
  }

  // Drift guard #3: the door line must still RENDER every door enum from the one table.
  assertDoorEnumsRendered(ELEMENT_GRAMMAR.door ?? "", DOOR_ENUMS, DOOR_HINGE_NEAR);

  // Drift guard #4: every OTHER closed value set the spec spells out must still come
  // from its source array, on the very line that teaches it. One call per set — a value
  // added to any of these tables with no rendering throws here rather than shipping a
  // spec that documents a language the compiler no longer speaks.
  const el = (k: string): string => ELEMENT_GRAMMAR[k] ?? "";
  const st = (k: string): string => STATEMENT_GRAMMAR[k] ?? "";
  const sg = (k: string): string => SETTING_GRAMMAR[k] ?? "";
  assertVocabRendered(el("wall"), "wall material", KNOWN_MATERIALS);
  assertVocabRendered(el("wall"), "arc direction", ARC_DIRS);
  assertVocabRendered(el("room"), "room `uses`", USE_KINDS);
  assertVocabRendered(el("room"), "relational direction", REL_DIRS);
  // Asserted PER AXIS, not as the flat `REL_ALIGNS`. The flat list is what the line used
  // to render, and rendering it was the reason the spec could not say the one thing an
  // agent most needs about `align`: which three of the six a given direction takes. Since
  // `REL_ALIGNS` is concatenated from `AXIS_ALIGNS`, these two calls still cover all six —
  // they are strictly stronger, because a new edge must now be rendered on a NAMED axis.
  assertVocabRendered(el("room"), "relational alignment (vertical cross axis)", AXIS_ALIGNS.v);
  assertVocabRendered(el("room"), "relational alignment (horizontal cross axis)", AXIS_ALIGNS.h);
  // …and the direction↔axis pairing itself, so the two halves cannot be rendered beside
  // directions that do not take them.
  assertVocabRendered(el("room"), "directions aligning on the vertical axis", [dirsOn("v")], "");
  assertVocabRendered(el("room"), "directions aligning on the horizontal axis", [dirsOn("h")], "");
  assertVocabRendered(el("furniture"), "furniture anchor", FURNITURE_ANCHORS);
  // The size-optional fixture list, joined with `/` the way the line prints it. Guarding it
  // is the whole point: this is the list that was retyped, went stale, and shipped that way.
  assertVocabRendered(el("furniture"), "size-optional fixture", SIZE_OPTIONAL_FIXTURES, "/");
  assertVocabRendered(el("dim"), "dim endpoint reference", DIM_REFS);
  // NB: the `dims auto` mode set is asserted against `SETTING_GRAMMAR.dims` below, not
  // here. `dims` is a plan SETTING, and until it had a line of its own the `dim` element
  // line was the only place the set could live — so it carried it, and then said it
  // twice. One owner: the setting line prints the modes, the `dim` line points at it.
  assertVocabRendered(el("stair"), "vertical direction", VERTICAL_DIRS);
  assertVocabRendered(el("escalator"), "vertical direction", VERTICAL_DIRS);
  assertVocabRendered(el("outdoor"), "outdoor kind", OUTDOOR_KINDS);
  assertVocabRendered(el("outdoor"), "balcony rail edge", RAIL_EDGES);
  assertVocabRendered(el("fence"), "fence style", FENCE_STYLES);
  assertVocabRendered(st("strip"), "strip direction", STRIP_DIRS);
  assertVocabRendered(st("schedule"), "schedule subject", SCHEDULE_SUBJECTS);
  // The setting lines' own closed sets. `paper`/`north` were previously asserted against
  // the whole document, which was true but imprecise — the assertion should name the line
  // that must carry the set, so a future edit that moves the words elsewhere still fails.
  assertVocabRendered(sg("paper"), "paper size", PAPER_SIZES);
  assertVocabRendered(sg("paper"), "paper orientation", PAPER_ORIENTATIONS);
  assertVocabRendered(sg("north"), "north direction", NORTH_DIRS);
  assertVocabRendered(sg("dims"), "`dims auto` mode (setting line)", AUTO_DIMS_MODES);

  // A fenced block (not a bullet list) so the `<placeholder>` angle brackets are
  // safe everywhere they render (GitHub, npm, and the Vue-compiled docs site).
  const statementLines = KEYWORDS.control.filter((k) => k in STATEMENT_GRAMMAR).map((k) => STATEMENT_GRAMMAR[k]);
  const elementLines =
    "```text\n" + [...KEYWORDS.element.map((k) => ELEMENT_GRAMMAR[k]), ...statementLines].join("\n") + "\n```";

  // The Structure block's settings, rendered FROM `SETTING_GRAMMAR` in `KEYWORDS.attribute`
  // order and re-padded so the `#` notes line up. Splitting on the table's own `\s{3,}#`
  // convention is what lets `clauseAtoms` read these lines exactly like the other two
  // tables'. The comment column is one past the longest form, floored at the width the
  // page has always used, so adding a short setting cannot re-indent every other line.
  const settingKeys = KEYWORDS.attribute.filter((k) => k in SETTING_GRAMMAR);
  const settingParts = settingKeys.map((k) => {
    const [form = "", note = ""] = (SETTING_GRAMMAR[k] ?? "").split(/\s{3,}#\s*/);
    return { form, note };
  });
  const settingCol = Math.max(20, ...settingParts.map((p) => p.form.length + 2));
  const settingLines = settingParts.map((p) => `  ${p.form.padEnd(settingCol)}# ${p.note}`).join("\n");

  // `style <kind>` takes every element kind but one. Printing the RULE rather than the
  // ten-item list is both shorter (this page has a hard budget) and more useful — and it
  // is still derived: the exception is computed, and asserted to be exactly one word, so
  // giving `opening` a palette (or taking another element's away) throws here.
  const styleless = KEYWORDS.element.filter((k) => !STYLE_KINDS.includes(k));
  if (styleless.length !== 1) {
    throw new Error(
      `The Scripting section says \`style\` takes any element kind but ONE, and ${styleless.length} ` +
        `element(s) now have no STYLE_KEYS entry (${styleless.join(", ") || "none"}). Rewrite the ` +
        `bullet to state the real rule — do not let the page keep asserting a shape the table lost.`,
    );
  }

  // The CLI verb list is rendered from the manifest — the same source `arch manifest
  // --json` serves — so a new command cannot be missing from the spec.
  // Only `commands` + `exitCodes` are read, and the spec never emits a version — pass a
  // constant so this stays pure (no package.json read) for the in-memory drift test.
  const manifest = buildManifest("0.0.0");
  const width = Math.max(...manifest.commands.map((c) => c.name.length));
  // First sentence only: the spec has a hard size budget (it goes in a system prompt),
  // so a long manifest summary must not silently eat into it.
  const brief = (s: string): string => s.split(". ")[0]!.replace(/\.$/, "");
  const cliLines =
    "```text\n" +
    manifest.commands.map((c) => `arch ${c.name.padEnd(width)}  # ${brief(c.summary)}`).join("\n") +
    "\n```";
  const exitLines = Object.entries(manifest.exitCodes)
    .map(([code, meaning]) => `\`${code}\` ${meaning}`)
    .join(" · ");

  const exampleBlocks = SPEC_EXAMPLES.map((name) => {
    const src = examples[name];
    if (src === undefined) throw new Error(`missing example "${name}" for spec generation`);
    return `### \`examples/${name}\`\n\n\`\`\`arch\n${src.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n\`\`\``;
  }).join("\n\n");

  const doc = `<!-- GENERATED by scripts/gen-llm-spec.ts — do not edit by hand. Run \`npm run gen:spec\`. -->

# ArchLang in one prompt

ArchLang is a tiny declarative language that compiles a \`.arch\` source file into a professional
floor-plan drawing (SVG/PNG/PDF/DXF). It is built for AI agents: deterministic (same source →
identical output), pure (no runtime/IO), and self-correcting (every error carries a machine code and
a \`fix\`). This page is everything you need to author it.

## The 7 rules that matter

1. **Units are millimetres.** A 4-metre wall is \`4000\`, not \`4\`. Optional metric suffixes fold to mm: \`4m\`=4000, \`3.5m\`=3500, \`40cm\`=400, \`20mm\`=20.
2. **Origin is top-left; +x goes right, +y goes DOWN** (screen/SVG convention — *not* math y-up).
3. **Coordinates are \`(x, y)\` tuples; sizes are \`WxH\`** (e.g. \`4000x3000\`) or \`<expr> x <expr>\` with spaces.
4. **Doors and windows must lie ON a wall segment** (on its centerline), or you get a
   \`W_DOOR_OFF_WALL\` / \`W_WINDOW_OFF_WALL\` warning.
5. **String interpolation is \`"{expr}"\`** inside double quotes (e.g. \`label "Unit {i}"\`).
6. **\`id=\` comes FIRST — right after the element keyword, before any category word** (\`wall id=w1 exterior …\`, \`furniture id=b1 bed …\`, never \`wall exterior id=w1\`). Ids are unique; omit \`id=\` to auto-generate one, and name a thing only when you reference it.
7. **Everything is expand-time and pure** — \`let\`/\`for\`/\`if\`/functions all evaluate during compile.

## Structure

\`\`\`arch
plan "Title" {
${settingLines}
  # … elements and scripting …
  title { project "…" drawn_by "…" date "…" }
}
\`\`\`

**\`paper\` is what makes \`scale\` real.** Without it every drawn size (label height, wall
stroke, margin) is a fraction of the drawing's own size, so a 100 m building gets 3 m labels;
\`scale\` is then just a title-block row. With \`paper\`, every annotation is a fixed number of
millimetres ON THE SHEET (3.5 mm room labels, 0.5 mm wall lines, 15 mm margins) × the scale
denominator — the same ink at any building size. Write \`paper\` and omit \`scale\` to auto-fit the
finest of ${SCALE_LADDER.join(" / ")} that fits; declare both and a plan too big for the sheet
warns \`W_SCALE_OVERFLOW\` (your scale is never silently overridden). \`arch describe --json\`
reports the result as \`sheet\`. Big plan? \`paper A1\` + \`dims auto all\` is the professional default.

## Elements

${elementLines}

## Scripting (all expand-time, deterministic)

- \`let NAME = expr\` — bind a constant. \`NAME = expr\` — reassign an existing binding.
- \`let f(a, b) = expr\` — a pure value-function. Built-ins: \`${BUILTIN_NAMES.join(" ")}\`.
- \`for i in lo..hi { … }\` — loop over a half-open integer range (\`0..3\` → 0,1,2).
- \`if cond { … } else { … }\` · \`while cond { … }\`.
- \`set <element>(attr: value)\` — scoped default for following elements (e.g. \`set door(swing: out)\`).
- Arrays: \`[a, b, c]\`, indexed \`arr[i]\`. Operators: \`+ - * / %\`, \`== != < > <= >=\`, \`&& ||\`. Comments: \`# …\`.
- \`import "lib/x.arch": name\` and \`component name(args) { … }\` for reuse.
- \`theme ${Object.keys(THEMES).join("|")}\` — a named palette base. \`theme [<name>] { key: value }\` overrides single keys, \`theme from "#rrggbb"\` derives the whole palette from one colour, and \`style <kind> { key: value }\` does the same per element kind (any but \`${styleless}\`). An unknown key WARNS and is dropped (\`W_UNKNOWN_THEME_KEY\`/\`W_UNKNOWN_STYLE_KEY\`), never fails.

## Keyword reference

(Elements and plan settings are fully specced above; these are the rest.)

- **Settings / control:** ${bullet(KEYWORDS.control)}
- **Enums / values:** ${bullet(KEYWORDS.enum)}

## CLI loop (how an agent drives it)

Every command takes \`--json\` (structured result on **stdout**, human messages on **stderr**) and
reads source from a file or stdin (\`-\`). Exit codes: ${exitLines}.

${cliLines}

The flags that matter (the verb list above covers the rest):

\`\`\`bash
arch compile plan.arch -o out.svg --json    # JSON: { ok, diagnostics, summary }.  -f txt = zero-dep ASCII plan
echo '<source>' | arch compile - --json     # stdin, no temp file
arch validate plan.arch --strict --json     # ship-gate: --strict fails on warnings too
arch fix plan.arch --dry-run --json         # preview/apply the machine-applicable diagnostics[].fixes
arch validate plan.arch --intent brief.json --feedback --json   # gate on a brief's intent contract (miss → exit 2)
arch score plan.arch --brief brief.json --json                  # satisfied/total — measures, never gates
\`\`\`

**Self-correction loop:** compile/validate → if \`ok\` is false, read each \`diagnostics[].fix\` (and
\`line\`/\`col\`/\`span\`), edit the source, recompile. Then \`describe --json\` to confirm the plan matches
intent (right room count, areas, adjacency) without rendering an image. **Before shipping, gate with
\`arch validate --strict --json\`** — a plan that lint flags
(furniture through a wall, a fixture blocking a doorway, a room you can't step into, an unreachable
room, a walk that squeezes too narrow — \`W_PATH_TOO_NARROW\` — or wanders the long way round —
\`W_CIRCUITOUS_PATH\`) cannot pass silently.

**Place furniture so it's physically sound:** keep every piece inside its room and off the walls
(don't cross a wall centerline); back plumbing/kitchen fixtures onto a wall rather than guessing an
\`at\`; give every room a \`door\`/\`opening\`; and leave
the doorway approach and the door's swing clear.

**Fix topology from facts, not guesses.** \`arch repair\` corrects furniture but never adds a door or
window (that is a design choice). When lint reports \`W_ROOM_UNREACHABLE\`, \`W_NO_ENTRANCE\`,
\`W_BEDROOM_NO_WINDOW\`, or \`W_BATH_VIA_BEDROOM\`, run \`arch suggest --json\` — it returns
ready-to-paste \`door\`/\`window\` statements (furniture-aware: a door candidate never opens onto a
wardrobe) that reference a wall only by a stable ref (an authored id or a unique category) or absolute
coordinates — never a re-bindable positional auto-id — with a rationale; pick one and insert it. If nothing fits, read
\`describe --json\` (\`access.rooms[].reachable\`, room \`bbox\`/\`adjacent\`, building extent =
min/max of room boxes) and attach the opening yourself — an exterior entrance into a cut-off living
space beats routing a bath through a bedroom — then re-\`repair\` and \`validate --strict\`. See
SKILL.md for the full recipe.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Using metres (\`size 4x3\`) | Use millimetres (\`size 4000x3000\`). |
| Expecting +y to go up | +y goes **down**; a room below another has a larger y. |
| Door/window floating off its wall | Attach it: \`door on <wall> at <pos>\` — hosted by construction. |
| Hand-summing room offsets | Lay the row with \`strip\`. |
| Furniture floated at a guessed \`at\`, or an \`inset\` hand-computed from a wall thickness | Place it \`in <room> anchor <9-point> [flush] [inset]\` or \`against wall <id>\` — closed-form, never names a thickness. |
| \`size 4000\` (no height) | Sizes are \`WxH\`: \`size 4000x3000\` (or \`W x H\` with spaces). |
| \`wall exterior id=w1 …\`, \`furniture bed id=b1 …\` | \`id=\` leads: \`wall id=w1 exterior …\`, \`furniture id=b1 bed …\`. After the category it is a parse error. |
| String math without interpolation | Use \`"{expr}"\`, e.g. \`label "{round(W / 1000)} m"\`. Only the built-ins above and your own \`let f(…)\` are callable — \`aream2\` is NOT built in. |

## Worked examples

${exampleBlocks}
`;

  // The sets the PROSE sections teach rather than a grammar line — same guard, scoped to
  // the whole document because no single line owns them. (`paper`/`orientation`/`north`
  // moved up to their own SETTING_GRAMMAR lines, which is strictly tighter.)
  assertVocabRendered(doc, "auto-fit scale ladder", SCALE_LADDER, " / ");
  assertVocabRendered(doc, "expression built-in", BUILTIN_NAMES, " ");
  assertVocabRendered(doc, "named theme base", Object.keys(THEMES));

  // Drift guard #5: `SCRIPTING_KEYWORDS` is a CLAIM about this document ("the prose
  // covers these"), so it is checked against the document it claims about — last, once
  // the text exists. It was false for `theme` and `style` until the bullet above.
  assertScriptingKeywordsTaught(doc, SCRIPTING_KEYWORDS);

  // Drift guard #6: the same check for `CLAUSE_ATTRIBUTES`, whose claim is "this is a
  // clause of an element line, so that line already teaches it". The partition guard
  // above only proves each attribute is CLASSIFIED; this proves the classification is
  // TRUE. It is what makes the `## Keyword reference` **Element clauses** bullet
  // redundant rather than merely repetitive, and that bullet is now gone — so if this
  // ever goes red the answer is to render the clause in its element's grammar line, not
  // to bring the bullet back.
  assertScriptingKeywordsTaught(
    doc,
    CLAUSE_ATTRIBUTES,
    "CLAUSE_ATTRIBUTES",
    "Render the clause in the grammar line of the element that takes it — or, if it now leads a " +
      "statement, move it to SETTING_GRAMMAR.",
  );
  return doc;
}

/** Read the embedded example files from disk (CLI/main path only). */
function readExamples(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of SPEC_EXAMPLES) {
    out[name] = readFileSync(resolve(ROOT, "examples", name), "utf8");
  }
  return out;
}

function main(): void {
  writeFileSync(resolve(ROOT, "spec.llm.md"), renderLlmSpec(readExamples()));
  process.stdout.write("✓ generated spec.llm.md from src/grammar/tokens.ts + examples/\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
