/**
 * The **D4 ⋉ Z² equivariance oracle** — the helpers `test/equivariance-*.test.ts` share.
 *
 * `place c() as g at t rotate r mirror m` carries a component through one element of the
 * plane's integer isometry group: a signed-permutation matrix (the dihedral group D4) plus
 * an integer translation. `src/frame.ts` implements that group exactly. The law this oracle
 * states is the one the whole `place` design rests on — every FACT the compiler reports
 * about a placed component is the fact it reports about the unplaced one, carried through
 * the same group element:
 *
 *   facts(g · P₀) = g · facts(P₀)
 *
 * where `g ·` acts trivially on an INVARIANT fact (an area, an adjacency, a diagnostic's
 * span into the component's own source) and through the frame on an EQUIVARIANT one (a
 * bounding box, a floor ring, a fixture's quarter-turn, a window's page direction).
 * Precedent: Spatter's integer-affine metamorphic testing of spatial databases (PACMMOD
 * 2024) — transform the input by an exact isometry, predict the output, compare.
 *
 * ## The construction
 *
 * The reference is **P₀, not P**. Both sides are the same example imported as a whole-file
 * component and placed once:
 *
 *   P₀ = `import "<example>" as w` + `place w() as g at (0, 0)`
 *   gP = the same, `at t rotate r mirror m`
 *
 * so both lose exactly what a whole-file import drops (`axes`, `level` blocks, module parse
 * warnings — `src/import.ts`), both carry the `g.` id prefix, and every span inside the
 * example is an offset into the SAME file on both sides. The wrapper's own source is
 * printed by `formatPlan` from a synthesized AST whose settings are copied off the example,
 * so the sheet, `north`, `site` and `dims auto` are shared.
 *
 * ## What is compared, and why some things are not
 *
 * {@link summaryFacts} splits `describe()` into keyed facts, each tagged with how the group
 * acts on it; {@link expectFacts} predicts gP's facts from P₀'s with the exact primitives
 * `src/frame.ts` itself exports (`tp`, `transformRect`, `transformDeg`, `makeFrame`), and
 * {@link diffFacts} reports every key where the prediction and gP disagree.
 *
 * GATED — compared only under the elements for which they are group facts ({@link gateFor}):
 *
 *  - the raster (`circulation`, and the lint rules that read the nav grid) — sampled on a
 *    lattice anchored at the rooms' min corner, so compared only when that lattice maps onto
 *    itself, and always under a pure translation (tier T2);
 *  - the compass-class lint rule — compared when `north` turns with the building (the
 *    co-rotated variant) or under a translation;
 *  - the sheet fit (`sheet`, and the diagnostics anchored on the wrapper's `paper`/`scale`
 *    statements) — the sheet does not turn with the building, so compared only when the
 *    element keeps the axes; the operative `scale` (and the one lint rule measured in drawn
 *    sizes) whenever the element keeps the axes OR the plan fixes its scale.
 *
 * EXCLUDED, each for a stated reason (the exclusion IS the claim that the fact is not a
 * group-equivariant quantity, so each needs one):
 *
 *  - `axes` — a whole-file import drops them on BOTH sides (`src/import.ts`), so there is
 *    nothing to compare.
 *  - `site.lot_bbox` — the lot line is a plan-level SETTING of the wrapper; it does not
 *    move with the placed component, so it is invariant, not equivariant, and the
 *    building's relation to it is not a group fact.
 *  - route polylines and detour ratios under a turn — see {@link circulationFacts}.
 *  - diagnostic `message`/`hints`/fix `title` — prose that embeds coordinates and page
 *    words ("on its left side"); the machine-readable half (`code`, `span`, fix edits) is
 *    compared instead.
 *  - in the drawing (T3): the label pass (a greedy search in page order), every text but a
 *    hand-written dimension's number, the `dims auto` chains (laid on fixed PAGE sides) and
 *    hatch fills — see {@link sceneGroups}.
 *
 * Geometric facts compare at a 1e-6 mm quantum (see `quantise`); invariant facts exactly.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve as resolvePath, sep } from "node:path";
import type { NorthDir, PlaceNode, PlaceRotate, PlanNode, Point } from "../src/ast.js";
import { resolvePlan } from "../src/analyze.js";
import { navExtent } from "../src/analyze/circulation.js";
import { northQuarterTurns } from "../src/describe.js";
import type { Diagnostic, FixSuggestion, Span } from "../src/diagnostics.js";
import { formatPlan } from "../src/format.js";
import { type Frame, makeFrame, tp, transformDeg, transformRect } from "../src/frame.js";
import {
  compile,
  DEFAULT_RULESET,
  describe,
  levelBlocks,
  makeVirtualWorld,
  offsetToLineCol,
  type ResolvedPlan,
  type RRoom,
  type Scene,
  type SceneSummary,
  type ScenePrim,
  toCompass,
  type World,
} from "../src/index.js";
import { buildLintContext } from "../src/lint/context.js";
import { LINT_RULES } from "../src/lint.js";
import { parse } from "../src/parser.js";

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

/** `examples/`, resolved against the repo root (vitest's cwd). */
export const EXAMPLES_DIR = resolvePath("examples");

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".arch") ? [p] : [];
    });
}

/** Every `examples/**\/*.arch`, keyed by its forward-slash path relative to `examples/` —
 *  the keys a whole-file `import` resolves against, so `imports.arch`'s own
 *  `import "lib/…"` lands on the right entry. */
export const EXAMPLE_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  walk(EXAMPLES_DIR).map((p) => [relative(EXAMPLES_DIR, p).split(sep).join("/"), readFileSync(p, "utf8")]),
);

/** The World every oracle compile reads through. */
export const EXAMPLES_WORLD: World = makeVirtualWorld({ ...EXAMPLE_FILES });

/** The shipped examples (top level of `examples/`; `lib/` holds component libraries). */
export const SHIPPED_EXAMPLES: readonly string[] = Object.keys(EXAMPLE_FILES)
  .filter((k) => !k.includes("/"))
  .sort();

/** An example's parse-stage AST (memoised by the parser; never mutated here). */
export function astOf(rel: string): PlanNode {
  const src = EXAMPLE_FILES[rel];
  if (src === undefined) throw new Error(`no example ${rel}`);
  const { plan } = parse(src);
  if (!plan) throw new Error(`${rel} does not parse`);
  return plan;
}

/**
 * The examples T1 covers: every shipped example with no `level` block. COMPUTED, never a
 * retyped list — a whole-file import drops `level` blocks, so a multi-storey example would
 * compare an empty component with itself and prove nothing.
 */
export const ELIGIBLE_EXAMPLES: readonly string[] = SHIPPED_EXAMPLES.filter(
  (rel) => levelBlocks(astOf(rel)).length === 0,
);

// ---------------------------------------------------------------------------
// The group
// ---------------------------------------------------------------------------

/** One group element, in the CANONICAL spelling `composeFrame` re-derives (`mirror x`). */
export interface GroupElement {
  name: string;
  rotate: PlaceRotate;
  mirror?: "x";
  /** A pure translation by `(T,T)` — see {@link translationFor}. */
  translate?: true;
}

/** All eight elements of D4: the four quarter-turns, each with and without `mirror x`. */
export const D4_ELEMENTS: readonly GroupElement[] = ([undefined, "x"] as const).flatMap((mirror) =>
  ([0, 90, 180, 270] as const).map(
    (rotate): GroupElement => ({
      name: `${rotate ? `r${rotate}` : ""}${mirror ? "mx" : ""}` || "e",
      rotate,
      ...(mirror ? { mirror } : {}),
    }),
  ),
);

/** The one pure translation (Z² part). */
export const TRANSLATION: GroupElement = { name: "t", rotate: 0, translate: true };

/** The elements the oracle is run with: D4, plus the translation. */
export const D4_TEST_ELEMENTS: readonly GroupElement[] = [...D4_ELEMENTS, TRANSLATION];

/**
 * The corpus plan. Every eligible example runs the two GENERATORS of D4 (`r90`, `mx`),
 * two products that exercise composition (`r180`, `r90mx`) and the translation; six
 * curated examples — chosen for coverage, not convenience: the plainest plan, fixtures
 * and lint fixes, a `site` with sliding doors, polygon and curved rooms with `dim`s,
 * verticals with columns and `axes`, and an auto-fit `paper` sheet — run all eight.
 */
export const CORPUS_GENERATORS: readonly string[] = ["r90", "mx", "r180", "r90mx", "t"];
export const CURATED_EXAMPLES: readonly string[] = [
  "studio.arch",
  "furnished-flat.arch",
  "courtyard-house.arch",
  "hexagon-pavilion.arch",
  "transit-hall.arch",
  "museum-wing.arch",
];

/** The elements one example is run with (never the identity — P₀ IS the identity). */
export function corpusElements(rel: string): GroupElement[] {
  const names = CURATED_EXAMPLES.includes(rel) ? D4_TEST_ELEMENTS.map((g) => g.name) : CORPUS_GENERATORS;
  return D4_TEST_ELEMENTS.filter((g) => g.name !== "e" && names.includes(g.name));
}

/**
 * The proper rotations an example is ALSO run with under co-rotated `north` (named
 * `r90+N` etc. in a pin): all three for an example that declares a `site` — the only
 * input a compass-class rule reads — and `r90` alone for a curated one.
 */
export function coRotatedElements(rel: string): GroupElement[] {
  const rotations = D4_ELEMENTS.filter((g) => !g.mirror && g.rotate !== 0);
  if (astOf(rel).site !== undefined) return rotations;
  return CURATED_EXAMPLES.includes(rel) ? rotations.filter((g) => g.rotate === 90) : [];
}

export function elementNamed(name: string): GroupElement {
  const g = D4_TEST_ELEMENTS.find((e) => e.name === name);
  if (!g) throw new Error(`no group element ${name}`);
  return g;
}

/**
 * The translation distance: 20 m, rounded UP to the plan's snap grid so the placed origin
 * is itself on the grid (a `place … at` is snapped like any other point). The nav grid
 * anchors at the rooms' own min corner (`navExtent`), so a translation can never misalign
 * the raster.
 */
export function translationFor(grid: number): number {
  return grid > 0 ? grid * Math.ceil(20000 / grid) : 20000;
}

/** The frame of `g` for a plan on `grid`: exactly what `place … at t rotate r mirror m`
 *  builds, through the same constructor. */
export function frameFor(g: GroupElement, grid: number): Frame {
  const t = g.translate ? translationFor(grid) : 0;
  return makeFrame({
    origin: { x: t, y: t },
    rotate: g.rotate,
    ...(g.mirror ? { mirror: g.mirror } : {}),
    prefix: "",
    component: "",
  });
}

/** Does the element's linear part swap the axes (a quarter-turn)? */
export const swapsAxes = (f: Frame): boolean => f.b !== 0;

/** The linear part applied to a direction (no translation). */
export const lin = (f: Frame, v: Point): Point => ({ x: f.a * v.x + f.b * v.y, y: f.c * v.x + f.d * v.y });

/** The four north cardinals in CLOCKWISE order — `north` turns with a clockwise quarter-turn. */
const NORTH_CLOCKWISE = ["up", "right", "down", "left"] as const;

/**
 * `north` co-rotated with a proper rotation by `quarterTurns` clockwise quarter-turns: the
 * building AND its compass turn together, so every compass fact is invariant.
 */
export function rotateNorth(n: NorthDir, quarterTurns: number): NorthDir {
  if (typeof n === "object") return { deg: n.deg + 90 * quarterTurns };
  const i = NORTH_CLOCKWISE.indexOf(n);
  return NORTH_CLOCKWISE[(i + quarterTurns) % 4]!;
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/** The instance alias both wrappers use — so every id is `g.<id>` on both sides. */
export const INSTANCE = "g";

/**
 * The sheet tier T3 draws on. Without `paper`, every drawn size (a stroke, a pane's inset,
 * an arrow head) is a fraction of the drawing's own extent, so ONE misplaced element that
 * moves the extent re-scales every other element's primitives and the violation smears
 * across the whole scene. A declared paper and scale make every size a constant, so each
 * element's primitives depend on that element alone and a violation names the element
 * that caused it.
 */
export const FIXED_SHEET = { paper: { size: "A0", orientation: "landscape" }, scale: "1:100" } as const;

/** {@link FIXED_SHEET} applied to a plan printed by `renderPlan` with no `paper` of its own. */
export function withFixedSheet(src: string): string {
  const out = src.replace(
    /^( {2}units mm\n)/m,
    `$1  paper ${FIXED_SHEET.paper.size} ${FIXED_SHEET.paper.orientation}\n  scale ${FIXED_SHEET.scale}\n`,
  );
  if (out === src) throw new Error("withFixedSheet: no `units mm` line to anchor the sheet on");
  return out;
}

/**
 * P₀ (`g === null` or the identity) or gP for one example, printed by `formatPlan` from a
 * synthesized AST: the example's plan-level SETTINGS (everything `PlanNode` carries except
 * its body, components, imports, comments and `axes`, which a whole-file import drops
 * anyway), one whole-file import and one `place`. The settings are taken by destructuring
 * the parsed AST, not by a retyped key list, so a new plan setting rides along by default.
 */
export function wrapperSource(
  rel: string,
  g: GroupElement | null,
  opts: { north?: NorthDir; fixedSheet?: boolean } = {},
): string {
  const ast = astOf(rel);
  const {
    axes: _axes,
    components: _components,
    imports: _imports,
    body: _body,
    comments: _comments,
    bodyStart: _bodyStart,
    paper,
    paperSpan: _paperSpan,
    scale,
    scaleSpan: _scaleSpan,
    ...rest
  } = ast;
  const settings = opts.fixedSheet
    ? { ...rest, paper: FIXED_SHEET.paper, scale: FIXED_SHEET.scale }
    : { ...rest, ...(paper ? { paper } : {}), ...(scale !== undefined ? { scale } : {}) };
  const t = g?.translate ? translationFor(ast.grid) : 0;
  const num = (value: number) => ({ t: "num" as const, value });
  const place: PlaceNode = {
    kind: "place",
    id: "",
    line: 2,
    span: { start: 1, end: 1 },
    name: "w",
    args: [],
    alias: INSTANCE,
    at: { x: num(t), y: num(t) },
    ...(g && g.rotate !== 0 ? { rotate: g.rotate } : {}),
    ...(g?.mirror ? { mirror: g.mirror } : {}),
  };
  const plan: PlanNode = {
    ...settings,
    north: opts.north ?? ast.north,
    components: new Map(),
    imports: [{ kind: "import", spec: rel, items: [], star: false, wholeAs: "w", line: 1, span: { start: 0, end: 0 } }],
    body: [place],
    comments: [],
    bodyStart: 0,
  };
  return formatPlan(plan, "");
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

/** Rule classes for the equivariance oracle, keyed by `LintRule.name`. */
export type RuleClass = "raster" | "compass" | "scale" | "invariant";

/**
 * How the group acts on each lint rule's output.
 *
 *  - `raster` — the rule reads the circulation nav grid, so it is invariant only when the
 *    lattice maps onto itself (tier T2), and exactly invariant under a pure translation.
 *  - `compass` — the rule reads compass directions against `north`; invariant when north
 *    turns WITH the building (the co-rotated variant) and under a translation.
 *  - `scale` — the rule measures in drawn annotation sizes, which a `paper` plan with no
 *    `scale` derives from the auto-fit denominator; a quarter-turn can legitimately change
 *    that denominator (the sheet does not turn), so it is compared whenever the scale is
 *    fixed or the element keeps the axes.
 *  - `invariant` — every other rule: a diagnostic points into the component's own source,
 *    which is the same bytes on both sides, so code, span and every fix edit must match.
 *
 * Every rule is classified explicitly, in `LINT_RULES` order, and
 * `test/equivariance-corpus.test.ts` holds this table to `LINT_RULES` both ways — a new
 * rule is a conscious classification, never a silent default.
 */
export const RULE_CLASS: Readonly<Record<string, RuleClass>> = {
  "per-room": "invariant",
  "furniture-overlap": "invariant",
  "furn-clearance": "invariant",
  "fixture-floating": "invariant",
  "fixture-wrong-room": "invariant",
  "furniture-wall-collision": "invariant",
  reachability: "invariant",
  "swing-obstructed": "invariant",
  "doorway-blocked": "invariant",
  "door-clearance": "invariant",
  "room-no-clear-path": "raster",
  "no-entrance": "invariant",
  "path-too-narrow": "raster",
  "circuitous-path": "raster",
  "alias-match": "invariant",
  "fixture-back-to-room": "invariant",
  "dim-inside": "invariant",
  "stair-unmatched": "invariant",
  "dim-overlap": "scale",
  "room-not-equator-facing": "compass",
  "pocket-run": "invariant",
  "outdoor-overlaps-room": "invariant",
  "balcony-no-door": "invariant",
  "door-near-corner": "invariant",
  "opening-not-dimensioned": "invariant",
};

export const ruleClass = (name: string): RuleClass => {
  const cls = RULE_CLASS[name];
  if (cls === undefined) throw new Error(`lint rule "${name}" has no RULE_CLASS — classify it`);
  return cls;
};

/** `lint()`'s rule-fold boundary stamp, applied the same way (`src/lint.ts`). */
function withFixProvenance(d: Diagnostic): Diagnostic {
  if (d.file === undefined || !d.fixes) return d;
  return { ...d, fixes: d.fixes.map((f) => ({ ...f, file: d.file })) };
}

/** Each rule's own output, in `LINT_RULES` order, over one shared context — the fold
 *  `lint()` performs, unfolded so a violation names its rule. */
export function lintByRule(ir: ResolvedPlan): { name: string; diags: Diagnostic[] }[] {
  const ctx = buildLintContext(ir, DEFAULT_RULESET);
  return LINT_RULES.map((r) => ({ name: r.name, diags: r.check(ctx).map(withFixProvenance) }));
}

/** Everything the oracle reads off one compiled source (tiers T1/T2). */
export interface Observation {
  src: string;
  summary: SceneSummary;
  ir: ResolvedPlan | null;
  lint: { name: string; diags: Diagnostic[] }[];
}

/** Observations of the examples World, memoised by source: T0, T1 and T2 all start from
 *  the same P₀, and `describe()` has no memo of its own. Other worlds are never cached. */
const observed = new Map<string, Observation>();

export function observe(src: string, world: World = EXAMPLES_WORLD): Observation {
  const hit = world === EXAMPLES_WORLD ? observed.get(src) : undefined;
  if (hit) return hit;
  const summary = describe(src, { world });
  const { ir } = resolvePlan(src, { world });
  const lint = ir ? lintByRule(ir) : [];
  const obs = { src, summary, ir, lint };
  if (world === EXAMPLES_WORLD) observed.set(src, obs);
  return obs;
}

/** The annotated Scene of a source (tier T3), or a thrown error naming why there is none. */
export function sceneOf(src: string, world: World = EXAMPLES_WORLD): Scene {
  const out = compile(src, { world, annotate: true });
  if (!out.scene) throw new Error(`no scene: ${out.errors.map((e) => e.message).join("; ")}`);
  return out.scene;
}

/**
 * Is the nav-grid lattice mapped onto itself by every D4 element? The grid is anchored at
 * the rooms' min corner with cells of `cell` mm, and it spills past the max corner when the
 * extent is not a whole number of cells — so a turn or a flip moves that spill to the other
 * side, and the cell centres no longer coincide.
 */
export function latticeAligned(ir: ResolvedPlan | null): boolean {
  if (!ir) return true;
  const ex = navExtent(ir.elements.filter((e): e is RRoom => e.kind === "room"));
  if (!ex) return true;
  return (ex.maxX - ex.minX) % ex.cell === 0 && (ex.maxY - ex.minY) % ex.cell === 0;
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/** How the group acts on one fact. */
export type FactKind = "inv" | "extent" | "rect" | "box" | "ring" | "circle" | "deg" | "rails" | "facing" | "instance";

export interface Fact {
  kind: FactKind;
  value: unknown;
}

export type Facts = Map<string, Fact>;

/** Deterministic JSON with sorted keys (and `undefined` dropped), for comparison. */
export function stable(v: unknown): string {
  if (v === undefined) return "undefined";
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : val,
  );
}

/**
 * A span, made comparable across the two wrappers. A span into an imported module (`file`
 * set) is compared as raw byte offsets — both sides index the SAME file. A span into the
 * WRAPPER itself (no `file`) is compared as line/column, because the co-rotated variant
 * rewrites the `north` line and every later byte offset shifts with it.
 */
export function normSpan(span: Span | undefined, file: string | undefined, src: string): string | null {
  if (!span) return null;
  if (file !== undefined) return `${file}@${span.start}-${span.end}`;
  const a = offsetToLineCol(src, span.start);
  const b = offsetToLineCol(src, span.end);
  return `root@${a.line}:${a.col}-${b.line}:${b.col}`;
}

/** The machine half of a diagnostic: what it is and where. Message/hints are prose. */
export function projectDiag(d: Diagnostic, src: string): Record<string, unknown> {
  return {
    code: d.code ?? null,
    severity: d.severity,
    span: normSpan(d.span, d.file, src),
    file: d.file ?? null,
    level: d.level ?? null,
  };
}

/** Every fix edit of a diagnostic — `{span, newText}` per edit, per suggestion. */
export function projectFixes(d: Diagnostic, src: string): unknown[] {
  return (d.fixes ?? []).map((f: FixSuggestion) =>
    f.edits.map((e) => ({ span: normSpan(e.span, f.file ?? d.file, src), newText: e.newText })),
  );
}

/** Keyed collection helper: ids are unique in a resolved plan, but never assume it. */
function keyed<T>(items: readonly T[] | undefined, idOf: (t: T) => string): [string, T][] {
  const seen = new Map<string, number>();
  return (items ?? []).map((it) => {
    const id = idOf(it);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return [n === 0 ? id : `${id}#${n}`, it];
  });
}

/**
 * `describe()` split into keyed facts. Keys name the element by id (`rooms[g.hall].bbox`)
 * so a violation says WHICH element; {@link generalize} drops the id for pinning.
 * Circulation is NOT here (tier T2 — {@link circulationFacts}); lint is {@link lintFacts}.
 */
export function summaryFacts(
  s: SceneSummary,
  src: string,
  gate: { sheet: boolean; scale: boolean } = { sheet: true, scale: true },
): Facts {
  const f: Facts = new Map();
  const inv = (k: string, value: unknown): void => void f.set(k, { kind: "inv", value });
  inv("ok", s.ok);
  inv("plan", s.plan);
  inv("caption", s.caption);
  inv("units", s.units);
  // The SHEET class: the sheet does not turn with the building, so under an axis-swapping
  // element the fit verdicts (and the overflow warnings anchored on the `paper`/`scale`
  // statements) legitimately change — `courtyard-house` fits A1 landscape at 1:100 and
  // overflows it turned. The auto-fit DENOMINATOR changes with them (`museum-wing` goes
  // 1:200 → 1:250), so the effective `scale` is gated separately: fixed unless auto-fit.
  if (gate.sheet) inv("sheet", s.sheet ?? null);
  if (gate.scale) inv("scale", s.scale ?? null);
  inv("accTitle", s.accTitle ?? null);
  inv("accDescr", s.accDescr ?? null);
  f.set("bbox", { kind: "extent", value: s.bbox });
  f.set("bbox_outer", { kind: "extent", value: s.bbox_outer });
  if (s.site) {
    const { lot_bbox: _lot, ...site } = s.site;
    inv("site", site);
  } else inv("site", null);

  inv(
    "instances.order",
    (s.instances ?? []).map((i) => i.name),
  );
  for (const [k, i] of keyed(s.instances, (i) => i.name)) f.set(`instances[${k}]`, { kind: "instance", value: i });

  inv(
    "rooms.order",
    s.rooms.map((r) => r.id),
  );
  for (const [k, r] of keyed(s.rooms, (r) => r.id)) {
    const { bbox, floor_polygon, floor_circle, ...rest } = r;
    inv(`rooms[${k}]`, rest);
    f.set(`rooms[${k}].bbox`, { kind: "rect", value: bbox });
    f.set(`rooms[${k}].floor_polygon`, { kind: "ring", value: floor_polygon });
    f.set(`rooms[${k}].floor_circle`, { kind: "circle", value: floor_circle ?? null });
  }

  inv(
    "doors.order",
    s.doors.map((d) => d.id),
  );
  for (const [k, d] of keyed(s.doors, (d) => d.id)) inv(`doors[${k}]`, d);

  inv(
    "windows.order",
    s.windows.map((w) => w.id),
  );
  for (const [k, w] of keyed(s.windows, (w) => w.id)) {
    const { facing, facingPage, ...rest } = w;
    inv(`windows[${k}]`, rest);
    f.set(`windows[${k}].facing`, { kind: "facing", value: { facing, ...(facingPage ? { facingPage } : {}) } });
  }

  inv(
    "openings.order",
    s.openings.map((o) => o.id),
  );
  for (const [k, o] of keyed(s.openings, (o) => o.id)) inv(`openings[${k}]`, o);

  inv(
    "furniture.order",
    s.furniture.map((x) => x.id),
  );
  for (const [k, x] of keyed(s.furniture, (x) => x.id)) {
    const { rotate, ...rest } = x;
    inv(`furniture[${k}]`, rest);
    f.set(`furniture[${k}].rotate`, { kind: "deg", value: rotate ?? 0 });
  }

  inv(
    "verticals.order",
    (s.verticals ?? []).map((v) => v.id),
  );
  for (const [k, v] of keyed(s.verticals, (v) => v.id)) {
    const { bbox, ...rest } = v;
    inv(`verticals[${k}]`, rest);
    f.set(`verticals[${k}].bbox`, { kind: "rect", value: bbox });
  }

  inv(
    "voids.order",
    (s.voids ?? []).map((v) => v.id),
  );
  for (const [k, v] of keyed(s.voids, (v) => v.id)) {
    inv(`voids[${k}]`, { id: v.id, room: v.room });
    f.set(`voids[${k}].box`, { kind: "box", value: { at: v.at, size: v.size } });
  }

  inv(
    "outdoor.order",
    (s.outdoor ?? []).map((o) => o.id),
  );
  for (const [k, o] of keyed(s.outdoor, (o) => o.id)) {
    const { bbox, rail, ...rest } = o;
    inv(`outdoor[${k}]`, rest);
    f.set(`outdoor[${k}].bbox`, { kind: "rect", value: bbox });
    f.set(`outdoor[${k}].rail`, { kind: "rails", value: rail ?? null });
  }

  inv("fences", s.fences ?? null);
  inv("heights", s.heights ?? null);
  inv("access", s.access);
  inv("totals", s.totals);
  inv("input_graph", s.input_graph);
  inv("freedom", s.freedom);
  inv("schedule", s.schedule ?? null);
  inv("zones", s.zones ?? null);
  const sheetSpans = sheetStatementSpans(src);
  const onSheet = (d: Diagnostic): boolean =>
    d.file === undefined && d.span !== undefined && sheetSpans.has(`${d.span.start}-${d.span.end}`);
  const plain = s.diagnostics.filter((d) => !onSheet(d));
  inv(
    "diagnostics",
    plain.map((d) => projectDiag(d, src)),
  );
  inv(
    "diagnostics.fixes",
    plain.map((d) => projectFixes(d, src)),
  );
  if (gate.sheet) {
    inv(
      "diagnostics.sheet",
      s.diagnostics.filter(onSheet).map((d) => projectDiag(d, src)),
    );
  }
  return f;
}

/**
 * The byte spans of the wrapper's own `paper` and `scale` statements — read off the
 * wrapper's parsed AST, not a retyped code list: a diagnostic anchored there is a verdict
 * about the SHEET (fit/overflow), which is the one legitimately orientation-dependent
 * thing a plan-level setting measures.
 */
function sheetStatementSpans(src: string): Set<string> {
  const { plan } = parse(src);
  const out = new Set<string>();
  for (const sp of [plan?.paperSpan, plan?.scaleSpan]) if (sp) out.add(`${sp.start}-${sp.end}`);
  return out;
}

/**
 * Each lint rule's output as two facts — the diagnostics (code/severity/span/file/level)
 * and their fix edits — gated by the rule's {@link RuleClass}: a `raster` rule is compared
 * only when `raster` holds, a `compass` rule only when `compass` holds.
 */
export function lintFacts(
  obs: Observation,
  gate: { raster: boolean; compass: boolean; scale: boolean },
  src: string = obs.src,
): Facts {
  const f: Facts = new Map();
  for (const r of obs.lint) {
    const cls = ruleClass(r.name);
    if (cls === "raster" && !gate.raster) continue;
    if (cls === "compass" && !gate.compass) continue;
    if (cls === "scale" && !gate.scale) continue;
    f.set(`lint.${r.name}`, { kind: "inv", value: r.diags.map((d) => projectDiag(d, src)) });
    f.set(`lint.${r.name}.fixes`, { kind: "inv", value: r.diags.map((d) => projectFixes(d, src)) });
  }
  return f;
}

/**
 * Tier T2's circulation facts. `whole` (a pure translation) compares the entire model;
 * otherwise only the lattice-level measurements that an aligned D4 element must preserve:
 * each room's walk distance and bottleneck width, and the sealed-room set. Route polylines
 * and detour ratios are excluded — BFS breaks parent ties in a fixed W,E,N,S order
 * (`src/analyze/circulation.ts`), so which of several equal-length routes is kept is a
 * convention, not a fact.
 */
export function circulationFacts(s: SceneSummary, whole: boolean): Facts {
  const f: Facts = new Map();
  const c = s.circulation;
  if (whole || !c) {
    f.set("circulation", { kind: "inv", value: c });
    return f;
  }
  for (const r of c.rooms) {
    f.set(`circulation.rooms[${r.roomId}].walk`, { kind: "inv", value: r.walkDistanceMm });
    f.set(`circulation.rooms[${r.roomId}].bottleneck`, { kind: "inv", value: r.bottleneckClearWidthMm });
  }
  f.set("circulation.blocked", { kind: "inv", value: (c.blocked ?? []).map((b) => b.roomId).sort() });
  return f;
}

// ---------------------------------------------------------------------------
// The prediction
// ---------------------------------------------------------------------------

/** Page direction letter ⇄ unit vector (+y DOWN). */
const PAGE_VEC: Readonly<Record<"N" | "E" | "S" | "W", Point>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};
const pageOf = (v: Point): "N" | "E" | "S" | "W" =>
  (Object.keys(PAGE_VEC) as ("N" | "E" | "S" | "W")[]).find((k) => PAGE_VEC[k].x === v.x && PAGE_VEC[k].y === v.y)!;

/** A rail side's outward normal (page terms). */
const SIDE_VEC: Readonly<Record<string, Point>> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const sideOf = (v: Point): string =>
  Object.keys(SIDE_VEC).find((k) => SIDE_VEC[k]!.x === v.x && SIDE_VEC[k]!.y === v.y)!;

/** Round to the 1e-6 mm comparison quantum; `-0` → `0`. */
export const q = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};
const pt = (p: Point): string => `${q(p.x)},${q(p.y)}`;

/** A closed ring as a canonical string: the lexicographically least rotation over both
 *  traversal directions (a reflection reverses winding; nothing downstream reads it). */
export function canonRing(ring: readonly Point[]): string {
  const s = ring.map(pt);
  if (s.length === 0) return "";
  let best: string | null = null;
  for (const seq of [s, [...s].reverse()]) {
    for (let i = 0; i < seq.length; i++) {
      const cand = [...seq.slice(i), ...seq.slice(0, i)].join(" ");
      if (best === null || cand < best) best = cand;
    }
  }
  return best!;
}

function frameMatrix(f: { a: number; b: number; c: number; d: number }): [number, number, number, number] {
  return [f.a, f.b, f.c, f.d];
}

interface Canon {
  canon: (v: unknown) => unknown;
  expect: (v: unknown, f: Frame, northG: NorthDir) => unknown;
}

type Rect = { x: number; y: number; w: number; h: number };
const rectT = (f: Frame, r: Rect): Rect => {
  const t = transformRect(f, { x: r.x, y: r.y }, { w: r.w, h: r.h });
  return { x: t.at.x, y: t.at.y, w: t.size.w, h: t.size.h };
};

/**
 * Quantise every number in a geometric fact to the 1e-6 mm comparison quantum (the same
 * one T3 compares primitives at). The frame is an exact integer isometry, but a fact
 * DERIVED after it — an angled wall's outer face, a `sqrt` — is computed in absolute
 * float coordinates, and a translation by 20 m moves its last bit: `gallery-l`'s
 * `bbox_outer.h` reads …889278 at the origin and …889281 twenty metres away. That is
 * float non-associativity, not a group fact, so geometric facts compare at 1e-6; the
 * INVARIANT facts (areas, counts, spans) stay exact.
 */
const quantise = (v: unknown): unknown =>
  typeof v === "number"
    ? q(v)
    : Array.isArray(v)
      ? v.map(quantise)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, quantise(x)]))
        : v;

type Facing = { facing: "N" | "E" | "S" | "W"; facingPage?: "N" | "E" | "S" | "W" };
type Inst = { name: string; component: string; at: Point; rotate: PlaceRotate; mirror?: "x" | "y" };
const instCanon = (i: Inst, at: Point, m: [number, number, number, number]) => ({
  name: i.name,
  component: i.component,
  at: { x: q(at.x), y: q(at.y) },
  m,
});
const instFrame = (i: Inst): Frame =>
  makeFrame({ origin: i.at, rotate: i.rotate, ...(i.mirror ? { mirror: i.mirror } : {}), prefix: "", component: "" });

const KINDS: Readonly<Record<FactKind, Canon>> = {
  inv: { canon: (v) => v, expect: (v) => v },
  extent: {
    canon: quantise,
    expect: (v, f) => {
      const e = v as { w: number; h: number };
      return quantise(swapsAxes(f) ? { w: e.h, h: e.w } : { w: e.w, h: e.h });
    },
  },
  rect: { canon: quantise, expect: (v, f) => quantise(rectT(f, v as Rect)) },
  box: {
    canon: quantise,
    expect: (v, f) => {
      const b = v as { at: Point; size: { w: number; h: number } };
      return quantise(transformRect(f, b.at, b.size));
    },
  },
  ring: {
    canon: (v) => canonRing(v as Point[]),
    expect: (v, f) => canonRing((v as Point[]).map((p) => tp(f, p))),
  },
  circle: {
    canon: quantise,
    expect: (v, f) => {
      if (v === null) return null;
      const c = v as { cx: number; cy: number; r: number };
      const p = tp(f, { x: c.cx, y: c.cy });
      return quantise({ cx: p.x, cy: p.y, r: c.r });
    },
  },
  deg: { canon: (v) => v, expect: (v, f) => transformDeg(f, v as number) },
  rails: {
    canon: (v) => (v === null ? null : [...(v as string[])].sort()),
    expect: (v, f) => (v === null ? null : (v as string[]).map((s) => sideOf(lin(f, SIDE_VEC[s]!))).sort()),
  },
  facing: {
    canon: (v) => v,
    expect: (v, f, northG) => {
      const w = v as Facing;
      const page0 = w.facingPage ?? w.facing;
      const pageG = pageOf(lin(f, PAGE_VEC[page0]));
      const turns = northQuarterTurns(northG);
      return { facing: toCompass(pageG, turns), ...(turns !== 0 ? { facingPage: pageG } : {}) };
    },
  },
  instance: {
    canon: (v) => {
      const i = v as Inst;
      return instCanon(i, i.at, frameMatrix(instFrame(i)));
    },
    expect: (v, f) => {
      const i = v as Inst;
      const m0 = instFrame(i);
      const m: [number, number, number, number] = [
        f.a * m0.a + f.b * m0.c,
        f.a * m0.b + f.b * m0.d,
        f.c * m0.a + f.d * m0.c,
        f.c * m0.b + f.d * m0.d,
      ];
      return instCanon(i, tp(f, i.at), m);
    },
  },
};

/** Predict gP's facts from P₀'s: act on every fact by its {@link FactKind}. `northG` is the
 *  `north` gP is compiled under (the co-rotated variant turns it). */
export function expectFacts(facts0: Facts, f: Frame, northG: NorthDir): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, fact] of facts0) out.set(k, stable(KINDS[fact.kind].expect(fact.value, f, northG)));
  return out;
}

/** The observed side, canonicalised the same way. */
export function canonFacts(facts: Facts): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, fact] of facts) out.set(k, stable(KINDS[fact.kind].canon(fact.value)));
  return out;
}

/** One place the prediction and the observation disagree. */
export interface Violation {
  /** The concrete key (`rooms[g.hall].bbox`). */
  key: string;
  /** The key with element ids dropped (`rooms[].bbox`) — what a pin names. */
  path: string;
  expected: string;
  actual: string;
}

/** Drop the element id from a key: `rooms[g.hall].bbox` → `rooms[].bbox`. */
export const generalize = (key: string): string => key.replace(/\[[^\]]*\]/g, "[]");

export function diffFacts(expected: Map<string, string>, actual: Map<string, string>): Violation[] {
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  const out: Violation[] = [];
  for (const key of keys) {
    const e = expected.get(key) ?? "<absent>";
    const a = actual.get(key) ?? "<absent>";
    if (e !== a) out.push({ key, path: generalize(key), expected: e, actual: a });
  }
  return out;
}

/** Which gated fact classes one P₀ → gP comparison includes. */
export interface Comparison {
  /** Compare the raster facts (circulation + raster lint rules)? */
  raster: boolean;
  /** Compare the compass-class lint rules? */
  compass: boolean;
  /** Compare the sheet-fit facts (the element keeps the axes)? */
  sheet: boolean;
  /** Compare the operative scale and scale-class rules (fixed scale, or axes kept)? */
  scale: boolean;
}

/**
 * The gates for one element: raster facts when the lattice maps onto itself or the element
 * is a pure translation; compass facts when north co-rotates or the element is a pure
 * translation; sheet-fit facts whenever the element keeps the axes; the operative scale
 * whenever the element keeps the axes or the plan fixes its scale (`autoScale` false).
 */
export function gateFor(
  g: GroupElement,
  f: Frame,
  opts: { aligned: boolean; coNorth?: boolean; autoScale?: boolean },
): Comparison {
  return {
    raster: opts.aligned || g.translate === true,
    compass: opts.coNorth === true || g.translate === true,
    sheet: !swapsAxes(f),
    scale: !swapsAxes(f) || opts.autoScale !== true,
  };
}

/** Everything {@link gateFor} needs to know about P₀. */
export const gateFacts = (obs0: Observation): { aligned: boolean; autoScale: boolean } => ({
  aligned: latticeAligned(obs0.ir),
  autoScale: obs0.summary.sheet?.scale_auto === true,
});

/**
 * The full P₀ → gP comparison: `describe()` facts, per-rule lint facts (gated), and — when
 * `raster` holds — the T2 circulation facts. Returns every violation.
 */
export function compareObservations(
  obs0: Observation,
  obsG: Observation,
  f: Frame,
  northG: NorthDir,
  gate: Comparison,
  opts: { translation?: boolean } = {},
): Violation[] {
  const facts0 = new Map([...summaryFacts(obs0.summary, obs0.src, gate), ...lintFacts(obs0, gate)]);
  const factsG = new Map([...summaryFacts(obsG.summary, obsG.src, gate), ...lintFacts(obsG, gate)]);
  if (gate.raster) {
    for (const [k, v] of circulationFacts(obs0.summary, opts.translation === true)) facts0.set(k, v);
    for (const [k, v] of circulationFacts(obsG.summary, opts.translation === true)) factsG.set(k, v);
  }
  return diffFacts(expectFacts(facts0, f, northG), canonFacts(factsG));
}

// ---------------------------------------------------------------------------
// T3 — the scene
// ---------------------------------------------------------------------------

/** Layers whose primitives are wall fabric (unioned across statements, so no element id). */
const WALL_LAYERS: ReadonlySet<string> = new Set(["wallFill", "wallFace"]);

/**
 * The scene's comparable primitives, grouped by `elementId` (annotate mode stamps one on
 * every node an element renders — `src/scene-build.ts`). Wall fabric carries no id and is
 * compared as ONE group, the whole wall layer. Excluded: the label pass (label placement is
 * a greedy page-order search), every text but a hand-written dimension's number, the
 * `dims auto` chains (no element id — they are laid on fixed sides of the PAGE), and hatch
 * fills (a pattern's angle is a drafting convention of the page, not of the building).
 *
 * A hand-written `dim`'s number is kept as its ANCHOR POINT only: which side of its line
 * the number sits on is geometry (it is what `W_DIM_OVERLAP` measures), while its value
 * and reading rotation are not group facts.
 */
export function sceneGroups(scene: Scene): Map<string, { kind: string; prims: ScenePrim[] }> {
  const out = new Map<string, { kind: string; prims: ScenePrim[] }>();
  for (const n of scene.nodes) {
    if (n.prim.t === "hatch" || n.layer === "labels") continue;
    if (n.layer === "dims" && n.elementId === undefined) continue;
    if (n.prim.t === "text" && n.layer !== "dims") continue;
    let id: string;
    let kind: string;
    if (n.elementId !== undefined) {
      id = n.elementId;
      kind = n.elementKind ?? "?";
    } else if (WALL_LAYERS.has(n.layer)) {
      id = "@walls";
      kind = "walls";
    } else continue;
    const g = out.get(id) ?? { kind, prims: [] };
    g.prims.push(n.prim);
    out.set(id, g);
  }
  return out;
}

/** Carry a primitive through a frame. */
export function transformPrim(f: Frame, p: ScenePrim): ScenePrim {
  switch (p.t) {
    case "polygon":
      return { t: "polygon", pts: p.pts.map((x) => tp(f, x)) };
    case "line":
      return { t: "line", a: tp(f, p.a), b: tp(f, p.b) };
    case "region":
      return { t: "region", loops: p.loops.map((l) => l.map((x) => tp(f, x))) };
    case "path":
      return {
        t: "path",
        loops: p.loops.map((l) => ({
          start: tp(f, l.start),
          edges: l.edges.map((e) =>
            e.t === "line"
              ? { t: "line" as const, to: tp(f, e.to) }
              : { ...e, to: tp(f, e.to), center: tp(f, e.center) },
          ),
        })),
      };
    case "arc":
      return { ...p, center: tp(f, p.center), start: tp(f, p.start), end: tp(f, p.end) };
    case "circle":
      return { ...p, center: tp(f, p.center) };
    case "text":
      return { ...p, at: tp(f, p.at) };
    default:
      return p;
  }
}

const undirected = (a: Point, b: Point): string => {
  const [x, y] = [pt(a), pt(b)].sort();
  return `${x}>${y}`;
};

/**
 * A closed outline's edges as a canonical POINT SET: every straight edge is merged with
 * every collinear edge it touches or overlaps (whatever loop or position it came from),
 * and every arc piece with every piece of the same circle it touches. What remains is the
 * set of maximal straight runs and maximal arcs, which is a property of the drawn outline
 * alone.
 *
 * Why not compare the edges as emitted: the wall joinery cuts a curve into ≤120° pieces
 * from wherever its loop happens to start, and splits a straight run wherever another loop
 * touches it. `aquarium`'s drum is tangent to a straight wall; under a quarter-turn the
 * same outline comes back as one loop pinched at the tangent point instead of two, so the
 * straight run and the arc are cut there on one side only. Same ink, different bookkeeping.
 */
type Edge = { t: "line"; a: Point; b: Point } | { t: "arc"; a: Point; b: Point; center: Point; r: number };

function canonEdgeSet(edges: readonly Edge[]): string[] {
  const out: string[] = [];
  // Straight runs, grouped by their carrying line and merged as 1-D intervals.
  const lines = new Map<string, { t0: number; t1: number; p0: Point; p1: Point }[]>();
  // Arc pieces, grouped by circle and merged as angular intervals.
  const arcs = new Map<string, { center: Point; r: number; ivs: [number, number][] }>();
  const TAU = 2 * Math.PI;
  for (const e of edges) {
    if (pt(e.a) === pt(e.b)) continue;
    if (e.t === "line") {
      // Only AXIS-ALIGNED runs are merged: their carrying line is an exact coordinate, so
      // grouping them cannot straddle a rounding boundary. An oblique edge (a fixture
      // glyph's chamfer) is kept as emitted — hashing its irrational direction would.
      const vertical = q(e.a.x) === q(e.b.x);
      const horizontal = q(e.a.y) === q(e.b.y);
      if (!vertical && !horizontal) {
        out.push(`e:${undirected(e.a, e.b)}`);
        continue;
      }
      const key = vertical ? `x=${q(e.a.x)}` : `y=${q(e.a.y)}`;
      const ta = vertical ? e.a.y : e.a.x;
      const tb = vertical ? e.b.y : e.b.x;
      const iv = ta <= tb ? { t0: ta, t1: tb, p0: e.a, p1: e.b } : { t0: tb, t1: ta, p0: e.b, p1: e.a };
      const list = lines.get(key) ?? [];
      list.push(iv);
      lines.set(key, list);
    } else {
      const key = `${pt(e.center)}r${q(e.r)}`;
      const u = { x: e.a.x - e.center.x, y: e.a.y - e.center.y };
      const v = { x: e.b.x - e.center.x, y: e.b.y - e.center.y };
      const sweep = Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
      // Start the (minor) interval at whichever endpoint it leaves in the +angle sense.
      const from = sweep >= 0 ? u : v;
      const s = (Math.atan2(from.y, from.x) + TAU) % TAU;
      const entry = arcs.get(key) ?? { center: e.center, r: e.r, ivs: [] };
      entry.ivs.push([s, s + Math.abs(sweep)]);
      arcs.set(key, entry);
    }
  }
  for (const [key, list] of lines) {
    list.sort((x, y) => x.t0 - y.t0);
    let cur = list[0]!;
    for (const iv of list.slice(1)) {
      if (iv.t0 <= cur.t1 + 1e-6) {
        if (iv.t1 > cur.t1) cur = { ...cur, t1: iv.t1, p1: iv.p1 };
      } else {
        out.push(`${key}:${undirected(cur.p0, cur.p1)}`);
        cur = iv;
      }
    }
    out.push(`${key}:${undirected(cur.p0, cur.p1)}`);
  }
  for (const [key, { center, r, ivs }] of arcs) {
    // Unroll the circle so an interval crossing angle 0 merges with one starting there.
    const all = ivs.flatMap(([a, b]) => [
      [a, b],
      [a + TAU, b + TAU],
    ]);
    all.sort((x, y) => x[0]! - y[0]!);
    const merged: [number, number][] = [];
    for (const [a, b] of all as [number, number][]) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    const covered = merged.some(([a, b]) => b - a >= TAU - 1e-9);
    if (covered) {
      out.push(`circle@${key}`);
      continue;
    }
    // Keep each merged arc once: the copy whose start lies in [0, 2π).
    for (const [a, b] of merged) {
      if (a >= TAU - 1e-12 || a < 0) continue;
      const p = (ang: number): Point => ({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) });
      out.push(`arc@${key}:${undirected(p(a), p(b))}a${q(b - a)}`);
    }
  }
  return out.sort();
}

const ringToEdges = (ring: readonly Point[]): Edge[] =>
  ring.map((p, i) => ({ t: "line" as const, a: p, b: ring[(i + 1) % ring.length]! }));

function pathEdges(l: {
  start: Point;
  edges: readonly ({ t: "line"; to: Point } | { t: "arc"; to: Point; center: Point; r: number })[];
}): Edge[] {
  const out: Edge[] = [];
  let prev = l.start;
  for (const e of l.edges) {
    out.push(
      e.t === "line" ? { t: "line", a: prev, b: e.to } : { t: "arc", a: prev, b: e.to, center: e.center, r: e.r },
    );
    prev = e.to;
  }
  return out;
}

/** A primitive as an orientation-free canonical string (1e-6 mm quantum): a closed shape is
 *  its canonical edge point set ({@link canonEdgeSet}), so a reflected (re-wound),
 *  re-started or differently-cut outline matches. */
export function canonPrim(p: ScenePrim): string {
  switch (p.t) {
    case "polygon":
      return `polygon|${canonEdgeSet(ringToEdges(p.pts)).join(" ")}`;
    case "region":
      return `region|${canonEdgeSet(p.loops.flatMap(ringToEdges)).join(" ")}`;
    case "line":
      return `line|${undirected(p.a, p.b)}`;
    case "path":
      return `path|${canonEdgeSet(p.loops.flatMap(pathEdges)).join(" ")}`;
    case "arc":
      return `arc|${pt(p.center)}r${q(p.r)}|${undirected(p.start, p.end)}`;
    case "circle":
      return `circle|${pt(p.center)}r${q(p.r)}`;
    case "text":
      return `text|${pt(p.at)}`;
    default:
      return `${p.t}|?`;
  }
}

/**
 * T3: per element id, gP's primitive multiset must equal g · P₀'s. Both scenes are drawn
 * on {@link FIXED_SHEET}, so the render sizes are constants; a size difference would
 * rescale every primitive at once, so it is reported alone.
 */
export function compareScenes(s0: Scene, sG: Scene, f: Frame): Violation[] {
  const out: Violation[] = [];
  if (stable(s0.sizes) !== stable(sG.sizes)) {
    return [{ key: "scene.sizes", path: "scene.sizes", expected: stable(s0.sizes), actual: stable(sG.sizes) }];
  }
  const g0 = sceneGroups(s0);
  const gG = sceneGroups(sG);
  for (const id of [...new Set([...g0.keys(), ...gG.keys()])].sort()) {
    const a = g0.get(id);
    const b = gG.get(id);
    const kind = a?.kind ?? b?.kind ?? "?";
    const expected = (a?.prims ?? []).map((p) => canonPrim(transformPrim(f, p))).sort();
    const actual = (b?.prims ?? []).map(canonPrim).sort();
    if (stable(expected) === stable(actual)) continue;
    const missing = multisetMinus(expected, actual);
    const extra = multisetMinus(actual, expected);
    const key = id === "@walls" ? "scene.walls" : `scene.${kind}[${id}]`;
    out.push({ key, path: generalize(key), expected: missing.join(" ; "), actual: extra.join(" ; ") });
  }
  return out;
}

function multisetMinus(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// T0 — the wrapper is faithful
// ---------------------------------------------------------------------------

/** Strip the wrapper's instance prefix from every string: `g.hall` → `hall`, and inside
 *  prose (`entrance via g.d_main`). Never matches after a word character or a dot, so a
 *  label like `e.g.` is untouched. */
const PREFIX = new RegExp(`(?<![\\w.])${INSTANCE}\\.`, "g");
const unprefix = (v: unknown): unknown =>
  typeof v === "string"
    ? v.replace(PREFIX, "")
    : Array.isArray(v)
      ? v.map(unprefix)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(PREFIX, ""), unprefix(x)]))
        : v;

/**
 * One side of the T0 comparison, normalised: what P and P₀ can legitimately disagree on
 * by CONSTRUCTION is removed — the `g.` prefix, the `instance`/`component` stamps, the
 * `instances` block, the instance's own zone, the `axes` a whole-file import drops, the
 * example's parse-stage warnings (a module's are dropped by `link`), a diagnostic's `file`
 * (P₀'s point into the example BY NAME, P's into the same bytes anonymously), and the
 * sheet diagnostics' anchor (each side's own `paper`/`scale` statement). Everything left
 * must be byte-for-byte the same.
 */
function t0View(obs: Observation, side: "P" | "P0", rel: string): Record<string, unknown> {
  const s = JSON.parse(JSON.stringify(obs.summary)) as Record<string, unknown> & SceneSummary;
  delete s.instances;
  delete s.axes;
  for (const r of s.rooms) {
    delete r.instance;
    delete r.component;
  }
  for (const d of s.doors) delete d.instance;
  for (const x of s.furniture) {
    delete x.instance;
    delete x.component;
  }
  for (const e of s.freedom.elements) delete e.instance;
  if (s.zones) {
    s.zones = s.zones.filter((z) => z.path !== INSTANCE);
    if (s.zones.length === 0) delete s.zones;
  }
  // The schedule groups rows by their innermost zone, and an instance IS a zone — so a row
  // P draws ungrouped is grouped under the instance in P₀.
  for (const row of s.schedule ?? [])
    if ((row as { zone?: string }).zone === INSTANCE) delete (row as { zone?: string }).zone;
  const ast = side === "P" ? astOf(rel) : parse(obs.src).plan;
  const sheet = new Set([ast?.paperSpan, ast?.scaleSpan].filter((x) => x).map((x) => `${x!.start}-${x!.end}`));
  const parseWarnings =
    side === "P"
      ? new Set(
          parse(obs.src)
            .diagnostics.filter((d) => d.severity === "warning")
            .map((d) => `${d.code}@${d.span?.start}-${d.span?.end}`),
        )
      : new Set<string>();
  const diagView = (d: Diagnostic) => ({
    code: d.code ?? null,
    severity: d.severity,
    span:
      d.span === undefined
        ? null
        : d.file === undefined && sheet.has(`${d.span.start}-${d.span.end}`)
          ? "sheet"
          : [d.span.start, d.span.end],
    level: d.level ?? null,
    fixes: (d.fixes ?? []).map((f) => f.edits.map((e) => ({ span: [e.span.start, e.span.end], newText: e.newText }))),
  });
  const out: Record<string, unknown> = {
    ...s,
    diagnostics: s.diagnostics
      .filter((d) => !parseWarnings.has(`${d.code}@${d.span?.start}-${d.span?.end}`))
      .map(diagView),
  };
  for (const r of obs.lint) out[`lint.${r.name}`] = r.diags.map(diagView);
  return side === "P0" ? (unprefix(out) as Record<string, unknown>) : out;
}

/**
 * T0: is P₀ a faithful proxy for the example P itself? Compared top-level key by key (and
 * rule by rule for lint), after {@link t0View}. A P₀ that fails to resolve where P
 * resolves is reported once, as `ok`, rather than as every fact it then lacks.
 */
export function t0Violations(rel: string): Violation[] {
  const src = EXAMPLE_FILES[rel];
  if (src === undefined) throw new Error(`no example ${rel}`);
  const p = observe(src);
  const p0 = observe(wrapperSource(rel, null));
  if (p.summary.ok !== p0.summary.ok) {
    const codes = (o: Observation) =>
      o.summary.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.code)
        .join(",");
    return [
      { key: "ok", path: "ok", expected: `${p.summary.ok} ${codes(p)}`, actual: `${p0.summary.ok} ${codes(p0)}` },
    ];
  }
  const a = t0View(p, "P", rel);
  const b = t0View(p0, "P0", rel);
  const out: Violation[] = [];
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const e = stable(a[key]);
    const x = stable(b[key]);
    if (e !== x) out.push({ key, path: key, expected: e, actual: x });
  }
  return out;
}

// ---------------------------------------------------------------------------
// One example, end to end
// ---------------------------------------------------------------------------

/** One (element, violations) outcome; `tag` is the element name, `+N` when north co-rotated. */
export interface Run {
  tag: string;
  vs: Violation[];
}

/**
 * Tiers T1 + T2 for one example: P₀ against every {@link corpusElements} gP (north fixed),
 * then every {@link coRotatedElements} gP with north turned with it. Returns `null` when
 * P₀ does not resolve — T0 owns that example.
 */
export function runFacts(rel: string): Run[] | null {
  const ast = astOf(rel);
  const obs0 = observe(wrapperSource(rel, null));
  if (!obs0.summary.ok) return null;
  const gf = gateFacts(obs0);
  const runs: Run[] = [];
  for (const g of corpusElements(rel)) {
    const f = frameFor(g, ast.grid);
    const obsG = observe(wrapperSource(rel, g));
    runs.push({
      tag: g.name,
      vs: compareObservations(obs0, obsG, f, ast.north, gateFor(g, f, gf), { translation: g.translate === true }),
    });
  }
  for (const g of coRotatedElements(rel)) {
    const f = frameFor(g, ast.grid);
    const north = rotateNorth(ast.north, g.rotate / 90);
    const obsG = observe(wrapperSource(rel, g, { north }));
    runs.push({
      tag: `${g.name}+N`,
      vs: compareObservations(obs0, obsG, f, north, gateFor(g, f, { ...gf, coNorth: true })),
    });
  }
  return runs;
}

/** Tier T3 for one example: the scene on {@link FIXED_SHEET}, P₀ against every
 *  {@link corpusElements} gP. `null` when P₀ does not resolve. */
export function runScenes(rel: string): Run[] | null {
  const ast = astOf(rel);
  const src0 = wrapperSource(rel, null, { fixedSheet: true });
  if (compile(src0, { world: EXAMPLES_WORLD }).errors.length > 0) return null;
  const s0 = sceneOf(src0);
  return corpusElements(rel).map((g) => ({
    tag: g.name,
    vs: compareScenes(s0, sceneOf(wrapperSource(rel, g, { fixedSheet: true })), frameFor(g, ast.grid)),
  }));
}

// ---------------------------------------------------------------------------
// Witnesses: one component, placed twice
// ---------------------------------------------------------------------------

/** How a witness declares its component `c` — inline by default, or e.g. an import line. */
export interface WitnessOptions {
  grid?: number;
  /** Replaces `component c() { <body> }` (then `body` is ignored), e.g. `import "lib.arch": wing as c`. */
  declare?: string;
  world?: World;
  /** Draw on {@link FIXED_SHEET} (tier T3). */
  fixedSheet?: boolean;
}

/** P₀ and gP for a witness: `component c() { … }` placed as `g` at the origin and by `g`. */
export function witnessPair(body: string, g: GroupElement, opts: WitnessOptions = {}): { p0: string; gP: string } {
  const grid = opts.grid ?? 50;
  const t = g.translate ? translationFor(grid) : 0;
  const sheet = opts.fixedSheet
    ? `  paper ${FIXED_SHEET.paper.size} ${FIXED_SHEET.paper.orientation}\n  scale ${FIXED_SHEET.scale}\n`
    : "";
  const decl = opts.declare ?? `component c() {\n${body}\n  }`;
  const mk = (clauses: string, at: number) =>
    `plan "witness" {\n  units mm\n  grid ${grid}\n${sheet}  ${decl}\n  place c() as ${INSTANCE} at (${at}, ${at})${clauses}\n}\n`;
  return {
    p0: mk("", 0),
    gP: mk(`${g.rotate ? ` rotate ${g.rotate}` : ""}${g.mirror ? ` mirror ${g.mirror}` : ""}`, t),
  };
}

/** Tiers T1–T3 over one witness: every violation, gated exactly as the corpus is. */
export function witnessViolations(body: string, g: GroupElement, opts: WitnessOptions = {}): Violation[] {
  const world = opts.world ?? EXAMPLES_WORLD;
  const f = frameFor(g, opts.grid ?? 50);
  const { p0, gP } = witnessPair(body, g, opts);
  const obs0 = observe(p0, world);
  const obsG = observe(gP, world);
  const vs = compareObservations(obs0, obsG, f, "up", gateFor(g, f, gateFacts(obs0)), {
    translation: g.translate === true,
  });
  const scenes = witnessPair(body, g, { ...opts, fixedSheet: true });
  vs.push(...compareScenes(sceneOf(scenes.p0, world), sceneOf(scenes.gP, world), f));
  return vs;
}

// ---------------------------------------------------------------------------
// Violation bookkeeping
// ---------------------------------------------------------------------------

/** One observed violation, reduced to what a pin names. */
export interface Observed {
  where: string;
  g: string;
  path: string;
}

export const observedKey = (o: Observed): string => `${o.where} | ${o.g} | ${o.path}`;

/** Collapse violations to their distinct pinnable paths for one (where, g). */
export function toObserved(where: string, g: string, vs: readonly Violation[]): Observed[] {
  return [...new Set(vs.map((v) => v.path))].sort().map((path) => ({ where, g, path }));
}

/** A pin row as the known table spells it: `where` and `g` may list several values, and a
 *  row stands for their cross product with its one `path`. */
export interface PinRow {
  where: string | readonly string[];
  g: string | readonly string[];
  path: string;
  cls: string;
}

const listOf = (v: string | readonly string[]): readonly string[] => (typeof v === "string" ? [v] : v);

/** Every (where, g, path) a set of rows pins, with the class(es) pinning it. */
export function expandPins(rows: readonly PinRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    for (const where of listOf(r.where)) {
      for (const g of listOf(r.g)) {
        const key = observedKey({ where, g, path: r.path });
        out.set(key, [...(out.get(key) ?? []), r.cls]);
      }
    }
  }
  return out;
}

/**
 * The two-way pin check for one scope (an example, a tier): observed violations the table
 * does not pin are NEW; pinned ones no longer observed are FIXED. Both must be empty.
 */
export function pinDiff(
  rows: readonly PinRow[],
  observed: readonly Observed[],
  inScope: (o: Observed) => boolean,
): { added: string[]; vanished: string[] } {
  const pinned = expandPins(rows);
  const seen = new Set(observed.filter(inScope).map(observedKey));
  const added = [...seen].filter((k) => !pinned.has(k)).sort();
  const vanished = [...pinned]
    .filter(([k]) => {
      const [where, g, path] = k.split(" | ");
      return inScope({ where: where!, g: g!, path: path! }) && !seen.has(k);
    })
    .map(([k, cls]) => `${k}  (${cls.join(", ")})`)
    .sort();
  return { added, vanished };
}

/** A one-line human rendering of violations, for failure messages. */
export function explain(vs: readonly Violation[], max = 6): string {
  return vs
    .slice(0, max)
    .map((v) => `  ${v.key}\n    expected ${v.expected.slice(0, 300)}\n    actual   ${v.actual.slice(0, 300)}`)
    .join("\n");
}
