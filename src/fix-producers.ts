/**
 * Fix producers — the functions that attach {@link FixSuggestion}s to specific
 * diagnostics at their raise site (T2c).
 *
 * These are the *syntactic* half of the fix system: every suggestion here is a
 * pure text rewrite of the offending `.arch` source (per the ADR-0005/0006
 * boundary — geometric solver faults stay with `arch repair`). They run inside an
 * element's `resolve`, where the real span + resolved geometry are known, and the
 * spans they emit are ORIGINAL-source byte offsets so {@link
 * import("./fix-apply.js").applyFixes} can apply them deterministically.
 *
 * Dependency-light on purpose (geometry + expression re-emission only) so an
 * element module can import it without pulling the parser/registry in.
 */

import type { DoorNode, OpeningAttach, OpeningNode, Point, WindowNode } from "./ast.js";
import type { FixSuggestion, Span } from "./diagnostics.js";
import type { WallLike } from "./geometry.js";
import { distPointToSegment, length, segmentsOfWall, sub } from "./geometry.js";
import { exprToSource } from "./expr-source.js";
import { fmt3 as numStr } from "./num-format.js";

/** A wall we can reference by id and re-project a point onto (a resolved wall). */
export type AttachableWall = WallLike & { span?: Span };

/** Spread a producer's result onto a `Diagnostic` — `{ fixes }` when non-empty,
 *  else `{}` (so a `null`/empty producer adds nothing). */
export function fixesFrom(fixes: FixSuggestion[] | null): { fixes?: FixSuggestion[] } {
  return fixes && fixes.length > 0 ? { fixes } : {};
}

/** One of the three opening kinds that support the `on <wall> at <pos>` form. */
type OpeningKind = "door" | "window" | "opening";
type OpeningLikeNode = DoorNode | WindowNode | OpeningNode;

/** An attached opening position rendered to source (`40%` | `1200` | `center`). */
function attachPosText(pos: OpeningAttach["pos"]): string {
  if (pos.kind === "center") return "center";
  if (pos.kind === "percent") return `${numStr(pos.value ?? 0)}%`;
  return numStr(pos.value ?? 0);
}

/** The leading placement clause of an opening node, re-emitted from the AST. */
function leadText(node: OpeningLikeNode): string {
  if (node.attach) return `on ${node.attach.wall} at ${attachPosText(node.attach.pos)}`;
  return `at (${exprToSource(node.at!.x)}, ${exprToSource(node.at!.y)})`;
}

/** Options for {@link emitOpening} — override the placement lead and/or width. */
interface EmitOpts {
  /** Replacement placement clause (e.g. `on w1 at 40%`); defaults to the node's own. */
  lead?: string;
  /** Replacement width text (e.g. `<positive-number>`); defaults to the node's own. */
  width?: string;
  /** True when the (overridden) lead is an attachment — suppresses the trailing
   *  `wall <ref>` clause, which the attachment form does not take. */
  attached?: boolean;
}

/**
 * Re-emit a whole door/window/opening statement from its AST node, canonically.
 * Every attribute the node can carry is enumerated here (these three elements are
 * simple), so a rebuild never silently drops one. Used to rewrite the placement
 * clause without hand-editing non-contiguous sub-spans.
 */
export function emitOpening(kind: OpeningKind, node: OpeningLikeNode, opts: EmitOpts = {}): string {
  const id = node.id ? `id=${node.id} ` : "";
  const lead = opts.lead ?? leadText(node);
  const width = opts.width ?? exprToSource(node.width);
  const attached = opts.attached ?? !!node.attach;
  const wall = attached ? "" : node.wall ? ` wall ${node.wall}` : "";
  let tail = "";
  if (kind === "door") {
    const d = node as DoorNode;
    tail += d.hinge ? ` hinge ${d.hinge}` : d.hingeNear ? ` hinge near ${d.hingeNear}` : "";
    tail += d.swing ? ` swing ${d.swing}` : d.swingInto ? ` swing into ${d.swingInto}` : "";
  }
  return `${kind} ${id}${lead} width ${width}${wall}${tail}`;
}

/** Clamp `v` into `[lo, hi]`. */
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * Project `at` onto a wall's polyline: the closest point's distance from the
 * point (`dist`) and its position as a percentage of the wall's total run
 * (`pct`, 0–100). The percentage is exactly what `on <wall> at <p>%` walks back
 * to, so a rewrite round-trips onto the wall.
 */
export function projectPointOntoWall(wall: AttachableWall, at: Point): { pct: number; dist: number } {
  const segs = segmentsOfWall(wall);
  const total = segs.reduce((s, seg) => s + length(sub(seg.b, seg.a)), 0);
  let acc = 0;
  let best = { dist: Infinity, along: 0 };
  for (const seg of segs) {
    const abx = seg.b.x - seg.a.x;
    const aby = seg.b.y - seg.a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 === 0 ? 0 : clamp(((at.x - seg.a.x) * abx + (at.y - seg.a.y) * aby) / len2, 0, 1);
    const cx = seg.a.x + t * abx;
    const cy = seg.a.y + t * aby;
    const dist = Math.hypot(at.x - cx, at.y - cy);
    const segLen = Math.sqrt(len2);
    if (dist < best.dist) best = { dist, along: acc + t * segLen };
    acc += segLen;
  }
  return { pct: total > 0 ? clamp((best.along / total) * 100, 0, 100) : 0, dist: best.dist };
}

/** The wall nearest to `at` (by closest segment), and whether it is a *unique*
 *  nearest — no other wall ties for the minimum distance (within an epsilon). */
function nearestWall(walls: readonly AttachableWall[], at: Point): { wall: AttachableWall; unique: boolean } | null {
  const EPS = 1e-6;
  let best: AttachableWall | null = null;
  let bestDist = Infinity;
  let ties = 0;
  for (const w of walls) {
    let d = Infinity;
    for (const s of segmentsOfWall(w)) d = Math.min(d, distPointToSegment(at, s.a, s.b));
    if (d < bestDist - EPS) {
      bestDist = d;
      best = w;
      ties = 0;
    } else if (Math.abs(d - bestDist) <= EPS) {
      ties++;
    }
  }
  if (!best) return null;
  return { wall: best, unique: ties === 0 };
}

/**
 * The fix for a `W_{DOOR,WINDOW,OPENING}_OFF_WALL` warning: rewrite the opening's
 * placement to the attachment form `on <nearestWallId> at <p>%`, where `p` is the
 * declared point projected onto that wall (so it lands *on* the wall by
 * construction). Rebuilds the whole element statement (the `at (x,y)` and trailing
 * `wall <ref>` clauses are not contiguous) over the node's own span, preserving id
 * / width / hinge / swing.
 *
 * `machine-applicable` when there is a single unambiguous nearest wall (a golden
 * test proves the applied edit compiles to a hosted opening); `maybe-incorrect`
 * when several walls tie for nearest (the guess may pick the wrong one). Returns
 * `null` when there is no wall to attach to or the node has no span.
 */
export function offWallFix(
  kind: OpeningKind,
  node: OpeningLikeNode,
  at: Point,
  walls: readonly AttachableWall[],
): FixSuggestion[] | null {
  if (!node.span || walls.length === 0 || node.attach) return null;
  const near = nearestWall(walls, at);
  if (!near?.wall.id) return null;
  const { pct } = projectPointOntoWall(near.wall, at);
  const lead = `on ${near.wall.id} at ${numStr(pct)}%`;
  const replacement = emitOpening(kind, node, { lead, attached: true });
  return [
    {
      title: `attach the ${kind} to wall "${near.wall.id}" at ${numStr(pct)}%`,
      applicability: near.unique ? "machine-applicable" : "maybe-incorrect",
      fixId: `${kind}-off-wall`,
      edits: [{ span: node.span, newText: replacement }],
    },
  ];
}

/**
 * The fix for `E_{DOOR,WINDOW,OPENING}_WIDTH` (width ≤ 0): rewrite the element with
 * a `width <positive-number>` placeholder. `has-placeholders`, so it is surfaced
 * in the editor but never auto-applied (the placeholder is not valid source). The
 * placement clause is preserved verbatim.
 */
export function openingWidthFix(kind: OpeningKind, node: OpeningLikeNode): FixSuggestion[] | null {
  if (!node.span) return null;
  const replacement = emitOpening(kind, node, { width: "<positive-number>" });
  return [
    {
      title: `set a positive width on the ${kind}`,
      applicability: "has-placeholders",
      fixId: `${kind}-width`,
      edits: [{ span: node.span, newText: replacement }],
    },
  ];
}
