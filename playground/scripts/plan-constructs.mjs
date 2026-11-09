/**
 * "What this plan uses": the language constructs a plan's source writes, each linked to its
 * section of the language reference (https://archlang.uk/reference). One section of every static
 * example page (`gen-static.mjs`), and the part of it that differs most from page to page.
 *
 * READ FROM THE PARSE TREE, NEVER FROM THE TEXT. A construct is detected on the `ast` that
 * `compile()` returns (the parse-stage `PlanNode`, src/ast.ts): a statement's `kind`, or a plan
 * field that is present only when the source wrote it. A regex over the text would find a keyword
 * in a comment or a label, and miss one the parser reads in another spelling.
 *
 * THE TABLE IS SMALL AND HONEST. A row exists only for a construct the reference has a heading
 * for, and its `anchor` is that heading's id under VitePress's slug rules. The heading ids are
 * not typed twice: `test/plan-constructs.test.ts` slugifies every heading of
 * docs/language-reference.md with VitePress's own rules (pinned against the installed VitePress)
 * and fails on an anchor that names none of them. The rows are in reference order, and a page
 * lists the constructs it uses in table order, so the output is a function of the source alone.
 *
 * Plain JavaScript with no dependency, so the generator and the vitest suite import the same table.
 */

/** The language reference on the docs host. */
export const REFERENCE_URL = "https://archlang.uk/reference";

/**
 * `[key, label, anchor, test]`: `label` is what the page prints, `anchor` the reference heading's
 * id, `test(facts)` whether the plan uses it (`facts` is {@link planFacts}).
 */
export const CONSTRUCTS = [
  ["paper", "Paper and scale", "paper-and-scale-the-sheet", (f) => Boolean(f.plan.paper)],
  ["site", "Site and orientation", "site-and-orientation", (f) => Boolean(f.plan.site)],
  ["boundary", "The lot line (boundary)", "the-lot-line-—-boundary-v1-31", (f) => Boolean(f.plan.site?.boundary)],
  [
    "accessible",
    "Accessible metadata (accTitle, accDescr)",
    "accessible-metadata-acctitle-accdescr",
    (f) => f.plan.accTitle !== undefined || f.plan.accDescr !== undefined,
  ],
  ["let", "Bindings (let)", "bindings-—-let", (f) => f.kinds.has("let")],
  ["component", "Components", "components", (f) => f.components > 0],
  ["place", "Placing instances (place)", "placing-instances-—-place-v1-22", (f) => f.kinds.has("place")],
  ["control", "Control flow (for, if)", "control-flow", (f) => f.kinds.has("for") || f.kinds.has("if")],
  ["set", "Set rules", "set-rules", (f) => f.kinds.has("set")],
  ["wall", "Walls", "wall", (f) => f.kinds.has("wall")],
  ["walls-from-rooms", "Walls from rooms", "walls-from-rooms", (f) => f.kinds.has("walls")],
  ["room", "Rooms", "room", (f) => f.kinds.has("room") || f.kinds.has("strip")],
  [
    "polygon",
    "Polygonal rooms",
    "polygonal-rooms-v1-23",
    (f) => f.statements.some((s) => s.kind === "room" && s.polygon),
  ],
  [
    "arc",
    "Curved walls (arc edges)",
    "curved-walls-—-arc-edges-v1-24",
    (f) => f.statements.some((s) => s.kind === "wall" && (s.arcs ?? []).some(Boolean)),
  ],
  ["circle", "Circular rooms", "circular-rooms-v1-24", (f) => f.statements.some((s) => s.kind === "room" && s.circle)],
  ["strip", "Strips", "strip-v1-13", (f) => f.kinds.has("strip")],
  ["door", "Doors", "door", (f) => f.kinds.has("door")],
  ["window", "Windows", "window", (f) => f.kinds.has("window")],
  ["opening", "Openings", "opening-v1-3", (f) => f.kinds.has("opening")],
  ["furniture", "Furniture", "furniture", (f) => f.kinds.has("furniture")],
  ["dim", "Dimensions", "dimension", (f) => f.kinds.has("dim")],
  ["dims-auto", "Automatic dimension chains", "automatic-dimension-chains", (f) => Boolean(f.plan.autoDims)],
  ["column", "Columns", "column", (f) => f.kinds.has("column")],
  [
    "vertical",
    "Stairs, elevators and escalators",
    "vertical-circulation-—-stair-elevator-escalator-v1-21",
    (f) => f.kinds.has("stair") || f.kinds.has("elevator") || f.kinds.has("escalator"),
  ],
  ["roof", "Roofs (the eaves line)", "roof-—-the-eaves-projection-line-v1-29", (f) => f.kinds.has("roof")],
  ["void", "Voids", "void-—-a-hole-in-the-floor-v1-29", (f) => f.kinds.has("void")],
  ["outdoor", "Outdoor ground", "outdoor-—-ground-outside-the-building-v1-31", (f) => f.kinds.has("outdoor")],
  ["fence", "Fences", "fence-—-a-boundary-line-on-the-ground-v1-31", (f) => f.kinds.has("fence")],
  ["title", "Title block", "title-block", (f) => Boolean(f.plan.title)],
  ["axes", "Positioning axes", "positioning-axes-定位轴线", (f) => Boolean(f.plan.axes)],
  [
    "sheet-tables",
    "Sheet tables (schedules, legend, notes)",
    "sheet-tables-—-room-schedule-legend",
    (f) => Boolean(f.plan.schedule || f.plan.openingSchedule || f.plan.legend || f.plan.notes?.length),
  ],
  ["level", "Levels (storeys)", "levels-—-a-multi-storey-building-v1-21", (f) => f.kinds.has("level")],
  ["zone", "Zones", "zones-—-wings-and-departments-v1-22", (f) => f.kinds.has("zone")],
  ["theme", "Theming", "theming", (f) => Boolean(f.plan.theme || f.plan.themeBase || f.plan.themeFrom)],
];

/** The statement lists a statement can hold (src/ast.ts): a block's body, an `if`'s branches. */
const CHILD_LISTS = ["body", "then", "else"];

function* walk(list) {
  for (const s of list ?? []) {
    if (!s || typeof s !== "object" || typeof s.kind !== "string") continue;
    yield s;
    for (const key of CHILD_LISTS) if (Array.isArray(s[key])) yield* walk(s[key]);
  }
}

/**
 * What the detectors read: the plan node, every statement of its body and of the components its
 * own source declares (an imported component's body is another file's source), and their kinds.
 */
export function planFacts(plan) {
  const own = plan.components instanceof Map ? [...plan.components.values()].filter((c) => !c.file) : [];
  const statements = [...walk(plan.body), ...own.flatMap((c) => [...walk(c.body)])];
  return { plan, statements, kinds: new Set(statements.map((s) => s.kind)), components: own.length };
}

/** The constructs `plan` (a `compile().ast`) uses, in table order: `{ key, label, href }`. */
export function planConstructs(plan) {
  const facts = planFacts(plan);
  return CONSTRUCTS.filter(([, , , test]) => test(facts)).map(([key, label, anchor]) => ({
    key,
    label,
    href: `${REFERENCE_URL}#${anchor}`,
  }));
}
