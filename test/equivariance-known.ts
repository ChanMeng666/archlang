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

import type { RDoor } from "../src/ir.js";
import { type RVertical, tailEdge } from "../src/vertical.js";
import { type CaseContext, lin, type Violation, windowOnTie } from "./d4-oracle.js";

/** Every pinned class. */
export type ClassName =
  | "fix-pullback"
  | "stair-tail"
  | "stair-break-hand"
  | "facing-tie"
  | "raster-tie"
  | "entrance-seed-walk"
  | "anchor-far-tie"
  | "label-point-tie"
  | "threshold-carve"
  | "float-translation"
  | "slide-track"
  | "column-corner"
  | "dim-text-side"
  | "dim-tick-hand"
  | "nested-ref";

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

/** The lint rules that read the nav grid. */
const RASTER_LINT = /^lint\.(room-no-clear-path|path-too-narrow|circuitous-path)($|\.)/;

/** The element id inside a key: `scene.door[g.o2]` → `g.o2`. */
const idOf = (key: string): string => /\[([^\]]*)\]/.exec(key)?.[1] ?? "";

/** A room's walk, measured on both sides (`walks()` attributes only those). */
const walkOf = (v: Violation, c: CaseContext) =>
  v.path === "circulation.rooms[].walk" ? c.walks().get(idOf(v.key)) : undefined;

/** A room measured on one side only, or the measured/sealed/unmeasured sets differ. */
const measuredSetChanged = (c: CaseContext): boolean =>
  c.violations.some(
    (v) =>
      (v.path.startsWith("circulation.rooms[]") && (v.expected === "<absent>" || v.actual === "<absent>")) ||
      v.path === "circulation.unmeasured" ||
      v.path === "circulation.blocked",
  );

/** `|a - b|` of a numeric violation (NaN otherwise). */
const numDelta = (v: Violation): number => Math.abs(Number(v.actual) - Number(v.expected));

/** An endpoint tie (the entrance cell moved at most one lattice step across a tied line;
 *  the measured cell at most one step per axis, to an EXACTLY equidistant cell), and the
 *  walk moved by no more than those two displacements. */
const endpointTie = (v: Violation, c: CaseContext): boolean => {
  const a = walkOf(v, c);
  return (
    a !== undefined &&
    !a.seedMoved &&
    a.anchorTie &&
    a.ent <= 1 &&
    (a.ent === 0 || c.ties.entrance) &&
    a.anchor <= 2 &&
    Math.abs(a.delta) <= a.ent + a.anchor
  );
};

/** Whether this class covers each circulation violation of the case; raster lint rules
 *  are covered by a raster class only when the whole raster change is. */
const rasterClasses: readonly ClassName[] = [
  "raster-tie",
  "entrance-seed-walk",
  "anchor-far-tie",
  "label-point-tie",
  "threshold-carve",
  "float-translation",
];

function rasterLint(self: ClassName, v: Violation, c: CaseContext): boolean {
  if (!RASTER_LINT.test(v.path)) return false;
  const circ = c.violations.filter((x) => x.path.startsWith("circulation"));
  const by = (x: Violation) => rasterClasses.filter((k) => KNOWN_CLASSES[k].coversFact?.(x, c) === true);
  return circ.length > 0 && circ.every((x) => by(x).length > 0) && circ.some((x) => by(x).includes(self));
}

interface RasterClass extends KnownClass {
  /** The class's own predicate on a circulation FACT (lint is derived from these). */
  coversFact(v: Violation, c: CaseContext): boolean;
}

function raster(self: ClassName, def: Omit<RasterClass, "covers">): RasterClass {
  return {
    ...def,
    covers: (v, c) =>
      def.coversFact(v, c) ||
      rasterLint(self, v, c) ||
      // A translation of float-sensitive geometry can flip ANY exact comparison, not only
      // the raster's: its lint outputs are this class's too.
      (self === "float-translation" && c.g.translate === true && c.floatSensitive && v.path.startsWith("lint.")),
  };
}

const ADR_0008 = "ADR 0008 (circulation facts are coarse and grid-quantised, ties row-major)";

export const KNOWN_CLASSES: Readonly<Record<ClassName, KnownClass & Partial<RasterClass>>> = {
  "fix-pullback": {
    status: "defect",
    law: "equivariance",
    site: "src/lint/rules/furniture.ts:196,207; src/lint/rules/dims.ts:180",
    summary:
      "a lint fix is computed from PLAN-space geometry (a fixture's global quarter-turn, a dim's reflected offset) but edits the SHARED component source, so the rewrite is wrong for every placed instance but the unturned one",
    // Only the two fix-bearing rules that compute from transformed geometry, and only when
    // the diagnostics themselves agree (a fix difference that follows a diagnostic
    // difference is that difference's business).
    covers: (v, c) =>
      (v.path === "lint.fixture-back-to-room.fixes" || v.path === "lint.dim-overlap.fixes") &&
      !c.paths.has(v.path.replace(/\.fixes$/, "")),
  },
  "stair-tail": {
    status: "defect",
    law: "equivariance",
    site: "src/vertical.ts:72,98 (footEdge/tailEdge); recorded as 'Limitation, inherited' in docs/adr/0016-component-instances-and-frames.md",
    summary:
      "a stair/escalator arrow's tail (and the entry edge the nav grid opens) is a fixed page rule — larger-coordinate end of the long axis — so a run turned so its tail lands elsewhere points the wrong way; ADR 0016 recorded this as inherited, and it stays a defect because it is scheduled to close",
    // Only when g really moves the tail off the rule's edge: the image of P₀'s tail normal
    // is not the tail gP's run is drawn from.
    covers: (v, c) => {
      if (!/^scene\.(stair|escalator)\[/.test(v.key)) return false;
      const id = idOf(v.key);
      const find = (o: CaseContext["obs0"]) =>
        o.ir?.elements.find((e): e is RVertical => (e.kind === "stair" || e.kind === "escalator") && e.id === id);
      const r0 = find(c.obs0);
      const rG = find(c.obsG);
      if (!r0 || !rG) return false;
      const N = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
      const img = lin(c.f, N[tailEdge(r0)]);
      const got = N[tailEdge(rG)];
      return img.x !== got.x || img.y !== got.y;
    },
  },
  "stair-break-hand": {
    status: "defect",
    law: "equivariance",
    site: "src/elements/vertical-glyphs.ts:144 (the break-line diagonals)",
    summary: "a stair's break line is drawn with a fixed handedness and a reflected stair never reads its mirror",
    covers: (v, c) => c.reflects && /^scene\.stair\[/.test(v.key),
  },
  "facing-tie": {
    status: "declared",
    law: "equivariance",
    site: "src/site.ts:191,206 (ties resolve horizontal-first, then N/W)",
    summary:
      "a window on a room corner (equidistant from two edges) or on a wall at 45° is a TIE, and ties resolve N/S before E/W by stated convention — a page-order rule, so an axis swap changes the answer",
    covers: (v, c) => c.swaps && v.path === "windows[].facing" && windowOnTie(c.obs0, idOf(v.key)),
  },
  "raster-tie": raster("raster-tie", {
    status: "defect",
    law: "equivariance",
    site: `src/analyze/circulation.ts:285 (cellOf floors a point on a lattice line to its +x/+y side), :962-986 (a room's measured cell is the row-major first of equidistant cells); ${ADR_0008}`,
    summary:
      "the nav grid breaks ENDPOINT ties in page order: an entrance on a lattice line is seeded on its +x/+y side, and a room whose seed point is equidistant from several cells measures to the row-major first — so a turn or flip moves the entrance one step and the measured cell one step per axis, and the walk by at most those displacements (≤ 3 cells)",
    // Bounded by the endpoints' own measured displacement, with the measured/unmeasured
    // set unchanged; a bottleneck by at most one clear-width quantum (2 cells).
    coversFact: (v, c) => {
      if (c.g.translate || measuredSetChanged(c)) return false;
      if (v.path === "circulation.rooms[].walk") return endpointTie(v, c);
      if (v.path === "circulation.rooms[].bottleneck") return numDelta(v) <= 2 * c.cellMm;
      return false;
    },
  }),
  "entrance-seed-walk": raster("entrance-seed-walk", {
    status: "defect",
    law: "equivariance",
    site: "src/analyze/circulation.ts:285 (cellOf floors the tied entrance to one side), :340-352 (seedCell then walks inward), :996-1010 (the walk origin is the first entrance's seed)",
    summary:
      "the first entrance is seeded across a tie (a lattice line, or a corner's diagonal step) and the tied side's inward walk goes elsewhere: further in past eroded cells, or into a pocket sealed from every room — so the walk origin moves several cells, or no room measures at all on one side",
    coversFact: (v, c) => {
      if (c.g.translate || !c.ties.entrance || !v.path.startsWith("circulation")) return false;
      // One side measures no room from the first entrance and the other does: its seed
      // landed in a sealed pocket on one side only.
      const measured = (o: CaseContext["obs0"]) => (o.summary.circulation?.rooms.length ?? 0) > 0;
      if (measured(c.obs0) !== measured(c.obsG)) return true;
      // Otherwise the seed moved more than a step: its magnitude is the geodesic between the
      // two tied seeds, which no straight-line bound holds — and a room whose nearest cell
      // lies in the pocket one seed cannot reach measures to a different reachable cell,
      // so the measured cell follows the seed rather than a tie of its own.
      const a = walkOf(v, c);
      return a !== undefined && !a.seedMoved && a.ent > 1;
    },
  }),
  "anchor-far-tie": raster("anchor-far-tie", {
    status: "defect",
    law: "equivariance",
    site: `src/analyze/circulation.ts:962-986,1049-1060 (anchor/reachableRep: row-major first of equidistant cells); ${ADR_0008}`,
    summary:
      "a room whose seed point is covered by an obstacle measures to the nearest free cell, and the nearest free cells form a RING round the obstacle — every one equidistant — so the row-major first lands on another side of it under a turn or flip and the walk changes by the way round the obstacle, metres, not a cell",
    // The measured cell moved more than one step per axis, to a cell EXACTLY as far from
    // the seed point: a genuine tie, not a different room shape. Magnitude is the geodesic
    // between the tied cells, which is not bounded by their straight-line distance.
    coversFact: (v, c) => {
      const a = walkOf(v, c);
      return (
        !c.g.translate &&
        a !== undefined &&
        !a.seedMoved &&
        a.anchorTie &&
        a.anchor > 2 &&
        (a.ent === 0 || c.ties.entrance)
      );
    },
  }),
  "label-point-tie": raster("label-point-tie", {
    status: "defect",
    law: "equivariance",
    site: "src/geometry/polygon.ts:207-236 (polygonLabelPoint: strict `>` over a scan-ordered grid), read by src/analyze/circulation.ts:975",
    summary:
      "a concave room whose centroid is off its floor is measured to its pole of inaccessibility, found by a scan-ordered search that keeps the FIRST of equally wide arms — so under a turn or flip the room is measured in its other arm",
    coversFact: (v, c) => {
      const a = walkOf(v, c);
      return !c.g.translate && a !== undefined && a.seedMoved;
    },
  }),
  "threshold-carve": raster("threshold-carve", {
    status: "defect",
    law: "equivariance",
    site: "src/analyze/circulation.ts:398-441 (thresholdPoints steps whole cells from a centre on a lattice line), :285 (each point floored to one side); :313-338 (a polygon room's ring-scan seed)",
    summary:
      "a doorway whose centre lies on a lattice line has every threshold point on a line, each floored to one side, so the set of rows a threshold is tried on shifts by one under a turn or flip — a doorway can carve in P₀ and not in gP (or vice versa): walks detour, and a room can become unmeasured",
    // The walk moved by more than its endpoints did (so the GRID itself differs), or a
    // room's measurement appears/disappears — and P₀ has a doorway seeded across a line.
    // Once a room's measurement has changed the grid differs, and every room's walk and
    // bottleneck in that case is this class's.
    coversFact: (v, c) => {
      if (c.g.translate || !c.ties.connector || !v.path.startsWith("circulation")) return false;
      if (v.path === "circulation.unmeasured" || v.path === "circulation.blocked") return true;
      if (v.path.startsWith("circulation.rooms[]") && measuredSetChanged(c)) return true;
      if (v.path === "circulation.rooms[].bottleneck") return numDelta(v) > 2 * c.cellMm;
      const a = walkOf(v, c);
      return (
        a !== undefined &&
        !a.seedMoved &&
        a.anchorTie &&
        a.ent <= 1 &&
        a.anchor <= 2 &&
        Math.abs(a.delta) > a.ent + a.anchor
      );
    },
  }),
  "float-translation": raster("float-translation", {
    status: "defect",
    law: "equivariance",
    site: "src/analyze/circulation.ts (cells and seeds in ABSOLUTE float coordinates); src/lint/rules/doors.ts:180-185 (pocketRunMm `>=` / `<= 0`), and every exact comparison on a resolved coordinate",
    summary:
      "the compiler measures in ABSOLUTE float coordinates, and P₀ carries geometry a translation re-rounds — a curve's tessellation, or an `at 55%` position resolved an ulp off its integer that 20 m of offset rounds back — so an exact tie or an exact threshold flips under a pure translation: a measured cell, a detour ratio, a pocket door's `>= need`",
    // Under a translation of float-sensitive geometry only: a walk within its endpoints'
    // displacement, a detour whose room's endpoints moved at most a step per axis, or a
    // lint output (an exact comparison flipped).
    coversFact: (v, c) => {
      if (!c.g.translate || !c.floatSensitive) return false;
      if (v.path === "circulation.rooms[].detour") {
        const e = c.endpoints().get(idOf(v.key));
        return e?.anchorTie === true && e.ent <= 1 && e.anchor <= 2;
      }
      if (v.path !== "circulation.rooms[].walk") return false;
      const a = walkOf(v, c);
      return a?.anchorTie === true && a.ent <= 1 && Math.abs(a.delta) <= a.ent + a.anchor;
    },
  }),
  "slide-track": {
    status: "defect",
    law: "equivariance",
    site: "src/elements/door-panels.ts:135-136 (the fixed panel's track is `n * off * sd`)",
    summary:
      "a sliding door's fixed/moving panels pick their track from the wall's LEFT normal times `slide`, a handed product the reflection never flips, so a mirrored door swaps its panels' faces",
    covers: (v, c) =>
      c.reflects &&
      /^scene\.door\[/.test(v.key) &&
      c.obs0.ir?.elements.some(
        (e): e is RDoor => e.kind === "door" && e.id === idOf(v.key) && e.doorKind === "sliding",
      ) === true,
  },
  "column-corner": {
    status: "defect",
    law: "equivariance",
    site: "src/frame.ts:393-398 (treats `column.at` as the CENTRE) vs src/elements/column.ts:20-24 (it is the TOP-LEFT)",
    summary:
      "the frame carries a column's `at` as a centre point, but a column's `at` is its top-left corner, so a turned or flipped column lands one size away — correct only under the identity and the transposition, which fix that corner",
    // A misplaced column that is the drawing's outermost element also moves the extent the
    // sheet fit is measured on — so the sheet verdicts follow, but only alongside it.
    covers: (v, c) =>
      !c.identityOrTransposition &&
      (v.path === "scene.column[]" ||
        ((v.path === "sheet" || v.path === "diagnostics.sheet") && c.paths.has("scene.column[]"))),
  },
  "dim-text-side": {
    status: "defect",
    law: "equivariance",
    site: "src/elements/dim.ts:259-262,320 (the number rides the from→to LEFT normal, whatever the offset's sign); src/frame.ts:392 negates the offset under a reflection",
    summary:
      "a ROOT renderer defect: a dim's number is always drawn on the left normal, so any NEGATIVE offset puts it between the line and what it measures — with no `place` at all; a reflection negates every placed dim's offset, which is how the oracle meets it",
    covers: (v, c) => c.reflects && v.path === "scene.dim[].text",
  },
  "dim-tick-hand": {
    status: "declared",
    law: "equivariance",
    site: "src/elements/dim.ts:290-291 (each station tick is drawn along `dir + n`)",
    summary:
      "a dimension's 45° station tick is a slash of fixed page sense relative to the line — a drafting convention like a hatch angle — so a reflected dim draws the other diagonal",
    covers: (v, c) => c.reflects && v.path === "scene.dim[].ticks",
  },
  "nested-ref": {
    status: "defect",
    law: "composition",
    site: "src/ir.ts:1773 (an instance group resolves against its OWN walls/rooms only)",
    summary:
      "a COMPOSITION defect, not an equivariance one: inside a component, a reference INTO a nested instance (`in c2.main anchor …`, `on west.shell at …`) does not resolve, so a plan that composes instances works at the root and fails at the IDENTITY once it is itself placed — contradicting ADR 0016 §3's 'the parent can reach in' and the museum-wings pattern",
    covers: () => false,
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
  "fix-pullback": "pull the fix back through the inverse frame before editing the component source",
  "stair-tail": "carry the tail edge through the frame (or an authored `entry <edge>`)",
  "stair-break-hand": "mirror the break line when the frame reflects (a `_mirror` flag, as fixtures carry)",
  "facing-tie": "never — declared convention (src/site.ts); the pin moves only if the tie rule does",
  "raster-tie": "break nav-grid endpoint ties by a D4-symmetric rule (or measure every tied endpoint)",
  "entrance-seed-walk": "seed the entrance symmetrically across its lattice line (both sides, nearest free)",
  "anchor-far-tie": "choose a room's measured cell by a D4-symmetric rule among equidistant cells",
  "label-point-tie": "a D4-symmetric tie-break in polygonLabelPoint (or measure to every tied arm)",
  "threshold-carve": "try threshold points on BOTH sides of a lattice line (a symmetric seed set)",
  "float-translation": "sample the nav grid in coordinates relative to its own origin",
  "slide-track": "flip the track choice with the frame's determinant (as `swing` is)",
  "column-corner": "carry a column through `transformRect`, like every other top-left rectangle",
  "dim-text-side": "draw the number on the side the offset points, `sign(offset) · n`",
  "dim-tick-hand": "never — declared drafting convention; the pin moves only if the tick convention does",
  "nested-ref": "resolve a component's references against its nested instances' transformed elements",
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
  // ---- T0: the wrapper is not faithful (a COMPOSITION defect) -----------------------------
  {
    where: "clinic.arch",
    g: "T0",
    path: "ok",
    cls: "nested-ref",
    why: "composition, not equivariance: clinic's root `furniture f_ecg … in c2.main anchor bottom-right` is E_PLACE_REF once the file is itself placed — at the identity",
    closesWith: CLOSES["nested-ref"],
  },
  {
    where: "museum-wings.arch",
    g: "T0",
    path: "access",
    cls: "nested-ref",
    why: "composition, not equivariance: `door d_west/d_east … wall west.shell|east.shell` no longer host once the file is placed, so their access edges lose their host wall",
    closesWith: CLOSES["nested-ref"],
  },
  {
    where: "museum-wings.arch",
    g: "T0",
    path: "diagnostics",
    cls: "nested-ref",
    why: "composition, not equivariance: the same two doors raise W_DOOR_OFF_WALL + W_SWING_ROOM_NOT_ADJACENT inside the wrapper",
    closesWith: CLOSES["nested-ref"],
  },

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
    where: "museum.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "scene.column[]",
    cls: "column-corner",
    why: "every gallery column is carried as a centre and lands one column-size off",
    closesWith: CLOSES["column-corner"],
  },
  {
    where: "transit-hall.arch",
    g: ["r90", "r180", "r270", "mx", "r90mx", "r180mx"],
    path: "scene.column[]",
    cls: "column-corner",
    why: "every platform column is carried as a centre and lands one column-size off (r270mx, the transposition, is right)",
    closesWith: CLOSES["column-corner"],
  },
  {
    where: DIM_EXAMPLES_2,
    g: DIM_REFLECTED_2,
    path: "scene.dim[].text",
    cls: "dim-text-side",
    why: "each hand-written dim's number lands between its line and what it measures once the reflection negates its offset",
    closesWith: CLOSES["dim-text-side"],
  },
  {
    where: DIM_EXAMPLES_4,
    g: DIM_REFLECTED_4,
    path: "scene.dim[].text",
    cls: "dim-text-side",
    why: "each hand-written dim's number lands between its line and what it measures once the reflection negates its offset",
    closesWith: CLOSES["dim-text-side"],
  },
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
  {
    where: ["bungalow.arch", "laneway-house.arch", "materials.arch", "terrace-row.arch"],
    g: ["mx", "r90mx"],
    path: "scene.door[]",
    cls: "slide-track",
    why: "every `sliding` door swaps which track its fixed panel runs on",
    closesWith: CLOSES["slide-track"],
  },
  {
    where: ["courtyard-house.arch", "hexagon-pavilion.arch"],
    g: ["mx", "r90mx", "r180mx", "r270mx"],
    path: "scene.door[]",
    cls: "slide-track",
    why: "every `sliding` door swaps which track its fixed panel runs on",
    closesWith: CLOSES["slide-track"],
  },
  {
    where: "transit-hall.arch",
    g: ["r90", "r180", "r90mx", "r180mx"],
    path: "scene.escalator[]",
    cls: "stair-tail",
    why: "both escalators' arrows keep the fixed page tail where g moves it (mx, r270, r270mx happen to fix it)",
    closesWith: CLOSES["stair-tail"],
  },
  {
    where: "library.arch",
    g: ["r90", "r180", "r90mx"],
    path: "scene.stair[]",
    cls: "stair-tail",
    why: "st_main's arrow keeps the fixed page tail where g moves it",
    closesWith: CLOSES["stair-tail"],
  },
  {
    where: "library.arch",
    g: ["mx", "r90mx"],
    path: "scene.stair[]",
    cls: "stair-break-hand",
    why: "st_main's break-line diagonals keep their handedness",
    closesWith: CLOSES["stair-break-hand"],
  },

  // ---- T2: the raster — one row per (example, mechanism, room set), each with its own
  //      measured magnitude and a `maxDelta` bound; ADR 0008 calls these facts coarse and
  //      grid-quantised, and a 7.3 m change is outside any such reading.
  {
    where: "accessible.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed", "g.r_living"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bed, r_living: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤+200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "aquarium.arch",
    g: "t",
    path: "circulation.rooms[].detour",
    ids: ["g.rotunda_r"],
    maxDelta: 0.011,
    cls: "float-translation",
    why: "rotunda_r: a re-rounded tie 20 m from the origin; detour 0.01",
    closesWith: CLOSES["float-translation"],
  },
  {
    where: "aquarium.arch",
    g: ["r90", "r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.foyer", "g.plant"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "foyer, plant: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "aquarium.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.kelp", "g.reef", "g.shop"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "kelp, reef, shop: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "aquarium.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.cafe", "g.concourse", "g.rotunda_r"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "cafe, concourse, rotunda_r: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "aquarium.arch",
    g: "r90",
    path: "circulation.rooms[].walk",
    ids: ["g.rotunda_r"],
    maxDelta: 200,
    cls: "threshold-carve",
    why: "rotunda_r: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤0+0 steps; walk −200 mm (2 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "attached.arch",
    g: ["r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed"],
    maxDelta: 900,
    cls: "anchor-far-tie",
    why: "r_bed: a bed covers its centre — the measured cell jumps 14 cells round the tie ring; walk +900 mm (9 cells)",
    closesWith: CLOSES["anchor-far-tie"],
  },
  {
    where: "attached.arch",
    g: ["r90", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_bed: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "attached.arch",
    g: ["r90", "r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_living"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_living: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "bungalow.arch",
    g: ["r90", "r180", "r90mx", "r90+N", "r180+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_entry"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_entry: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "bungalow.arch",
    g: ["r90", "r180", "mx", "r90mx", "r90+N", "r180+N", "r270+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_laundry"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_laundry: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "bungalow.arch",
    g: ["r180", "mx", "r90mx", "r180+N", "r270+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath", "g.r_bed1", "g.r_bed2", "g.r_hall", "g.r_kitchen", "g.r_living"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bath, r_bed1, r_bed2, r_hall, r_kitchen, r_living: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "courtyard-house.arch",
    g: ["r90", "r180", "r90mx", "r180mx", "r90+N", "r180+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_dining"],
    maxDelta: 1400,
    cls: "anchor-far-tie",
    why: "r_dining: a table covers its centre — the measured cell jumps 16 cells round the tie ring; walk −1400 mm (14 cells)",
    closesWith: CLOSES["anchor-far-tie"],
  },
  {
    where: "courtyard-house.arch",
    g: ["r180", "r270", "mx", "r90mx", "r180+N", "r270+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_gallery"],
    maxDelta: 7300,
    cls: "label-point-tie",
    why: "r_gallery: the concave room's label point flips to its other arm; walk +7300 mm (73 cells)",
    closesWith: CLOSES["label-point-tie"],
  },
  {
    where: "courtyard-house.arch",
    g: ["r90", "r180", "r90mx", "r180mx", "r90+N", "r180+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed1", "g.r_bed2", "g.r_study"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_bed1, r_bed2, r_study: entrance moved ≤0 step, measured cell ≤1 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "courtyard-house.arch",
    g: ["r90", "r180", "r270", "mx", "r90mx", "r180mx", "r90+N", "r180+N", "r270+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed3"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bed3: entrance moved ≤0 step, measured cell ≤2 steps (exact ties); walk ≤+200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "courtyard-house.arch",
    g: ["r270", "mx", "r270mx", "r270+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed1"],
    maxDelta: 200,
    cls: "threshold-carve",
    why: "r_bed1: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤0+0 steps; walk ±200 mm (2 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "courtyard-house.arch",
    g: ["r270", "r270mx", "r270+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_study"],
    maxDelta: 200,
    cls: "threshold-carve",
    why: "r_study: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤0+0 steps; walk −200 mm (2 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "courtyard-house.arch",
    g: "r180mx",
    path: "circulation.rooms[].walk",
    ids: ["g.r_util"],
    maxDelta: 200,
    cls: "threshold-carve",
    why: "r_util: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤0+0 steps; walk +200 mm (2 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "furnished-flat.arch",
    g: ["r90", "r180mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath", "g.r_bed1"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bath, r_bed1: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤+200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "furnished-flat.arch",
    g: ["r90", "r180", "r90mx", "r180mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed2", "g.r_live", "g.r_util"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bed2, r_live, r_util: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "furnished-flat.arch",
    g: ["r180", "r270", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_hall"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_hall: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "furnished-flat.arch",
    g: ["r180", "r270", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath", "g.r_bed1"],
    maxDelta: 400,
    cls: "threshold-carve",
    why: "r_bath, r_bed1: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤1+1 steps; walk +400 mm (4 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "furnished-flat.arch",
    g: ["r270", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_live", "g.r_util"],
    maxDelta: 300,
    cls: "threshold-carve",
    why: "r_live, r_util: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤0+1 steps; walk +300 mm (3 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "garden-loft.arch",
    g: ["r90", "r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_live"],
    maxDelta: 1900,
    cls: "anchor-far-tie",
    why: "r_live: a table covers its centre — the measured cell jumps 18 cells round the tie ring; walk −1900 mm (19 cells)",
    closesWith: CLOSES["anchor-far-tie"],
  },
  {
    where: "garden-loft.arch",
    g: ["r90", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_bed: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "garden-loft.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bath: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤+200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "garden-loft.arch",
    g: "mx",
    path: "circulation.rooms[].walk",
    ids: ["g.r_live"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_live: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤−200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "hexagon-pavilion.arch",
    g: ["r180", "r270", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.g_ne", "g.g_nw"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "g_ne, g_nw: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "hexagon-pavilion.arch",
    g: ["r180", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.g_se", "g.g_sw"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "g_se, g_sw: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "hexagon-pavilion.arch",
    g: ["r270", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.rotunda"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "rotunda: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤+100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "hexagon-pavilion.arch",
    g: ["r90", "r270", "mx", "r90mx", "r180mx", "r270mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.g_n"],
    maxDelta: 1200,
    cls: "threshold-carve",
    why: "g_n: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤1+1 steps; walk −1200 mm (12 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "hexagon-pavilion.arch",
    g: ["r90", "r270", "r90mx", "r270mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.g_se", "g.g_sw"],
    maxDelta: 700,
    cls: "threshold-carve",
    why: "g_se, g_sw: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤1+0 steps; walk +700 mm (7 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "hexagon-pavilion.arch",
    g: "r180",
    path: "circulation.rooms[].walk",
    ids: ["g.rotunda"],
    maxDelta: 1300,
    cls: "threshold-carve",
    why: "rotunda: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤1+0 steps; walk +1300 mm (13 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "imports.arch",
    g: ["r90", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_main"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_main: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "laneway-house.arch",
    g: ["r90", "r180", "r90mx", "r90+N", "r180+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_live"],
    maxDelta: 3600,
    cls: "anchor-far-tie",
    why: "r_live: a table covers its centre — the measured cell jumps 17 cells round the tie ring; walk +3600 mm (36 cells)",
    closesWith: CLOSES["anchor-far-tie"],
  },
  {
    where: "laneway-house.arch",
    g: ["r180", "mx", "r90mx", "r180+N", "r270+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath", "g.r_bed"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bath, r_bed: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "laneway-house.arch",
    g: ["r90", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed"],
    maxDelta: 300,
    cls: "threshold-carve",
    why: "r_bed: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤0+1 steps; walk −300 mm (3 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "library.arch",
    g: "t",
    path: "circulation.rooms[].walk",
    ids: ["g.r_reading"],
    maxDelta: 200,
    cls: "float-translation",
    why: "r_reading: a re-rounded tie 20 m from the origin; walk −200 mm (2 cells)",
    closesWith: CLOSES["float-translation"],
  },
  {
    where: "library.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_eaisle", "g.r_lobby", "g.r_ref", "g.r_waisle"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "r_eaisle, r_lobby, r_ref, r_waisle: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "library.arch",
    g: ["r90", "r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_hall"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_hall: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "library.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_cafe", "g.r_children", "g.r_kitchen", "g.r_staff"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_cafe, r_children, r_kitchen, r_staff: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "library.arch",
    g: ["r180", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_plant", "g.r_wc_m", "g.r_wc_w"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "r_plant, r_wc_m, r_wc_w: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "library.arch",
    g: ["r90", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_plant", "g.r_wc_m", "g.r_wc_w"],
    maxDelta: 1100,
    cls: "threshold-carve",
    why: "r_plant, r_wc_m, r_wc_w: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤1+2 steps; walk −1100 mm (11 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "materials.arch",
    g: ["r90", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_shop"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_shop: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "materials.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_store", "g.r_wc"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "r_store, r_wc: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "materials.arch",
    g: "mx",
    path: "circulation.rooms[].walk",
    ids: ["g.r_office"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_office: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤+200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "materials.arch",
    g: ["r90", "r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_office"],
    maxDelta: 400,
    cls: "threshold-carve",
    why: "r_office: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤1+1 steps; walk +400 mm (4 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "museum-wing.arch",
    g: ["r90", "r180", "r270", "mx", "r90mx", "r180mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.g1", "g.g2", "g.g3"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "g1, g2, g3: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "museum-wing.arch",
    g: ["r180", "r270", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.corridor"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "corridor: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤+100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "museum-wings.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.east.g1", "g.east.g2", "g.east.g3", "g.hall", "g.west.g1", "g.west.g2", "g.west.g3"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "east.g1, east.g2, east.g3, hall, west.g1, west.g2, west.g3: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "museum-wings.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.east.corridor", "g.west.corridor"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "east.corridor, west.corridor: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤+100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "one-room.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_main"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "r_main: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "parametric.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.room_1"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "room_1: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤+100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "relational.arch",
    g: ["r90", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.kitchen"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "kitchen: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "relational.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.living"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "living: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤+300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "relational.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.bath", "g.bed"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "bath, bed: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤+200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "studio.arch",
    g: ["r90", "r270", "mx", "r180mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_bed: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "studio.arch",
    g: ["r90", "r180", "r270", "mx", "r90mx", "r180mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_hall", "g.r_living"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "r_hall, r_living: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "studio.arch",
    g: ["r270", "mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_bath: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤+100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "studio.arch",
    g: ["r90", "r180", "r90mx", "r180mx", "r90+N"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath"],
    maxDelta: 400,
    cls: "threshold-carve",
    why: "r_bath: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤1+1 steps; walk +400 mm (4 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
  {
    where: "terrace-row.arch",
    g: ["r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.u1.bed"],
    maxDelta: 800,
    cls: "anchor-far-tie",
    why: "u1.bed: a bed covers its centre — the measured cell jumps 7 cells round the tie ring; walk −800 mm (8 cells)",
    closesWith: CLOSES["anchor-far-tie"],
  },
  {
    where: "terrace-row.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.u1.bath", "g.u1.hall", "g.u1.living"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "u1.bath, u1.hall, u1.living: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "terrace-row.arch",
    g: "mx",
    path: "circulation.rooms[].walk",
    ids: ["g.u1.bed"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "u1.bed: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤−100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "tiny-house.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_main"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_main: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤−200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "two-bed.arch",
    g: ["r90", "r180"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed1"],
    maxDelta: 300,
    cls: "anchor-far-tie",
    why: "r_bed1: a bed's clearance halo covers its centre (224 mm off) — the measured cell jumps 3 cells round the tie ring; walk −300 mm (3 cells)",
    closesWith: CLOSES["anchor-far-tie"],
  },
  {
    where: "two-bed.arch",
    g: ["r90", "r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bath", "g.r_kitchen"],
    maxDelta: 300,
    cls: "raster-tie",
    why: "r_bath, r_kitchen: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−300 mm (3 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "two-bed.arch",
    g: ["r90", "r180", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_hall"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_hall: entrance moved ≤1 step, measured cell ≤2 steps (exact ties); walk ≤−100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "two-bed.arch",
    g: ["r180", "mx", "r90mx"],
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed2"],
    maxDelta: 200,
    cls: "raster-tie",
    why: "r_bed2: entrance moved ≤1 step, measured cell ≤1 steps (exact ties); walk ≤±200 mm (2 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "two-bed.arch",
    g: "mx",
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed1"],
    maxDelta: 100,
    cls: "raster-tie",
    why: "r_bed1: entrance moved ≤1 step, measured cell ≤0 steps (exact ties); walk ≤+100 mm (1 cells)",
    closesWith: CLOSES["raster-tie"],
  },
  {
    where: "two-bed.arch",
    g: "r90",
    path: "circulation.rooms[].walk",
    ids: ["g.r_bed2"],
    maxDelta: 300,
    cls: "threshold-carve",
    why: "r_bed2: a doorway seeded across a lattice line carves on another row, beyond the endpoints' ≤0+1 steps; walk +300 mm (3 cells)",
    closesWith: CLOSES["threshold-carve"],
  },
];
