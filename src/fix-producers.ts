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
import type { DoorHinge } from "./grammar/tokens.js";
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
  /**
   * Replacement hinge side (doors only). Keeps the author's idiom: a node written
   * with `hinge near start|end` is re-emitted in that form (`start` ≡ `left`,
   * `end` ≡ `right` — the same mapping `door.resolve` applies), anything else as an
   * explicit `hinge left|right`, which is also how a door with no hinge clause at
   * all acquires one.
   */
  hinge?: DoorHinge;
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
    if (opts.hinge) {
      tail += d.hingeNear ? ` hinge near ${opts.hinge === "left" ? "start" : "end"}` : ` hinge ${opts.hinge}`;
    } else {
      tail += d.hinge ? ` hinge ${d.hinge}` : d.hingeNear ? ` hinge near ${d.hingeNear}` : "";
    }
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
 * The fix for `W_FIXTURE_BACK_TO_ROOM`: turn a wall-requiring fixture so its back
 * faces the wall it is standing against — `rotate <n>`, replacing an authored
 * clause or inserted where the grammar allows one.
 *
 * The edit is driven by `_rotateSpan` (recorded by the parser, carried onto the
 * resolved fixture): a non-empty span is the authored `rotate <expr>` run and is
 * REPLACED; a zero-width span is the insertion point — always before the optional
 * trailing `in <room>`, which must stay last — and gets a leading space. Either way
 * the offsets are original-source bytes, so {@link import("./fix-apply.js").applyFixes}
 * can apply it deterministically. `machine-applicable`: the caller only asks for a
 * rotation when exactly one edge of the fixture is walled, so `n` is the unique
 * answer, not a guess (ADR 0005). Returns `null` without a span to write into.
 */
export function fixtureRotateFix(
  fixture: { category: string; label?: string; _rotateSpan?: Span },
  rotate: number,
): FixSuggestion[] | null {
  const span = fixture._rotateSpan;
  if (!span) return null;
  const insert = span.start === span.end;
  const name = fixture.label ?? fixture.category;
  return [
    {
      title: `turn "${name}" to \`rotate ${rotate}\` so its back is against the wall`,
      applicability: "machine-applicable",
      fixId: "fixture-back-to-room",
      edits: [{ span, newText: `${insert ? " " : ""}rotate ${rotate}` }],
    },
  ];
}

/**
 * The fix for `W_SWING_OBSTRUCTED`: hang the leaf on the OTHER jamb.
 *
 * Of the rule's remedy set this is the only one that is a bounded, checkable rewrite:
 * a hinge flip mirrors the quarter-disc across the opening **on the same side of the
 * same wall**, so it changes no other derived geometry, and there is exactly one
 * alternative — nothing to guess between (ADR 0005). The caller only asks for it after
 * recomputing the flipped swing and proving it meets no furniture and no other door's
 * swing, so it clears the warning by solving it rather than by moving it somewhere the
 * rule cannot see. The other remedies (move the door, move/shrink the obstruction,
 * narrow the leaf, drop to a leafless `opening`) each require choosing geometry or
 * changing the brief, and stay hints.
 *
 * The replacement text is the whole statement re-emitted from the AST in
 * `door.resolve` and carried on the IR as `_flipHingeText` (lint sees only the IR),
 * which preserves the authored `at`/`on … at`, width expression and swing verbatim.
 * Returns `null` without a span to write into.
 */
export function doorHingeFlipFix(
  door: { id: string; span?: Span; _flipHingeText?: string },
  hinge: DoorHinge,
): FixSuggestion[] | null {
  if (!door.span || !door._flipHingeText) return null;
  return [
    {
      title: `hang the leaf on the other jamb (\`hinge ${hinge}\`) — the flipped swing is clear`,
      applicability: "machine-applicable",
      fixId: "door-swing-obstructed",
      edits: [{ span: door.span, newText: door._flipHingeText }],
    },
  ];
}

/**
 * The fix for `W_DIM_INSIDE`: swap the dimension's two endpoints, which flips the
 * side its line lands on (the offset runs along the LEFT normal of from→to, so
 * reversing the order mirrors it to the outside) without changing the measured
 * length or any other clause.
 *
 * The replacement text is the whole statement re-emitted from the AST in
 * `dim.resolve` and carried on the IR as `_swapText` — lint sees only the IR, and
 * re-emitting there keeps the authored expressions (`H + WALL / 2`, an interpolated
 * `text`) intact rather than baking in resolved numbers. `machine-applicable`: the
 * swap is the unique answer, not a guess. Returns `null` without a span to write
 * into (a synthesized `dims auto` dim never has one).
 */
export function dimSwapFix(dm: { span?: Span; _swapText?: string }): FixSuggestion[] | null {
  if (!dm.span || !dm._swapText) return null;
  return [
    {
      title: "swap the dimension's endpoints so the line reads outside the building",
      applicability: "machine-applicable",
      fixId: "dim-inside",
      edits: [{ span: dm.span, newText: dm._swapText }],
    },
  ];
}

/**
 * The fix for `W_DIM_OVERLAP`: move this dimension out by whole dimension-chain tiers,
 * so its drawn band clears the one it collides with.
 *
 * The author's `offset` **is** the tier control (ArchLang never re-staggers a hand-written
 * dimension — ADR 0005, "no invisible architect"), so the fix edits exactly that clause and
 * nothing else: `_offsetSpan` is the authored `offset <expr>` run, REPLACED, or a zero-width
 * insertion point — always before the optional trailing `text "…"`, which the grammar puts
 * last — which gets a leading space. Offsets are original-source bytes, so
 * {@link import("./fix-apply.js").applyFixes} can apply it deterministically.
 *
 * `newOffset` is computed by the rule (the smallest whole number of `CHAIN_STEP` tiers that
 * provably separates the two bands), which is why this is `machine-applicable`: the number
 * is derived, not guessed. Replacing the clause DOES bake a literal in place of an authored
 * expression — unavoidable, since the fix's whole content is a new number — but it is scoped
 * to the one clause, so every other expression in the statement survives verbatim.
 * Returns `null` without a span to write into (a synthesized `dims auto` chain never has one).
 */
export function dimBumpFix(dm: { id: string; _offsetSpan?: Span }, newOffset: number): FixSuggestion[] | null {
  const span = dm._offsetSpan;
  if (!span) return null;
  const insert = span.start === span.end;
  return [
    {
      title: `move dimension "${dm.id}" out to \`offset ${numStr(newOffset)}\` — the next free chain tier`,
      applicability: "machine-applicable",
      fixId: "dim-overlap",
      edits: [{ span, newText: `${insert ? " " : ""}offset ${numStr(newOffset)}` }],
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
