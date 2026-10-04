/**
 * The PINNED equivariance violations — data for `test/equivariance-*.test.ts`.
 *
 * Every violation the D4 ⋉ Z² oracle (`test/d4-oracle.ts`) finds is either a defect a later
 * change will close, or a declared convention that is not a group fact. Each is pinned
 * here, and the suites assert the computed set EQUALS this table in both directions (the
 * G.10 tripwire of `test/plan-json.test.ts`, generalised):
 *
 *  - a violation not in {@link KNOWN} fails as `NEW equivariance violation …` — a
 *    regression, or a new finding to classify and pin with a witness;
 *  - a row no longer observed fails as `FIXED: delete the pin and its witness …` — the
 *    defect closed, so the pin (and its `STILL …` witness, which fails at the same moment)
 *    must go, turning the tripwire into the law it was waiting for.
 *
 * A row stands for the cross product of its `where`, `g` and (optional) `ids` with its one
 * `path` (`d4-oracle.ts`'s `generalize` drops element ids from the path: `rooms[].bbox`;
 * `ids` names the elements). `g` is a group element's name (`r90`, `mx`, `r90mx` =
 * `rotate 90 mirror x`, `t` = the translation), `+N` when north turned with it, and `T0` for
 * the wrapper-faithfulness tier. `maxDelta` bounds the SIZE a row absorbs (mm, or the unit
 * of the fact), so a regression past the measured magnitude fails as NEW. Two rows may pin
 * the same triple when two classes both break it.
 *
 * The corpus suites also ask each pinned violation's class whether its `covers` predicate
 * really accounts for it — a pin is a claim about a mechanism, and the predicate is that
 * claim made executable. The fuzz suite, which cannot name examples, relies on the
 * predicates alone.
 */

import { type CaseContext, facadeProbeOrderSensitive, facadeProbes, type Violation, windowOnTie } from "./d4-oracle.js";

/** Every pinned class. */
export type ClassName = "facing-tie" | "float-translation" | "dim-tick-hand" | "facade-probe-order";

export interface KnownClass {
  /** `defect`: a later change closes it. `declared`: a convention, never a defect. */
  status: "defect" | "declared";
  /**
   * Which law it breaks. `equivariance`: facts(gP) ≠ g · facts(P₀). `composition`: the
   * plan does not survive being placed at all — it fails at the IDENTITY (tier T0), so it
   * is a defect of `place` as a composition operator, found by this oracle but not a
   * failure of equivariance.
   */
  law: "equivariance" | "composition";
  /** Where in `src/` the rule lives (and any decision record that already names it). */
  site: string;
  /** One line: what breaks. */
  summary: string;
  /** Does this class account for violation `v` of case `c`? (fuzz exclusion, pin audit) */
  covers(v: Violation, c: CaseContext): boolean;
}

/** The element id inside a key: `scene.door[g.o2]` → `g.o2`. */
const idOf = (key: string): string => /\[([^\]]*)\]/.exec(key)?.[1] ?? "";

/**
 * The raster pins are gone: the nav grid breaks its ties D4-symmetrically (backlog E.6–E.10
 * — an entrance on a lattice line seeds both sides, a threshold is carved on a symmetric
 * row set, and among equidistant cells a room is measured to the one the walk reaches
 * first, then by a group-invariant key), so on a grid-aligned plan every circulation fact
 * is exactly equivariant and the four classes that pinned it (`raster-tie`,
 * `entrance-seed-walk`, `anchor-far-tie`, `threshold-carve`) are closed. Their witnesses
 * are the law now ("closed classes" in `test/equivariance-corpus.test.ts`); a raster
 * violation of any size is NEW.
 */
export const KNOWN_CLASSES: Readonly<Record<ClassName, KnownClass>> = {
  "facing-tie": {
    status: "declared",
    law: "equivariance",
    site: "src/site.ts:191,206 (ties resolve horizontal-first, then N/W)",
    summary:
      "a window on a room corner (equidistant from two edges) or on a wall at 45° is a TIE, and ties resolve N/S before E/W by stated convention — a page-order rule, so an axis swap changes the answer",
    covers: (v, c) => c.swaps && v.path === "windows[].facing" && windowOnTie(c.obs0, idOf(v.key)),
  },
  "float-translation": {
    status: "defect",
    law: "equivariance",
    site: "src/lint/rules/doors.ts:180-185 (pocketRunMm `>=` / `<= 0`), and every exact comparison lint makes on a resolved coordinate",
    summary:
      "lint compares resolved coordinates in ABSOLUTE floats, and P₀ carries geometry a translation re-rounds — an `at 55%` position resolved an ulp off its integer that 20 m of offset rounds back — so an exact threshold flips under a pure translation: a pocket door's `>= need`. (The circulation half is CLOSED: the nav grid samples in its extent's own frame, snapped to a dyadic lattice — see the closed-classes law.)",
    // No circulation fact moves under a translation: a raster change under `t` is NEW. Only
    // lint outputs of float-sensitive geometry remain.
    covers: (v, c) => c.g.translate === true && c.floatSensitive && v.path.startsWith("lint."),
  },
  "dim-tick-hand": {
    status: "declared",
    law: "equivariance",
    site: "src/elements/dim.ts:290-291 (each station tick is drawn along `dir + n`)",
    summary:
      "a dimension's 45° station tick is a slash of fixed page sense relative to the line — a drafting convention like a hatch angle — so a reflected dim draws the other diagonal",
    covers: (v, c) => c.reflects && v.path === "scene.dim[].ticks",
  },
  "facade-probe-order": {
    status: "defect",
    law: "composition",
    site: "src/facade.ts probeSide (`d < bestDist`: the FIRST of the equidistant parallel segments wins) over `ir.walls`, whose order a `place` changes (root: instance walls first; inside an instance: nested-instance walls last)",
    summary:
      "`dims auto` offsets and ends every chain on a facade at the outer face of the wall `probeSide` finds nearest the facade's midpoint; where two parallel walls of different thickness tie there, `ir.walls` order picks one, and placing the storey reorders `ir.walls` — so the identity placement draws different chains (hillside-villa L2: the 100 mm ensuite wall in P, the 300 mm shell in P₀)",
    // T0 only (the identity), only the id-less `dims auto` layer, and only where the
    // mechanism is present: a facade whose probe the wall order decides, decided
    // differently in P (`obs0`) and P₀ (`obsG`).
    covers: (v, c) =>
      c.g.name === "e" &&
      v.path === "scene.dims" &&
      facadeProbeOrderSensitive(c.obs0).length > 0 &&
      facadeProbes(c.obs0) !== facadeProbes(c.obsG),
  },
};

/** One pinned violation (or a cross product of them). */
export interface KnownViolation {
  where: string | readonly string[];
  g: string | readonly string[];
  path: string;
  /** Only these elements (the concrete key's bracketed id); absent = every element. */
  ids?: readonly string[];
  /** The largest |actual − expected| this row absorbs (numeric facts only). */
  maxDelta?: number;
  cls: ClassName;
  /** One line: why this row is observed — the mechanism and the measured magnitude. */
  why: string;
  /** What closes it. */
  closesWith: string;
}

/** What closes each class — one sentence, shared by its rows. */
const CLOSES: Readonly<Record<ClassName, string>> = {
  "facing-tie": "never — declared convention (src/site.ts); the pin moves only if the tie rule does",
  "float-translation":
    "compare resolved coordinates in lint through a snapped relative frame, as the nav grid now does",
  "dim-tick-hand": "never — declared drafting convention; the pin moves only if the tick convention does",
  "facade-probe-order":
    "break `probeSide`'s tie by a wall-order-free rule (e.g. the outermost face among the tied segments), so the probe no longer reads `ir.walls` order",
};

const DIM_REFLECTED_2 = ["mx", "r90mx"] as const;
const DIM_REFLECTED_4 = ["mx", "r90mx", "r180mx", "r270mx"] as const;
const DIM_EXAMPLES_2 = [
  "aquarium.arch",
  "gallery-l.arch",
  "imports.arch",
  "library.arch",
  "parametric.arch",
  "relational.arch",
  "themed.arch",
  "tiny-house.arch",
  "two-bed.arch",
] as const;
const DIM_EXAMPLES_4 = ["hexagon-pavilion.arch", "studio.arch"] as const;

export const KNOWN: readonly KnownViolation[] = [
  // ---- T1: describe() -------------------------------------------------------------------
  {
    where: "aquarium.arch",
    g: ["r90", "r90mx"],
    path: "windows[].facing",
    ids: ["g.w_arc2"],
    cls: "facing-tie",
    why: "w_arc2 sits at the drum's 45° point, where the outward probe's |oy| = |ox| and the tie reads N/S-first",
    closesWith: CLOSES["facing-tie"],
  },

  // ---- T3: the scene --------------------------------------------------------------------
  {
    where: DIM_EXAMPLES_2,
    g: DIM_REFLECTED_2,
    path: "scene.dim[].ticks",
    cls: "dim-tick-hand",
    why: "each dim's 45° station ticks are drawn along dir + n, a fixed page slash; the mirror image is the other diagonal (a drafting convention, like a hatch angle)",
    closesWith: CLOSES["dim-tick-hand"],
  },
  {
    where: DIM_EXAMPLES_4,
    g: DIM_REFLECTED_4,
    path: "scene.dim[].ticks",
    cls: "dim-tick-hand",
    why: "each dim's 45° station ticks are drawn along dir + n, a fixed page slash; the mirror image is the other diagonal (a drafting convention, like a hatch angle)",
    closesWith: CLOSES["dim-tick-hand"],
  },
  // clinic's T3 run is observable only since nested-ref closed (backlog E.16): before, its
  // P₀ did not resolve and T3 compared nothing.
  {
    where: "clinic.arch",
    g: ["mx", "r90mx"],
    path: "scene.dim[].ticks",
    ids: ["g.dim_1"],
    cls: "dim-tick-hand",
    why: "dim_1's 45° station ticks are drawn along dir + n, a fixed page slash; the mirror image is the other diagonal (a drafting convention, like a hatch angle)",
    closesWith: CLOSES["dim-tick-hand"],
  },

  // ---- multi-storey T3: each storey's scene (`test/equivariance-storeys-scene.test.ts`) --
  {
    where: "hillside-villa.arch@L1",
    g: DIM_REFLECTED_4,
    path: "scene.dim[].ticks",
    ids: ["g.dim_1"],
    cls: "dim-tick-hand",
    why: "the ground floor's one hand-written dim (dim_1) draws its 45° station ticks along dir + n, a fixed page slash; the mirror image is the other diagonal (a drafting convention, like a hatch angle)",
    closesWith: CLOSES["dim-tick-hand"],
  },
  {
    where: "hillside-villa.arch@L2",
    g: "T0",
    path: "scene.dims",
    cls: "facade-probe-order",
    why: "the right facade's probe point (13800, 5100) is 0 mm from both the shell (300 mm) and the en_m ensuite's own wall (100 mm, x = 13800 over y 4200..6800); P lists the instance walls first and takes the ensuite wall (outer face 13850), P₀ lists g.shell first (13950) — so every chain ending on that facade reads 100 mm different (overall 14000 in P, 14100 in P₀; the drawn walls span -150..13950)",
    closesWith: CLOSES["facade-probe-order"],
  },
];
