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
 * A multi-storey plan cannot be imported whole (its `level` blocks would be dropped), so it
 * is built differently — every storey a component, every storey placed by the same g — and
 * compared storey by storey with the same machinery, its drawing included: see
 * "Multi-storey buildings" below.
 *
 * ## What is compared, and why some things are not
 *
 * {@link summaryFacts} splits `describe()` into keyed facts, each tagged with how the group
 * acts on it; {@link expectFacts} predicts gP's facts from P₀'s with the exact primitives
 * `src/frame.ts` itself exports (`tp`, `transformRect`, `transformDeg`, `makeFrame`), and
 * {@link diffFacts} reports every key where the prediction and gP disagree.
 *
 * **Which predictions are independent of the code under test.** `KINDS.rect`, `box`, `deg`
 * and `instance` predict with the SAME `frame.ts` primitives the compiler uses to move a
 * placed element (`transformRect`, `transformDeg`, `makeFrame`), and `rails` with the same
 * normal-through-the-matrix rule — so a defect inside one of those primitives would move
 * the prediction and the observation together and pass. They are cross-checked elsewhere:
 * T3 carries every drawn primitive through `tp` ALONE (a point map, no rectangle or
 * quarter-turn logic), and `ring` compares floor rings vertex by vertex through `tp`, so a
 * wrong `transformRect`/`transformDeg`/rail rule shows up in the drawing and the rings even
 * though it cannot in the bboxes. `instance` has no such cross-check: its matrix is
 * predicted with `makeFrame`, the constructor `place` itself calls.
 *
 * GATED — compared only under the elements for which they are group facts ({@link gateFor}):
 *
 *  - the raster (`circulation`, and the lint rules that read the nav grid) — sampled on a
 *    lattice anchored at the rooms' min corner, so compared only when that lattice maps onto
 *    itself, and always under a pure translation (tier T2), one fact per measured number so
 *    a violation names the room ({@link circulationFacts});
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
 *  - route and walk POLYLINES — see {@link circulationFacts}.
 *  - diagnostic `message`/`hints`/fix `title` — prose that embeds coordinates and page
 *    words ("on its left side"); the machine-readable half (`code`, `span`, fix edits) is
 *    compared instead.
 *  - in the drawing (T3): the label pass (a greedy search in page order), every text but a
 *    hand-written dimension's number, the `dims auto` chains (laid on fixed PAGE sides) and
 *    hatch fills — see {@link sceneGroups}, which also splits a dimension into `.line`,
 *    `.ticks` and `.text` so its declared tick hand and its text-side defect pin apart.
 *
 * Geometric facts compare at a 1e-6 mm quantum (see `quantise`); invariant facts exactly.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve as resolvePath, sep } from "node:path";
import type { LevelNode, NorthDir, PlaceNode, PlaceRotate, PlanNode, Point, RoofNode } from "../src/ast.js";
import { buildDoorAccessGraph, buildingRoomReach, DEFAULT_TOL, resolvePlan, storeyGrounded } from "../src/analyze.js";
import { type CirculationOverlay, computeCirculationOverlay, navExtent } from "../src/analyze/circulation.js";
import type { RDoor, RFurniture, ROpening, ResolvedLevel, RVoid } from "../src/ir.js";
import { arrivalRuns, verticalConnections, verticalReach, verticalsOf } from "../src/vertical.js";
import { northQuarterTurns } from "../src/describe.js";
import type { Diagnostic, FixSuggestion, Span } from "../src/diagnostics.js";
import { formatPlan } from "../src/format.js";
import { type Frame, det, makeFrame, tp, transformDeg, transformRect } from "../src/frame.js";
import {
  compile,
  DEFAULT_RULESET,
  describe,
  levelBlocks,
  makeVirtualWorld,
  offsetToLineCol,
  type ResolvedPlan,
  type RRoom,
  type RWindow,
  type Scene,
  type SceneSummary,
  type ScenePrim,
  toCompass,
  type World,
} from "../src/index.js";
import { measureExtent, probeSide, type Side, SIDES } from "../src/facade.js";
import { type BuildingContext, buildLintContext } from "../src/lint/context.js";
import { LINT_RULES, reconcileSharedFixes } from "../src/lint.js";
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
 *  `lint()` performs, unfolded so a violation names its rule. `lint()`'s shared-statement
 *  post-pass is applied per rule, which is the same thing: it groups by diagnostic code,
 *  and a code belongs to one rule. */
export function lintByRule(ir: ResolvedPlan): { name: string; diags: Diagnostic[] }[] {
  const ctx = buildLintContext(ir, DEFAULT_RULESET);
  return LINT_RULES.map((r) => ({
    name: r.name,
    diags: reconcileSharedFixes(r.check(ctx).map(withFixProvenance), [{ ir }]),
  }));
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
  if (world === EXAMPLES_WORLD) {
    // Bounded, oldest first out: the corpus revisits a few hundred sources, a fuzz run
    // thousands it never sees again.
    if (observed.size >= 512) observed.delete(observed.keys().next().value!);
    observed.set(src, obs);
  }
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
 * Tier T2's circulation facts, one key per measured number so a violation names the room.
 * Under EVERY element (backlog E.6–E.10 closed the nav grid's page-order ties): the model's
 * header (entrance, cell size, body radius); each room's walk distance, bottleneck width,
 * detour ratio and walk-nearest entrance; every key route's walk, bottleneck and detour; the
 * sealed rooms with their widest way in; and the unmeasured rooms with their reasons — a
 * room measured on one side only shows up as an `<absent>` walk.
 *
 * Only the POLYLINES are left out (the overlay's walk and route paths): a BFS keeps one of
 * several equal-length routes by a fixed W,E,N,S parent order (`src/analyze/grid.ts`), a
 * convention rather than a fact, and no number reported depends on which.
 */
export function circulationFacts(s: SceneSummary): Facts {
  const f: Facts = new Map();
  const c = s.circulation;
  const inv = (k: string, value: unknown): void => void f.set(k, { kind: "inv", value });
  inv("circulation.present", c !== null);
  if (!c) return f;
  inv("circulation.header", { entranceId: c.entranceId, cellSizeMm: c.cellSizeMm, bodyRadiusMm: c.bodyRadiusMm });
  for (const r of c.rooms) {
    inv(`circulation.rooms[${r.roomId}].walk`, r.walkDistanceMm);
    inv(`circulation.rooms[${r.roomId}].bottleneck`, r.bottleneckClearWidthMm);
    inv(`circulation.rooms[${r.roomId}].detour`, r.detourRatio);
    inv(`circulation.rooms[${r.roomId}].entrance`, r.entranceId ?? null);
  }
  inv("circulation.blocked", c.blocked ?? []);
  inv(
    "circulation.unmeasured",
    (c.unmeasured ?? []).map((u) => `${u.roomId}:${u.reason}`),
  );
  for (const r of c.routes) {
    const k = `circulation.routes[${r.fromRoomId}>${r.toRoomId}]`;
    inv(`${k}.walk`, r.walkDistanceMm);
    inv(`${k}.bottleneck`, r.bottleneckClearWidthMm);
    inv(`${k}.detour`, r.detourRatio);
  }
  return f;
}

// ---------------------------------------------------------------------------
// The circulation overlay (the grid the facts are measured on, drawn)
// ---------------------------------------------------------------------------

/** The circulation overlay of a resolved plan: the SAME nav grid the facts come from, with
 *  each room's measured walk as a polyline and each entrance's seed cells. */
export function overlayOf(ir: ResolvedPlan): CirculationOverlay | null {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const voids = ir.elements.filter((e): e is RVoid => e.kind === "void");
  const access = buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings);
  return computeCirculationOverlay(
    rooms,
    ir.walls,
    doors,
    openings,
    furniture,
    access,
    DEFAULT_TOL,
    undefined,
    verticalsOf(ir),
    voids,
  );
}

/**
 * Does a window's page facing sit on a declared TIE (`windowFacingPage`, `src/site.ts`)?
 * Either it sits on a corner of a rectangular room — equidistant from two perpendicular
 * edges, resolved N/S-first — or its host wall's tangent at the window is at 45°, where
 * the outward probe's `|oy| >= |ox|` is an equality.
 */
export function windowOnTie(obs: Observation, windowId: string): boolean {
  const ir = obs.ir;
  if (!ir) return false;
  const w = ir.elements.find((e): e is RWindow => e.kind === "window" && e.id === windowId);
  if (!w) return false;
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const corner = rooms.some(
    (r) =>
      !r.poly &&
      !r.circle &&
      [r.at.x, r.at.x + r.size.w].includes(w.at.x) &&
      [r.at.y, r.at.y + r.size.h].includes(w.at.y),
  );
  if (corner) return true;
  const h = w.host;
  if (!h) return false;
  const arc = h.arc;
  const t = arc ? { x: -(w.at.y - arc.center.y), y: w.at.x - arc.center.x } : { x: h.b.x - h.a.x, y: h.b.y - h.a.y };
  return Math.abs(Math.abs(t.x) - Math.abs(t.y)) <= 1e-6 * Math.hypot(t.x, t.y);
}

/**
 * The facades whose `dims auto` reference wall depends on the ORDER of `ir.walls`:
 * `probeSide` (`src/facade.ts`) keeps the first of the parallel segments nearest the
 * facade's probe point, so where two of them tie at different thicknesses the list order
 * picks the outer face every chain on that side is offset from and ends on. Measured
 * with `probeSide` itself, over the walls in their order and reversed — never a retyped
 * copy of its probe point.
 */
export function facadeProbeOrderSensitive(obs: Observation): Side[] {
  const ir = obs.ir;
  const ext = ir ? measureExtent(ir) : null;
  if (!ir || !ext) return [];
  const reversed = [...ir.walls].reverse();
  return SIDES.filter((side) => stable(probeSide(ir.walls, ext, side)) !== stable(probeSide(reversed, ext, side)));
}

/** Each facade's `dims auto` reference wall line and half thickness (`probeSide`). */
export function facadeProbes(obs: Observation): string {
  const ir = obs.ir;
  const ext = ir ? measureExtent(ir) : null;
  if (!ir || !ext) return "null";
  return stable(Object.fromEntries(SIDES.map((side) => [side, probeSide(ir.walls, ext, side)])));
}

/** Everything a class's `covers` may consult about one (P₀, gP) case. */
export interface CaseContext {
  g: GroupElement;
  /** g's frame. */
  f: Frame;
  /** The element's linear part has `det < 0`. */
  reflects: boolean;
  /** The element's linear part swaps the axes (a quarter-turn). */
  swaps: boolean;
  /** The linear part is the identity or the transposition `[0 1; 1 0]`. */
  identityOrTransposition: boolean;
  /** gP's source — so a class can name the construct it is about (`door id=o2 sliding`). */
  src: string;
  obs0: Observation;
  obsG: Observation;
  /** Every violation of this case, and the set of their paths. */
  violations: readonly Violation[];
  paths: ReadonlySet<string>;
  /**
   * P₀ carries geometry a translation re-rounds: a circle room or an arc edge (whose
   * tessellation and tangents are irrational), or a resolved coordinate `x` with
   * `(x + T) − T ≠ x` — an `at 55%` position that resolved an ulp off its integer.
   */
  floatSensitive: boolean;
}

function floatSensitive(obs: Observation, t: number): boolean {
  const ir = obs.ir;
  if (!ir) return false;
  const pts: Point[] = [];
  for (const e of ir.elements) {
    if (e.kind === "room" && e.circle) return true;
    if (e.kind === "wall") {
      if (e.arcs?.some((a) => a !== undefined)) return true;
      pts.push(...e.points, ...e.openings.map((o) => o.at));
    }
    if ("at" in e && e.at && typeof e.at === "object") pts.push(e.at as Point);
  }
  return pts.some((p) => p.x + t - t !== p.x || p.y + t - t !== p.y);
}

export function caseContext(
  obs0: Observation,
  obsG: Observation,
  g: GroupElement,
  f: Frame,
  vs: readonly Violation[],
): CaseContext {
  return {
    g,
    f,
    reflects: f.a * f.d - f.b * f.c < 0,
    swaps: swapsAxes(f),
    identityOrTransposition:
      (f.a === 1 && f.d === 1 && f.b === 0) || (f.a === 0 && f.d === 0 && f.b === 1 && f.c === 1),
    src: obsG.src,
    obs0,
    obsG,
    violations: vs,
    paths: new Set(vs.map((v) => v.path)),
    floatSensitive: g.translate === true && floatSensitive(obs0, f.tx),
  };
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
): Violation[] {
  const facts0 = new Map([...summaryFacts(obs0.summary, obs0.src, gate), ...lintFacts(obs0, gate)]);
  const factsG = new Map([...summaryFacts(obsG.summary, obsG.src, gate), ...lintFacts(obsG, gate)]);
  if (gate.raster) {
    for (const [k, v] of circulationFacts(obs0.summary)) facts0.set(k, v);
    for (const [k, v] of circulationFacts(obsG.summary)) factsG.set(k, v);
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
 * A hand-written `dim` is split into three PARTS, because it carries two different facts
 * under a reflection and a pin must be able to name one without absorbing the other:
 *
 *  - `.text` — the number, as its ANCHOR POINT only: which side of the line it sits on is
 *    geometry (what `W_DIM_OVERLAP` measures); its value and reading rotation are not;
 *  - `.ticks` — the two 45° station strokes, drawn along `dir + n` (`src/elements/dim.ts`),
 *    whose mirror image is the OTHER diagonal: a page drafting convention, like a hatch;
 *  - `.line` — the dimension line and its witness lines.
 *
 * A tick is recognised by its shape, not by emission order: the one line whose MIDPOINT is
 * an endpoint of another line of the same dim (a station).
 */
export function sceneGroups(scene: Scene): Map<string, { kind: string; part?: string; prims: ScenePrim[] }> {
  const out = new Map<string, { kind: string; part?: string; prims: ScenePrim[] }>();
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
  for (const [id, g] of [...out]) {
    if (g.kind !== "dim") continue;
    out.delete(id);
    const lines = g.prims.filter((p): p is Extract<ScenePrim, { t: "line" }> => p.t === "line");
    const ends = new Set(lines.flatMap((l) => [pt(l.a), pt(l.b)]));
    const isTick = (p: ScenePrim): boolean =>
      p.t === "line" && ends.has(pt({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }));
    const parts: [string, ScenePrim[]][] = [
      ["text", g.prims.filter((p) => p.t === "text")],
      ["ticks", g.prims.filter(isTick)],
      ["line", g.prims.filter((p) => p.t !== "text" && !isTick(p))],
    ];
    for (const [part, prims] of parts) if (prims.length > 0) out.set(`${id}|${part}`, { kind: g.kind, part, prims });
  }
  return out;
}

/**
 * Carry a primitive through a frame. A REFLECTING frame (`det < 0`) reverses orientation, so
 * every arc's `sweep` flips — on an `arc` primitive and on a `path`'s arc edges — exactly as
 * `glyph-lib.ts`'s `mapSceneNode` does for a mirrored glyph; the canonical form below reads
 * the sweep, so a prediction that kept it would draw the arc's complement side.
 */
export function transformPrim(f: Frame, p: ScenePrim): ScenePrim {
  const flips = det(f) < 0;
  const sweepOf = (sweep: 0 | 1): 0 | 1 => (flips ? (sweep === 0 ? 1 : 0) : sweep);
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
              : { ...e, to: tp(f, e.to), center: tp(f, e.center), sweep: sweepOf(e.sweep) },
          ),
        })),
      };
    case "arc":
      return { ...p, center: tp(f, p.center), start: tp(f, p.start), end: tp(f, p.end), sweep: sweepOf(p.sweep) };
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
type Edge =
  | { t: "line"; a: Point; b: Point }
  | { t: "arc"; a: Point; b: Point; center: Point; r: number; sweep: 0 | 1 };

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
      // The interval is read off the arc's SWEEP flag, not off its endpoints alone: two
      // endpoints bound two arcs, and for an exact semicircle (a scallop, a lobe, a pill's end)
      // the two are the same size, so only the flag says which side is drawn. Sweep 1 runs in
      // the +angle sense (screen y-down), so the interval starts at `a`; sweep 0 runs the other
      // way, so it starts at `b`.
      const aa = Math.atan2(e.a.y - e.center.y, e.a.x - e.center.x);
      const ab = Math.atan2(e.b.y - e.center.y, e.b.x - e.center.x);
      const from = e.sweep === 1 ? aa : ab;
      const span = (((e.sweep === 1 ? ab - aa : aa - ab) % TAU) + TAU) % TAU;
      const s = (from + TAU) % TAU;
      const entry = arcs.get(key) ?? { center: e.center, r: e.r, ivs: [] };
      entry.ivs.push([s, s + span]);
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
    // Measure the arcs from a point of the circle NO arc covers, so no arc straddles the angle
    // origin and each comes out exactly once. Taking "the copy whose start lies in [0, 2π)" off
    // the unrolled list instead was seam-sensitive: two pieces meeting exactly at angle 0 kept
    // the piece starting at 0 BESIDE the merged run that already contains it, and whether a
    // float landed on 0 or a hair under 2π decided which spelling came out — so the same ink
    // canonicalised two ways (a semicircle cut at its apex on the +x axis, a pill's end, an
    // oval's vertex). The unrolled line's coverage is EXACT on [2π, 4π) — every interval and
    // every wrap is represented there — so the end of a maximal run that lands in that window
    // is a genuinely uncovered point; one always exists when the circle is not covered.
    const gap = (merged.find(([, b]) => b >= TAU && b < 2 * TAU) ?? merged[0]!)[1];
    const rel = ivs
      .map(([a, b]): [number, number] => {
        const s = (((a - gap) % TAU) + TAU) % TAU;
        return [s, s + (b - a)];
      })
      .sort((x, y) => x[0] - y[0]);
    const runs: [number, number][] = [];
    for (const [a, b] of rel) {
      const last = runs[runs.length - 1];
      if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b);
      else runs.push([a, b]);
    }
    for (const [a, b] of runs) {
      const p = (ang: number): Point => ({
        x: center.x + r * Math.cos(ang + gap),
        y: center.y + r * Math.sin(ang + gap),
      });
      // The midpoint names the SIDE: two arcs with the same endpoints and span (the two halves
      // of a circle cut by a diameter) differ only there.
      out.push(`arc@${key}:${undirected(p(a), p(b))}m${pt(p((a + b) / 2))}a${q(b - a)}`);
    }
  }
  return out.sort();
}

const ringToEdges = (ring: readonly Point[]): Edge[] =>
  ring.map((p, i) => ({ t: "line" as const, a: p, b: ring[(i + 1) % ring.length]! }));

function pathEdges(l: {
  start: Point;
  edges: readonly ({ t: "line"; to: Point } | { t: "arc"; to: Point; center: Point; r: number; sweep: 0 | 1 })[];
}): Edge[] {
  const out: Edge[] = [];
  let prev = l.start;
  for (const e of l.edges) {
    out.push(
      e.t === "line"
        ? { t: "line", a: prev, b: e.to }
        : { t: "arc", a: prev, b: e.to, center: e.center, r: e.r, sweep: e.sweep },
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
    // Through the same sweep-aware interval rule as a path's arc edge, so a door swing (or a
    // scallop) drawn on the other side of its chord is a different mark.
    case "arc":
      return `arc|${canonEdgeSet([{ t: "arc", a: p.start, b: p.end, center: p.center, r: p.r, sweep: p.sweep }]).join(" ")}`;
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
  for (const gid of [...new Set([...g0.keys(), ...gG.keys()])].sort()) {
    const a = g0.get(gid);
    const b = gG.get(gid);
    const kind = a?.kind ?? b?.kind ?? "?";
    const part = a?.part ?? b?.part;
    const expected = (a?.prims ?? []).map((p) => canonPrim(transformPrim(f, p))).sort();
    const actual = (b?.prims ?? []).map(canonPrim).sort();
    if (stable(expected) === stable(actual)) continue;
    const missing = multisetMinus(expected, actual);
    const extra = multisetMinus(actual, expected);
    const id = gid.split("|")[0]!;
    const key = id === "@walls" ? "scene.walls" : `scene.${kind}[${id}]${part ? `.${part}` : ""}`;
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
  return t0Normalise(obs.summary, obs.lint, {
    sheet,
    drop: (d) => parseWarnings.has(`${d.code}@${d.span?.start}-${d.span?.end}`),
    unprefix: side === "P0",
  });
}

/** What one side of a T0 comparison has by construction, so it can be taken out. */
interface T0Side {
  /** The byte spans of THIS side's own `paper`/`scale` statements (a sheet verdict's anchor). */
  sheet: ReadonlySet<string>;
  /** A diagnostic this side has by construction and the other cannot. */
  drop?: (d: Diagnostic) => boolean;
  /** Carry a byte offset into THIS side's root source to the other side's (identity when absent). */
  offset?: (o: number) => number;
  /** Strip the instance prefix (the placed side). */
  unprefix: boolean;
}

/** A diagnostic's T0 view: code, severity, span (raw offsets, or `sheet`), level, fix edits. */
function t0Diag(d: Diagnostic, side: T0Side): Record<string, unknown> {
  const at = (sp: Span, file: string | undefined): [number, number] =>
    file === undefined && side.offset ? [side.offset(sp.start), side.offset(sp.end)] : [sp.start, sp.end];
  return {
    code: d.code ?? null,
    severity: d.severity,
    span:
      d.span === undefined
        ? null
        : d.file === undefined && side.sheet.has(`${d.span.start}-${d.span.end}`)
          ? "sheet"
          : at(d.span, d.file),
    level: d.level ?? null,
    fixes: (d.fixes ?? []).map((f) => f.edits.map((e) => ({ span: at(e.span, f.file ?? d.file), newText: e.newText }))),
  };
}

function t0Normalise(summary: SceneSummary, lint: Observation["lint"], side: T0Side): Record<string, unknown> {
  const s = JSON.parse(JSON.stringify(summary)) as Record<string, unknown> & SceneSummary;
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
  const diagView = (d: Diagnostic) => t0Diag(d, side);
  const out: Record<string, unknown> = {
    ...s,
    diagnostics: s.diagnostics.filter((d) => !side.drop?.(d)).map(diagView),
  };
  for (const r of lint) out[`lint.${r.name}`] = r.diags.map(diagView);
  return side.unprefix ? (unprefix(out) as Record<string, unknown>) : out;
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
  /** The case, so a pin's class can be asked whether it really accounts for a violation. */
  ctx?: CaseContext;
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
  const run = (tag: string, g: GroupElement, north: NorthDir, coNorth: boolean): void => {
    const f = frameFor(g, ast.grid);
    const obsG = observe(wrapperSource(rel, g, coNorth ? { north } : {}));
    const vs = compareObservations(obs0, obsG, f, north, gateFor(g, f, { ...gf, coNorth }));
    runs.push({ tag, vs, ctx: caseContext(obs0, obsG, g, f, vs) });
  };
  for (const g of corpusElements(rel)) run(g.name, g, ast.north, false);
  for (const g of coRotatedElements(rel)) run(`${g.name}+N`, g, rotateNorth(ast.north, g.rotate / 90), true);
  return runs;
}

/** Tier T3 for one example: the scene on {@link FIXED_SHEET}, P₀ against every
 *  {@link corpusElements} gP. `null` when P₀ does not resolve. */
export function runScenes(rel: string): Run[] | null {
  const ast = astOf(rel);
  const src0 = wrapperSource(rel, null, { fixedSheet: true });
  if (compile(src0, { world: EXAMPLES_WORLD }).errors.length > 0) return null;
  const s0 = sceneOf(src0);
  const obs0 = observe(wrapperSource(rel, null));
  return corpusElements(rel).map((g) => {
    const f = frameFor(g, ast.grid);
    const vs = compareScenes(s0, sceneOf(wrapperSource(rel, g, { fixedSheet: true })), f);
    return { tag: g.name, vs, ctx: caseContext(obs0, observe(wrapperSource(rel, g)), g, f, vs) };
  });
}

// ---------------------------------------------------------------------------
// One random case (the fuzz suite, and any probe of it)
// ---------------------------------------------------------------------------

/** How a random plan is rendered as P₀ (`g === null`) or gP, optionally on {@link FIXED_SHEET}. */
export type InstanceRender = (g: GroupElement | null, fixedSheet: boolean) => string;

/**
 * Tiers T1–T3 for one random plan and one element: every violation, and the case context
 * the classes' `covers` predicates read. The scene is drawn on {@link FIXED_SHEET}, so the
 * renderer must drop the plan's own `paper` when asked for it.
 */
export function instanceCase(
  render: InstanceRender,
  g: GroupElement,
  grid: number,
  north: NorthDir,
): { vs: Violation[]; ctx: CaseContext } {
  const f = frameFor(g, grid);
  const obs0 = observe(render(null, false));
  const obsG = observe(render(g, false));
  const vs = compareObservations(obs0, obsG, f, north, gateFor(g, f, gateFacts(obs0)));
  vs.push(...compareScenes(sceneOf(withFixedSheet(render(null, true))), sceneOf(withFixedSheet(render(g, true))), f));
  return { vs, ctx: caseContext(obs0, obsG, g, f, vs) };
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
  return witnessCase(body, g, opts).vs;
}

/** {@link witnessViolations} with its case context, so a witness can also ask its class
 *  whether the predicate accounts for what it reproduces. */
export function witnessCase(
  body: string,
  g: GroupElement,
  opts: WitnessOptions = {},
): { vs: Violation[]; ctx: CaseContext } {
  const world = opts.world ?? EXAMPLES_WORLD;
  const f = frameFor(g, opts.grid ?? 50);
  const { p0, gP } = witnessPair(body, g, opts);
  const obs0 = observe(p0, world);
  const obsG = observe(gP, world);
  const vs = compareObservations(obs0, obsG, f, "up", gateFor(g, f, gateFacts(obs0)));
  const scenes = witnessPair(body, g, { ...opts, fixedSheet: true });
  vs.push(...compareScenes(sceneOf(scenes.p0, world), sceneOf(scenes.gP, world), f));
  return { vs, ctx: caseContext(obs0, obsG, g, f, vs) };
}

// ---------------------------------------------------------------------------
// Multi-storey buildings: every storey a component, every storey placed by ONE g
// ---------------------------------------------------------------------------

/**
 * The shipped examples the whole-file construction cannot see: every one WITH a `level`
 * block. COMPUTED, the complement of {@link ELIGIBLE_EXAMPLES}, never a retyped list.
 */
export const MULTI_STOREY_EXAMPLES: readonly string[] = SHIPPED_EXAMPLES.filter(
  (rel) => levelBlocks(astOf(rel)).length > 0,
);

/** One `level` block of a source, located by its bytes. */
interface StoreyCut {
  level: number;
  /** `level` keyword … the block's closing `}` (exclusive): the statement's span. */
  start: number;
  end: number;
  /** The block's opening `{`. */
  open: number;
  /** `level 2 "First floor" height 3000` — the header, verbatim. */
  header: string;
  /** The component the body becomes. */
  name: string;
  /** The body's own `roof` statements, which stay in the `level` block: each one's span and
   *  its text there (a `wall <id>` names the PLACED wall, `g.<id>`). */
  roofs: { start: number; end: number; text: string }[];
}

function storeyCuts(src: string): StoreyCut[] {
  const { plan } = parse(src);
  if (!plan) throw new Error("storeyCuts: the source does not parse");
  return plan.body
    .filter((s): s is LevelNode => s.kind === "level")
    .map((l) => {
      const { start, end } = l.span!;
      // The header's `{`: the first one outside the storey name's string literal.
      let open = -1;
      let quoted = false;
      for (let i = start; i < end && open < 0; i++) {
        if (src[i] === '"') quoted = !quoted;
        else if (!quoted && src[i] === "{") open = i;
      }
      if (open < 0 || src[end - 1] !== "}") throw new Error(`storeyCuts: level ${l.level} has no { … } block`);
      const name = `storey_${l.level < 0 ? `m${-l.level}` : l.level}`;
      if (plan.components.has(name)) throw new Error(`storeyCuts: the plan already declares ${name}`);
      const roofs = l.body
        .filter((x): x is RoofNode => x.kind === "roof")
        .map((x) => {
          // A `roof polygon` is written in storey coordinates that a `place` frame would not
          // carry from outside the component: not expressible this way, so say so.
          if (x.polygon) throw new Error(`storeyCuts: level ${l.level}'s \`roof polygon\` cannot ride a place frame`);
          const text = src.slice(x.span!.start, x.span!.end);
          const named = x.wall === undefined ? text : text.replace(/(\bwall\s+)(\S+)/, `$1${INSTANCE}.$2`);
          if (x.wall !== undefined && named === text) throw new Error(`storeyCuts: no \`wall ${x.wall}\` in ${text}`);
          return { ...x.span!, text: named };
        });
      return { level: l.level, start, end, open, header: src.slice(start, open).trimEnd(), name, roofs };
    });
}

/** A per-storey wrapper and the map from its byte offsets back to the source's. */
export interface StoreyWrapper {
  src: string;
  /** A byte offset into {@link src} carried to the same byte of the source it was cut from
   *  (a relocated `roof` statement's start and end to its own statement's in the source). */
  toSource(offset: number): number;
}

/**
 * P₀ (`g === null`) or gP for a multi-storey source, by BYTE-PRESERVING surgery: every
 * `level N … { body }` becomes `component storey_N() { body }` in place — its body, and
 * every byte before, between and after the blocks (settings, `let`s, `set`s, components,
 * `site`, `axes`, `title`, comments), copied verbatim — and the plan closes with one
 * `level N … { place storey_N() as g at (t, t) rotate r mirror m }` per storey, its header
 * verbatim, every storey placed by the SAME g (as `./shaft-equivariance-models.ts` builds
 * a building).
 *
 * Why not the corpus's whole-file import: a whole-file import drops `level` blocks, and an
 * IMPORTED component does not see its module's plan-global `let`s (`townhouse`'s storeys
 * are written in `W`, `D`, `SPINE`…), while an inline one sees the root's. So the storeys
 * are inline, and both sides are the SAME text up to the closing `level` lines: every span
 * inside a storey is the same byte offset in P₀ and in gP, and {@link StoreyWrapper.toSource}
 * maps it onto the source P for T0.
 *
 * `north`, when given, replaces the value of the plan's one `north` line (the co-rotated
 * variant); a diagnostic span into the root compares as line/column (`normSpan`), so the
 * edit moves no fact.
 */
export function storeyWrapper(source: string, g: GroupElement | null, opts: { north?: NorthDir } = {}): StoreyWrapper {
  let src = source;
  if (opts.north !== undefined) {
    const line = /^([ \t]*north[ \t]+)\S+/m;
    if ((src.match(new RegExp(line.source, "gm")) ?? []).length !== 1)
      throw new Error("storeyWrapper: co-rotating north needs exactly one `north` line");
    src = src.replace(line, `$1${typeof opts.north === "object" ? opts.north.deg : opts.north}`);
  }
  const cuts = storeyCuts(src);
  if (cuts.length === 0) throw new Error("storeyWrapper: no level block");
  const close = src.lastIndexOf("}");
  const t = g?.translate ? translationFor(parse(src).plan!.grid) : 0;
  const clauses = `${g?.rotate ? ` rotate ${g.rotate}` : ""}${g?.mirror ? ` mirror ${g.mirror}` : ""}`;
  // A roof belongs to the BUILDING (`E_ROOF_PLACEMENT` refuses one inside a component), so
  // it is blanked out of its storey's body — same length, newlines kept, so no offset moves —
  // and written into the storey's `level` block, where the language puts it: verbatim, but
  // for a `wall <id>`, which there names the placed wall `g.<id>`.
  let body = src;
  for (const r of cuts.flatMap((c) => c.roofs)) {
    body = body.slice(0, r.start) + body.slice(r.start, r.end).replace(/[^\n]/g, " ") + body.slice(r.end);
  }
  // Each copied chunk: the wrapper offset it starts at, and the source offset it came from.
  const chunks: { at: number; from: number }[] = [];
  let out = "";
  const copy = (a: number, b: number): void => {
    chunks.push({ at: out.length, from: a });
    out += body.slice(a, b);
  };
  let cursor = 0;
  for (const c of cuts) {
    copy(cursor, c.start);
    out += `component ${c.name}() `;
    copy(c.open, c.end);
    cursor = c.end;
  }
  copy(cursor, close);
  // A relocated roof's text: where it sits in the wrapper and the statement it came from.
  // `wall g.<id>` makes it longer than the source statement, so only its two ENDS map
  // exactly (a statement span's start and end are all a span ever names).
  const roofAt: { at: number; end: number; from: number; fromEnd: number }[] = [];
  for (const c of cuts) {
    out += `  ${c.header} {\n    place ${c.name}() as ${INSTANCE} at (${t}, ${t})${clauses}`;
    for (const r of c.roofs) {
      out += "\n    ";
      roofAt.push({ at: out.length, end: out.length + r.text.length, from: r.start, fromEnd: r.end });
      out += r.text;
    }
    out += "\n  }\n";
  }
  copy(close, src.length);
  return {
    src: out,
    toSource(o) {
      const roof = roofAt.find((r) => r.at <= o && o <= r.end);
      if (roof) return o === roof.end ? roof.fromEnd : Math.min(roof.from + (o - roof.at), roof.fromEnd);
      let k = chunks[0]!;
      for (const ch of chunks) if (ch.at <= o) k = ch;
      return k.from + (o - k.at);
    },
  };
}

/**
 * The multi-storey test source of a building given as level BODIES (the shaft models): a
 * plain `level` plan — what `./shaft-equivariance-models.ts`'s `placed()` places, written
 * the way an author would, so the SAME surgery as the shipped examples turns it into P₀.
 */
export function levelPlanOf(name: string, storeys: readonly string[]): string {
  const levels = storeys.map((body, i) => `  level ${i + 1} {${body}\n  }`).join("\n");
  return `plan "${name}" {\n  units mm\n${levels}\n}\n`;
}

/**
 * {@link BuildingContext} per storey, as `lint()` builds it (`buildingContexts`,
 * `src/lint.ts`, not exported): which runs are shafts, and where a door-less storey is
 * arrived on. Retyped from the source, so `test/equivariance-storeys.test.ts` holds the
 * fold built on it to `lint()` itself, storey by storey.
 */
function buildingContextsOf(levels: readonly ResolvedLevel[], tol: number): Map<number, BuildingContext> {
  const inputs = levels.map((l) => ({ level: l.level, ir: l.ir }));
  const connections = verticalConnections(inputs);
  const peerIds = new Set(connections.map((c) => c.id));
  const grounded = (n: number): boolean => {
    const l = levels.find((x) => x.level === n);
    return l ? storeyGrounded(l.ir, tol) : false;
  };
  const roomReach = buildingRoomReach(inputs, tol);
  const reach = verticalReach(inputs, grounded, roomReach);
  const runs = arrivalRuns(inputs, grounded, roomReach);
  return new Map(
    levels.map((l) => [
      l.level,
      {
        multiStorey: true,
        verticalPeerIds: peerIds,
        arrivalRooms: reach.arrivalRooms.get(l.level) ?? [],
        arrivalShafts: runs.get(l.level) ?? [],
      },
    ]),
  );
}

/**
 * {@link lintByRule} for a multi-storey plan: every storey's rules over its own context
 * WITH the building's (shafts, arrivals), each diagnostic tagged with its `level`, and the
 * shared-statement post-pass over the whole building — so each rule's output, storey by
 * storey, is exactly the slice of `lint()` it contributes.
 */
export function lintStoreysByRule(
  levels: readonly ResolvedLevel[],
): Map<number, { name: string; diags: Diagnostic[] }[]> {
  const building = buildingContextsOf(levels, DEFAULT_RULESET.tolMm);
  const ctxs = levels.map((l) => ({
    level: l.level,
    ctx: buildLintContext(l.ir, DEFAULT_RULESET, building.get(l.level)),
  }));
  const out = new Map<number, { name: string; diags: Diagnostic[] }[]>(levels.map((l) => [l.level, []]));
  for (const r of LINT_RULES) {
    const raised = ctxs.flatMap(({ level, ctx }) => r.check(ctx).map((d) => ({ ...withFixProvenance(d), level })));
    const kept = reconcileSharedFixes(raised, levels);
    for (const l of levels) out.get(l.level)!.push({ name: r.name, diags: kept.filter((d) => d.level === l.level) });
  }
  return out;
}

/** Everything the oracle reads off one compiled multi-storey source. */
export interface BuildingObservation {
  src: string;
  /** The whole plan's `describe()`. */
  summary: SceneSummary;
  /**
   * One {@link Observation} per storey, ascending: the storey's `describe().levels[i]` as a
   * summary (with the whole plan's `ok`, and the diagnostics tagged with this level), its
   * resolved plan, and its slice of every rule — so every single-storey fact kind, gate and
   * class applies to a storey unchanged.
   */
  storeys: Map<number, Observation>;
}

const observedBuildings = new Map<string, BuildingObservation>();

export function observeBuilding(src: string, world: World = EXAMPLES_WORLD): BuildingObservation {
  const hit = world === EXAMPLES_WORLD ? observedBuildings.get(src) : undefined;
  if (hit) return hit;
  const summary = describe(src, { world });
  const { levels } = resolvePlan(src, { world });
  const lint = lintStoreysByRule(levels);
  const storeys = new Map<number, Observation>();
  for (const l of summary.levels ?? []) {
    const { level, name: _name, ...facts } = l;
    const storey: SceneSummary = {
      ...facts,
      ok: summary.ok,
      diagnostics: summary.diagnostics.filter((d) => d.level === level),
    };
    const ir = levels.find((x) => x.level === level)?.ir ?? null;
    storeys.set(level, { src, summary: storey, ir, lint: lint.get(level) ?? [] });
  }
  const obs = { src, summary, storeys };
  if (world === EXAMPLES_WORLD) {
    if (observedBuildings.size >= 256) observedBuildings.delete(observedBuildings.keys().next().value!);
    observedBuildings.set(src, obs);
  }
  return obs;
}

/** The pin scope of one storey of a building (`townhouse.arch@L2`), and of the building itself. */
export const storeyScope = (building: string, level: number): string => `${building}@L${level}`;
export const buildingScope = (building: string): string => `${building}@building`;

/**
 * The facts that belong to the BUILDING, not to a storey: whether it resolves, its storeys
 * (number and name, in page order), `describe().vertical` (every shaft's stops — level,
 * `dir`, the room it lands in — and the reachable storeys), and the diagnostics no storey
 * owns, the sheet's gated as in {@link summaryFacts}. All invariant: a shaft's `dir` is
 * authored per storey, and a stop's room is an id.
 */
export function buildingFacts(obs: BuildingObservation, gate: { sheet: boolean }): Facts {
  const f: Facts = new Map();
  const s = obs.summary;
  const inv = (k: string, value: unknown): void => void f.set(k, { kind: "inv", value });
  inv("ok", s.ok);
  inv(
    "levels.order",
    (s.levels ?? []).map((l) => ({ level: l.level, name: l.name ?? null })),
  );
  inv("vertical", s.vertical ?? null);
  const sheetSpans = sheetStatementSpans(obs.src);
  const onSheet = (d: Diagnostic): boolean =>
    d.file === undefined && d.span !== undefined && sheetSpans.has(`${d.span.start}-${d.span.end}`);
  const unowned = s.diagnostics.filter((d) => d.level === undefined);
  const plain = unowned.filter((d) => !onSheet(d));
  inv(
    "diagnostics",
    plain.map((d) => projectDiag(d, obs.src)),
  );
  inv(
    "diagnostics.fixes",
    plain.map((d) => projectFixes(d, obs.src)),
  );
  if (gate.sheet) {
    inv(
      "diagnostics.sheet",
      unowned.filter(onSheet).map((d) => projectDiag(d, obs.src)),
    );
  }
  return f;
}

/** The building as an {@link Observation}, for a {@link CaseContext} of its own scope. */
const asObservation = (b: BuildingObservation): Observation => ({ src: b.src, summary: b.summary, ir: null, lint: [] });

/**
 * One P₀ → gP comparison of a building: every storey through {@link compareObservations},
 * gated by THAT storey's lattice and sheet, plus the {@link buildingFacts}. Keyed by
 * {@link storeyScope}/{@link buildingScope}; a storey present on one side only is reported
 * as the building's `levels.order`.
 */
export function compareBuildings(
  name: string,
  b0: BuildingObservation,
  bG: BuildingObservation,
  g: GroupElement,
  f: Frame,
  northG: NorthDir,
  coNorth: boolean,
): Map<string, { vs: Violation[]; ctx: CaseContext }> {
  const out = new Map<string, { vs: Violation[]; ctx: CaseContext }>();
  for (const [level, o0] of b0.storeys) {
    const oG = bG.storeys.get(level);
    if (!oG) continue;
    const vs = compareObservations(o0, oG, f, northG, gateFor(g, f, { ...gateFacts(o0), coNorth }));
    out.set(storeyScope(name, level), { vs, ctx: caseContext(o0, oG, g, f, vs) });
  }
  const sheet = !swapsAxes(f);
  const vs = diffFacts(expectFacts(buildingFacts(b0, { sheet }), f, northG), canonFacts(buildingFacts(bG, { sheet })));
  out.set(buildingScope(name), { vs, ctx: caseContext(asObservation(b0), asObservation(bG), g, f, vs) });
  return out;
}

/** The elements a building is run with: all eight of D4 but the identity (P₀ IS the
 *  identity), and the translation. */
export const BUILDING_ELEMENTS: readonly GroupElement[] = D4_TEST_ELEMENTS.filter((g) => g.name !== "e");

/**
 * Tiers T1 + T2 for one multi-storey source: P₀ against every {@link BUILDING_ELEMENTS} gP
 * (north fixed), then — for a plan with a `site`, the one input a compass-class rule reads —
 * every proper rotation with north turned with it (`+N`). Runs keyed by scope; `null` when
 * P₀ does not resolve (T0 owns that).
 */
export function runBuildingFacts(
  name: string,
  source: string,
  world: World = EXAMPLES_WORLD,
): Map<string, Run[]> | null {
  const ast = parse(source).plan!;
  const b0 = observeBuilding(storeyWrapper(source, null).src, world);
  if (!b0.summary.ok) return null;
  const runs = new Map<string, Run[]>();
  const run = (tag: string, g: GroupElement, north: NorthDir, coNorth: boolean): void => {
    const f = frameFor(g, ast.grid);
    const bG = observeBuilding(storeyWrapper(source, g, coNorth ? { north } : {}).src, world);
    for (const [where, { vs, ctx }] of compareBuildings(name, b0, bG, g, f, north, coNorth)) {
      runs.set(where, [...(runs.get(where) ?? []), { tag, vs, ctx }]);
    }
  };
  for (const g of BUILDING_ELEMENTS) run(g.name, g, ast.north, false);
  if (ast.site !== undefined) {
    for (const g of D4_ELEMENTS.filter((x) => !x.mirror && x.rotate !== 0)) {
      run(`${g.name}+N`, g, rotateNorth(ast.north, g.rotate / 90), true);
    }
  }
  return runs;
}

/**
 * T0 for a multi-storey source: is P₀ (every storey a component, placed at the origin) a
 * faithful proxy for P itself? Per storey, the {@link t0View} normalisation (instance
 * prefix, stamps and zone; P₀'s spans carried back onto P's bytes by
 * {@link StoreyWrapper.toSource}); for the building, its storeys, `vertical` (unprefixed)
 * and the diagnostics no storey owns. Keyed by scope, like {@link runBuildingFacts}.
 */
export function t0BuildingViolations(
  name: string,
  source: string,
  opts: { world?: World; plant?: (p0: string) => string } = {},
): Map<string, Violation[]> {
  const world = opts.world ?? EXAMPLES_WORLD;
  const built = storeyWrapper(source, null);
  // `plant` edits P₀ (the control that shows T0 can fail); the offset map is the unplanted one.
  const w = { ...built, src: opts.plant ? opts.plant(built.src) : built.src };
  const p = observeBuilding(source, world);
  const p0 = observeBuilding(w.src, world);
  const out = new Map<string, Violation[]>();
  if (p.summary.ok !== p0.summary.ok) {
    const codes = (o: BuildingObservation) =>
      o.summary.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.code)
        .join(",");
    out.set(buildingScope(name), [
      { key: "ok", path: "ok", expected: `${p.summary.ok} ${codes(p)}`, actual: `${p0.summary.ok} ${codes(p0)}` },
    ]);
    return out;
  }
  const sheetOf = (src: string): Set<string> => sheetStatementSpans(src);
  const sideP: T0Side = { sheet: sheetOf(source), unprefix: false };
  const sideP0: T0Side = { sheet: sheetOf(w.src), offset: w.toSource, unprefix: true };
  const compare = (where: string, a: Record<string, unknown>, b: Record<string, unknown>): void => {
    const vs: Violation[] = [];
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const e = stable(a[key]);
      const x = stable(b[key]);
      if (e !== x) vs.push({ key, path: key, expected: e, actual: x });
    }
    out.set(where, vs);
  };
  for (const level of new Set([...p.storeys.keys(), ...p0.storeys.keys()])) {
    const a = p.storeys.get(level);
    const b = p0.storeys.get(level);
    compare(
      storeyScope(name, level),
      a ? t0Normalise(a.summary, a.lint, sideP) : {},
      b ? t0Normalise(b.summary, b.lint, sideP0) : {},
    );
  }
  const building = (o: BuildingObservation, side: T0Side): Record<string, unknown> => {
    const v = {
      levels: (o.summary.levels ?? []).map((l) => ({ level: l.level, name: l.name ?? null })),
      vertical: o.summary.vertical ?? null,
      diagnostics: o.summary.diagnostics.filter((d) => d.level === undefined).map((d) => t0Diag(d, side)),
    };
    return side.unprefix ? (unprefix(v) as Record<string, unknown>) : v;
  };
  compare(buildingScope(name), building(p, sideP), building(p0, sideP0));
  return out;
}

// ---------------------------------------------------------------------------
// Multi-storey buildings, tier T3: each storey's drawn scene
// ---------------------------------------------------------------------------

/**
 * A multi-storey source on {@link FIXED_SHEET}: its own `paper`/`scale` statements blanked
 * (same length, so no offset moves) and the fixed sheet stated first in the plan body. A
 * `level` plan's sheet is the building's (every storey is drawn on it), so this is the
 * same sheet the single-storey T3 draws on; applied to the SOURCE, before the storey
 * surgery, so P₀ and every gP inherit it and still differ only in their closing `level`
 * lines.
 */
export function withFixedSheetStoreys(src: string): string {
  const plan = parse(src).plan;
  if (!plan) throw new Error("withFixedSheetStoreys: the source does not parse");
  let out = src;
  for (const sp of [plan.paperSpan, plan.scaleSpan]) {
    if (sp) out = out.slice(0, sp.start) + out.slice(sp.start, sp.end).replace(/[^\n]/g, " ") + out.slice(sp.end);
  }
  const open = /^plan\s+"[^"]*"\s*\{/m.exec(out);
  if (!open) throw new Error('withFixedSheetStoreys: no `plan "…" {` to anchor the sheet on');
  const at = open.index + open[0].length;
  const sheet = `\n  paper ${FIXED_SHEET.paper.size} ${FIXED_SHEET.paper.orientation}\n  scale ${FIXED_SHEET.scale}`;
  return out.slice(0, at) + sheet + out.slice(at);
}

/** Every storey's annotated Scene of a `level` source, by level (tier T3), or a thrown
 *  error naming why there is none. */
export function storeyScenes(src: string, world: World = EXAMPLES_WORLD): Map<number, Scene> {
  const out = compile(src, { world, annotate: true });
  if (!out.pages) throw new Error(`no pages: ${out.errors.map((e) => e.message).join("; ") || "not a level plan"}`);
  return new Map(out.pages.map((p) => [p.level, p.scene]));
}

/**
 * Tier T3 for one multi-storey source: every storey's scene, P₀ against every
 * {@link BUILDING_ELEMENTS} gP, through {@link compareScenes} — the single-storey tier's
 * comparison unchanged (the same {@link sceneGroups} split, canonical form, exclusions and
 * fixed sheet), one storey's page at a time, every storey carried by the same g. North is
 * held fixed, as `runScenes` holds it: the north arrow is page chrome, not a compared group
 * (measured: turning `north` alone moves no compared group on any shipped storey). A storey
 * drawn on one side only is reported on
 * the building as `scene.pages`. Runs keyed by scope; `null` when P₀ does not compile (T0
 * owns that).
 */
export function runBuildingScenes(
  name: string,
  source: string,
  world: World = EXAMPLES_WORLD,
): Map<string, Run[]> | null {
  const grid = parse(source).plan!.grid;
  const sheet = withFixedSheetStoreys(source);
  const src0 = storeyWrapper(sheet, null).src;
  if (compile(src0, { world }).errors.length > 0) return null;
  const s0 = storeyScenes(src0, world);
  // The case context is what a pin's class is asked about, so it is built only for a run
  // that HAS a violation (`pinAudit` skips a run without one): the observations it reads
  // re-run describe() and lint(), which on the scaled models costs far more than the scene.
  const b0 = (): BuildingObservation => observeBuilding(storeyWrapper(source, null).src, world);
  const runs = new Map<string, Run[]>();
  const push = (where: string, run: Run): void => void runs.set(where, [...(runs.get(where) ?? []), run]);
  for (const g of BUILDING_ELEMENTS) {
    const f = frameFor(g, grid);
    const sG = storeyScenes(storeyWrapper(sheet, g).src, world);
    const bG = (): BuildingObservation => observeBuilding(storeyWrapper(source, g).src, world);
    for (const [level, scene0] of s0) {
      const sceneG = sG.get(level);
      if (!sceneG) continue;
      const vs = compareScenes(scene0, sceneG, f);
      const ctx = vs.length > 0 ? caseContext(b0().storeys.get(level)!, bG().storeys.get(level)!, g, f, vs) : undefined;
      push(storeyScope(name, level), { tag: g.name, vs, ...(ctx ? { ctx } : {}) });
    }
    const pages = (s: Map<number, Scene>) => stable([...s.keys()]);
    const vs: Violation[] =
      pages(s0) === pages(sG)
        ? []
        : [{ key: "scene.pages", path: "scene.pages", expected: pages(s0), actual: pages(sG) }];
    const ctx = vs.length > 0 ? caseContext(asObservation(b0()), asObservation(bG()), g, f, vs) : undefined;
    push(buildingScope(name), { tag: g.name, vs, ...(ctx ? { ctx } : {}) });
  }
  return runs;
}

/**
 * One scene, normalised for T0 and split into comparable keys. Every node is kept — the
 * labels, hatches, every text and the `dims auto` chains that T3 leaves out, because T0
 * compares at the IDENTITY, where page order is no excuse — grouped by the element that
 * drew it (`scene.<kind>[<id>]`), the wall fabric as `scene.walls`, and every other
 * id-less node by its layer (`scene.<layer>`: `dims` is the `dims auto` chains); each
 * group a multiset of nodes, since paint order across statements is not drawn (the SVG
 * backend emits by layer). Every other scene key (`sizes`, `bounds`, `chrome`, `title`, …)
 * is one key `scene.<key>`. What the two sides differ in by CONSTRUCTION is taken out: on
 * the placed side the `g.` prefix (`unprefix`), every `span` carried back onto the
 * source's bytes (`toSource`), and the instance's own zone on a schedule row (`zone: "g"`;
 * an instance is a zone — `t0Normalise` drops the same stamp).
 */
function t0SceneView(scene: Scene, side: { placed: false } | { placed: true; toSource(o: number): number }) {
  const norm = (v: unknown, key?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => norm(x));
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    if (side.placed && key === "span" && typeof o.start === "number" && typeof o.end === "number") {
      return { ...o, start: side.toSource(o.start), end: side.toSource(o.end as number) };
    }
    return Object.fromEntries(
      Object.entries(o)
        .filter(([k, x]) => !(side.placed && k === "zone" && x === INSTANCE))
        .map(([k, x]) => [k, norm(x, k)]),
    );
  };
  const view = (side.placed ? unprefix(norm(scene)) : norm(scene)) as Scene;
  const out = new Map<string, string[]>();
  const { nodes, ...rest } = view;
  for (const [k, v] of Object.entries(rest)) out.set(`scene.${k}`, [stable(v)]);
  for (const n of nodes) {
    const key =
      n.elementId !== undefined
        ? `scene.${n.elementKind ?? "?"}[${n.elementId}]`
        : WALL_LAYERS.has(n.layer)
          ? "scene.walls"
          : `scene.${n.layer}`;
    out.set(key, [...(out.get(key) ?? []), stable(n)]);
  }
  for (const v of out.values()) v.sort();
  return out;
}

/**
 * T0 for a multi-storey DRAWING: does P₀ (every storey a component, placed at the origin)
 * draw what P draws, storey by storey, on P's own sheet? Every node and every scene key,
 * after {@link t0SceneView}'s normalisation; a violation names the group, with the nodes
 * one side has and the other lacks. Runs tagged `T0`, keyed by scope; a run with a
 * violation carries the identity's case context with P as `obs0` and P₀ as `obsG`, so
 * its pin's class is audited like any other. `plant` edits P₀ (the control that shows it
 * can fail). Not on the fixed sheet: this is the claim that the construction draws the
 * shipped example's own pages.
 */
export function t0BuildingScenes(
  name: string,
  source: string,
  opts: { world?: World; plant?: (p0: string) => string } = {},
): Map<string, Run[]> {
  const world = opts.world ?? EXAMPLES_WORLD;
  const built = storeyWrapper(source, null);
  const src0 = opts.plant ? opts.plant(built.src) : built.src;
  const sP = storeyScenes(source, world);
  const sP0 = storeyScenes(src0, world);
  const e = elementNamed("e");
  const f = frameFor(e, parse(source).plan!.grid);
  const out = new Map<string, Run[]>();
  for (const level of new Set([...sP.keys(), ...sP0.keys()])) {
    const a = sP.get(level);
    const b = sP0.get(level);
    const va = a ? t0SceneView(a, { placed: false }) : new Map<string, string[]>();
    const vb = b ? t0SceneView(b, { placed: true, toSource: built.toSource }) : new Map<string, string[]>();
    const vs: Violation[] = [];
    for (const key of [...new Set([...va.keys(), ...vb.keys()])].sort()) {
      const inP = va.get(key) ?? [];
      const inP0 = vb.get(key) ?? [];
      if (stable(inP) === stable(inP0)) continue;
      vs.push({
        key,
        path: generalize(key),
        expected: multisetMinus(inP, inP0).join(" ; "),
        actual: multisetMinus(inP0, inP).join(" ; "),
      });
    }
    const oP = (): Observation | undefined => observeBuilding(source, world).storeys.get(level);
    const oP0 = (): Observation | undefined => observeBuilding(src0, world).storeys.get(level);
    const ctx = vs.length > 0 && oP() && oP0() ? caseContext(oP()!, oP0()!, e, f, vs) : undefined;
    out.set(storeyScope(name, level), [{ tag: "T0", vs, ...(ctx ? { ctx } : {}) }]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Violation bookkeeping
// ---------------------------------------------------------------------------

/**
 * One observed violation, reduced to what a pin names: where, under which element, which
 * generalised path, WHICH element (`id`, the concrete key's bracketed id — `g.r_gallery`;
 * `""` for a key with none), and how BIG (`delta`, the largest numeric |actual − expected|
 * over the violations collapsed into it; `NaN` when a side is absent or not a number).
 */
export interface Observed {
  where: string;
  g: string;
  path: string;
  id: string;
  delta: number;
}

/** The element id inside a concrete key: `circulation.rooms[g.hall].walk` → `g.hall`. */
export const idOfKey = (key: string): string => /\[([^\]]*)\]/.exec(key)?.[1] ?? "";

export const observedKey = (o: Pick<Observed, "where" | "g" | "path" | "id">): string =>
  `${o.where} | ${o.g} | ${o.path} | ${o.id}`;

/** |actual − expected| of a numeric violation; `NaN` for anything else. */
export function numericDelta(v: Violation): number {
  const a = Number(v.actual);
  const e = Number(v.expected);
  return v.actual.trim() === "" || v.expected.trim() === "" ? Number.NaN : Math.abs(a - e);
}

/** Collapse violations to their distinct (path, id) pairs for one (where, g). */
export function toObserved(where: string, g: string, vs: readonly Violation[]): Observed[] {
  const out = new Map<string, Observed>();
  for (const v of vs) {
    const id = idOfKey(v.key);
    const o = { where, g, path: v.path, id, delta: numericDelta(v) };
    const k = observedKey(o);
    const prev = out.get(k);
    out.set(k, prev ? { ...prev, delta: Number.isNaN(prev.delta) ? prev.delta : Math.max(prev.delta, o.delta) } : o);
  }
  return [...out.values()].sort((a, b) => (observedKey(a) < observedKey(b) ? -1 : 1));
}

/**
 * A pin row as the known table spells it: `where` and `g` may list several values, and a
 * row stands for their cross product with its one `path`.
 *
 *  - `ids`, when present, pins ONLY those elements — one expanded pin per id, each of which
 *    must still be observed. Absent: the row pins the path for every element (one wildcard
 *    pin per (where, g), observed while any element violates it).
 *  - `maxDelta`, when present, bounds the SIZE the row absorbs: an observed violation whose
 *    `delta` exceeds it (or is `NaN` — a side absent) is not pinned by this row, so a
 *    regression past the measured magnitude fails as NEW.
 */
export interface PinRow {
  where: string | readonly string[];
  g: string | readonly string[];
  path: string;
  ids?: readonly string[];
  maxDelta?: number;
  cls: string;
}

const listOf = (v: string | readonly string[]): readonly string[] => (typeof v === "string" ? [v] : v);

/** The wildcard id of a row with no `ids`. */
const ANY = "*";

/** Every (where, g, path, id) a set of rows pins, with the rows pinning it. */
export function expandPins(rows: readonly PinRow[]): Map<string, PinRow[]> {
  const out = new Map<string, PinRow[]>();
  for (const r of rows) {
    for (const where of listOf(r.where)) {
      for (const g of listOf(r.g)) {
        for (const id of r.ids ?? [ANY]) {
          const key = observedKey({ where, g, path: r.path, id });
          out.set(key, [...(out.get(key) ?? []), r]);
        }
      }
    }
  }
  return out;
}

/**
 * The two-way pin check for one scope (an example, a tier): observed violations no row
 * pins (by id, or by wildcard, within the row's bound) are NEW; pinned ones no longer
 * observed are FIXED. Both must be empty.
 */
export function pinDiff(
  rows: readonly PinRow[],
  observed: readonly Observed[],
  inScope: (o: Pick<Observed, "where" | "g" | "path" | "id">) => boolean,
): { added: string[]; vanished: string[] } {
  const pinned = expandPins(rows);
  const seen = observed.filter(inScope);
  const within = (o: Observed, rs: readonly PinRow[] | undefined): boolean =>
    (rs ?? []).some((r) => r.maxDelta === undefined || o.delta <= r.maxDelta);
  const added = seen
    .filter((o) => !within(o, pinned.get(observedKey(o))) && !within(o, pinned.get(observedKey({ ...o, id: ANY }))))
    .map((o) => `${observedKey(o)}${Number.isNaN(o.delta) ? "" : `  (Δ ${o.delta})`}`)
    .sort();
  const seenExact = new Set(seen.map(observedKey));
  const seenAny = new Set(seen.map((o) => observedKey({ ...o, id: ANY })));
  const vanished = [...pinned]
    .filter(([k]) => {
      const [where, g, path, id] = k.split(" | ") as [string, string, string, string];
      return inScope({ where, g, path, id }) && !(id === ANY ? seenAny : seenExact).has(k);
    })
    .map(([k, rs]) => `${k}  (${rs.map((r) => r.cls).join(", ")})`)
    .sort();
  return { added, vanished };
}

/**
 * The pin AUDIT: a pin is a claim about a mechanism, and its class's `covers` predicate is
 * that claim made executable. For every observed violation a row pins, at least one of
 * the pinning rows' classes must say it accounts for it — so a pin cannot sit on a
 * violation its own class's evidence does not describe. Returns the failures.
 */
export function pinAudit(
  rows: readonly PinRow[],
  classes: Readonly<Record<string, { covers(v: Violation, c: CaseContext): boolean }>>,
  where: string,
  runs: readonly Run[],
): string[] {
  const pinned = expandPins(rows);
  const out: string[] = [];
  for (const r of runs) {
    if (!r.ctx) continue;
    for (const v of r.vs) {
      const o = { where, g: r.tag, path: v.path, id: idOfKey(v.key) };
      const rs = [...(pinned.get(observedKey(o)) ?? []), ...(pinned.get(observedKey({ ...o, id: ANY })) ?? [])];
      if (rs.length === 0) continue; // unpinned: pinDiff reports it as NEW
      if (!rs.some((row) => classes[row.cls]?.covers(v, r.ctx!) === true)) {
        out.push(
          `${observedKey(o)} is pinned as ${rs.map((x) => x.cls).join("/")}, whose predicate does not account for it`,
        );
      }
    }
  }
  return out;
}

/** A one-line human rendering of violations, for failure messages. */
export function explain(vs: readonly Violation[], max = 6): string {
  return vs
    .slice(0, max)
    .map((v) => `  ${v.key}\n    expected ${v.expected.slice(0, 300)}\n    actual   ${v.actual.slice(0, 300)}`)
    .join("\n");
}
