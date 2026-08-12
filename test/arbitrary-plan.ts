/**
 * A `fast-check` arbitrary that emits **valid** ArchLang source.
 *
 * ## Why this exists
 *
 * `test/fuzz.test.ts` holds the flagship determinism property, and it fed
 * `fc.string()` into a plan body. Almost every case that produces is a parse error
 * whose `svg` is `""`, so "compile is deterministic" was, in practice, asserting only
 * that the ERROR path is deterministic. Determinism on plans that actually render was
 * example-based only — `compile twice` assertions scattered across ~30 files.
 *
 * This module closes that hole: one arbitrary that emits plans which compile clean and
 * produce real geometry, so the determinism law (and the byte-identity, cache and
 * round-trip laws layered on it) can be stated over the rendering path.
 *
 * ## What it GUARANTEES
 *
 * Every emitted source, for every seed:
 *
 *  - **Parses and resolves with no error-severity diagnostic.** `compile(s).svg` is a
 *    non-empty SVG document with real geometry in it. `test/fuzz.test.ts` asserts this
 *    as a standing property rather than trusting the claim (`emits only plans that
 *    render`), so a generator that starts leaking errors goes red immediately.
 *  - **Every reference resolves.** Wall ids on openings and `against` clauses, room ids
 *    on `in <room>`, and the relational `right-of <ref>` all name something the same
 *    render emitted; ids are systematic, so `E_DUP_ID` cannot occur.
 *  - **Every closed value set is honoured, and READ FROM ITS OWNER.** Door kinds and
 *    their per-kind legal clauses, use kinds, furniture anchors, relational
 *    directions/alignments (paired to the correct cross axis), north directions, dims
 *    modes, dim reference words, compass words and hemispheres are all imported from
 *    `src/ast.ts` / `src/grammar/tokens.ts`. **Nothing here is a retyped list** — this
 *    repo has been bitten by exactly that (a hand-typed vocabulary in a *generator*
 *    reproduced the same wrong text for three releases while `check:drift` stayed
 *    green), and a generator that hardcoded one would be the next instance. The
 *    practical consequence: adding a door kind, an anchor or an alignment edge to the
 *    owning table puts it into the fuzz corpus with no edit here.
 *  - **Determinism of the arbitrary itself.** `renderPlan` is a pure function of the
 *    spec; no `Date.now()`, no `Math.random()`, no I/O. The only entropy is
 *    fast-check's seeded generator, so a reported counterexample reproduces.
 *
 * ## What it does NOT guarantee
 *
 *  - **Not lint-clean.** Emitted plans routinely carry `W_*` warnings — unreachable
 *    rooms, overlapping rooms, doors that open onto furniture, a pocket door with no
 *    run, dimensions on the wrong side. That is deliberate: warnings are what make the
 *    `fix`/`repair` round-trip properties non-vacuous, and demanding architectural
 *    soundness from a random generator would collapse its coverage.
 *  - **Not architecturally sensible.** A bedroom may hold a urinal and a dimension may
 *    measure nothing. The laws under test are compiler laws, not design laws.
 *  - **Not exhaustive over the grammar.** Deliberately absent, because each brings a
 *    refusal surface a random generator would have to model rather than explore:
 *    `import` (I/O through the `World` seam), `level` (either/or nesting — `E_LEVEL_MIX`),
 *    `place`/`component` (frames), `strip`, the scripting forms (`for`/`if`/`while`/
 *    `let`/`set`), `theme`/`style`, `axes`, `schedule`/`legend`, `stair`/`elevator`/
 *    `escalator`, and `title`. Those have dedicated example-based suites.
 *  - **`site` and `zone` are deliberately NOT emitted by the base arbitrary.** They are
 *    the two forms whose law is "adding this changes no bytes", so they are applied as
 *    *mutations* ({@link withSite}, {@link withZone}) — a plan cannot be both the
 *    control and the treatment.
 *
 * ## Shape, and why it shrinks
 *
 * The arbitrary generates a plain-data {@link PlanSpec} and maps it through the pure
 * {@link renderPlan}. fast-check therefore shrinks the *spec* — fewer rooms, fewer
 * openings, smaller numbers — and the counterexample it prints is the rendered source,
 * which you can paste straight into `arch compile`. A failing case you cannot read is
 * worth much less than a failing case, so nothing here uses `fc.gen()` or a filter that
 * would break the shrinker.
 *
 * The layout is a **grid of cells**: 1–3 columns × 1–2 rows inside one closed exterior
 * shell, with a partition on every interior boundary and one room per cell. Everything
 * that cannot live on a grid — a polygon room, a circular room, an arc-bearing wall, a
 * relationally-placed room — goes in an *annex* to the right of the shell, where it
 * cannot collide with the grid. That split is what lets the renderer guarantee validity
 * by construction instead of by rejection sampling.
 */

import fc from "fast-check";
import {
  AUTO_DIMS_MODES,
  AXIS_ALIGNS,
  COMPASS_DIRECTIONS,
  DIM_REFS,
  FURNITURE_ANCHORS,
  HEMISPHERES,
  NORTH_DIRS,
  REL_ALIGN_CENTERS,
  REL_ALIGNS,
  REL_DIR_AXIS,
  REL_DIRS,
  USE_KINDS,
  type AutoDimsMode,
  type CompassWord,
  type DimRef,
  type FurnitureAnchor,
  type Hemisphere,
  type NorthCardinal,
  type RelDir,
  type UseKind,
} from "../src/ast.js";
import { DOOR_ENUMS, DOOR_KINDS, DOOR_KIND_CLAUSES, type DoorKind } from "../src/grammar/tokens.js";
import { CATALOG_CATEGORIES } from "../src/fixtures-catalog.js";

// ---------------------------------------------------------------------------
// The spec — plain data, no strings. This is what fast-check shrinks.
// ---------------------------------------------------------------------------

/** A door, window or cased opening hosted on a wall by `on <wall> at <pct>%`. */
export interface OpeningSpec {
  what: "door" | "window" | "opening";
  /** Index into the render's wall list; taken modulo, so `0` (the shell) is the
   *  shrink target. */
  host: number;
  /** Position along the host wall's whole run, in percent — always in range. */
  pct: number;
  widthMm: number;
  /** `door` only. `hinged` is the default and is dropped by the resolver. */
  kind: DoorKind;
  /** Clause values. Each is emitted only when {@link DOOR_KIND_CLAUSES} says this
   *  kind accepts that clause, which is what keeps `E_DOOR_KIND_CLAUSE` off. */
  hinge: (typeof DOOR_ENUMS.hinge)[number];
  swing: (typeof DOOR_ENUMS.swing)[number];
  slide: (typeof DOOR_ENUMS.slide)[number];
  /** Drawing-only aperture fraction, always inside `[0,1]` (`E_DOOR_OPEN_RANGE`). */
  open: number;
  withHinge: boolean;
  withSwing: boolean;
  withSlide: boolean;
  withOpen: boolean;
}

/** All four fixture placement forms. */
export type FurnitureSpec =
  | {
      form: "at";
      cat: string;
      /** Fraction of the shell's extent, so the piece lands inside the building. */
      xPct: number;
      yPct: number;
      w: number;
      h: number;
      /** Quarter-turn only (`E_FURN_ROTATE`); `undefined` omits the clause. */
      rotate?: 0 | 90 | 180 | 270;
      label: boolean;
      /** Index into the grid rooms, or `undefined` for no `in <room>`. */
      room?: number;
    }
  | {
      form: "against";
      cat: string;
      /** Index into the wall list. */
      wall: number;
      /** Index into that wall's segments — taken modulo its real segment count. */
      segment: number;
      /** Position along the segment in percent, so `offset` is always in run. */
      offsetPct: number;
      /** Always explicit: inference from `in <room>` can legitimately refuse. */
      side: "left" | "right";
      w: number;
      h: number;
    }
  | { form: "centered"; cat: string; room: number; w: number; h: number }
  | {
      form: "anchor";
      cat: string;
      room: number;
      anchor: FurnitureAnchor;
      flush: boolean;
      inset?: number;
      w: number;
      h: number;
    };

/** A manual dimension string outside the shell. */
export interface DimSpec {
  /** `undefined` = the historical bare form; else one of {@link DIM_REFS}. */
  ref?: DimRef;
  /** Which side of the building to run along. */
  edge: "top" | "bottom" | "left" | "right";
  offsetMm?: number;
  text: boolean;
}

/** The annex: everything the cell grid cannot express, placed clear of it. */
export interface AnnexSpec {
  /** An L-shaped `room … polygon` ring (always simple and non-degenerate). */
  polygon: boolean;
  /** A `room … circle at (cx,cy) radius R`. */
  circle: boolean;
  /** A partition wall with one `arc` edge (radius is forced ≥ chord/2). */
  arc: boolean;
  /** A relationally-placed room, against an annex-local rectangle base. */
  relational: boolean;
  /** Which direction the relational room sits in. */
  relDir: RelDir;
  /** Index into that direction's OWN cross axis (`E_ROOM_ALIGN_AXIS`). */
  relAlign: number;
  relGap: number;
  /** A free-standing `column`. */
  column: boolean;
}

export interface PlanSpec {
  name: string;
  /** Cell widths, mm. 1–3 entries. */
  cols: number[];
  /** Cell heights, mm. 1–2 entries. */
  rows: number[];
  shellThickness: number;
  partitionThickness: number;
  /** Snap grid, or `undefined` for none. */
  grid?: number;
  north?: NorthCardinal;
  /** `paper <size>` with no `scale`, so the sheet auto-fits and never overflows. */
  paper?: "A4" | "A3" | "A2";
  /** Per-cell `uses`; short arrays simply leave later cells unclassified. */
  uses: (UseKind | undefined)[];
  /** Per-cell room labels. */
  labels: boolean[];
  dimsAuto?: AutoDimsMode;
  openings: OpeningSpec[];
  furniture: FurnitureSpec[];
  dims: DimSpec[];
  annex: AnnexSpec;
}

// ---------------------------------------------------------------------------
// Vocabulary — every list below is IMPORTED, never retyped (see the header).
// ---------------------------------------------------------------------------

/** Fixture categories the catalog knows, plus one deliberately unknown word so the
 *  labelled-rectangle fallback in `furniture.render()` is exercised too. */
const FIXTURE_CATEGORIES: readonly string[] = [...CATALOG_CATEGORIES, "widget"];

/**
 * The EDGE words: every alignment word that is not a CENTRING word. Both halves come
 * from `src/ast.ts` — {@link REL_ALIGNS} is the full set and {@link REL_ALIGN_CENTERS}
 * is the owner of "the centring edge of each axis" — so this is a difference of two
 * owned tables rather than a retyped list of four literals.
 */
const EDGE_WORDS: ReadonlySet<string> = new Set(
  (REL_ALIGNS as readonly string[]).filter((w) => !REL_ALIGN_CENTERS.includes(w)),
);

/**
 * Does this anchor touch an edge of the room box?
 *
 * `flush` measures from a wall FACE, so it is legal only on an anchor that names one;
 * `anchor center` names none and the resolver refuses it (`E_FURN_FLUSH`) rather than
 * ignoring the word. That refusal is correct behaviour to respect, so the generator
 * must not produce it — but "which anchor is the centre one" still has to come from a
 * table rather than a retyped literal. It is derived here by splitting the compound
 * anchor name on `-` and asking whether any part is an {@link EDGE_WORDS} word.
 *
 * `test/fuzz.test.ts` pins the derivation (exactly one anchor is edge-less, and every
 * other is not), so a vocabulary change that decouples the two tables goes red there
 * with a clear message instead of surfacing as a puzzling fuzz failure.
 */
export const anchorTouchesEdge = (anchor: string): boolean => anchor.split("-").some((part) => EDGE_WORDS.has(part));

/** Fixed label strings. Hostile text is `test/escape-fuzz.test.ts`'s job, not this
 *  file's — random label bytes would only add noise to a determinism counterexample. */
const LABELS = ["Living", "Bed 1", "Hall", "Store", "Utility"] as const;

const PLAN_NAMES = ["P", "Unit A", "Test Plan"] as const;

// ---------------------------------------------------------------------------
// Geometry the renderer derives (so validity is by construction, not by filter)
// ---------------------------------------------------------------------------

interface WallInfo {
  id: string;
  /** Length of each segment, in order — what `segment <n>` indexes and what
   *  `offset <mm>` must stay inside. */
  segments: number[];
}

/** Millimetre string. Everything is an integer, so no float formatting can drift. */
const mm = (n: number): string => String(Math.round(n));

const cumulative = (xs: readonly number[]): number[] => {
  const out: number[] = [0];
  let acc = 0;
  for (const x of xs) {
    acc += x;
    out.push(acc);
  }
  return out;
};

/** `i` mapped into `[0, n)`. Non-negative inputs only (every index is an `fc.nat`). */
const wrap = (i: number, n: number): number => (n <= 0 ? 0 : i % n);

// ---------------------------------------------------------------------------
// The renderer — pure, total, and the sole place a `PlanSpec` becomes text
// ---------------------------------------------------------------------------

/** How to decorate a rendered plan with a form whose law is "this changes no bytes". */
export interface RenderOptions {
  /** Emit a `site { street … }` block. Draws nothing; see {@link withSite}. */
  site?: { street: CompassWord; hemisphere?: Hemisphere };
  /** Wrap every drawable statement in `zone <id> { … }`. Zero geometric semantics. */
  zone?: string;
}

/**
 * Render a {@link PlanSpec} to ArchLang source. Pure and total: every spec renders,
 * and every rendered source compiles without an error diagnostic.
 */
export function renderPlan(spec: PlanSpec, opts: RenderOptions = {}): string {
  const cols = spec.cols.length > 0 ? spec.cols : [4000];
  const rows = spec.rows.length > 0 ? spec.rows : [3000];
  const xs = cumulative(cols);
  const ys = cumulative(rows);
  const W = xs[xs.length - 1]!;
  const H = ys[ys.length - 1]!;

  // --- walls ---------------------------------------------------------------
  const walls: WallInfo[] = [];
  const wallLines: string[] = [];

  walls.push({ id: "w_shell", segments: [W, H, W, H] });
  wallLines.push(
    `  wall id=w_shell exterior thickness ${mm(spec.shellThickness)} ` +
      `{ (0,0) (${mm(W)},0) (${mm(W)},${mm(H)}) (0,${mm(H)}) close }`,
  );
  for (let k = 1; k < xs.length - 1; k++) {
    const x = xs[k]!;
    walls.push({ id: `w_v${k}`, segments: [H] });
    wallLines.push(
      `  wall id=w_v${k} partition thickness ${mm(spec.partitionThickness)} { (${mm(x)},0) (${mm(x)},${mm(H)}) }`,
    );
  }
  for (let k = 1; k < ys.length - 1; k++) {
    const y = ys[k]!;
    walls.push({ id: `w_h${k}`, segments: [W] });
    wallLines.push(
      `  wall id=w_h${k} partition thickness ${mm(spec.partitionThickness)} { (0,${mm(y)}) (${mm(W)},${mm(y)}) }`,
    );
  }

  // --- rooms, one per cell -------------------------------------------------
  const roomIds: string[] = [];
  const roomLines: string[] = [];
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < cols.length; i++) {
      const n = roomIds.length;
      const id = `r${n}`;
      roomIds.push(id);
      const use = spec.uses[n];
      const label = spec.labels[n] ? ` label "${LABELS[n % LABELS.length]}"` : "";
      roomLines.push(
        `  room id=${id} at (${mm(xs[i]!)},${mm(ys[j]!)}) size ${mm(cols[i]!)}x${mm(rows[j]!)}` +
          `${label}${use ? ` uses ${use}` : ""}`,
      );
    }
  }

  // --- openings ------------------------------------------------------------
  const openingLines = spec.openings.map((o, n) => {
    const host = walls[wrap(o.host, walls.length)]!;
    const head = `${o.what} id=o${n}`;
    const place = `on ${host.id} at ${mm(o.pct)}% width ${mm(o.widthMm)}`;
    if (o.what !== "door") return `  ${head} ${place}`;
    // A kind's legal clause set is the owner's, so a new kind — or a change to what an
    // existing one accepts — flows in here without an edit.
    const legal = DOOR_KIND_CLAUSES[o.kind];
    const clauses: string[] = [];
    if (o.withHinge && legal.hinge) clauses.push(`hinge ${o.hinge}`);
    if (o.withSwing && legal.swing) clauses.push(`swing ${o.swing}`);
    if (o.withSlide && legal.slide) clauses.push(`slide ${o.slide}`);
    if (o.withOpen && legal.open) clauses.push(`open ${o.open}`);
    // `hinged` is the default and the resolver drops it; spelling it is still legal
    // and is what proves the drop stays byte-identical under the determinism law.
    return `  door id=o${n} ${o.kind} ${place}${clauses.length ? ` ${clauses.join(" ")}` : ""}`;
  });

  // --- furniture -----------------------------------------------------------
  const furnitureLines = spec.furniture.map((f, n) => {
    const id = `f${n}`;
    const size = `size ${mm(f.w)}x${mm(f.h)}`;
    if (f.form === "at") {
      const x = Math.round((f.xPct / 100) * Math.max(W - f.w, 0));
      const y = Math.round((f.yPct / 100) * Math.max(H - f.h, 0));
      const parts = [`furniture id=${id} ${f.cat} at (${mm(x)},${mm(y)}) ${size}`];
      if (f.label) parts.push(`label "${LABELS[n % LABELS.length]}"`);
      if (f.rotate !== undefined) parts.push(`rotate ${f.rotate}`);
      // `in <room>` must come last — the grammar requires it after `rotate`.
      if (f.room !== undefined) parts.push(`in ${roomIds[wrap(f.room, roomIds.length)]}`);
      return `  ${parts.join(" ")}`;
    }
    if (f.form === "against") {
      const wall = walls[wrap(f.wall, walls.length)]!;
      const seg = wrap(f.segment, wall.segments.length);
      // Derived from the real segment length, so `offset` is never outside the run.
      const offset = Math.round((f.offsetPct / 100) * wall.segments[seg]!);
      // `side` is always explicit: inferring it from `in <room>` legitimately REFUSES
      // when neither or both faces fall inside, which is a real refusal to respect
      // rather than a hole to paper over.
      return `  furniture id=${id} ${f.cat} against wall ${wall.id} segment ${seg} offset ${mm(offset)} side ${f.side} ${size}`;
    }
    const room = roomIds[wrap(f.room, roomIds.length)];
    if (f.form === "centered") return `  furniture id=${id} ${f.cat} in ${room} centered ${size}`;
    const inset = f.inset !== undefined ? ` inset ${mm(f.inset)}` : "";
    // `flush` needs an edge to measure from — `anchor center` names none and is refused
    // (`E_FURN_FLUSH`). See {@link anchorTouchesEdge}.
    const flush = f.flush && anchorTouchesEdge(f.anchor) ? " flush" : "";
    return `  furniture id=${id} ${f.cat} in ${room} anchor ${f.anchor}${flush}${inset} ${size}`;
  });

  // --- annex: everything the cell grid cannot express ----------------------
  const ax = W + 3000; // clear of the shell, so nothing here collides with the grid
  const annexLines: string[] = [];
  const a = spec.annex;
  if (a.polygon) {
    // An L: (0,0)-(4000,0)-(4000,3000)-(2000,3000)-(2000,5000)-(0,5000). Six vertices,
    // never self-intersecting, never all-collinear — E_ROOM_POLY_* cannot fire.
    const p = (dx: number, dy: number) => `(${mm(ax + dx)},${mm(dy)})`;
    annexLines.push(
      `  room id=r_poly polygon ${p(0, 0)} ${p(4000, 0)} ${p(4000, 3000)} ${p(2000, 3000)} ${p(2000, 5000)} ${p(0, 5000)}`,
    );
  }
  if (a.circle) {
    annexLines.push(`  room id=r_circ circle at (${mm(ax + 2000)},${mm(8000)}) radius 1500`);
  }
  if (a.arc) {
    // radius == chord, comfortably above the chord/2 floor `E_ARC_RADIUS` enforces.
    annexLines.push(
      `  wall id=w_bow partition thickness 100 { (${mm(ax)},${mm(12000)}) arc (${mm(ax + 3000)},${mm(12000)}) radius 3000 }`,
    );
  }
  if (a.relational) {
    // The reference is an annex-local RECTANGLE: a rectangle-only clause refuses a
    // polygon room outright (`E_PLACE_POLY`), which is correct behaviour to respect,
    // not to generate.
    annexLines.push(`  room id=r_base at (${mm(ax)},${mm(16000)}) size 3000x2500`);
    // The alignment edge is drawn from the direction's OWN cross axis, so
    // `E_ROOM_ALIGN_AXIS` cannot fire however the table is reordered or extended.
    const axis = REL_DIR_AXIS[a.relDir];
    const edges = AXIS_ALIGNS[axis];
    const edge = edges[wrap(a.relAlign, edges.length)]!;
    annexLines.push(`  room id=r_rel ${a.relDir} r_base align ${edge} gap ${mm(a.relGap)} size 2000x2000`);
  }
  if (a.column) {
    annexLines.push(`  column id=c0 at (${mm(ax + 5000)},${mm(1000)}) size 300x300`);
  }
  if (a.arc) annexLines.push(`  dim radius w_bow`);
  if (a.circle) annexLines.push(`  dim diameter r_circ`);

  // --- manual dimension strings, run outside the shell ---------------------
  const dimLines = spec.dims.map((d) => {
    const gap = 800;
    const [p0, p1] =
      d.edge === "top"
        ? [`(0,${mm(-gap)})`, `(${mm(W)},${mm(-gap)})`]
        : d.edge === "bottom"
          ? [`(0,${mm(H + gap)})`, `(${mm(W)},${mm(H + gap)})`]
          : d.edge === "left"
            ? [`(${mm(-gap)},${mm(H)})`, `(${mm(-gap)},0)`]
            : [`(${mm(W + gap)},0)`, `(${mm(W + gap)},${mm(H)})`];
    const ref = d.ref ? `${d.ref} ` : "";
    const offset = d.offsetMm !== undefined ? ` offset ${mm(d.offsetMm)}` : "";
    const text = d.text ? ` text "${d.edge === "top" || d.edge === "bottom" ? mm(W) : mm(H)}"` : "";
    return `  dim ${ref}${p0}->${p1}${offset}${text}`;
  });

  // --- assembly ------------------------------------------------------------
  // Plan-level SETTINGS stay outside any `zone` wrapper: they configure the whole
  // drawing, and only the drawable statements are what a zone groups.
  const settings: string[] = ["  units mm"];
  if (spec.grid !== undefined) settings.push(`  grid ${mm(spec.grid)}`);
  if (spec.north !== undefined) settings.push(`  north ${spec.north}`);
  if (spec.paper !== undefined) settings.push(`  paper ${spec.paper}`);
  if (spec.dimsAuto !== undefined) settings.push(`  dims auto ${spec.dimsAuto}`);
  if (opts.site) {
    const hemi = opts.site.hemisphere ? ` hemisphere ${opts.site.hemisphere}` : "";
    settings.push(`  site { street ${opts.site.street}${hemi} }`);
  }

  const body = [...wallLines, ...roomLines, ...openingLines, ...furnitureLines, ...annexLines, ...dimLines];
  const drawable = opts.zone ? [`  zone ${opts.zone} {`, ...body.map((l) => `  ${l}`), `  }`] : body;

  return `plan "${spec.name}" {\n${settings.join("\n")}\n${drawable.join("\n")}\n}\n`;
}

// ---------------------------------------------------------------------------
// The arbitraries
// ---------------------------------------------------------------------------

/** Millimetre magnitudes on a 100 mm lattice — integers only, so no float formatting
 *  is involved and a shrunk counterexample reads as round numbers. */
const mmRange = (loHundreds: number, hiHundreds: number) =>
  fc.integer({ min: loHundreds, max: hiHundreds }).map((n) => n * 100);

const doorSpec = fc.record({
  what: fc.constant<"door">("door"),
  host: fc.nat({ max: 5 }),
  pct: fc.integer({ min: 5, max: 95 }),
  widthMm: mmRange(7, 12),
  kind: fc.constantFrom(...DOOR_KINDS),
  hinge: fc.constantFrom(...DOOR_ENUMS.hinge),
  swing: fc.constantFrom(...DOOR_ENUMS.swing),
  slide: fc.constantFrom(...DOOR_ENUMS.slide),
  open: fc.constantFrom(0, 0.25, 0.5, 1),
  withHinge: fc.boolean(),
  withSwing: fc.boolean(),
  withSlide: fc.boolean(),
  withOpen: fc.boolean(),
});

/** A window or cased opening: the same placement, none of the door clauses. */
const holeSpec = fc
  .record({
    what: fc.constantFrom<"window" | "opening">("window", "opening"),
    host: fc.nat({ max: 5 }),
    pct: fc.integer({ min: 5, max: 95 }),
    widthMm: mmRange(6, 15),
  })
  .map(
    (h): OpeningSpec => ({
      ...h,
      kind: "hinged",
      hinge: DOOR_ENUMS.hinge[0],
      swing: DOOR_ENUMS.swing[0],
      slide: DOOR_ENUMS.slide[0],
      open: 1,
      withHinge: false,
      withSwing: false,
      withSlide: false,
      withOpen: false,
    }),
  );

const openingSpec: fc.Arbitrary<OpeningSpec> = fc.oneof(doorSpec, holeSpec);

const category = fc.constantFrom(...FIXTURE_CATEGORIES);

const furnitureSpec: fc.Arbitrary<FurnitureSpec> = fc.oneof(
  fc.record({
    form: fc.constant<"at">("at"),
    cat: category,
    xPct: fc.integer({ min: 0, max: 100 }),
    yPct: fc.integer({ min: 0, max: 100 }),
    w: mmRange(3, 18),
    h: mmRange(3, 18),
    rotate: fc.option(fc.constantFrom<0 | 90 | 180 | 270>(0, 90, 180, 270), { nil: undefined }),
    label: fc.boolean(),
    room: fc.option(fc.nat({ max: 5 }), { nil: undefined }),
  }),
  fc.record({
    form: fc.constant<"against">("against"),
    cat: category,
    wall: fc.nat({ max: 5 }),
    segment: fc.nat({ max: 3 }),
    offsetPct: fc.integer({ min: 0, max: 100 }),
    side: fc.constantFrom<"left" | "right">("left", "right"),
    w: mmRange(3, 10),
    h: mmRange(3, 8),
  }),
  fc.record({
    form: fc.constant<"centered">("centered"),
    cat: category,
    room: fc.nat({ max: 5 }),
    w: mmRange(3, 15),
    h: mmRange(3, 12),
  }),
  fc.record({
    form: fc.constant<"anchor">("anchor"),
    cat: category,
    room: fc.nat({ max: 5 }),
    anchor: fc.constantFrom(...FURNITURE_ANCHORS),
    flush: fc.boolean(),
    inset: fc.option(mmRange(0, 5), { nil: undefined }),
    w: mmRange(3, 12),
    h: mmRange(3, 10),
  }),
);

const dimSpec: fc.Arbitrary<DimSpec> = fc.record({
  ref: fc.option(fc.constantFrom(...DIM_REFS), { nil: undefined }),
  edge: fc.constantFrom<"top" | "bottom" | "left" | "right">("top", "bottom", "left", "right"),
  offsetMm: fc.option(mmRange(0, 8), { nil: undefined }),
  text: fc.boolean(),
});

const annexSpec: fc.Arbitrary<AnnexSpec> = fc.record({
  polygon: fc.boolean(),
  circle: fc.boolean(),
  arc: fc.boolean(),
  relational: fc.boolean(),
  relDir: fc.constantFrom(...REL_DIRS),
  relAlign: fc.nat({ max: 2 }),
  relGap: mmRange(0, 5),
  column: fc.boolean(),
});

/**
 * The spec arbitrary. Sizes are bounded so a plan stays reviewable: at most six rooms,
 * six openings, six fixtures and three dimension strings.
 */
export const planSpec: fc.Arbitrary<PlanSpec> = fc.record({
  name: fc.constantFrom(...PLAN_NAMES),
  cols: fc.array(mmRange(20, 50), { minLength: 1, maxLength: 3 }),
  rows: fc.array(mmRange(20, 40), { minLength: 1, maxLength: 2 }),
  shellThickness: fc.constantFrom(100, 150, 200, 300),
  partitionThickness: fc.constantFrom(80, 100, 150),
  grid: fc.option(fc.constantFrom(50, 100), { nil: undefined }),
  north: fc.option(fc.constantFrom(...NORTH_DIRS), { nil: undefined }),
  paper: fc.option(fc.constantFrom<"A4" | "A3" | "A2">("A4", "A3", "A2"), { nil: undefined }),
  uses: fc.array(fc.option(fc.constantFrom(...USE_KINDS), { nil: undefined }), { maxLength: 6 }),
  labels: fc.array(fc.boolean(), { maxLength: 6 }),
  dimsAuto: fc.option(fc.constantFrom(...AUTO_DIMS_MODES), { nil: undefined }),
  openings: fc.array(openingSpec, { maxLength: 6 }),
  furniture: fc.array(furnitureSpec, { maxLength: 6 }),
  dims: fc.array(dimSpec, { maxLength: 3 }),
  annex: annexSpec,
});

/**
 * **The arbitrary to reach for.** Valid ArchLang source, ready to hand to `compile`.
 *
 * Because it is `planSpec.map(renderPlan)`, fast-check shrinks the underlying spec and
 * prints the rendered source as the counterexample — paste it into `arch compile`.
 */
export const archPlan: fc.Arbitrary<string> = planSpec.map((s) => renderPlan(s));

/**
 * A plan guaranteed to contain **no `site` and no `zone`** — the control half of the
 * byte-identity laws. Identical to {@link archPlan}: the base arbitrary never emits
 * either form. Named separately so the property that pairs it with {@link withSite} /
 * {@link withZone} reads as the law it is testing, and so this stays true by definition
 * if the base arbitrary ever gains those forms.
 */
export const featureFreePlan: fc.Arbitrary<string> = archPlan;

/** The `site` clause an unrelated-addition property adds to a feature-free plan. */
export const siteClause: fc.Arbitrary<{ street: CompassWord; hemisphere?: Hemisphere }> = fc.record({
  street: fc.constantFrom(...COMPASS_DIRECTIONS),
  hemisphere: fc.option(fc.constantFrom(...HEMISPHERES), { nil: undefined }),
});

/** A `zone` id an unrelated-addition property wraps a feature-free plan in. */
export const zoneId: fc.Arbitrary<string> = fc.constantFrom("z", "west", "wing_a");

/** The same plan with a `site` block added. `site` draws nothing, so the SVG must not
 *  move — that is the law, generalised from the hand-written fixture pairs. */
export const withSite = (spec: PlanSpec, site: { street: CompassWord; hemisphere?: Hemisphere }): string =>
  renderPlan(spec, { site });

/** The same plan with every drawable statement wrapped in one `zone`. A zone has zero
 *  geometric semantics, so the SVG must not move. */
export const withZone = (spec: PlanSpec, zone: string): string => renderPlan(spec, { zone });
