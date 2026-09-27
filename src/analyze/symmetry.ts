/**
 * The plan's SYMMETRY GROUP and its REPETITION, as facts — `describe(src, { facts:
 * ["symmetry"] })`. Opt-in: nothing here runs unless a caller asks for it.
 *
 * ## The group
 *
 * A plan's symmetry group is its stabiliser in the plane's rectilinear isometry group
 * D4 ⋉ Z² — the group `place` already acts by (`src/algebra/d4.ts`, `src/frame.ts`). A
 * finite non-empty set has no non-trivial translational symmetry, so its stabiliser fixes
 * a point and is conjugate to a subgroup of D4. Every D4 element maps an axis-aligned box
 * to an axis-aligned box, so a symmetry maps the set's box onto itself and fixes the box's
 * centre `c`. The only candidates are therefore the seven non-identity `g_c(p) = c + L(p − c)`,
 * and each is TESTED, never assumed.
 *
 * **The "never a bounding box" law.** The box is used for one thing: to ENUMERATE the
 * candidate centre, which is a necessary condition only. Every reported symmetry is then
 * VERIFIED ON THE SHAPE, by exact equality of the whole labelled record set with its image,
 * and no position anywhere is derived from the box. A shape the box would mislead (an L, a
 * courtyard) is simply one whose candidates fail the test.
 *
 * ## Exactness
 *
 * Everything is compared in DOUBLED, CENTRED coordinates: with `P = 2p` and
 * `2C = min P + max P`, `u = 2P − 2C = 4(p − c)`, where the candidate `g_c` becomes the
 * linear map `u ↦ L·u` — a signed permutation, so integer inputs stay integers and the
 * comparison is EXACT, even when the centre sits on a half (or quarter) millimetre. That
 * holds whenever every coordinate is a multiple of half a millimetre, which is every
 * grid-snapped plan. Otherwise (an
 * oblique host's jamb, an arc centre) the layer is compared at {@link fmt4} precision —
 * the "same bytes" quantum `src/elements/glyph-chirality.ts` uses — applied to the
 * MAGNITUDE so the quantiser commutes with the sign flips `L` makes; there is no tolerance
 * constant of this module's own, and the layer says which case it was (`exact`).
 *
 * ## Layers, each reported on its own
 *
 *  - `shell` — the walls in MAXIMAL-LINE NORMAL FORM (the maximal lines of Stiny's shape
 *    algebra; Krishnamurti 1980): collinear segments of one thickness that overlap or touch
 *    are merged along their carrier line, so how an author split a wall into statements does
 *    not matter. Arcs stay
 *    arcs (centre, endpoints, turning sense). Label: the wall thickness.
 *  - `rooms` — each room's floor (a rectangle's or polygon's ring with collinear vertices
 *    removed, a circle's centre and radius), labelled by its `uses` — the room's function,
 *    never its label text.
 *  - `full` — the rooms plus every opening (a door's hinge jamb, far jamb and open-leaf
 *    tip, which carry its hinge side and swing; a window's and a cased opening's jambs and
 *    width) plus the furniture (footprint, category, the back vector when the catalogue
 *    gives the symbol a back, and the handedness of a HANDED symbol — asked of the drawing
 *    itself, `glyph-chirality.ts`'s predicate, and flipped by a reflection).
 *
 * A furniture piece is compared on those attributes, not on its drawn marks, so a symbol
 * with more symmetry than its attributes say can only make the answer SMALLER, never
 * larger.
 *
 * ## Repetition
 *
 * Translational runs (the translation part of a frieze group, the way Szalinski reads a
 * CAD program's loops): three or more CONGRUENT rooms — same floor, same `uses`, same
 * furniture laid out the same way, up to a translation — whose positions, sorted by
 * `(y, x)`, have a constant first difference. And alternating MIRROR runs (a terrace: A,
 * mirror-A, A, mirror-A), where each room is the exact reflection of the one before it
 * about an axis-parallel line and the lines are evenly spaced.
 *
 * Pure, synchronous, deterministic. Integer arithmetic throughout (BigInt where a cross
 * product could pass 2^53); no trig, no clock, no randomness.
 */

import type { Point } from "../ast.js";
import type { RDoor, RFurniture, ROpening, RRoom, RWall, RWindow, ResolvedPlan } from "../ir.js";
import { D4_ELEMENTS, type D4, det, toMatrix, toSpelling, backVectorOfDeg } from "../algebra/d4.js";
import { fmt4 } from "../num-format.js";
import { doorSwing, normal, segmentDirAt, segmentsOfWall } from "../geometry.js";
import { pointInRoomBox, roomBox, roomUses } from "../analyze.js";
import { fixtureSpec } from "../fixtures-catalog.js";
import { fixtureGlyph } from "../elements/fixtures-glyphs.js";
import { marksEqual, mirrorNode } from "../elements/glyph-chirality.js";
import type { RenderSizes } from "../scene.js";
import { DEFAULT_THEME } from "../theme.js";

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

/** The subgroup of D4 a layer's stabiliser is, up to conjugacy. */
export type SymmetryGroup = "C1" | "C2" | "C4" | "D1" | "D2" | "D4";

/**
 * A mirror line through the layer's centre, named by the reflection it is:
 *
 *  - `"x"` — the `mirror x` reflection, which negates x: the line is VERTICAL, `x = c.x`;
 *  - `"y"` — `mirror y`, which negates y: the line is HORIZONTAL, `y = c.y`;
 *  - `"diag"` — the line `y − c.y = x − c.x`, top-left to bottom-right on the page (+y down);
 *  - `"antidiag"` — the line `y − c.y = −(x − c.x)`, bottom-left to top-right.
 */
export type MirrorAxis = "x" | "y" | "diag" | "antidiag";

/** One group element in `place`'s own normal-form spelling: reflect in x, then turn. */
export interface SymmetryElement {
  rotate: 0 | 90 | 180 | 270;
  mirror?: "x";
}

/** One layer's symmetry: the stabiliser of its labelled record set. */
export interface LayerSymmetry {
  group: SymmetryGroup;
  /** The one mirror line of a `D1`. */
  axis?: MirrorAxis;
  /** The two mirror lines of a `D2`: `["x","y"]` or `["diag","antidiag"]`. */
  axes?: [MirrorAxis, MirrorAxis];
  /** The fixed point every element turns or reflects about, in plan mm. */
  centre: { x: number; y: number };
  /** Every element of the group, the identity first, in D4's `R^k·Fx^f` index order. */
  elements: SymmetryElement[];
  /** True when every coordinate was a multiple of half a millimetre and the comparison
   *  was exact; false when it was made at `fmt4` precision. */
  exact: boolean;
}

/** A run of ≥3 congruent rooms at a constant offset. */
export interface TranslationRepeat {
  kind: "translate";
  count: number;
  /** The offset from each room to the next, in mm. */
  step: { x: number; y: number };
  /** The rooms, in run order (ascending `(y, x)`). */
  ids: string[];
}

/** A run of ≥3 rooms, each the mirror image of the one before about an evenly spaced
 *  axis-parallel line (A, mirror-A, A, …). */
export interface MirrorRepeat {
  kind: "mirror";
  count: number;
  /** The reflection between neighbours: `"x"` = mirror lines vertical, `"y"` = horizontal. */
  axis: "x" | "y";
  /** The frieze translation: room `i+2` is room `i` moved by this, in mm. */
  step: { x: number; y: number };
  /** The mirror lines between neighbours (their x for axis `"x"`, their y for `"y"`), mm. */
  lines: number[];
  ids: string[];
}

export type Repeat = TranslationRepeat | MirrorRepeat;

/** `describe().symmetry`. A layer is `null` when it holds nothing. */
export interface SymmetryFacts {
  layers: {
    shell: LayerSymmetry | null;
    rooms: LayerSymmetry | null;
    full: LayerSymmetry | null;
  };
  repeats: Repeat[];
}

// ---------------------------------------------------------------------------
// Records: labelled point tuples the group acts on
// ---------------------------------------------------------------------------

/**
 * How a record's points are compared: `set` unordered, `seq` in order, `ring` up to a
 * cyclic shift and reversal, `arc` as `[centre, a, b]` traversed in the sense `hand` gives
 * (`+1` clockwise on the sheet), so the same curve traced backwards is the same record.
 */
type Form = "set" | "seq" | "ring" | "arc";

interface Rec<P> {
  form: Form;
  label: string;
  pts: P[];
  /** A direction carried by the record (a fixture's back): acted on by `L`, never moved. */
  vec?: { x: number; y: number };
  /** A handedness: `+1`/`−1`, flipped by every reflection. */
  hand?: 1 | -1;
}

/** An integer point in the layer's working unit. */
interface IP {
  x: number;
  y: number;
}

const pk = (p: IP): string => `${p.x},${p.y}`;

/** The lexicographically least spelling of a closed ring, over every start and both senses. */
function ringKey(pts: readonly IP[]): string {
  const s = pts.map(pk);
  let best: string | undefined;
  for (const seq of [s, [...s].reverse()]) {
    for (let i = 0; i < seq.length; i++) {
      const k = [...seq.slice(i), ...seq.slice(0, i)].join(" ");
      if (best === undefined || k < best) best = k;
    }
  }
  return best ?? "";
}

function recKey(r: Rec<IP>): string {
  let body: string;
  switch (r.form) {
    case "set":
      body = r.pts.map(pk).sort().join(" ");
      break;
    case "seq":
      body = r.pts.map(pk).join(" ");
      break;
    case "ring":
      body = ringKey(r.pts);
      break;
    case "arc": {
      const [c, a, b] = r.pts as [IP, IP, IP];
      body = (r.hand === -1 ? [c, b, a] : [c, a, b]).map(pk).join(" ");
      break;
    }
  }
  const vec = r.vec ? `|v${r.vec.x},${r.vec.y}` : "";
  const hand = r.hand !== undefined && r.form !== "arc" ? `|h${r.hand}` : "";
  return `${r.label}|${r.form}|${body}${vec}${hand}`;
}

/** `+ 0` turns a `-0` a matrix entry produced back into `0`, so no key ever reads `-0`. */
const act = (g: D4, p: IP): IP => {
  const [a, b, c, d] = toMatrix(g);
  return { x: a * p.x + b * p.y + 0, y: c * p.x + d * p.y + 0 };
};

function actRec(g: D4, r: Rec<IP>): Rec<IP> {
  return {
    form: r.form,
    label: r.label,
    pts: r.pts.map((p) => act(g, p)),
    ...(r.vec ? { vec: act(g, r.vec) } : {}),
    ...(r.hand !== undefined ? { hand: (r.hand * det(g)) as 1 | -1 } : {}),
  };
}

// ---------------------------------------------------------------------------
// Quantisation
// ---------------------------------------------------------------------------

/**
 * The working-unit integer of a doubled coordinate `v`: `v` itself when the layer is
 * exact, else `v` at {@link fmt4} precision scaled to an integer — rounded on the
 * MAGNITUDE, so `q(−v) = −q(v)` and the quantiser commutes with every signed permutation.
 */
function quantiser(exact: boolean): (v: number) => number {
  if (exact) return (v) => v + 0;
  return (v) => {
    const m = Math.round(Number(fmt4(Math.abs(v))) * 1e4);
    return v < 0 ? -m : m;
  };
}

/** mm per working unit: a doubled coordinate is half a mm; `fmt4` scales by 1e4 more. */
const unitMm = (exact: boolean): number => (exact ? 0.5 : 0.5e-4);

/** A mm figure as the facts channel prints it — through `fmt4`, never a raw float. */
const mm = (v: number): number => Number(fmt4(v));

interface Frame0 {
  /** min + max of the doubled coordinates `P = 2p`: `2C = 4c`. */
  c2: { x: number; y: number };
  exact: boolean;
  q(v: number): number;
}

/** The candidate centre (doubled) and the precision of a layer, from its raw points. */
function frameOf(raw: readonly Rec<Point>[]): Frame0 | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let exact = true;
  for (const r of raw) {
    for (const p of r.pts) {
      const X = 2 * p.x;
      const Y = 2 * p.y;
      if (!Number.isInteger(X) || !Number.isInteger(Y)) exact = false;
      if (X < minX) minX = X;
      if (Y < minY) minY = Y;
      if (X > maxX) maxX = X;
      if (Y > maxY) maxY = Y;
    }
  }
  if (minX === Infinity) return null;
  return { c2: { x: minX + maxX, y: minY + maxY }, exact, q: quantiser(exact) };
}

/**
 * A raw record in the layer's centred integer working coordinates `u = 2P − 2C`, where
 * `P = 2p` is the doubled coordinate and `2C = min P + max P` — i.e. `u = 4(p − c)`. For a
 * whole-mm plan that is the doubled `2(p − c)` scheme scaled once more; the extra factor is
 * what keeps a half-mm plan (whose `2C` can be odd) on integers too.
 */
function centred(f: Frame0, r: Rec<Point>): Rec<IP> {
  const u = (p: Point): IP => ({ x: f.q(4 * p.x - f.c2.x), y: f.q(4 * p.y - f.c2.y) });
  return {
    form: r.form,
    label: r.label,
    pts: r.pts.map(u),
    ...(r.vec ? { vec: r.vec } : {}),
    ...(r.hand !== undefined ? { hand: r.hand } : {}),
  };
}

// ---------------------------------------------------------------------------
// The stabiliser
// ---------------------------------------------------------------------------

/** The mirror line each reflection `R^k·Fx` fixes, indexed by `k`. */
const AXIS_OF_K: readonly MirrorAxis[] = ["x", "antidiag", "y", "diag"];

function classify(els: readonly D4[]): Pick<LayerSymmetry, "group" | "axis" | "axes"> {
  const reflections = els.filter((g) => g.f === 1);
  switch (els.length) {
    case 1:
      return { group: "C1" };
    case 2:
      return reflections.length === 0 ? { group: "C2" } : { group: "D1", axis: AXIS_OF_K[reflections[0]!.k]! };
    case 4:
      if (reflections.length === 0) return { group: "C4" };
      return { group: "D2", axes: reflections.some((g) => g.k === 0) ? ["x", "y"] : ["diag", "antidiag"] };
    default:
      return { group: "D4" };
  }
}

/** The stabiliser of a record set that is already in centred working coordinates. */
function stabiliser(recs: readonly Rec<IP>[]): D4[] {
  const keys = (rs: readonly Rec<IP>[]): string => rs.map(recKey).sort().join("\n");
  const base = keys(recs);
  return D4_ELEMENTS.filter((g) => (g.k === 0 && g.f === 0) || keys(recs.map((r) => actRec(g, r))) === base);
}

function layerSymmetry(f: Frame0, recs: readonly Rec<IP>[]): LayerSymmetry {
  const els = stabiliser(recs);
  return {
    ...classify(els),
    centre: { x: mm(f.c2.x / 4), y: mm(f.c2.y / 4) },
    elements: els.map((g) => toSpelling(g)),
    exact: f.exact,
  };
}

// ---------------------------------------------------------------------------
// The shell: walls in maximal-line normal form
// ---------------------------------------------------------------------------

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

/**
 * Merge collinear, same-label segments that overlap or touch into maximal segments.
 * Each carrier line is keyed by its primitive integer direction (sign-normalised) and its
 * constant `d × p` — exact, in BigInt, so an oblique line never rounds.
 */
function maximalLines(segs: readonly { label: string; a: IP; b: IP }[]): Rec<IP>[] {
  const lines = new Map<string, { label: string; ivs: { t: bigint; u: bigint; a: IP; b: IP }[] }>();
  for (const s of segs) {
    let dx = s.b.x - s.a.x;
    let dy = s.b.y - s.a.y;
    if (dx === 0 && dy === 0) continue;
    const k = gcd(dx, dy);
    dx /= k;
    dy /= k;
    if (dx < 0 || (dx === 0 && dy < 0)) {
      dx = -dx;
      dy = -dy;
    }
    const DX = BigInt(dx);
    const DY = BigInt(dy);
    const c = DX * BigInt(s.a.y) - DY * BigInt(s.a.x);
    const ta = DX * BigInt(s.a.x) + DY * BigInt(s.a.y);
    const tb = DX * BigInt(s.b.x) + DY * BigInt(s.b.y);
    const key = `${s.label}|${dx},${dy}|${c}`;
    const iv = ta <= tb ? { t: ta, u: tb, a: s.a, b: s.b } : { t: tb, u: ta, a: s.b, b: s.a };
    const line = lines.get(key);
    if (line) line.ivs.push(iv);
    else lines.set(key, { label: s.label, ivs: [iv] });
  }
  const out: Rec<IP>[] = [];
  for (const { label, ivs } of lines.values()) {
    ivs.sort((p, q) => (p.t < q.t ? -1 : p.t > q.t ? 1 : 0));
    let cur = { ...ivs[0]! };
    for (const iv of ivs.slice(1)) {
      if (iv.t <= cur.u) {
        if (iv.u > cur.u) {
          cur.u = iv.u;
          cur.b = iv.b;
        }
      } else {
        out.push({ form: "set", label, pts: [cur.a, cur.b] });
        cur = { ...iv };
      }
    }
    out.push({ form: "set", label, pts: [cur.a, cur.b] });
  }
  return out;
}

function shellSymmetry(walls: readonly RWall[]): LayerSymmetry | null {
  const straight: { label: string; a: Point; b: Point }[] = [];
  const arcs: Rec<Point>[] = [];
  for (const w of walls) {
    const label = `wall t=${fmt4(w.thickness)}`;
    for (const s of segmentsOfWall(w)) {
      if (s.arc) {
        arcs.push({ form: "arc", label, pts: [s.arc.center, s.arc.a, s.arc.b], hand: s.arc.sweep < 0 ? -1 : 1 });
      } else straight.push({ label, a: s.a, b: s.b });
    }
  }
  const raw: Rec<Point>[] = [
    ...straight.map((s): Rec<Point> => ({ form: "seq", label: s.label, pts: [s.a, s.b] })),
    ...arcs,
  ];
  const f = frameOf(raw);
  if (!f) return null;
  const segs = straight.map((s) => {
    const [a, b] = centred(f, { form: "seq", label: s.label, pts: [s.a, s.b] }).pts as [IP, IP];
    return { label: s.label, a, b };
  });
  return layerSymmetry(f, [...maximalLines(segs), ...arcs.map((r) => centred(f, r))]);
}

// ---------------------------------------------------------------------------
// Rooms, openings, furniture
// ---------------------------------------------------------------------------

const usesLabel = (r: RRoom): string => `room ${[...roomUses(r)].sort().join(",")}`;

/** A room's floor as raw points: its ring, or a circle's centre and four extremes. */
function floorRec(r: RRoom): Rec<Point> {
  const label = usesLabel(r);
  if (r.circle) {
    const { c, r: R } = r.circle;
    const pts = [c, { x: c.x + R, y: c.y }, { x: c.x - R, y: c.y }, { x: c.x, y: c.y + R }, { x: c.x, y: c.y - R }];
    return { form: "set", label, pts };
  }
  if (r.poly) return { form: "ring", label, pts: r.poly };
  const { x, y } = r.at;
  const { w, h } = r.size;
  return {
    form: "ring",
    label,
    pts: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  };
}

/** Drop repeated and collinear vertices of an integer ring, so a ring has one spelling. */
function reduceRing(pts: readonly IP[]): IP[] {
  let ring = pts.filter((p, i) => {
    const n = pts[(i + 1) % pts.length]!;
    return p.x !== n.x || p.y !== n.y;
  });
  for (let changed = true; changed && ring.length > 3; ) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length]!;
      const b = ring[i]!;
      const c = ring[(i + 1) % ring.length]!;
      const cross = BigInt(b.x - a.x) * BigInt(c.y - b.y) - BigInt(b.y - a.y) * BigInt(c.x - b.x);
      if (cross === 0n) {
        ring = ring.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return ring;
}

const tidy = (r: Rec<IP>): Rec<IP> => (r.form === "ring" ? { ...r, pts: reduceRing(r.pts) } : r);

/** The two jambs of an opening of `width` centred on `at` along its host, or `[at]`. */
function jambs(at: Point, width: number, host: RDoor["host"]): Point[] {
  if (!host) return [at];
  const d = segmentDirAt(host, at);
  const hw = width / 2;
  return [
    { x: at.x - d.x * hw, y: at.y - d.y * hw },
    { x: at.x + d.x * hw, y: at.y + d.y * hw },
  ];
}

/**
 * A door as `[primary jamb, far jamb, leaf tip]`: the hinge jamb and the open leaf's tip
 * for a hinged door (the very points {@link doorSwing} draws), the jamb the panel parks
 * toward and the face it runs on for any other kind. Those three points carry the hinge
 * side, the slide side and the swing, so a reflection that swaps them is seen.
 */
function doorRec(d: RDoor): Rec<Point> {
  const label = `door ${d.doorKind ?? "hinged"} w=${fmt4(d.width)}`;
  const swing = doorSwing(d);
  if (swing) return { form: "seq", label, pts: [swing.hinge, swing.farJamb, swing.leafEnd] };
  if (!d.host) return { form: "set", label, pts: [d.at] };
  const dir = segmentDirAt(d.host, d.at);
  const n = normal(dir);
  const hw = d.width / 2;
  const s = d.slide === "right" ? 1 : -1;
  const p = { x: d.at.x + dir.x * hw * s, y: d.at.y + dir.y * hw * s };
  const o = { x: d.at.x - dir.x * hw * s, y: d.at.y - dir.y * hw * s };
  const face = d.swing === "in" ? n : { x: -n.x, y: -n.y };
  return { form: "seq", label, pts: [p, o, { x: p.x + face.x * d.width, y: p.y + face.y * d.width }] };
}

/** Pen sizes for the handedness question. Glyph GEOMETRY never reads them (they are paint
 *  only), so any value asks the same question of the drawing. */
const HAND_SIZES: RenderSizes = {
  refDim: 1,
  wallStroke: 1,
  thin: 1,
  roomFont: 1,
  areaFont: 1,
  dimFont: 1,
  furnFont: 1,
  margin: 1,
  hatchGap: 1,
};

/**
 * Is the symbol this piece draws HANDED — different from its own mirror image? Asked of
 * the drawing in its back-on-top frame at this footprint, exactly the question the
 * renderer asks before it reflects a mirrored instance (`glyph-chirality.ts`).
 */
function handed(f: RFurniture): boolean {
  const deg = f.rotate ?? 0;
  const swap = deg === 90 || deg === 270;
  const pw = swap ? f.size.h : f.size.w;
  const ph = swap ? f.size.w : f.size.h;
  const cx = f.at.x + f.size.w / 2;
  const cy = f.at.y + f.size.h / 2;
  const nodes = fixtureGlyph(f.category, { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph }, DEFAULT_THEME, HAND_SIZES);
  if (!nodes) return false;
  return !marksEqual(
    nodes,
    nodes.map((n) => mirrorNode(n, cx)),
  );
}

function furnitureRec(f: RFurniture): Rec<Point> {
  const { x, y } = f.at;
  const { w, h } = f.size;
  const spec = fixtureSpec(f.category);
  return {
    form: "set",
    label: `furniture ${f.category}`,
    pts: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    ...(spec && spec.symmetric !== true ? { vec: backVectorOfDeg(f.rotate ?? 0) } : {}),
    ...(handed(f) ? { hand: f._mirror ? -1 : 1 } : {}),
  };
}

// ---------------------------------------------------------------------------
// Repetition
// ---------------------------------------------------------------------------

interface Motif {
  id: string;
  /** Translation-invariant key: the floor and furniture relative to {@link anchor}. */
  key: string;
  /** Keys of the motif reflected by `Fx` and by `Fy`, re-anchored. */
  mirrorKey: { x: string; y: string };
  /** The least `(y, x)` point of the floor — a vertex of the shape, never a box corner. */
  anchor: IP;
  /** The same for the reflected motifs (in reflected coordinates). */
  mirrorAnchor: { x: IP; y: IP };
}

const lessYX = (a: IP, b: IP): boolean => a.y < b.y || (a.y === b.y && a.x < b.x);

function motifOf(id: string, floor: Rec<IP>, furn: readonly Rec<IP>[]): Motif {
  const view = (flip: "x" | "y" | null): { key: string; anchor: IP } => {
    const m = (p: IP): IP => (flip === "x" ? { x: -p.x + 0, y: p.y } : flip === "y" ? { x: p.x, y: -p.y + 0 } : p);
    const fl = floor.pts.map(m);
    let anchor = fl[0]!;
    for (const p of fl) if (lessYX(p, anchor)) anchor = p;
    const rel = (p: IP): IP => ({ x: p.x - anchor.x, y: p.y - anchor.y });
    const move = (r: Rec<IP>): Rec<IP> => {
      const moved: Rec<IP> = { ...r, pts: r.pts.map((p) => rel(m(p))) };
      if (r.vec) moved.vec = m(r.vec);
      if (flip && r.hand !== undefined) moved.hand = -r.hand as 1 | -1;
      return moved;
    };
    const key = [recKey(move(floor)), ...furn.map((r) => recKey(move(r))).sort()].join("\n");
    return { key, anchor };
  };
  const plain = view(null);
  const mx = view("x");
  const my = view("y");
  return {
    id,
    key: plain.key,
    mirrorKey: { x: mx.key, y: my.key },
    anchor: plain.anchor,
    mirrorAnchor: { x: mx.anchor, y: my.anchor },
  };
}

/**
 * Split a sorted sequence greedily into maximal runs whose consecutive differences of
 * `pos` are all equal, keeping the runs of at least `min` (≥ 2) items.
 */
function constantRuns<T>(items: readonly T[], pos: (t: T) => IP, min: number): T[][] {
  const runs: T[][] = [];
  let i = 0;
  while (i + min - 1 < items.length) {
    const a = pos(items[i]!);
    const b = pos(items[i + 1]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let j = i + 1;
    while (j + 1 < items.length) {
      const p = pos(items[j]!);
      const q = pos(items[j + 1]!);
      if (q.x - p.x !== dx || q.y - p.y !== dy) break;
      j++;
    }
    if (j - i + 1 >= min) {
      runs.push(items.slice(i, j + 1));
      i = j + 1;
    } else i++;
  }
  return runs;
}

function repeatsOf(rooms: readonly RRoom[], furniture: readonly RFurniture[]): Repeat[] {
  if (rooms.length < 3) return [];
  // Which room each piece belongs to: its declared `in <room>`, else the first room whose
  // FLOOR holds the footprint's centre (the poly-aware test, never a room's box).
  const boxes = rooms.map((r) => ({ id: r.id, box: roomBox(r) }));
  const owned = new Map<string, RFurniture[]>(rooms.map((r) => [r.id, []]));
  for (const f of furniture) {
    const c = { x: f.at.x + f.size.w / 2, y: f.at.y + f.size.h / 2 };
    const owner = f.room !== undefined && owned.has(f.room) ? f.room : boxes.find((b) => pointInRoomBox(c, b.box))?.id;
    if (owner !== undefined) owned.get(owner)!.push(f);
  }
  const floors = rooms.map(floorRec);
  const furnRecs = new Map<string, Rec<Point>[]>(rooms.map((r) => [r.id, owned.get(r.id)!.map(furnitureRec)]));
  const all = [...floors, ...[...furnRecs.values()].flat()];
  // Uncentred doubled coordinates: a repeat is about offsets, not a centre.
  let exact = true;
  for (const r of all)
    for (const p of r.pts) if (!Number.isInteger(2 * p.x) || !Number.isInteger(2 * p.y)) exact = false;
  const q = quantiser(exact);
  const unit = unitMm(exact);
  const ip = (r: Rec<Point>): Rec<IP> => tidy({ ...r, pts: r.pts.map((p) => ({ x: q(2 * p.x), y: q(2 * p.y) })) });
  const motifs = rooms.map((r, i) => motifOf(r.id, ip(floors[i]!), furnRecs.get(r.id)!.map(ip)));

  const out: Repeat[] = [];
  const byYX = (a: Motif, b: Motif): number => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x;

  // Translational runs, per congruence class, in first-occurrence (source) order.
  const classes = new Map<string, Motif[]>();
  for (const m of motifs) {
    const c = classes.get(m.key);
    if (c) c.push(m);
    else classes.set(m.key, [m]);
  }
  for (const members of classes.values()) {
    if (members.length < 3) continue;
    for (const run of constantRuns([...members].sort(byYX), (m) => m.anchor, 3)) {
      const a = run[0]!.anchor;
      const b = run[1]!.anchor;
      out.push({
        kind: "translate",
        count: run.length,
        step: { x: mm((b.x - a.x) * unit), y: mm((b.y - a.y) * unit) },
        ids: run.map((m) => m.id),
      });
    }
  }

  // Alternating mirror runs. `b` is the `Fx`-image of `a` about the vertical line whose
  // doubled-unit position is `L/2` when b's motif IS a's reflected motif and b's anchor is
  // a's reflected anchor moved by `(L, 0)` — i.e. no offset across the line.
  for (const axis of ["x", "y"] as const) {
    const along = (p: IP): number => (axis === "x" ? p.x : p.y);
    const across = (p: IP): number => (axis === "x" ? p.y : p.x);
    const next = new Map<string, { to: Motif; line: number }>();
    const hasPrev = new Set<string>();
    for (const a of [...motifs].sort(byYX)) {
      let best: { to: Motif; line: number } | null = null;
      for (const b of motifs) {
        if (b === a || b.key === a.key || b.key !== a.mirrorKey[axis]) continue;
        const ra = a.mirrorAnchor[axis];
        if (across(b.anchor) !== across(ra)) continue;
        const L = along(b.anchor) - along(ra); // = twice the line's doubled position
        if (along(b.anchor) <= along(a.anchor)) continue;
        if (!best || L < best.line) best = { to: b, line: L };
      }
      if (best && !hasPrev.has(best.to.id)) {
        next.set(a.id, best);
        hasPrev.add(best.to.id);
      }
    }
    for (const start of [...motifs].sort(byYX)) {
      if (hasPrev.has(start.id) || !next.has(start.id)) continue;
      const chain: Motif[] = [start];
      const lines: number[] = [];
      for (let cur = next.get(start.id); cur; cur = next.get(cur.to.id)) {
        chain.push(cur.to);
        lines.push(cur.line);
      }
      // Runs of evenly spaced lines — n lines bound n + 1 rooms, so two lines (three
      // rooms) is the shortest run. Reflecting about the lines at `l₀/2` and `l₁/2` in
      // turn is the translation `l₁ − l₀`: the frieze step from room i to room i + 2.
      const idx = lines.map((l, i) => ({ i, p: { x: l, y: 0 } }));
      for (const span of constantRuns(idx, (e) => e.p, 2)) {
        const first = span[0]!.i;
        const members = chain.slice(first, first + span.length + 1);
        const ls = span.map((e) => lines[e.i]!);
        const period = mm((ls[1]! - ls[0]!) * unit);
        out.push({
          kind: "mirror",
          count: members.length,
          axis,
          step: axis === "x" ? { x: period, y: 0 } : { x: 0, y: period },
          lines: ls.map((l) => mm((l / 2) * unit)),
          ids: members.map((m) => m.id),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** The symmetry facts of one resolved storey. */
export function symmetryFacts(ir: ResolvedPlan): SymmetryFacts {
  const walls = ir.elements.filter((e): e is RWall => e.kind === "wall");
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windows = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");

  const roomRecs = rooms.map(floorRec);
  const fullRecs: Rec<Point>[] = [
    ...roomRecs,
    ...doors.map(doorRec),
    ...windows.map(
      (w): Rec<Point> => ({ form: "set", label: `window w=${fmt4(w.width)}`, pts: jambs(w.at, w.width, w.host) }),
    ),
    ...openings.map(
      (o): Rec<Point> => ({ form: "set", label: `opening w=${fmt4(o.width)}`, pts: jambs(o.at, o.width, o.host) }),
    ),
    ...furniture.map(furnitureRec),
  ];
  const tidyLayer = (raw: readonly Rec<Point>[]): LayerSymmetry | null => {
    const f = frameOf(raw);
    return f
      ? layerSymmetry(
          f,
          raw.map((r) => tidy(centred(f, r))),
        )
      : null;
  };
  return {
    layers: {
      shell: shellSymmetry(walls),
      rooms: tidyLayer(roomRecs),
      full: tidyLayer(fullRecs),
    },
    repeats: repeatsOf(rooms, furniture),
  };
}
