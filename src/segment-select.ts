/**
 * Segment selectors (plan card PS3.5): `segment north|south|east|west` and `segment containing
 * <room>.<edge>`, written wherever `segment <n>` is. A selector is an ALIAS: it resolves to the
 * one segment index the number would name, and from there on nothing knows it was written, so
 * the drawing, `describe()` and `lint()` are those of the numeric twin byte for byte.
 *
 * - `segment north` (and the other three) is the one straight segment of a CLOSED ring whose
 *   outward face, the side away from the floor, looks exactly that way on the page (`+y` down,
 *   so north is up). A ring's floor is the side it encloses, decided by the exact orientation
 *   of its vertex ring; a courtyard ring that `walls from rooms` derived has its floor outside,
 *   so the rule flips there (ADR 0028 §3, direction of a derived wall). An open wall has no
 *   floor side and is refused; arcs and diagonal segments face no compass word. The words read
 *   as the datum aliases do: only in the root of a plan whose `north` is `up`, else
 *   `E_DATUM_COMPASS` (ADR 0028 §2).
 * - `segment containing <room>.<edge>` is the one straight segment whose centreline lies on the
 *   edge's line and overlaps the edge with positive length. The edge is read through the group's
 *   datum reader, so every datum refusal holds (`E_ROOM_NOT_RECTANGLE`, `E_DATUM_UNPLACED`,
 *   `E_DATUM_COMPASS`, `E_UNKNOWN_REF`, `E_DATUM_NAME`).
 *
 * Anything but exactly one match is `E_SEGMENT_SELECT`, listing the candidate numbers so the
 * author can type one. Exact arithmetic throughout (no tolerance row); every scan is charged to
 * the step meter before it runs.
 */

import type { SegmentSelect } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { chargeSteps } from "./expr.js";
import { segmentsOfWall, type WallSegment } from "./geometry.js";
import type { RWall } from "./ir.js";
import type { DatumAccess } from "./opening-relation.js";
import type { ParseCtx } from "./registry.js";
import { COMPASS_DATUM_ALIASES, edgeOfRoom, splitDatum } from "./room-datums.js";
import type { SideWord } from "./room-tiling.js";

/** The four compass words a selector takes, in the order the reference lists them. */
export const SEGMENT_COMPASS_WORDS = ["north", "south", "east", "west"] as const;
type Compass = (typeof SEGMENT_COMPASS_WORDS)[number];

/** A selector's written text, whole: what Plan JSON accepts back in `segment_select`. */
export const SEGMENT_SELECT_RE = new RegExp(
  `^(?:${SEGMENT_COMPASS_WORDS.join("|")}|containing [A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)+)$`,
);

/**
 * Parse a selector right after the `segment` keyword, or return `undefined` (the caller then
 * parses the number). A bare compass word is the selector; a variable of that name is reached
 * by parenthesising it (`segment (east)`). `containing` is a selector only when a DOTTED name
 * follows (an edge is always `<room>.<edge>`), which was never legal after a number, so a
 * variable named `containing` followed by `offset …` reads exactly as before.
 */
export function parseSegmentSelect(ctx: ParseCtx): SegmentSelect | undefined {
  const t = ctx.peek();
  if (t.type !== "ident") return undefined;
  if ((SEGMENT_COMPASS_WORDS as readonly string[]).includes(t.value)) {
    ctx.next();
    return { kind: "compass", dir: t.value as Compass, span: { start: t.start, end: t.end } };
  }
  const edge = ctx.peek(1);
  if (t.value === "containing" && edge.type === "ident" && edge.value.includes(".")) {
    ctx.next();
    const e = ctx.eatIdent();
    return { kind: "containing", edge: e.value, span: { start: t.start, end: e.end } };
  }
  return undefined;
}

/** A numeric `segment` expression as source: a bare compass-word variable is parenthesised,
 *  since written bare it would now read as a selector. */
export function segmentExprText(text: string): string {
  return (SEGMENT_COMPASS_WORDS as readonly string[]).includes(text) ? `(${text})` : text;
}

/** The selector as written, after `segment`: `north`, `containing r.left`. */
export function segmentSelectText(s: SegmentSelect): string {
  return s.kind === "compass" ? s.dir : `containing ${s.edge}`;
}

/** What a selector reads from the resolver. */
export interface SelectCtx {
  diag(d: Diagnostic): void;
  datums?: DatumAccess;
}

const fail = (ctx: SelectCtx, code: string, message: string, span: Span): null => {
  ctx.diag({ severity: "error", message, code, span });
  return null;
};

/** The way a straight, axis-aligned segment's outward face looks, or `null` when it has none
 *  (an arc, a diagonal or a zero-length segment). `floorRight`: the floor lies to the right of
 *  travel on the page. */
function facing(s: WallSegment, floorRight: boolean): Compass | null {
  if (s.arc) return null;
  const dx = Math.sign(s.b.x - s.a.x);
  const dy = Math.sign(s.b.y - s.a.y);
  if ((dx === 0) === (dy === 0)) return null;
  // Right of travel on a `+y`-down page is (-dy, dx); outward is away from the floor.
  const ox = floorRight ? dy : -dy;
  const oy = floorRight ? -dx : dx;
  if (oy < 0) return "north";
  if (oy > 0) return "south";
  return ox > 0 ? "east" : "west";
}

/** `segment 0, segment 2` — the candidates an author can type. */
const listOf = (idx: readonly number[]): string => idx.map((i) => `\`segment ${i}\``).join(", ");

/**
 * Resolve a selector on `wall` (named `ref` as the author wrote it) to its segment index, or
 * `null` after a diagnostic spanned on the selector.
 */
export function selectSegment(sel: SegmentSelect, wall: RWall, ref: string, ctx: SelectCtx): number | null {
  const segs = segmentsOfWall(wall);
  const written = `segment ${segmentSelectText(sel)}`;
  const decide = (matches: readonly number[], candidates: string): number | null => {
    if (matches.length === 1) return matches[0]!;
    return fail(
      ctx,
      "E_SEGMENT_SELECT",
      matches.length === 0
        ? `\`${written}\` matches no segment of wall "${ref}" (${candidates}); write \`segment <n>\``
        : `\`${written}\` matches ${matches.length} segments of wall "${ref}" (${listOf(matches)}); write the one you mean`,
      sel.span,
    );
  };
  if (sel.kind === "compass") {
    const compass = ctx.datums?.compass;
    if (!compass?.aliases) {
      const frameWord = COMPASS_DATUM_ALIASES[sel.dir]!;
      return fail(
        ctx,
        "E_DATUM_COMPASS",
        `\`${sel.dir}\` would mean two things here (${compass?.why ?? "no compass is in force"}); write \`segment containing <room>.${frameWord}\` or \`segment <n>\``,
        sel.span,
      );
    }
    if (!wall.closed || wall.points.length < 3) {
      return fail(
        ctx,
        "E_SEGMENT_SELECT",
        `\`${written}\`: wall "${ref}" is open, so it has no floor side and none of its segments faces a compass direction; write \`segment containing <room>.<edge>\` or \`segment <n>\``,
        sel.span,
      );
    }
    // One step per vertex for the orientation, one per segment for the scan, before either runs.
    chargeSteps(wall.points.length + segs.length + 1);
    let twice = 0;
    const pts = wall.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      twice += p.x * q.y - q.x * p.y;
    }
    if (twice === 0) {
      return fail(
        ctx,
        "E_SEGMENT_SELECT",
        `\`${written}\`: wall "${ref}" encloses no area, so it has no floor side; write \`segment <n>\``,
        sel.span,
      );
    }
    // Positive on a `+y`-down page is clockwise: the enclosed side is right of travel. A derived
    // courtyard ring has its floor outside the ring.
    const floorRight = twice > 0 !== (wall._derived?.ring === "inner");
    const matches: number[] = [];
    const faces: string[] = [];
    for (const s of segs) {
      const f = facing(s, floorRight);
      if (f === null) continue;
      faces.push(`\`segment ${s.index}\` faces ${f}`);
      if (f === sel.dir) matches.push(s.index);
    }
    return decide(matches, faces.length > 0 ? faces.join(", ") : "none faces a compass direction");
  }
  // `containing <room>.<edge>`: read the edge through the group's own reader.
  chargeSteps(1);
  const name = sel.edge;
  const d = splitDatum(name);
  const access = ctx.datums;
  const v = d && access ? access.read(name, sel.span) : undefined;
  if (v === null) return null;
  if (d === undefined || v === undefined || access === undefined) {
    return fail(
      ctx,
      "E_SEGMENT_SELECT",
      `\`${written}\`: \`${name}\` is not a room edge; write \`segment containing <room>.top|bottom|left|right\``,
      sel.span,
    );
  }
  const word = COMPASS_DATUM_ALIASES[d.word] ?? d.word;
  if (word === "cx" || word === "cy") {
    return fail(
      ctx,
      "E_SEGMENT_SELECT",
      `\`${written}\`: \`${name}\` is a room's centre line, not an edge; write \`segment containing ${d.room}.top|bottom|left|right\``,
      sel.span,
    );
  }
  // The read above took this side as one run or refused, so the accessor finds that same run.
  const { vertical, c, lo, hi } = edgeOfRoom(access.table, d.room, word as SideWord)!;
  chargeSteps(segs.length + 1);
  const matches: number[] = [];
  const straight: number[] = [];
  for (const s of segs) {
    if (s.arc) continue;
    straight.push(s.index);
    const on = vertical ? s.a.x === c && s.b.x === c : s.a.y === c && s.b.y === c;
    if (!on) continue;
    const a = vertical ? s.a.y : s.a.x;
    const b = vertical ? s.b.y : s.b.x;
    if (Math.min(Math.max(a, b), hi) > Math.max(Math.min(a, b), lo)) matches.push(s.index);
  }
  return decide(
    matches,
    straight.length > 0 ? `its straight segments: ${listOf(straight)}` : "it has no straight segment",
  );
}
