/**
 * Instance frames — the rigid transform behind `place` (component v2).
 *
 * A component is authored in LOCAL coordinates from `(0,0)`; a `place` names where that
 * origin lands and, optionally, a quarter-turn and an axis reflection. This module is the
 * one place that transform lives:
 *
 *  - {@link Frame} is a 2×2 integer matrix plus a translation. Every entry is `-1|0|1`
 *    and `|det| = 1`, so a frame is EXACT — no trig, no floats introduced, and the
 *    composition of two frames is another such frame (nested `place` just multiplies).
 *    Its linear part is an element of the group D4 (`src/algebra/d4.ts`).
 *  - {@link transformElement} maps a resolved element from its instance's local frame to
 *    plan-global coordinates. It is applied to the element the resolver already produced,
 *    NOT to the resolver's inputs — see the note below. Each element module owns its own
 *    action (`ElementDef.transform`, handed a {@link makeTransformCtx} facade).
 *
 * **Why transform the OUTPUT and not the input coordinates.** Every derived-geometry rule
 * in the resolver is stated in world terms — `anchor top-left` names a corner of the page,
 * `against wall … side left` names a face, `hinge left` names a side of the wall's
 * traversal direction, `dims auto` measures page axes. Feeding pre-rotated coordinates
 * into those rules would silently mean something different, so every element resolver
 * would have to learn what a frame is. Resolving the instance in its own frame and then
 * applying one rigid transform keeps all of that code untouched and is exactly
 * equivalent, because a rotation/reflection is an isometry of the rectilinear world: the
 * only rules that are not equivariant are the handed ones, and each element's `transform`
 * flips those explicitly (a door's `swing`, a `dim`'s signed `offset`, a fixture's
 * quarter-turn).
 *
 * **Grid snapping happens in the author's frame, BEFORE the transform**, so a round-half-up
 * tie (`50` on a 100 grid snaps to `100`, and `mirror x` then carries it to `-100`, where
 * authoring `-50` in plan space would have snapped to `0`) is a property of the authored
 * frame, not a defect of the group action.
 *
 * Determinism: pure integer arithmetic on the matrix; the only division is the `/ 2`
 * already present in the resolved geometry. `transform(transform(p, f), inverse(f)) === p`
 * byte-for-byte.
 */

import type { Point } from "./ast.js";
import type { Span } from "./diagnostics.js";
import type { WallSegment } from "./geometry.js";
import type { Arc } from "./geometry/arc.js";
import type { RailSide } from "./ast.js";
import type { ResolvedElement } from "./ir.js";
import type { ElementDef, TransformCtx } from "./registry.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import {
  D4_IDENTITY,
  backVectorOfDeg,
  degOfBackVector,
  fromMatrix,
  fromSpelling,
  SIDE_NORMAL,
  sideOfNormal,
  toMatrix,
  toSpelling,
} from "./algebra/d4.js";

/**
 * A placed instance's coordinate frame: `p_global = M · p_local + t`.
 *
 * `M = [a b; c d]` is a signed permutation matrix (a quarter-turn optionally composed
 * with an axis reflection). `prefix` is the dotted instance path every id born inside the
 * instance is namespaced with.
 */
export interface Frame {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
  /** Dotted instance path (`west`, `west.inner`) — the id namespace. */
  prefix: string;
  /** Component name the instance was made from (for `describe()`). */
  component: string;
  /** The authored quarter-turn, for `describe()`/diagnostics (composed, mod 360). */
  rotate: 0 | 90 | 180 | 270;
  /** The authored reflection, when the composed frame has one. */
  mirror?: "x" | "y";
  /** Byte span of the `place` statement, in the file the `place` was written in. */
  span?: Span;
  /** The file the `place` statement lives in (absent = the compiled source). */
  file?: string;
  /**
   * For a NESTED instance only: the enclosing instance's frame, and this `place`'s own
   * frame relative to it (what {@link makeFrame} built before {@link composeFrame}). Absent
   * on a top-level instance, whose frame is its own local frame. The resolver walks these
   * to express a descendant in an ancestor's local frame by composing the authored frames,
   * with the same arithmetic the ancestor's body gets when it is compiled as the plan.
   * Resolver-internal: {@link makeTransformCtx} strips both, so an element's `transform`
   * (a plugin's included) never sees them.
   */
  parent?: Frame;
  local?: Frame;
}

/** The identity frame (the root plan). Exposed so callers can spell "no transform". */
export const IDENTITY: Frame = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, prefix: "", component: "", rotate: 0 };

/**
 * Build the frame for one `place`: reflect first (in the component's own axes), then
 * turn, then translate. `mirror x` negates x (a left↔right flip); `mirror y` negates y.
 */
export function makeFrame(opts: {
  origin: Point;
  rotate?: 0 | 90 | 180 | 270;
  mirror?: "x" | "y";
  prefix: string;
  component: string;
  span?: Span;
  file?: string;
}): Frame {
  // The quarter-turn's matrix, CLOCKWISE on screen (+x right, +y down).
  const [ra, rb, rc, rd] = toMatrix(fromSpelling(opts.rotate ?? 0));
  const mx = opts.mirror === "x" ? -1 : 1;
  const my = opts.mirror === "y" ? -1 : 1;
  // R · Mir  (Mir is diagonal, so this is a column scale of R). Kept as arithmetic rather
  // than read from `toMatrix(fromSpelling(rotate, mirror))`: the product writes `0 · −1`
  // as `-0`, and a signed zero can reach an arc's `atan2`, so the table (plain zeros) is
  // equal but not byte-identical.
  return {
    a: ra * mx,
    b: rb * my,
    c: rc * mx,
    d: rd * my,
    tx: opts.origin.x,
    ty: opts.origin.y,
    prefix: opts.prefix,
    component: opts.component,
    rotate: opts.rotate ?? 0,
    ...(opts.mirror ? { mirror: opts.mirror } : {}),
    ...(opts.span ? { span: opts.span } : {}),
    ...(opts.file !== undefined ? { file: opts.file } : {}),
  };
}

/**
 * Compose a child frame (local → parent-local) with its parent (parent-local → global),
 * producing the child's local → global frame. This is what makes a `place` inside a
 * component body work: `p_global = P(C(p))`.
 */
export function composeFrame(parent: Frame, child: Frame): Frame {
  const a = parent.a * child.a + parent.b * child.c;
  const b = parent.a * child.b + parent.b * child.d;
  const c = parent.c * child.a + parent.d * child.c;
  const d = parent.c * child.b + parent.d * child.d;
  const tx = parent.a * child.tx + parent.b * child.ty + parent.tx;
  const ty = parent.c * child.tx + parent.d * child.ty + parent.ty;
  const composed: Frame = {
    a,
    b,
    c,
    d,
    tx,
    ty,
    prefix: child.prefix,
    component: child.component,
    rotate: 0,
    ...(child.span ? { span: child.span } : {}),
    ...(child.file !== undefined ? { file: child.file } : {}),
  };
  // Re-derive the human-facing (rotate, mirror) pair from the composed matrix — D4's
  // normal form `R^k · Fx^f` — so `describe()` reports the transform the instance
  // actually carries. The product of two D4 matrices is in D4, so the fallback is
  // unreachable; it keeps this total rather than throwing inside a pure transform.
  const spelled = toSpelling(fromMatrix([a, b, c, d]) ?? D4_IDENTITY);
  composed.rotate = spelled.rotate;
  if (spelled.mirror) composed.mirror = spelled.mirror;
  return composed;
}

/** Determinant of the linear part: `+1` for a pure rotation, `−1` when reflected. */
export function det(f: Frame): number {
  return f.a * f.d - f.b * f.c;
}

/** Is this frame the identity (no transform at all)? */
export function isIdentity(f: Frame): boolean {
  return f.a === 1 && f.b === 0 && f.c === 0 && f.d === 1 && f.tx === 0 && f.ty === 0;
}

/** Map a point from the frame's local coordinates into global ones. */
export function tp(f: Frame, p: Point): Point {
  return { x: f.a * p.x + f.b * p.y + f.tx, y: f.c * p.x + f.d * p.y + f.ty };
}

/** The inverse frame (global → local). Exact: `M⁻¹ = adj(M)/det`, and `det = ±1`. */
export function inverse(f: Frame): Frame {
  const dt = det(f);
  const a = f.d / dt;
  const b = -f.b / dt;
  const c = -f.c / dt;
  const d = f.a / dt;
  return {
    a,
    b,
    c,
    d,
    tx: -(a * f.tx + b * f.ty),
    ty: -(c * f.tx + d * f.ty),
    prefix: "",
    component: f.component,
    rotate: 0,
  };
}

/** Does the frame swap the x and y axes (a 90°/270° turn)? Then `w`/`h` swap. */
function swapsAxes(f: Frame): boolean {
  return f.b !== 0;
}

/**
 * Map an axis-aligned rectangle given as TOP-LEFT + size. The transformed corners are
 * taken component-wise minimum, because a turn or a flip moves which corner is "top
 * left" — transforming the corner alone would shift the rectangle by its own extent.
 */
export function transformRect(
  f: Frame,
  at: Point,
  size: { w: number; h: number },
): { at: Point; size: { w: number; h: number } } {
  const c1 = tp(f, at);
  const c2 = tp(f, { x: at.x + size.w, y: at.y + size.h });
  return {
    at: { x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y) },
    size: swapsAxes(f) ? { w: size.h, h: size.w } : { w: size.w, h: size.h },
  };
}

/**
 * Carry a fixture's quarter-turn through the frame. Exact for rotations AND reflections:
 * the symbol's back vector (`backVectorOfDeg`, D4's action on a facing) is transformed by
 * the frame's linear part and read back as a quarter-turn, so a mirrored instance's
 * fixtures face the mirrored way round.
 *
 * This is the ROTATION only. Under a reflection the symbol is also handed, and that half
 * rides on {@link import("./ir.js").RFurniture._mirror}, set beside this call — the two
 * together are the exact factorisation `M · R(l) = R(m − l) · Fx`.
 */
export function transformDeg(f: Frame, deg: number | undefined): 0 | 90 | 180 | 270 {
  const v = backVectorOfDeg(deg ?? 0);
  return degOfBackVector({ x: f.a * v.x + f.b * v.y, y: f.c * v.x + f.d * v.y });
}

/** Namespace an id with the frame's instance prefix (`west` + `main` → `west.main`). */
export function nsId(f: Frame, id: string): string {
  return f.prefix ? `${f.prefix}.${id}` : id;
}

/**
 * Map a solved arc into global coordinates. A frame is a signed permutation + translation
 * — an EXACT isometry — so a circle stays a circle of the same radius: the centre and both
 * endpoints transform as points, and the swept ANGLE is preserved in magnitude while its
 * ROTATIONAL SENSE reverses under a reflection (a mirrored clockwise curve reads
 * counter-clockwise). `start` is re-derived from the transformed centre and endpoint rather
 * than rotated numerically, so a quarter-turn is bit-exact.
 */
function transformArc(f: Frame, arc: Arc): Arc {
  const center = tp(f, arc.center);
  const a = tp(f, arc.a);
  const b = tp(f, arc.b);
  return {
    center,
    r: arc.r,
    a,
    b,
    sweep: det(f) < 0 ? -arc.sweep : arc.sweep,
    start: Math.atan2(a.y - center.y, a.x - center.x),
  };
}

/** Map a wall segment (a door's resolved host) into global coordinates. */
function transformSegment(f: Frame, s: WallSegment): WallSegment {
  const out: WallSegment = { ...s, a: tp(f, s.a), b: tp(f, s.b), wallId: nsId(f, s.wallId) };
  if (s.arc) out.arc = transformArc(f, s.arc);
  return out;
}

/**
 * The {@link TransformCtx} an element's `transform` receives for frame `f`: the frame's
 * maps, closed over `f`, and the element's already-namespaced `id`. This is the whole
 * surface an element module needs, so none of them imports this file.
 */
export function makeTransformCtx(f: Frame, id: string): TransformCtx {
  // The nesting chain is the resolver's bookkeeping, not part of the transform: an element's
  // action (a plugin's included) sees the frame without it.
  const { parent: _parent, local: _local, ...frame } = f;
  return {
    frame: f.parent || f.local ? frame : f,
    id,
    reflected: det(f) < 0,
    swapsAxes: swapsAxes(f),
    point: (p) => tp(f, p),
    rect: (at, size) => transformRect(f, at, size),
    arc: (a) => transformArc(f, a),
    segment: (s) => transformSegment(f, s),
    quarterTurn: (d) => transformDeg(f, d),
    side: (s) => transformRailSide(f, s),
    nsId: (x) => nsId(f, x),
  };
}

/**
 * The action that carries `el` across a frame: its own def's `transform`, else — for a
 * plugin that REPLACES a built-in kind without supplying one — the built-in's. That fallback
 * reads the built-in's resolved shape, so a replacement whose `resolve` returns a different
 * shape must supply its own `transform`. `undefined` means the element cannot be placed (a
 * plugin kind with no `transform`).
 */
export function transformOf(el: ResolvedElement, def?: ElementDef): ElementDef["transform"] {
  return def?.transform ?? BUILTIN_REGISTRY.byKind.get(el.kind)?.transform;
}

/**
 * Map one resolved element from its instance's local frame into plan-global coordinates,
 * returning a NEW element (the local one stays intact — a door's `host` aliases its wall's
 * point objects, so transforming in place would double-apply the frame). `null` when the
 * element has no action ({@link transformOf}); the resolver turns that into
 * `E_INSTANCE_NO_TRANSFORM` and drops the element.
 *
 * The element's own `transform` flips its handed properties when the frame reflects
 * (`det < 0`): a door's `swing` is measured from the host wall's LEFT normal, and a `dim`'s
 * `offset` from the measured segment's left normal, so both reverse under a reflection; and
 * a fixture's drawn SYMBOL is handed, which `_mirror` carries to the renderer. `hinge` does
 * NOT flip — it is defined along the wall's traversal direction, which the transform
 * carries with it. The id namespacing and the `_instance`/`_component` stamps happen here,
 * once, for every kind.
 */
export function tryTransformElement(f: Frame, el: ResolvedElement, def?: ElementDef): ResolvedElement | null {
  const action = transformOf(el, def);
  if (!action) return null;
  const id = nsId(f, el.id);
  const out = action(el, makeTransformCtx(f, id));
  out._instance = f.prefix;
  out._component = f.component;
  return out;
}

/**
 * {@link tryTransformElement} that THROWS (a `TypeError`) on a kind with no action,
 * instead of returning `null`. It exists for tests (`test/frame.test.ts` drives every
 * built-in kind through it) and has no caller in `src/`: production code — the resolver
 * behind `compile()` — calls `tryTransformElement` and turns a `null` into
 * `E_INSTANCE_NO_TRANSFORM`, because a user-source problem is returned, never thrown.
 */
export function transformElement(f: Frame, el: ResolvedElement, def?: ElementDef): ResolvedElement {
  const out = tryTransformElement(f, el, def);
  if (!out) throw new TypeError(`transformElement: element kind "${el.kind}" has no transform()`);
  return out;
}

/**
 * Which side a rail edge becomes under a frame: push its outward normal (`SIDE_NORMAL`)
 * through the matrix's LINEAR part (no translation — a direction has no position) and read
 * back the side that normal names.
 *
 * Exact by construction: the frame is a signed permutation, so a unit axis vector maps to
 * a unit axis vector and the lookup below always hits. There is no rounding, no
 * tolerance, and `transformRailSide(inverse(f), transformRailSide(f, s)) === s`.
 */
function transformRailSide(f: Frame, side: RailSide): RailSide {
  const n = SIDE_NORMAL[side];
  // Unreachable fallback for a signed-permutation matrix; returning the input keeps the
  // function total rather than throwing inside a pure transform.
  return sideOfNormal({ x: f.a * n.x + f.b * n.y, y: f.c * n.x + f.d * n.y }) ?? side;
}
