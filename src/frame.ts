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
 *  - {@link transformElement} maps a resolved element from its instance's local frame to
 *    plan-global coordinates. It is applied to the element the resolver already produced,
 *    NOT to the resolver's inputs — see the note below.
 *
 * **Why transform the OUTPUT and not the input coordinates.** Every derived-geometry rule
 * in the resolver is stated in world terms — `anchor top-left` names a corner of the page,
 * `against wall … side left` names a face, `hinge left` names a side of the wall's
 * traversal direction, `dims auto` measures page axes. Feeding pre-rotated coordinates
 * into those rules would silently mean something different, so every element resolver
 * would have to learn what a frame is. Resolving the instance in its own frame and then
 * applying one rigid transform keeps all of that code untouched and is exactly
 * equivalent, because a rotation/reflection is an isometry of the rectilinear world: the
 * only rules that are not equivariant are the handed ones, and this module flips those
 * explicitly (a door's `swing`, a `dim`'s signed `offset`, a fixture's quarter-turn).
 *
 * Determinism: pure integer arithmetic on the matrix; the only division is the `/ 2`
 * already present in the resolved geometry. `transform(transform(p, f), inverse(f)) === p`
 * byte-for-byte.
 */

import type { Point } from "./ast.js";
import type { Span } from "./diagnostics.js";
import type { WallSegment } from "./geometry.js";
import type { ResolvedElement, RFurniture, RRoom, RWall } from "./ir.js";

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
}

/** The identity frame (the root plan). Exposed so callers can spell "no transform". */
export const IDENTITY: Frame = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, prefix: "", component: "", rotate: 0 };

/** Linear part of a quarter-turn, CLOCKWISE on screen (+x right, +y down). */
function rotationMatrix(deg: 0 | 90 | 180 | 270): [number, number, number, number] {
  switch (deg) {
    case 90:
      return [0, -1, 1, 0]; // (x,y) → (−y, x)
    case 180:
      return [-1, 0, 0, -1];
    case 270:
      return [0, 1, -1, 0]; // (x,y) → (y, −x)
    default:
      return [1, 0, 0, 1];
  }
}

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
  const [ra, rb, rc, rd] = rotationMatrix(opts.rotate ?? 0);
  const mx = opts.mirror === "x" ? -1 : 1;
  const my = opts.mirror === "y" ? -1 : 1;
  // R · Mir  (Mir is diagonal, so this is a column scale of R).
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
  // Re-derive the human-facing (rotate, mirror) pair from the composed matrix, so
  // `describe()` reports the transform the instance actually carries.
  const flipped = det(composed) < 0;
  const [ra, rb] = flipped ? [a * -1, b] : [a, b];
  composed.rotate = rb === -1 ? 90 : ra === -1 ? 180 : rb === 1 ? 270 : 0;
  if (flipped) composed.mirror = "x";
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
 * The unit vector a fixture's BACK points along at quarter-turn `deg` — the drawn symbol
 * starts back-north and turns clockwise (see `furniture.render`). Used to carry a symbol's
 * orientation through a frame without ever asking "what is rotation plus a reflection?".
 */
function backVector(deg: number): Point {
  switch (((deg % 360) + 360) % 360) {
    case 90:
      return { x: 1, y: 0 };
    case 180:
      return { x: 0, y: 1 };
    case 270:
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: -1 };
  }
}

/** Inverse of {@link backVector}. */
function degFromBack(v: Point): 0 | 90 | 180 | 270 {
  if (v.x === 1) return 90;
  if (v.y === 1) return 180;
  if (v.x === -1) return 270;
  return 0;
}

/**
 * Carry a fixture's quarter-turn through the frame. Exact for rotations AND reflections:
 * the symbol's back vector is transformed by the frame's linear part and read back as a
 * quarter-turn, so a mirrored instance's fixtures face the mirrored way round.
 *
 * (The glyph itself is re-ORIENTED, not reflected — reflection is not a Scene primitive.
 * For ArchLang's rectilinear fixture symbols the two differ only for a handed glyph.)
 */
export function transformDeg(f: Frame, deg: number | undefined): 0 | 90 | 180 | 270 {
  const v = backVector(deg ?? 0);
  return degFromBack({ x: f.a * v.x + f.b * v.y, y: f.c * v.x + f.d * v.y });
}

/** Namespace an id with the frame's instance prefix (`west` + `main` → `west.main`). */
export function nsId(f: Frame, id: string): string {
  return f.prefix ? `${f.prefix}.${id}` : id;
}

/** Map a wall segment (a door's resolved host) into global coordinates. */
function transformSegment(f: Frame, s: WallSegment): WallSegment {
  return { ...s, a: tp(f, s.a), b: tp(f, s.b), wallId: nsId(f, s.wallId) };
}

/**
 * Map one resolved element from its instance's local frame into plan-global coordinates,
 * returning a NEW element (the local one stays intact — a door's `host` aliases its wall's
 * point objects, so transforming in place would double-apply the frame).
 *
 * Handed properties are flipped when the frame reflects (`det < 0`): a door's `swing` is
 * measured from the host wall's LEFT normal, and a `dim`'s `offset` from the measured
 * segment's left normal, so both reverse under a reflection. `hinge` does NOT flip — it is
 * defined along the wall's traversal direction, which the transform carries with it.
 */
export function transformElement(f: Frame, el: ResolvedElement): ResolvedElement {
  const reflected = det(f) < 0;
  const id = nsId(f, el.id);
  const out = transformGeometry(f, el, id, reflected);
  out._instance = f.prefix;
  out._component = f.component;
  return out;
}

function transformGeometry(f: Frame, el: ResolvedElement, id: string, reflected: boolean): ResolvedElement {
  switch (el.kind) {
    case "wall": {
      const w: RWall = {
        ...el,
        id,
        points: el.points.map((p) => tp(f, p)),
        openings: el.openings.map((o) => ({ at: tp(f, o.at), width: o.width })),
      };
      return w;
    }
    case "room": {
      const r = transformRect(f, el.at, el.size);
      const out: RRoom = { ...el, id, at: r.at, size: r.size };
      // The relational constraint is DISCHARGED by the instance's own placement pass
      // (which ran in the local frame, where `right-of` means the component's right).
      // Keeping it would let the plan-level pass re-place the room in global terms.
      delete out._rel;
      return out;
    }
    case "door":
      return {
        ...el,
        id,
        at: tp(f, el.at),
        host: el.host ? transformSegment(f, el.host) : null,
        swing: reflected ? (el.swing === "in" ? "out" : "in") : el.swing,
      };
    case "window":
    case "opening":
      return { ...el, id, at: tp(f, el.at), host: el.host ? transformSegment(f, el.host) : null };
    case "furniture": {
      const r = transformRect(f, el.at, el.size);
      const deg = transformDeg(f, el.rotate);
      const out: RFurniture = { ...el, id, at: r.at, size: r.size };
      if (deg) out.rotate = deg;
      else delete out.rotate;
      if (el.room !== undefined) out.room = nsId(f, el.room);
      return out;
    }
    case "dim":
      return { ...el, id, from: tp(f, el.from), to: tp(f, el.to), offset: reflected ? -el.offset : el.offset };
    case "column": {
      // `column`'s `at` is its CENTRE, so it needs no corner correction — only the
      // cross-axis extents swap on a quarter-turn.
      const size = swapsAxes(f) ? { w: el.size.h, h: el.size.w } : el.size;
      return { ...el, id, at: tp(f, el.at), size };
    }
    case "stair":
    case "elevator":
    case "escalator": {
      const r = transformRect(f, el.at, el.size);
      return { ...el, id, at: r.at, size: r.size };
    }
  }
}
