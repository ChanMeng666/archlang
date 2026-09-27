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
 * Dependency-light on purpose (geometry + expression re-emission only, plus
 * `statement-print.js` — the shared printer, itself parser-free — for
 * {@link emitOpening}) so an element module can import it without pulling the
 * parser/registry in.
 */

import type { DoorNode, OpeningNode, Point, WindowNode } from "./ast.js";
import type { FixSuggestion, Span } from "./diagnostics.js";
import type { DoorHinge } from "./grammar/tokens.js";
import type { Bounds, DimLike, WallLike } from "./geometry.js";
import { dimReadsInside, dimSwapped, distPointToSegment, length, segmentsOfWall, sub } from "./geometry.js";
import { fmt3 as numStr } from "./num-format.js";
import { printDoc } from "./doc.js";
import { statementText } from "./statement-print.js";

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

/**
 * Options for {@link emitOpening} — each field is an AST edit applied to a deep
 * clone of the node before it is handed to the shared printer
 * ({@link statementText}), never a hand-assembled text fragment. This is what makes
 * `emitOpening` print `sill`/`head`/heights (and anything the grammar adds later)
 * for free: it never enumerates clauses itself.
 */
interface EmitOpts {
  /** Replacement placement: `on <wall> at <pct>%`, built directly into an
   *  {@link OpeningAttach} (never text to re-parse) and replacing the node's own
   *  `at`/`wall`/`attach`. Defaults to the node's own lead. `pct` is a plain
   *  number so it prints through the same `numStr` (`t: "num"` → {@link
   *  import("./expr-source.js").exprToSource}) path a legal `on w at p%` always
   *  printed through, byte-for-byte. */
  lead?: { wall: string; pct: number };
  /** Replacement width text (only `<positive-number>`, the has-placeholders form,
   *  at today's call sites); becomes a `ref` Expr, which prints its name verbatim —
   *  the same text `emitOpening` always produced for this placeholder. Defaults to
   *  the node's own width. */
  width?: string;
  /**
   * Replacement hinge side (doors only). Keeps the author's idiom: a node written
   * with `hinge near start|end` is re-emitted in that form (`start` ≡ `left`,
   * `end` ≡ `right` — the same mapping `door.resolve` applies), anything else as an
   * explicit `hinge left|right`, which is also how a door with no hinge clause at
   * all acquires one.
   */
  hinge?: DoorHinge;
  /** Door clauses to LEAVE OUT of the rebuild (`E_DOOR_KIND_CLAUSE`'s fix deletes
   *  exactly the clause its kind has no meaning for, and nothing else). */
  drop?: readonly ("hinge" | "swing" | "slide" | "open")[];
  /** Replacement `open` text (doors only) — e.g. the clamped value `E_DOOR_OPEN_RANGE`
   *  quotes. Ignored when `open` is dropped or the node writes none. */
  open?: string;
}

/**
 * Apply an {@link EmitOpts} to `node` (already a deep clone — see {@link emitOpening})
 * as AST edits, so the shared printer ({@link statementText}) re-emits everything the
 * old hand-written `emitOpening` had to enumerate by hand, including clauses it never
 * knew about (`sill`/`head`/wall `height`).
 */
function applyEmitOpts(node: OpeningLikeNode, opts: EmitOpts): OpeningLikeNode {
  if (opts.lead !== undefined) {
    node.attach = { wall: opts.lead.wall, pos: { kind: "percent", value: { t: "num", value: opts.lead.pct } } };
    delete node.at;
    delete node.wall;
  }
  if (opts.width !== undefined) {
    node.width = { t: "ref", name: opts.width };
  }
  if (node.kind === "door") {
    const d = node;
    if (opts.hinge !== undefined) {
      if (d.hingeNear) {
        d.hingeNear = opts.hinge === "left" ? "start" : "end";
        delete d.hinge;
      } else {
        d.hinge = opts.hinge;
        delete d.hingeNear;
      }
    }
    if (opts.drop?.includes("hinge")) {
      delete d.hinge;
      delete d.hingeNear;
    }
    if (opts.drop?.includes("swing")) {
      delete d.swing;
      delete d.swingInto;
    }
    if (opts.drop?.includes("slide")) delete d.slide;
    if (opts.drop?.includes("open")) {
      delete d.open;
    } else if (opts.open !== undefined && d.open !== undefined) {
      // Matches the old printer's own guard: `open` is a REPLACEMENT for an
      // authored value, never an insertion — a door with no `open` clause at all
      // keeps having none. Every real call site (`doorOpenRangeFix`) already only
      // fires when `node.open !== undefined`, so this is a no-op there.
      d.open = { t: "num", value: Number(opts.open) };
    }
  }
  return node;
}

/**
 * Re-emit a whole door/window/opening statement from its AST node, canonically —
 * through the shared printer ({@link statementText}), the same one `arch fmt` and
 * Plan JSON's decompiler use. A deep clone absorbs `opts` as AST edits
 * ({@link applyEmitOpts}); the clone is then printed flat, exactly as `statementText`
 * already prints every leaf kind except `wall`/`strip`.
 *
 * Going through the shared printer — rather than a second, hand-written
 * enumeration of clauses — is what keeps a rebuild from silently dropping one:
 * `sill`/`head` (and any future clause) are printed because `statementText` prints
 * them, not because this function remembered to.
 */
export function emitOpening(kind: OpeningKind, node: OpeningLikeNode, opts: EmitOpts = {}): string {
  // Unreachable at every current call site: each one either passes a literal kind
  // alongside a node already cast to that same element's node type (`door.ts`'s
  // `n = node as DoorNode` paired with `"door"`, and likewise for window/opening),
  // so `node.kind` and `kind` can never disagree in practice. Kept as a guard
  // against a future call site that forwards a caller-supplied `kind` without the
  // matching cast — cheap insurance, not dead code to trust blindly.
  if (node.kind !== kind) throw new Error(`emitOpening: node.kind "${node.kind}" does not match "${kind}"`);
  const clone = structuredClone(node);
  const edited = applyEmitOpts(clone, opts);
  return printDoc(statementText(edited));
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
  const replacement = emitOpening(kind, node, { lead: { wall: near.wall.id, pct } });
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
 * The fix for `E_DOOR_KIND_CLAUSE`: delete the one clause this door's kind has no
 * meaning for, and change nothing else.
 *
 * The whole statement is re-emitted over the node's own span (the clauses are not
 * contiguous — `wall <ref>` can sit between them), with exactly the offending clause
 * omitted. `machine-applicable`: deletion is the unique answer that keeps the author's
 * stated kind, and it is what the diagnostic already says to do. The OTHER remedy —
 * change the kind — is a hint, because which kind was meant is a design decision the
 * compiler has no basis to guess (ADR 0005).
 *
 * Returns `null` without a span to write into.
 */
export function doorKindClauseFix(
  node: DoorNode,
  clause: "hinge" | "swing" | "slide" | "open",
): FixSuggestion[] | null {
  if (!node.span) return null;
  return [
    {
      title: `delete the \`${clause}\` clause — a "${node.doorKind ?? "hinged"}" door has none`,
      applicability: "machine-applicable",
      fixId: "door-kind-clause",
      edits: [{ span: node.span, newText: emitOpening("door", node, { drop: [clause] }) }],
    },
  ];
}

/**
 * The fix for `E_DOOR_OPEN_RANGE`: rewrite `open` to the nearest legal fraction.
 *
 * The same shape as `E_ARC_RADIUS`'s minimum-radius fix — an impossible number
 * replaced by the closest possible one, quoted in the diagnostic. `machine-applicable`
 * because the clamp is arithmetic with one answer, and because `open` is a DRAWING
 * fact: nothing measured reads it, so no check can be satisfied by applying this.
 */
export function doorOpenRangeFix(node: DoorNode, clamped: number): FixSuggestion[] | null {
  if (!node.span || node.open === undefined) return null;
  return [
    {
      title: `clamp it to \`open ${numStr(clamped)}\``,
      applicability: "machine-applicable",
      fixId: "door-open-range",
      edits: [{ span: node.span, newText: emitOpening("door", node, { open: numStr(clamped) }) }],
    },
  ];
}

/**
 * The fix for `W_POCKET_RUN`: reverse the slide, so the panel disappears into the
 * length of wall that is actually there.
 *
 * Of that rule's four remedies this is the only bounded, checkable rewrite, and the
 * caller emits it **only after recomputing the reversed run and proving it satisfies**
 * — never as a guess. The other three are hints on principle, not on effort: "move the
 * door" picks geometry the author did not state, "lengthen the wall" edits a different
 * statement, and "narrow it" rewrites the author's stated requirement to satisfy the
 * checker — the constraint-laundering pattern, which this project does not ship as an
 * applicable fix under any flag.
 *
 * The edit is driven by `_slideSpan` (recorded by the parser, carried onto the IR) so
 * it rewrites exactly the `slide` clause: a non-empty span is the authored run and is
 * REPLACED, a zero-width span is the insertion point — always before the trailing
 * `open`, which the grammar puts last — and gets a leading space. The
 * `fixtureRotateFix` precedent, byte for byte.
 */
export function pocketRunFix(
  door: { id: string; _slideSpan?: Span },
  reversed: "left" | "right",
): FixSuggestion[] | null {
  const span = door._slideSpan;
  if (!span) return null;
  const insert = span.start === span.end;
  return [
    {
      title: `slide it the other way — \`slide ${reversed}\` (that run is long enough)`,
      applicability: "machine-applicable",
      fixId: "pocket-run",
      edits: [{ span, newText: `${insert ? " " : ""}slide ${reversed}` }],
    },
  ];
}

/**
 * The fix for `W_DIM_INSIDE`: swap the dimension's two endpoints, which flips the
 * side its line lands on (the offset runs along the LEFT normal of from→to, so
 * reversing the order mirrors it across the measured segment) without changing the
 * measured length or any other clause.
 *
 * The replacement text is the whole statement re-emitted from the AST in
 * `dim.resolve` and carried on the IR as `_swapText` — lint sees only the IR, and
 * re-emitting there keeps the authored expressions (`H + WALL / 2`, an interpolated
 * `text`) intact rather than baking in resolved numbers.
 *
 * **The swap is offered only when it is evaluated to help.** Mirroring across the
 * measured segment moves the line to the other side of it — which is the outside
 * only when the segment is at the building's edge. A dimension that runs THROUGH
 * the plan reads inside either way, and offering the swap there was a defect, not a
 * fix: `arch fix` is a fixpoint loop, so the warning came back on the next pass, the
 * same edit was offered again, and the plan swapped back and forth until the pass
 * budget ran out — leaving the shipped result dependent on the PARITY of that budget.
 * So the producer re-asks the rule's own predicate ({@link dimReadsInside}) of the
 * {@link dimSwapped} geometry and returns `null` when the answer is still "inside".
 * The diagnostic still reports; it simply carries no mechanical edit, which ADR 0011
 * allows and ADR 0005 prefers to inventing an offset the author never stated.
 *
 * `machine-applicable` once offered: the swap is then the unique answer, not a guess.
 * Returns `null` without a span to write into (a synthesized `dims auto` dim never
 * has one, and a `dim radius`/`diameter` call-out has no written endpoints to swap).
 */
export function dimSwapFix(dm: DimLike & { span?: Span; _swapText?: string }, extents: Bounds): FixSuggestion[] | null {
  if (!dm.span || !dm._swapText) return null;
  if (dimReadsInside(dimSwapped(dm), extents)) return null;
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

/**
 * The fix for `E_ROOM_ALIGN`: replace an out-of-set alignment word with the nearest
 * legal one.
 *
 * The edit is the **offending word alone** — `bad.span`, not the whole `room`
 * statement — so every expression, label and `gap` on that line survives verbatim, and
 * two bad rooms on adjacent lines are fixed in one pass without their edits overlapping.
 *
 * `machine-applicable` needs an argument, because unlike the clamp fixes above this one
 * replaces a value with a GUESS, and a wrong guess moves a room. Three things make it
 * safe here. The alternative is not the author's intent but the silent leading-edge
 * fallback this diagnostic exists to abolish, so applying it cannot be worse than
 * leaving it. The source is an ERROR, so nothing downstream is measuring the plan yet.
 * And {@link import("./expr.js").closest} answers only within a small edit distance —
 * the caller passes `null` when there is no near miss, and this returns `null` with it,
 * leaving a diagnostic that carries hints and no fix. So a fix is offered only for a
 * near-miss of a real word, which is a typo, not a design decision.
 */
export function roomAlignFix(bad: { word: string; span: Span }, suggestion: string | null): FixSuggestion[] | null {
  if (suggestion === null) return null;
  return [
    {
      title: `use \`align ${suggestion}\``,
      applicability: "machine-applicable",
      fixId: "room-align",
      edits: [{ span: bad.span, newText: suggestion }],
    },
  ];
}

/**
 * The fix for `E_ROOM_ALIGN_AXIS`: replace an in-set alignment word that belongs to the
 * OTHER axis with its counterpart on this one.
 *
 * Shaped exactly like {@link roomAlignFix} — the edit is the alignment word alone, so
 * labels, `gap` and expressions on that line survive verbatim and two bad rooms fix in
 * one pass without overlapping edits — but it is a strictly stronger claim, and takes
 * no `null` branch.
 *
 * {@link roomAlignFix} guesses: `closest()` answers within an edit distance and declines
 * outside it, because the author's misspelling could have meant more than one thing.
 * Here nothing is guessed. The word is spelled correctly, so `closest()` is the wrong
 * tool entirely — it would rank `left` nearest to `left`, the very word being refused.
 * What is wrong is the AXIS, and
 * {@link import("./ast.js").relAlignCounterpart} translates across it positionally:
 * leading stays leading, trailing stays trailing. So the caller always has an answer,
 * and `machine-applicable` needs no hedge.
 *
 * Worth knowing when reading a diff: for a LEADING mismatch (`right-of … align left`)
 * the rewrite is output-neutral, because the silent fallback this diagnostic abolishes
 * happened to land on the leading edge anyway. It is the TRAILING mismatches
 * (`right-of … align right`) that were being drawn wrong.
 */
export function roomAlignAxisFix(span: Span, counterpart: string): FixSuggestion[] {
  return [
    {
      title: `use \`align ${counterpart}\``,
      applicability: "machine-applicable",
      fixId: "room-align-axis",
      edits: [{ span, newText: counterpart }],
    },
  ];
}
