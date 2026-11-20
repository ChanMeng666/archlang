/**
 * The move `W_DOORWAY_BLOCKED` offers as a fix (card AF9): the door or cased opening moved along its
 * own wall until its landing misses every piece. Lint-only, so it stays off the compiler path (the
 * rules import it; no compile module does).
 *
 * The search is the opening rules' own ({@link keepouts}, {@link clearMove}, `src/lint/rules/openings.ts`):
 * the run's ends, each meeting wall grown by the nib, each other opening on the run grown by a mullion
 * and a door's corner nib, plus one keep-out per piece that reaches into the landing band on either
 * face, its extent along the run. The move stays in the opening's bay (it crosses no wall that meets
 * the run) and serves the same rooms. At each moved position the warning's own predicate is asked
 * again, and for a door `W_SWING_OBSTRUCTED`'s too (every leaf clear of every piece and every other
 * door's swing): a direction is offered only when both are clear there, because a fix that leaves a
 * warning standing makes `arch fix` ping-pong (`dimSwapFix`'s lesson). The nearer direction is
 * offered, both on a tie.
 *
 * Only an opening placed by a position the edit can rewrite is read: `_lead` (a literal offset on a
 * hosted wall or in a relational clause). Not one placed `at (x,y)`, one `open between` derives, one
 * a placed component draws (its edit belongs in the component's frame), nor a double door's pair.
 * Bounded by `clearMove`'s own count: `2 × keep-outs + 4` steps per direction.
 */

import { rectOf } from "../analyze.js";
import type { FixSuggestion } from "../diagnostics.js";
import { doorLeaves, sectorIntersectsRect, segmentLength, swingsCollide } from "../geometry.js";
import type { RDoor, RFurniture, ROpening } from "../ir.js";
import { fmt3 as numStr } from "../num-format.js";
import { relationalClause, relationText } from "../opening-relation.js";
import type { LintContext } from "./context.js";
import { mm } from "./measure.js";
import {
  clearMove,
  junctionLookup,
  type Keepout,
  keepouts,
  moveUnit,
  openingsOnRuns,
  servesSame,
  wallPosition,
} from "./rules/openings.js";

/** One move: the edit over the opening's lead clause, and how far it goes. */
export interface DoorwayMove {
  span: { start: number; end: number };
  text: string;
  shift: number;
}

/**
 * The checked moves for a blocked doorway, nearer first; empty when none clears. `blocked` is the
 * rule's own predicate, asked of the opening moved there; `counts` the pieces the rule reads.
 */
export function doorwayMoves(
  ctx: LintContext,
  el: RDoor | ROpening,
  blocked: (moved: RDoor | ROpening) => boolean,
  counts: (f: RFurniture) => boolean = () => true,
): DoorwayMove[] {
  const lead = el._lead;
  const seg = el.host;
  // Not an imported module's statement: its offsets are that module's (design §3; red team N6).
  if (!lead || !seg || seg.arc || el._instance !== undefined || ctx.at(el).file !== undefined) return [];
  const all = openingsOnRuns(ctx);
  const o = all.find((r) => r.el === el);
  if (!o) return [];
  const u = moveUnit(o, all);
  if (u.leaves.length > 1) return [];
  const js = junctionLookup(ctx)(o);
  const ks: Keepout[] = keepouts(ctx, o, u, all, js);
  const horiz = seg.a.y === seg.b.y;
  const len = segmentLength(seg);
  const reach = ctx.rules.doorwayLandingMm + seg.thickness / 2;
  const across = horiz ? el.at.y : el.at.x;
  const along = (p: number): number =>
    horiz ? (p - seg.a.x) * Math.sign(seg.b.x - seg.a.x) : (p - seg.a.y) * Math.sign(seg.b.y - seg.a.y);
  for (const f of ctx.furniture) {
    if (!counts(f)) continue;
    const r = rectOf(f);
    const [c0, c1] = horiz ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
    if (!(c0 < across + reach && c1 > across - reach)) continue;
    const [p, q] = (horiz ? [r.x, r.x + r.w] : [r.y, r.y + r.h]).map(along) as [number, number];
    ks.push({ lo: Math.min(p, q), hi: Math.max(p, q) });
  }
  // The bay: between the nearest meeting walls either side, or the run's ends.
  const mid = (o.lo + o.hi) / 2;
  const bayLo = Math.max(0, ...js.filter((j) => j.hi <= mid).map((j) => j.hi));
  const bayHi = Math.min(len, ...js.filter((j) => j.lo >= mid).map((j) => j.lo));
  const same = servesSame(ctx);
  const clr = ctx.rules.swingClearanceMm;
  const swings = ctx.doors.filter((d) => d !== el).flatMap((d) => doorLeaves(d));
  const found: DoorwayMove[] = [];
  for (const dir of [-1, 1] as const) {
    const m = clearMove(ctx, u, ks, dir);
    if (!m || m.lo < bayLo - 1e-6 || m.hi > bayHi + 1e-6) continue;
    const { at, s } = m.placed[0]!;
    const moved = { ...el, at };
    if (blocked(moved) || same([{ el, at }]) === null) continue;
    if (
      moved.kind === "door" &&
      !doorLeaves(moved).every(
        (sw) =>
          !ctx.furniture.some((f) => sectorIntersectsRect(sw, rectOf(f), clr)) &&
          swings.every((t) => !swingsCollide(sw, t, clr)),
      )
    )
      continue;
    // The position alone (`at <pos>`), so the rest of the statement keeps its bytes (red team N9).
    let text: string | undefined;
    if (el._relation) {
      const clause = relationalClause(el._relation, ctx.rooms, at);
      const lead = `${relationText({ ...el._relation, at: undefined })} `;
      text = clause?.startsWith(lead) ? clause.slice(lead.length) : undefined;
    } else {
      const pos = wallPosition(ctx, seg, s);
      const total = ctx.wallSegs.filter((t) => t.wallId === seg.wallId).reduce((a, t) => a + segmentLength(t), 0);
      text = `at ${numStr(lead.from === "end" ? total - pos : pos)}${lead.from ? ` from ${lead.from}` : ""}`;
    }
    if (text !== undefined) found.push({ span: lead.span, text, shift: m.shift });
  }
  const near = Math.min(...found.map((f) => f.shift));
  return found.filter((f) => f.shift === near);
}

/**
 * The fix for `W_DOORWAY_BLOCKED`: each of {@link doorwayMoves}' moves. Always `maybe-incorrect`: the
 * piece could move instead (`arch repair`'s remedy, ADR 0011 §5), and moving a door moves where the
 * author placed it.
 */
export function doorwayMoveFix(moves: readonly DoorwayMove[], what: string, piece: string): FixSuggestion[] | null {
  return moves.length === 0
    ? null
    : moves.map(
        (m): FixSuggestion => ({
          title: `move the ${what} ${mm(m.shift)} mm along its wall (\`${m.text}\`), so its landing misses "${piece}"`,
          applicability: "maybe-incorrect",
          fixId: "doorway-move",
          edits: [{ span: m.span, newText: m.text }],
        }),
      );
}
