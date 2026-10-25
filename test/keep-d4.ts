/**
 * The source-level D4 transformer of `keep` (design §7, R10), for `./keep.test.ts`'s
 * equivariance law: test-only, so it lives here and not in `src/`.
 */

import { actOnSide, applyVec, type D4 } from "../src/algebra/d4.js";
import type { KeepNode, KeepRef, Point } from "../src/ast.js";
import type { Expr } from "../src/expr.js";
import { COMPASS_DATUM_ALIASES, type DatumWord } from "../src/room-datums.js";

/**
 * A keep carried through a whole-plan turn or mirror, as source (design §7, R10): the plan's body
 * placed as one instance `prefix` by `place … at t rotate … mirror …`, and the keep rewritten to
 * name the same lines in world words. A room's `left|right|top|bottom` goes where the frame takes
 * that side, `cx`↔`cy` and `width`↔`depth` swap under a quarter turn, ids gain the prefix, and a
 * value along an axis is carried to the image axis (`offset`: its sign; `fixed`: its sign and the
 * translation). `vertical(ref)` says which way a line the source cannot spell runs (a wall's
 * centreline), and `opening(ref)` whether an id names a door, window or opening (whose width runs
 * along its wall, so it stays a width under any turn). An axis reference is left as it is: a frame carries no positioning axis, so the
 * law is stated over keeps that name none. Values must be literals.
 */
export function transformKeep(
  n: KeepNode,
  g: D4,
  t: Point,
  prefix: string,
  vertical: (ref: KeepRef) => boolean,
  opening: (ref: KeepRef) => boolean = () => false,
): KeepNode {
  const img = (v: { x: number; y: number }): { x: number; y: number } => applyVec(g, v);
  const swaps = img({ x: 1, y: 0 }).x === 0;
  const ref = (r: KeepRef): KeepRef => {
    switch (r.t) {
      case "axis":
        return r;
      case "el":
        return { ...r, id: `${prefix}.${r.id}` };
      case "room": {
        const w = (COMPASS_DATUM_ALIASES[r.word] ?? r.word) as DatumWord;
        const word = w === "cx" || w === "cy" ? (swaps ? (w === "cx" ? "cy" : "cx") : w) : actOnSide(g, w);
        return { ...r, room: `${prefix}.${r.room}`, word };
      }
    }
  };
  const isVertical = (r: KeepRef): boolean =>
    r.t === "room" ? ["left", "right", "cx", "west", "east"].includes(r.word) : vertical(r);
  /** The image of a line's normal axis: its sign, and the translation along it. */
  const along = (r: KeepRef): { s: number; t: number } => {
    const v = img(isVertical(r) ? { x: 1, y: 0 } : { x: 0, y: 1 });
    return v.x !== 0 ? { s: v.x, t: t.x } : { s: v.y, t: t.y };
  };
  const lit = (e: Expr): number => {
    if (e.t !== "num") throw new Error("transformKeep: a keep's value must be a literal");
    return e.value;
  };
  const num = (v: number): Expr => ({ t: "num", value: v });
  switch (n.form) {
    case "align":
      return { ...n, refs: n.refs.map(ref) };
    case "equal":
      return {
        ...n,
        measure: swaps && !n.refs.some(opening) ? (n.measure === "width" ? "depth" : "width") : n.measure,
        refs: n.refs.map(ref),
      };
    case "offset":
      return { ...n, x: ref(n.x), from: ref(n.from), mm: num(along(n.from).s * lit(n.mm)) };
    case "min-clear":
      return { ...n, room: ref(n.room) };
    case "on-axis":
      return { ...n, wall: ref(n.wall) };
    case "stacked":
      return { ...n, target: ref(n.target) };
    case "fixed": {
      const a = along(n.datum);
      return { ...n, datum: ref(n.datum), mm: num(a.s * lit(n.mm) + a.t) };
    }
  }
}

/** The sign a residual of `n` takes under `g`: `+1` or `-1` for a keep measured along one axis
 *  (`align`, `on axis`, `offset`, `fixed`), `+1` for an extent or a span (`equal`, `min clear`). */
export function residualSign(n: KeepNode, g: D4, vertical: (ref: KeepRef) => boolean): number {
  const first: KeepRef | undefined =
    n.form === "align"
      ? n.refs[0]
      : n.form === "offset"
        ? n.from
        : n.form === "fixed"
          ? n.datum
          : n.form === "on-axis"
            ? n.wall
            : undefined;
  if (!first) return 1;
  const isV = first.t === "room" ? ["left", "right", "cx", "west", "east"].includes(first.word) : vertical(first);
  const v = applyVec(g, isV ? { x: 1, y: 0 } : { x: 0, y: 1 });
  return v.x !== 0 ? v.x : v.y;
}
