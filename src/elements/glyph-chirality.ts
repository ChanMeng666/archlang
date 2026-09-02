/**
 * The handedness of a drawn fixture symbol, and what a mirrored `place` does to it.
 *
 * ## The defect this closes
 *
 * `place … mirror x` reflects a resolved element's **position** — its footprint, its
 * quarter-turn, the handed rules `frame.ts` flips explicitly. It never touched the SYMBOL
 * drawn inside that footprint, so a mirrored wing drew a LEFT-handed `sofa_l` in a
 * right-handed room: every number right, the drawing wrong, and nothing to fail
 * (`docs/backlog.md` 5.4).
 *
 * ## Where the flip belongs, and why it is one reflection and not "rotation plus a mirror"
 *
 * A frame's linear part with `det < 0` is a signed permutation, so it factors **exactly**
 * as `M = R(m) · Fx`, where `Fx` negates x and `R` is a quarter-turn. Composed with the
 * symbol's own local turn `R(l)`:
 *
 * ```
 *   M · R(l)  =  R(m) · Fx · R(l)  =  R(m − l) · Fx
 * ```
 *
 * because `Fx · R(l) = R(−l) · Fx`. And `m − l` is precisely what {@link
 * import("../frame.js").transformDeg} already computes (it pushes the symbol's back vector
 * through the matrix). So the world drawing is *the glyph reflected about its own vertical
 * centre line, then quarter-turned by the rotation the element already carries* — the
 * renderer needs one extra step in the frame it already draws in, and no knowledge of which
 * axis the author wrote. `mirror x`, `mirror y`, and either composed with a `rotate` all
 * reduce to the same `Fx` here; only the derived quarter-turn differs, and that is not this
 * module's business.
 *
 * ## Handedness is DERIVED, never declared
 *
 * A per-family `chiral` flag was considered and rejected for the reason a `sofa_l_r`
 * *category* was rejected: it puts the fix in a table that every future handed symbol has
 * to be remembered in. It is also not expressible there. Five of the shipped families
 * (`counter`, `fridge`, `upper_cabinet`, `hedge`, `motorcycle`) are handed at some
 * footprints and symmetric at others, because their detail is tiled and the tile COUNT
 * comes from the aspect ratio — a single flag is simply the wrong shape for that fact.
 *
 * So {@link mirrorGlyph} asks the drawing instead: reflect the marks, and keep the
 * reflection only if it is a different drawing. A symbol with a vertical mirror axis
 * therefore renders **byte-identical** whether its instance was reflected or not, at every
 * footprint, with nothing to maintain. Nineteen of the 83 shipped families are handed at
 * their catalogued footprints; `test/glyph-chirality.test.ts` enumerates them, as a record
 * of the survey rather than as the mechanism.
 *
 * "A different drawing" is measured at the finest precision any backend serializes —
 * {@link fmt4}, the DXF formatter — so "symmetric" means exactly "would emit the same
 * bytes", and there is no tolerance constant of this module's own invention. Float noise
 * from the glyph layer's own `cos`/`sin` sits seven orders below that quantum, which is
 * why an EXACT comparison would call 63 of the 83 families handed and be useless.
 *
 * Pure and deterministic: no clock, no randomness, no trig.
 */

import type { Point } from "../ast.js";
import { fmt4 } from "../num-format.js";
import type { PathEdge, SceneNode, ScenePrim } from "../scene.js";

/**
 * Reflect one scene node about the vertical line `x = axis`.
 *
 * The switch is **exhaustive with no `default`** on purpose — the same guard
 * `furniture.ts`'s `rotateNode` and `pdf.ts`'s `drawNode` carry. A new `ScenePrim` variant
 * fails the typecheck here rather than being silently passed through unreflected.
 *
 * A reflection REVERSES orientation, so every `sweep` flag flips: an arc drawn clockwise
 * from `start` to `end` is drawn counter-clockwise once mirrored. `r` is a length and is
 * invariant. Point ORDER within a polygon is left alone (as `rotateNode` leaves it), which
 * flips the winding — nothing downstream reads a furniture polygon's winding, and
 * {@link marksEqual} compares up to it.
 */
export function mirrorNode(n: SceneNode, axis: number): SceneNode {
  const mp = (p: Point): Point => ({ x: axis + (axis - p.x), y: p.y });
  const me = (e: PathEdge): PathEdge =>
    e.t === "line" ? { ...e, to: mp(e.to) } : { ...e, to: mp(e.to), center: mp(e.center), sweep: flip(e.sweep) };
  const prim = n.prim;
  switch (prim.t) {
    case "polygon":
      return { ...n, prim: { ...prim, pts: prim.pts.map(mp) } };
    case "line":
      return { ...n, prim: { ...prim, a: mp(prim.a), b: mp(prim.b) } };
    // A glyph draws no text — the shared drawing contract in the `glyphs-*` suites pins
    // that — so this arm exists for totality. The anchor point moves and the string stays
    // upright and unreversed, which is the same treatment `rotateNode` gives it.
    case "text":
      return { ...n, prim: { ...prim, at: mp(prim.at) } };
    case "circle":
      return { ...n, prim: { ...prim, center: mp(prim.center) } };
    case "arc":
      return {
        ...n,
        prim: { ...prim, center: mp(prim.center), start: mp(prim.start), end: mp(prim.end), sweep: flip(prim.sweep) },
      };
    case "region":
      return { ...n, prim: { ...prim, loops: prim.loops.map((lp) => lp.map(mp)) } };
    case "path":
      return {
        ...n,
        prim: { ...prim, loops: prim.loops.map((lp) => ({ start: mp(lp.start), edges: lp.edges.map(me) })) },
      };
    // A hatch's `angle` is measured in PATTERN space, so reflecting its loops without
    // reflecting the pattern would shear the fill off its own boundary. No fixture glyph
    // emits one (the furniture pass draws linework, never a material fill), so this is a
    // declared non-case rather than an omission — give a glyph a hatch and the angle rule
    // has to be written first. Same declaration `rotateNode` makes.
    case "hatch":
      return n;
  }
}

const flip = (s: 0 | 1): 0 | 1 => (s === 0 ? 1 : 0);

/**
 * The glyph `nodes` as a mirrored instance should draw them: reflected about the vertical
 * line `x = axis`, **unless** the reflection leaves the drawing unchanged, in which case the
 * original array is returned so a symmetric symbol keeps its exact bytes.
 *
 * `axis` is the footprint's centre x in the symbol's own pre-rotation frame, so the
 * reflection maps the footprint onto itself and the piece cannot escape its own extent.
 */
export function mirrorGlyph(nodes: SceneNode[], axis: number): SceneNode[] {
  const flipped = nodes.map((n) => mirrorNode(n, axis));
  return marksEqual(nodes, flipped) ? nodes : flipped;
}

/**
 * Do these two node lists draw the same marks? — the predicate behind "this symbol has a
 * vertical mirror axis".
 *
 * Compared as an unordered MULTISET of canonical marks, because a reflection is allowed to
 * change how a symmetric drawing is spelled without changing what it draws: a rectangle's
 * point sequence rotates and reverses, an arc's endpoints swap, and two mirror-image halves
 * trade places in the node list. Each of those is a re-spelling, not a different picture, so
 * the canonical form below quotients by exactly them and by nothing else — a mark's paint,
 * pen weight, line type and layer all still have to match.
 */
export function marksEqual(a: readonly SceneNode[], b: readonly SceneNode[]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(nodeKey).sort();
  const kb = b.map(nodeKey).sort();
  return ka.every((k, i) => k === kb[i]);
}

/** A node's canonical spelling: everything a backend can see, quotiented by re-spellings. */
function nodeKey(n: SceneNode): string {
  const paint = n.paint;
  const p = [
    paint.fill ?? "",
    paint.stroke ?? "",
    paint.width ?? "",
    paint.dash ? paint.dash.join("/") : "",
    paint.linecap ?? "",
    paint.linejoin ?? "",
    paint.miterLimit ?? "",
    paint.fillRule ?? "",
  ].join(":");
  return `${n.layer}|${n.layerName ?? ""}|${p}|${n.lineWeight ?? ""}|${n.lineType ?? ""}|${primKey(n.prim)}`;
}

const pt = (p: Point): string => `${fmt4(p.x)},${fmt4(p.y)}`;

/** The lexicographically smallest spelling of a closed ring — over every start point and
 *  both directions of travel, which is what makes it invariant under a reflection. */
function ringKey(pts: readonly Point[]): string {
  const s = pts.map(pt);
  let best: string | undefined;
  for (const seq of [s, [...s].reverse()]) {
    for (let i = 0; i < seq.length; i++) {
      const k = [...seq.slice(i), ...seq.slice(0, i)].join(" ");
      if (best === undefined || k < best) best = k;
    }
  }
  return best ?? "";
}

function primKey(prim: ScenePrim): string {
  switch (prim.t) {
    case "polygon":
      return `poly ${ringKey(prim.pts)}`;
    // A segment has no direction on the page, so its endpoints are compared unordered.
    case "line":
      return `line ${[pt(prim.a), pt(prim.b)].sort().join(" ")}`;
    case "circle":
      return `circle ${pt(prim.center)} ${fmt4(prim.r)}`;
    // The same curve traced the other way round: normalise to `sweep 0` by swapping the
    // endpoints, which is exactly what a reflection does to an arc.
    case "arc": {
      const ends = prim.sweep === 0 ? [prim.start, prim.end] : [prim.end, prim.start];
      return `arc ${pt(prim.center)} ${fmt4(prim.r)} ${ends.map(pt).join(" ")}`;
    }
    case "text":
      return `text ${pt(prim.at)} ${fmt4(prim.size)} ${prim.anchor} ${prim.rotate ?? 0} ${prim.value}`;
    case "region":
      return `region ${prim.loops.map(ringKey).sort().join(" | ")}`;
    // A path's loops each start somewhere definite and its edges carry radii, so it is
    // compared as written apart from the sweep normalisation above. No fixture glyph emits
    // one; this keeps the function total rather than claiming a canonical form it has no
    // caller to justify.
    case "path":
      return `path ${prim.loops
        .map(
          (lp) =>
            `${pt(lp.start)}>${lp.edges.map((e) => (e.t === "line" ? `l${pt(e.to)}` : `a${pt(e.to)}${pt(e.center)}${fmt4(e.r)}${e.sweep}`)).join("")}`,
        )
        .sort()
        .join(" | ")}`;
    case "hatch":
      return `hatch ${prim.material} ${fmt4(prim.scale)} ${fmt4(prim.angle)} ${prim.region.map(ringKey).sort().join(" | ")}`;
  }
}
