/**
 * The Plan JSON scope table (RM3.1, design `docs/plans/product-roadmap/design/plan-json-scope.md` §2):
 * every top-level statement and element clause of `.arch`, and what Plan JSON claims to carry of it.
 *
 * - `round-trips`: written into the document and written back as the clause by `emit.ts`.
 * - `by-result`: the document holds what the form produced, not the form (a loop's elements, a
 *   relational position's coordinates); by design, and not a loss of the drawing or the facts.
 * - `partial`: part of it travels; what does not is the `dropped` clause named in `dropped`.
 * - `dropped`: none of it travels; `planToJson().dropped` names it with `dropped`.
 * - `refused`: the projection refuses the plan rather than export it (`import` in the library).
 *
 * `test/plan-json-roundtrip-law.test.ts` holds this table to the code both ways: every clause
 * `planToJson` can drop (`DROPPED_WORDS`, `src/cli/serialize.ts`, plus `keep`) has a row, and every
 * row's `dropped` is such a clause. It is not retyped anywhere else.
 */
export type ScopeStatus = "round-trips" | "by-result" | "partial" | "dropped" | "refused";

export interface ScopeRow {
  /** The form as the language spells it. */
  form: string;
  status: ScopeStatus;
  /** The `PlanJsonDroppedClause` words that report what does not travel (`partial`, `dropped`). */
  dropped?: readonly string[];
  /** Where it is carried, or why not. */
  note: string;
}

export const PLAN_JSON_SCOPE: readonly ScopeRow[] = [
  // --- plan-level statements and settings -----------------------------------------------------
  { form: 'plan "<name>"', status: "round-trips", note: "`plan`" },
  { form: "units mm", status: "round-trips", note: '`units: "mm"`; the parser accepts only `mm`' },
  { form: "grid", status: "round-trips", note: "`grid`" },
  { form: "paper", status: "round-trips", note: "`paper`; a fitted scale is `scale_auto` and fits again" },
  { form: "scale", status: "partial", dropped: ["hidden"], note: "`scale`; `scale … hidden` is a sheet mark" },
  { form: "north", status: "partial", dropped: ["hidden"], note: "`north`; `north hidden` is a sheet mark" },
  { form: "site { street … hemisphere … }", status: "partial", dropped: ["site boundary"], note: "`site`" },
  { form: "dims auto", status: "round-trips", note: "`dims_auto`" },
  { form: "height <mm> (plan)", status: "round-trips", note: "`storey_height`, under the heights gate" },
  { form: "height … clear <mm>", status: "partial", dropped: ["clear height"], note: "the height travels" },
  { form: "title { … }", status: "partial", dropped: ["hidden"], note: "`title`; `title hidden` is a sheet mark" },
  { form: "accTitle", status: "dropped", dropped: ["accTitle"], note: "accessibility metadata" },
  { form: "accDescr", status: "dropped", dropped: ["accDescr"], note: "accessibility metadata" },
  { form: "theme", status: "dropped", dropped: ["theme"], note: "style layer" },
  { form: "style <kind> { … }", status: "dropped", dropped: ["style"], note: "style layer" },
  { form: "axes", status: "dropped", dropped: ["axes"], note: "an `at axis …` opening is exported by its coordinates" },
  { form: "schedule rooms", status: "dropped", dropped: ["schedule rooms"], note: "sheet layer" },
  { form: "schedule openings", status: "dropped", dropped: ["schedule openings"], note: "sheet layer" },
  { form: "legend", status: "dropped", dropped: ["legend"], note: "sheet layer" },
  { form: "notes", status: "dropped", dropped: ["notes"], note: "sheet layer" },
  { form: "sheet text { … }", status: "dropped", dropped: ["sheet text"], note: "sheet layer" },
  { form: "sheet text { decimal … }", status: "dropped", dropped: ["decimal mark"], note: "sheet layer" },
  {
    form: "level <n> [name] [height …] [slab …] [clear …] { … }",
    status: "partial",
    dropped: ["level"],
    note: "each storey is its own document in `pages`; the `level` header is not carried",
  },
  { form: "zone", status: "dropped", dropped: ["zone"], note: "its rooms travel" },
  { form: "keep", status: "dropped", dropped: ["keep"], note: "ADR 0033; plan-soundness PS4.10 would carry them" },
  { form: "let, for, if, while, set, assignment", status: "by-result", note: "the elements they make" },
  { form: "strip", status: "by-result", note: "the rooms it expands to" },
  {
    form: "component + place",
    status: "dropped",
    dropped: ["place"],
    note: "exported flattened under dotted ids; carried as `components`/`instances` only where a placed component derives its walls (PS3.9); RM3.1 second half",
  },
  {
    form: "import",
    status: "refused",
    note: "the library refuses it by design; the CLI resolves it first and exports the flat result",
  },
  // --- elements and their clauses ---------------------------------------------------------------
  { form: "room (at … size, polygon)", status: "round-trips", note: "`rooms[]`" },
  {
    form: "room … uses",
    status: "round-trips",
    note: "only authored uses are written; a label-derived use is derived again (PS0.18, `78e0b7f9`)",
  },
  { form: "room … floor <pattern>", status: "round-trips", note: "`rooms[].floor` (RM3.1)" },
  { form: "room circle", status: "partial", dropped: ["circle"], note: "the document keeps the 48-gon" },
  { form: "room … label … at", status: "partial", dropped: ["label at"], note: "the label travels" },
  { form: "wall", status: "round-trips", note: "points, arcs, thickness, height, status, closed, material" },
  {
    form: "wall … material poche scale/angle",
    status: "partial",
    dropped: ["poche hatch"],
    note: "a non-default material carries its scale and angle",
  },
  { form: "walls from rooms", status: "round-trips", note: "`walls_from_rooms`, never the walls it derives" },
  {
    form: "wall … between|around (a relational wall)",
    status: "by-result",
    note: "ADR 0028 §4: written as a wall with its resolved points",
  },
  {
    form: "room <dir> <ref> [align …] [gap …] (a relational room)",
    status: "by-result",
    note: "its resolved rectangle (`at` + `size`)",
  },
  {
    form: "door at (x,y)",
    status: "round-trips",
    note: "the clauses its kind accepts (`hinge`, `swing`, `swing inward|outward`, `slide`, `open`), `door_kind`, the host `wall`",
  },
  {
    form: "window at (x,y)",
    status: "round-trips",
    note: "`window_kind`, `hinge`; `sill` only when the statement wrote it (J16): a default sill comes back a default",
  },
  { form: "opening at (x,y)", status: "round-trips", note: "an `open between` opening travels as its clause" },
  {
    form: "door|window|opening on <wall> at <pos>",
    status: "by-result",
    note: "its resolved centre (`x`/`y`) and the host wall's category: a hint that quotes the placement quotes `at (x, y)`",
  },
  {
    form: "door|window|opening between A and B | on <room>.<edge>",
    status: "round-trips",
    note: "`relation` (ADR 0028 §5); one positioned `at axis …`, or inside a `place`, is written by its coordinates",
  },
  { form: "furniture at (x,y)", status: "round-trips", note: "`x`/`y`, `rotate`, `mirror`, `label`, `in <room>`" },
  {
    form: "furniture in <room> centered|anchor …",
    status: "round-trips",
    note: "`centered`, `anchor`, `flush`, `inset` beside the resolved footprint",
  },
  {
    form: "furniture against wall … | against <room>.<edge>",
    status: "round-trips",
    note: "`against_wall` (`segment`, `segment_select`, `offset`, `side`) or `against_edge`; `rotate` un-turns the size",
  },
  {
    form: "furniture … facing <id> | clear front|sides",
    status: "round-trips",
    note: "`facing` on a piece of the plan itself (inside a `place`, its resolved `rotate`), `clear_front`, `clear_sides`",
  },
  { form: "dim (x,y)->(x,y)", status: "round-trips", note: "`dims[]`" },
  { form: "dim faces|clear", status: "by-result", note: "its resolved two ends; the law fixtures hold the bytes" },
  { form: "dim radius", status: "by-result", note: "its resolved two ends and text; the law fixtures hold the bytes" },
  { form: "dim diameter", status: "by-result", note: "its resolved two ends and text; its room is a `circle`" },
  {
    form: "column",
    status: "partial",
    dropped: ["column order"],
    note: "`columns[]`, after the furniture: a column written before a piece comes back after it",
  },
  {
    form: "outdoor",
    status: "partial",
    dropped: ["outdoor order"],
    note: "`outdoor[]` (RM3.1, PS0.21), after the rooms: a surface written before a room comes back after it. A balcony's rail draws in its own CAD layer group, so its order against furniture and fences moves nothing",
  },
  {
    form: "fence",
    status: "partial",
    dropped: ["fence order"],
    note: "`fences[]` (RM3.1, PS0.21), after the furniture and columns: a fence written before one comes back after",
  },
  { form: "stair", status: "dropped", dropped: ["stair"], note: "vertical circulation is not projected" },
  { form: "elevator", status: "dropped", dropped: ["elevator"], note: "vertical circulation is not projected" },
  { form: "escalator", status: "dropped", dropped: ["escalator"], note: "vertical circulation is not projected" },
  { form: "roof", status: "dropped", dropped: ["roof"], note: "drawing-only" },
  { form: "void", status: "dropped", dropped: ["void"], note: "not projected" },
  { form: "section", status: "dropped", dropped: ["section"], note: "a drawing mark (RM6.1)" },
  { form: "hidden (any sheet mark)", status: "dropped", dropped: ["hidden"], note: "sheet layer" },
  {
    form: "a wall, room, door, window or piece with no `id=` (an auto id)",
    status: "partial",
    dropped: ["auto id"],
    note: "written as `id=<auto id>`, so it comes back authored: a lint hint that names only an authored id (a window's, a piece's) then names it",
  },
];
