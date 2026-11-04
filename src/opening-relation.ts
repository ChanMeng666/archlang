/**
 * Openings by relation (ADR 0028 §5): where a `door|window|opening` stands when its position
 * is written against the rooms rather than against a wall.
 *
 * - `between <A> and <B> [at <pos>]` (door, cased opening): the one wall body on the shared
 *   edge run of two rooms, rectangular or rectilinear, derived or authored, at a position
 *   measured along that run. A polygon can share several runs with a room: the position then
 *   has to pick one, which only `<mm> from <room>.<edge>` can, and any other is refused.
 * - `on <room>.<edge> [at <pos>]` (door, window, cased opening): the one EXTERIOR wall body on
 *   that edge of the room, at a position measured along the edge. An edge can carry several
 *   bodies, say part exterior, part partition. The position is still measured along the whole
 *   edge, and names one point of it before any wall is read, so where the opening lands is
 *   arithmetic: its whole span on one exterior body and no other wall stands there, and any
 *   other landing refuses.
 * - The datum positions on the existing `on <wall> at …` form: `<mm> from start|end`,
 *   `<mm> from <room>.<edge>`, `axis <label>` ({@link datumAccess}, read by `attach.ts`).
 *
 * A position is `center`, `<mm> from start|end` (the run runs from its end with the smaller
 * coordinate, ADR 0028 §3), `<mm> from <room>.<edge>` (an edge perpendicular to the run
 * through one of its ends: the offset runs from that end into the run) or `axis <label>`
 * (a positioning axis crossing the run). Every offset is to the opening's CENTRE, as `on
 * <wall> at <mm>` always measured. A door and a cased opening must write one; a window
 * defaults to `center`. Nothing is chosen: every case with no single answer refuses.
 *
 * **The nib is enforced, never slid.** A relational opening whose jamb comes nearer than
 * `max(100 mm, host thickness / 2)` to a meeting wall's face (the measure and the default
 * values of `W_OPENING_AT_JUNCTION`, `src/opening-junctions.ts`), runs into a meeting wall,
 * or runs past the end of its run or its host, is refused with `E_OPENING_NIB` naming the
 * nearest legal position. An `open between` boundary voided over its whole clear span is no
 * meeting wall ({@link standingJunctionSpans}). Steps are charged before every scan.
 *
 * `window on <room>.<edge> at corner <room>.<edge>` ({@link placeCorner}) runs a window out to a
 * corner of the two walls. Its span ends on the other wall's outer face, so `at ± width / 2` is
 * still the span, and with the window on that wall the two ordinary cuts cover the block the walls
 * make there. What is not a true corner of two walls refuses (`E_WINDOW_CORNER`).
 */

import type { AttachPos, OpeningAttach, OpeningBetween, Point, WallsPairRoom } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { exprChildren } from "./cursor.js";
import { chargeSteps } from "./expr.js";
import type { Expr } from "./expr.js";
import { distPointToWallSegment, segmentsOfWall, type WallSegment } from "./geometry.js";
import type { OpeningRelation, RWall, WindowCorner } from "./ir.js";
import { fmt3 as numStr } from "./num-format.js";
import {
  atFreeEnd,
  FLUSH_MM,
  JUNCTION_EPS,
  JUNCTION_NIB_DEFAULTS,
  type JunctionSpan,
  openBoundaryIds,
  sameSeg,
  standingJunctionSpans,
} from "./opening-junctions.js";
import type { DatumTable, RoomDatums } from "./room-datums.js";
import { axisRead, COMPASS_DATUM_ALIASES, edgeOfRoom, splitDatum } from "./room-datums.js";
import {
  type EdgeLine,
  extremeRuns,
  pickAt,
  rectilinear,
  ringParts,
  type RunLine,
  type RunPick,
  runEndMet,
  runPicks,
  runText,
  sharedRuns,
  type SideWord,
  type TileRoom,
} from "./room-tiling.js";
import { attachPosStr } from "./statement-print.js";
import { openBoundaryPhraseOf, wallPhraseOf } from "./wall-ref.js";

export type { EdgeLine } from "./room-tiling.js";

/** What the resolver lends a relational opening: the group's frozen datum table, and a read
 *  of a dotted datum name through the group's own reader (its refusals included). */
export interface DatumAccess {
  table: DatumTable;
  /** The value of `name` read as a datum: `undefined` when it is not one, `null` when the
   *  reader refused it (the diagnostic is already pushed, through `reword` when one is given).
   *  One step, charged by the caller. */
  read(name: string, span: Span | undefined, reword?: (d: Diagnostic) => Diagnostic): number | null | undefined;
  /** Whether a bare compass word may stand for a frame direction in this group (the root of a
   *  plan whose `north` is `up`, ADR 0028 §2), and why not when it may not: what `segment
   *  north` reads (`src/segment-select.ts`). Absent = refused. */
  compass?: { aliases: boolean; why: string };
}

/** What the placement needs from `ResolveCtx`. */
export interface RelationCtx {
  /** The plan's snap module (0: no snapping). */
  grid: number;
  walls: readonly RWall[];
  snapPt(p: Point): Point;
  diag(d: Diagnostic): void;
  eval(e: Expr): number;
  datums?: DatumAccess;
}

type Kind = "door" | "window" | "opening";

/** The position as written, for `describe()` and Plan JSON: `800 from end`, `center`;
 *  `undefined` when none is written. The one printer `arch fmt` uses. */
export function posText(pos: AttachPos): string | undefined {
  return pos.kind === "default" ? undefined : attachPosStr(pos);
}

/** A relational placement's written form, as {@link OpeningRelation}. */
export function relationOf(src: { between: OpeningBetween } | { edge: OpeningAttach }): OpeningRelation {
  const pos = "between" in src ? src.between.pos : src.edge.pos;
  const at = posText(pos);
  return {
    ...("between" in src ? { between: [src.between.a.id, src.between.b.id] as [string, string] } : {}),
    ...("edge" in src ? { edge: src.edge.wall } : {}),
    ...(at !== undefined ? { at } : {}),
  };
}

/** The relation as one phrase: `between a and b at 800 from end`, `on r.top`. */
export function relationText(r: OpeningRelation): string {
  const lead = r.between ? `between ${r.between[0]} and ${r.between[1]}` : `on ${r.edge}`;
  return r.at !== undefined ? `${lead} at ${r.at}` : lead;
}

/**
 * The relational clause that puts an opening's centre at `centre` (a plan point on its run):
 * `between a and b at 600 from start`, `on r.top at 1200 from start`. What a lint hint quotes
 * for a relational opening, so it never names the internal id of a derived host (ADR 0028
 * §3). Read from the rooms the relation names (rectangles and rectilinear rings in plan
 * coordinates, as lint holds them); `undefined` when they no longer give a run. Of a pair with
 * several runs it reads the one `centre` stands on, and the edge the author wrote keeps picking it.
 */
export function relationalClause(
  r: OpeningRelation,
  rooms: ReadonlyArray<{ id: string; at: Point; size: { w: number; h: number }; poly?: readonly Point[] }>,
  centre: Point,
): string | undefined {
  const lines = (id: string): RoomDatums | undefined => {
    const room = rooms.find((x) => x.id === id);
    if (!room || room.poly) return undefined;
    const { x, y } = room.at;
    const { w, h } = room.size;
    return { top: y, bottom: y + h, left: x, right: x + w, cx: x + w / 2, cy: y + h / 2 };
  };
  const tile = (id: string): TileRoom | undefined => {
    const l = lines(id);
    if (l) return { id, rect: rectOf(l) };
    const ring = rooms.find((x) => x.id === id)?.poly;
    const parts = ring ? ringParts(ring) : undefined;
    return parts ? { id, parts } : undefined;
  };
  const edgeLine = (datum: string): EdgeLine | undefined => {
    const d = splitDatum(datum);
    const word = d ? (COMPASS_DATUM_ALIASES[d.word] ?? d.word) : undefined;
    if (!d || !word || word === "cx" || word === "cy") return undefined;
    const side = word as SideWord;
    const l = lines(d.room);
    if (l) {
      const vertical = side === "left" || side === "right";
      return { vertical, c: l[side], lo: vertical ? l.top : l.left, hi: vertical ? l.bottom : l.right };
    }
    const ring = rooms.find((x) => x.id === d.room)?.poly;
    const runs = ring && rectilinear(ring) ? extremeRuns(ring, side) : [];
    return runs.length === 1 ? runs[0] : undefined;
  };
  let run: Run | undefined;
  if (r.between) {
    const a = lines(r.between[0]);
    const b = lines(r.between[1]);
    if (a && b) run = sharedRun(a, b);
    else {
      const [ta, tb] = [tile(r.between[0]), tile(r.between[1])];
      const got = ta && tb ? sharedRuns(ta, tb) : undefined;
      if (got?.ok) run = got.runs.find((u) => standsOn(centre, u));
    }
  } else if (r.edge) {
    const e = edgeLine(r.edge);
    if (e) run = { vertical: e.vertical, c: e.c, r0: e.lo, r1: e.hi };
  }
  if (!run) return undefined;
  const t = run.vertical ? centre.y : centre.x;
  // Keep the anchor the author wrote (`from end`, `from <room>.<edge>` at an end of the run),
  // as E_OPENING_NIB's hint does; `center`, an axis or no position read from the start.
  const from = /\bfrom\s+(\S+)$/.exec(r.at ?? "")?.[1];
  const datum = from !== undefined && from !== "start" && from !== "end" ? edgeLine(from) : undefined;
  const meets = datum !== undefined && datum.vertical !== run.vertical;
  let anchor: OnRun["anchor"] = { end: "r0", word: "start" };
  if (from === "end") anchor = { end: "r1", word: "end" };
  else if (meets && datum.c === run.r0) anchor = { end: "r0", word: from! };
  else if (meets && datum.c === run.r1) anchor = { end: "r1", word: from! };
  return `${relationText({ ...r, at: undefined })} at ${legalText(anchor, t, run)}`;
}

/**
 * Read a dotted `<room>.<edge>` name as an edge line: `undefined` after a diagnostic (a
 * refused datum, a centre line, or no datum at all). Charged one step, as a datum read is.
 */
function readEdge(
  name: string,
  span: Span | undefined,
  ctx: RelationCtx,
  what: string,
  reword?: (d: Diagnostic) => Diagnostic,
): EdgeLine | undefined {
  chargeSteps(1);
  const d = splitDatum(name);
  const access = ctx.datums;
  const v = d && access ? access.read(name, span, reword) : undefined;
  if (v === null) return undefined;
  if (d === undefined || v === undefined || access === undefined) {
    ctx.diag(
      datumDiag(
        `${what} is measured from \`${name}\`, which is not a room edge: write \`<room>.top|bottom|left|right\`, \`start\` or \`end\``,
        span,
      ),
    );
    return undefined;
  }
  const word = (COMPASS_DATUM_ALIASES[d.word] ?? d.word) as SideWord | "cx" | "cy";
  if (word === "cx" || word === "cy") {
    ctx.diag(
      datumDiag(
        `${what} is measured from \`${name}\`, a room's centre line, not an edge: an offset runs from a room edge or an end of the run`,
        span,
      ),
    );
    return undefined;
  }
  return edgeOfRoom(access.table, d.room, word);
}

const datumDiag = (message: string, span: Span | undefined, hints?: string[]): Diagnostic => ({
  severity: "error",
  message,
  code: "E_OPENING_DATUM",
  ...(span ? { span } : {}),
  ...(hints ? { hints } : {}),
});

// ---- hosted datum positions (`on <wall> at …`) ------------------------------------------

/**
 * The run distance along a hosted wall where a datum position puts the opening's centre, or
 * `null` after a diagnostic. `from start|end` reads the run's own ends; `from <room>.<edge>`
 * and `axis <label>` need the datum line to cross the wall's run at exactly one point (a
 * curved run, a run lying along the line, or a line that crosses it twice or never is
 * `E_OPENING_DATUM`), and the offset runs from that crossing along the wall's own direction.
 * Only the `from`/`axis`/`default` kinds reach here.
 */
export function hostedDatumDistance(
  attach: OpeningAttach,
  segs: readonly WallSegment[],
  segLen: (s: WallSegment) => number,
  total: number,
  raw: number,
  ctx: RelationCtx,
  what: string,
): number | null {
  const pos = attach.pos;
  if (pos.kind === "default") {
    ctx.diag(
      datumDiag(
        `${what} is attached \`on ${attach.wall}\` with no position: write \`at <pos>\` (only an \`on <room>.<edge>\` window may leave it out)`,
        attach.span,
      ),
    );
    return null;
  }
  if (pos.kind === "from" && "word" in pos.from) return pos.from.word === "start" ? raw : total - raw;
  let line: { vertical: boolean; c: number } | undefined;
  let name: string;
  if (pos.kind === "axis") {
    line = axisLine(pos.label, pos.span, ctx, what);
    name = `axis ${pos.label}`;
  } else if (pos.kind === "from" && "datum" in pos.from) {
    line = readEdge(pos.from.datum, pos.from.span, ctx, what);
    name = pos.from.datum;
  } else {
    return null;
  }
  if (!line) return null;
  chargeSteps(segs.length + 1);
  const hits: Array<{ p: Point; dist: number }> = [];
  let acc = 0;
  for (const s of segs) {
    const len = segLen(s);
    if (s.arc) {
      ctx.diag(
        datumDiag(
          `${what} is placed by \`${name}\` on a wall with a curved run: a datum is read only along straight walls`,
          attach.span,
        ),
      );
      return null;
    }
    const ka = line.vertical ? s.a.x : s.a.y;
    const kb = line.vertical ? s.b.x : s.b.y;
    if (ka === line.c && kb === line.c) {
      ctx.diag(
        datumDiag(
          `\`${name}\` runs along \`${attach.wall}\` instead of crossing it, so it marks no point on it`,
          attach.span,
        ),
      );
      return null;
    }
    if (Math.min(ka, kb) <= line.c && line.c <= Math.max(ka, kb)) {
      const t = (line.c - ka) / (kb - ka);
      const p = t === 0 ? s.a : t === 1 ? s.b : { x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) };
      if (!hits.some((h) => h.p.x === p.x && h.p.y === p.y)) hits.push({ p, dist: acc + t * len });
    }
    acc += len;
  }
  if (hits.length !== 1) {
    ctx.diag(
      datumDiag(
        hits.length === 0
          ? `\`${name}\` does not cross \`${attach.wall}\`, so it marks no point on it`
          : `\`${name}\` crosses \`${attach.wall}\` at ${hits.length} points, so it does not say which one`,
        attach.span,
      ),
    );
    return null;
  }
  return hits[0]!.dist + raw;
}

/** The positioning axis labelled `label`, as a line: `x` axes are vertical (`x = pos`). */
function axisLine(
  label: string,
  span: Span,
  ctx: RelationCtx,
  what: string,
): { vertical: boolean; c: number } | undefined {
  chargeSteps(1 + (ctx.datums?.table.axes.length ?? 0));
  const a = ctx.datums?.table.axes.find((x) => x.label === label);
  if (!a) {
    ctx.diag(
      datumDiag(
        `${what} stands on \`axis ${label}\`, but ${ctx.datums?.table.axes.length ? `no positioning axis is labelled "${label}"` : "this plan or component declares no positioning axes"}`,
        span,
      ),
    );
    return undefined;
  }
  return { vertical: a.axis === "x", c: a.pos };
}

// ---- arithmetic on an axis (`at axis.2 + 500`, CR-D5) -----------------------------------

/**
 * The positioning-axis labels an opening's position expression reads (`axis.2 + 500` reads
 * `2`), in source order, each once. The bare `at axis.2` never reaches here: the parser turns
 * it into `at axis 2`. Uncharged on purpose: the walk visits the nodes the evaluation of the
 * same expression has just paid for, and charging it would move the step count of every plan
 * that writes an expression position.
 */
export function axisLabelsRead(e: Expr): string[] {
  const out: string[] = [];
  const go = (x: Expr): void => {
    if (x.t === "ref") {
      const label = axisRead(x.name);
      if (label !== undefined && !out.includes(label)) out.push(label);
    }
    for (const c of exprChildren(x)) go(c);
  };
  go(e);
  return out;
}

/**
 * The refusal of arithmetic on an axis in an opening's position (decision CR-D5). An axis is a
 * plan coordinate and a position along a wall is a distance along it, so `at axis.2 + 500` used
 * to land 3500 mm from the wall's start: on the axis only on a wall that starts at 0, and
 * somewhere else without a word on any other. `along` is the distance that reaches the plan
 * coordinate the expression meant, when one is known; the hint quotes it.
 */
export function axisArithmeticDiag(
  what: string,
  pos: AttachPos,
  labels: readonly string[],
  span: Span | undefined,
  along?: { wall: string; vertical: boolean; c: number; d: number },
): Diagnostic {
  const first = labels[0]!;
  const reach = along
    ? `; for the point on \`${along.wall}\` where ${along.vertical ? "x" : "y"} = ${numStr(along.c)}, write \`at ${numStr(along.d)}\` (mm from the wall's start)`
    : "; for a point off the axis, measure it from an end of the run: `at <mm> from start|end`";
  return datumDiag(
    `${what} is placed \`at ${attachPosStr(pos)}\`, arithmetic on \`axis.${first}\`: an axis is a plan coordinate, but a position along a wall is a distance along it, so the result lands on the axis only by chance`,
    span,
    [`To stand on the axis, write \`at axis ${first}\`${reach}.`],
  );
}

/**
 * The run distance at which an axis line `line` crosses a hosted wall's straight run, when it
 * crosses it at exactly one point; `undefined` otherwise (a curved run, a run along the line,
 * none or several crossings). The arithmetic of {@link hostedDatumDistance}, step for step,
 * without its diagnostics: only a hint reads it.
 */
export function axisCrossingDistance(
  line: { vertical: boolean; c: number },
  segs: readonly WallSegment[],
  segLen: (s: WallSegment) => number,
): number | undefined {
  chargeSteps(segs.length + 1);
  const hits: Array<{ p: Point; dist: number }> = [];
  let acc = 0;
  for (const s of segs) {
    const len = segLen(s);
    if (s.arc) return undefined;
    const ka = line.vertical ? s.a.x : s.a.y;
    const kb = line.vertical ? s.b.x : s.b.y;
    if (ka === line.c && kb === line.c) return undefined;
    if (Math.min(ka, kb) <= line.c && line.c <= Math.max(ka, kb)) {
      const t = (line.c - ka) / (kb - ka);
      const p = t === 0 ? s.a : t === 1 ? s.b : { x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) };
      if (!hits.some((h) => h.p.x === p.x && h.p.y === p.y)) hits.push({ p, dist: acc + t * len });
    }
    acc += len;
  }
  return hits.length === 1 ? hits[0]!.dist : undefined;
}

/**
 * The labels of `labels` this scope declares, in order. An undeclared one (`axis.9` on a grid of
 * two) is already `E_UNKNOWN_REF` at the datum, from the evaluator; when none is declared the
 * arithmetic refusal is not added on top, so one mistake is one error and no hint names a label
 * the plan does not have. One step per label and axis, as `at axis` pays.
 */
export function declaredAxes(labels: readonly string[], ctx: RelationCtx | undefined): string[] {
  const axes = ctx?.datums?.table.axes ?? [];
  chargeSteps(1 + labels.length * axes.length);
  return labels.filter((l) => axes.some((a) => a.label === l));
}

/** The axis family every label belongs to (`vertical` for `x` axes), or `undefined` when they
 *  mix families or one is not declared. One step per label and axis, as `at axis` pays. */
export function axisFamily(labels: readonly string[], ctx: RelationCtx): boolean | undefined {
  const axes = ctx.datums?.table.axes ?? [];
  chargeSteps(1 + labels.length * axes.length);
  let vertical: boolean | undefined;
  for (const l of labels) {
    const a = axes.find((x) => x.label === l);
    if (!a) return undefined;
    const v = a.axis === "x";
    if (vertical !== undefined && v !== vertical) return undefined;
    vertical = v;
  }
  return vertical;
}

// ---- relational placement (`between`, `on <room>.<edge>`) ------------------------------

/** A run an opening is placed along: the line, and its ends `r0 < r1` (start, end). */
type Run = RunLine;

/** A room a `between` names: a rectangle's lines, or a rectilinear polygon's ring. */
type PairRoom = RoomDatums | { ring: readonly Point[] };

/**
 * A room of the group's table by id, or `undefined` after a diagnostic. A ring the room itself
 * refused adds none: the plan already says why, as it does in `walls from rooms`.
 */
function pairRoom(room: WallsPairRoom, ctx: RelationCtx, what: string): PairRoom | undefined {
  const ring = ctx.datums?.table.rings.get(room.id);
  if (ring === null) return undefined;
  if (ring !== undefined) return { ring };
  // The refusals a datum read gives (`E_UNKNOWN_REF`, `E_ROOM_NOT_RECTANGLE`, `E_DATUM_UNPLACED`),
  // through the group's own reader, on the room's name. Each is said in this line's words: the
  // `.top` it reads to get there is no word the author wrote.
  const unseen = `${what} names "${room.id}", which is not a room this plan or component can see`;
  const reword = (d: Diagnostic): Diagnostic => {
    const table = ctx.datums?.table;
    if (d.code === "E_UNKNOWN_REF") {
      // The reader's near miss, already paid for, as the room it suggests: the `.top` is this read's.
      const hints = d.hints?.map((h) => h.replace(/\.top"\?$/, '"?'));
      return { ...d, message: unseen, ...(hints ? { hints } : {}) };
    }
    if (d.code === "E_DATUM_UNPLACED") {
      const why =
        table?.refused.get(room.id) === "degenerate"
          ? "a room with no positive size"
          : "a room that could not be placed (its own error says why)";
      return { ...d, message: `${what} names "${room.id}", ${why}` };
    }
    if (d.code !== "E_ROOM_NOT_RECTANGLE") return d;
    const circle = table?.refused.get(room.id) === "circle";
    const shape = circle ? "a circle room" : "a polygon room with an edge that is neither horizontal nor vertical";
    return {
      ...d,
      message: `${what} is placed \`between\` "${room.id}", ${shape}: only rectangular and rectilinear rooms share an edge run`,
      hints: ["Place it on the wall you mean instead: `on <wall> at …`, or `at (x,y)`."],
    };
  };
  const v = ctx.datums?.read(`${room.id}.top`, room.span, reword);
  if (v === null) return undefined;
  const lines = ctx.datums?.table.rooms.get(room.id);
  if (lines === undefined) {
    ctx.diag({ severity: "error", message: unseen, code: "E_UNKNOWN_REF", span: room.span });
  }
  return lines;
}

/** The shared edge run of two rectangles, or none (facing edges on one line, positive overlap). */
function sharedRun(a: RoomDatums, b: RoomDatums): Run | undefined {
  const along = (lo0: number, hi0: number, lo1: number, hi1: number): [number, number] => [
    Math.max(lo0, lo1),
    Math.min(hi0, hi1),
  ];
  const candidates: Run[] = [];
  if (a.right === b.left || a.left === b.right) {
    const [r0, r1] = along(a.top, a.bottom, b.top, b.bottom);
    candidates.push({ vertical: true, c: a.right === b.left ? a.right : a.left, r0, r1 });
  }
  if (a.bottom === b.top || a.top === b.bottom) {
    const [r0, r1] = along(a.left, a.right, b.left, b.right);
    candidates.push({ vertical: false, c: a.bottom === b.top ? a.bottom : a.top, r0, r1 });
  }
  return candidates.find((r) => r.r1 > r.r0);
}

const rectOf = (r: RoomDatums): NonNullable<TileRoom["rect"]> => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });

/** A room of a pair as the sweep reads it. Its ring is rectilinear, or it would not be one. */
const tileOf = (id: string, r: PairRoom): TileRoom =>
  "ring" in r ? { id, parts: ringParts(r.ring)! } : { id, rect: rectOf(r) };

/** A room of a pair as {@link runPicks} reads it: a rectangle's edges, or a polygon's sides. */
const edgesOf = (id: string, r: PairRoom): TileRoom =>
  "ring" in r ? { id, shape: "polygon", ring: r.ring } : { id, rect: rectOf(r) };

/** Does `p` lie on the run? Exactly: an opening's centre was put on its run's line. */
const standsOn = (p: Point, r: Run): boolean => {
  const [c, t] = r.vertical ? [p.x, p.y] : [p.y, p.x];
  return c === r.c && r.r0 <= t && t <= r.r1;
};

/**
 * Every run two rooms share, or `null` after a diagnostic. Two rectangles keep their line
 * arithmetic, and share at most one; a polygon is read through the sweep that derives its walls,
 * so a door and the wall it stands in cannot disagree about where an edge is.
 */
function runsBetween(b: OpeningBetween, A: PairRoom, B: PairRoom, ctx: RelationCtx, what: string): Run[] | null {
  if (!("ring" in A) && !("ring" in B)) {
    const run = sharedRun(A, B);
    return run ? [run] : [];
  }
  const got = sharedRuns(tileOf(b.a.id, A), tileOf(b.b.id, B));
  if (got.ok) return got.runs;
  ctx.diag({
    severity: "error",
    message: `${what} cannot stand between "${b.a.id}" and "${b.b.id}": the two rooms overlap, so the edge between them is not one line`,
    code: got.refusal.code,
    span: b.span,
    hints: ["Move or resize the rooms so they meet edge to edge."],
  });
  return null;
}

/** What to write for each run: the position that picks it, or the point it stands at. */
function pickHints(where: string, picks: readonly RunPick[], ctx: RelationCtx): string[] {
  return picks.map((pick) => {
    const { at } = pickAt(pick, ctx.snapPt);
    return pick.from
      ? `\`${where} at ${at}\` stands on the edge ${runText(pick.run)}.`
      : `No edge of these rooms picks the edge ${runText(pick.run)} alone: write the point, \`at ${at}\`.`;
  });
}

/**
 * The one run of several that the position picks, or `undefined` after a diagnostic. Only
 * `<mm> from <room>.<edge>` can: a run has one end there, and the rule of ADR 0028 §5 is what
 * tells the runs apart. `center`, `from start|end`, an axis or no position would all be a choice
 * of run the author did not write (ADR 0005), so each refuses and says what to write instead.
 */
function pickRun(
  b: OpeningBetween,
  A: PairRoom,
  B: PairRoom,
  runs: readonly Run[],
  ctx: RelationCtx,
  what: string,
): Run | undefined {
  const where = relationText({ between: [b.a.id, b.b.id] });
  const said = runs.map(runText).join("; ");
  const hints = (): string[] => pickHints(where, runPicks([edgesOf(b.a.id, A), edgesOf(b.b.id, B)], runs), ctx);
  const pair = `"${b.a.id}" and "${b.b.id}"`;
  const pos = b.pos;
  let why = pos.kind === "default" ? "no position says which" : `\`at ${posText(pos)}\` does not say which`;
  if (pos.kind === "from" && "datum" in pos.from) {
    const name = pos.from.datum;
    const edge = readEdge(name, pos.from.span, ctx, what, (d) =>
      d.code === "E_ROOM_NOT_RECTANGLE" ? { ...d, hints: hints() } : d,
    );
    if (!edge) return undefined;
    chargeSteps(runs.length);
    const met = runs.filter((r) => runEndMet(edge, r) !== undefined);
    if (met.length === 1) return met[0];
    if (met.length === 0) {
      ctx.diag({
        ...datumDiag(
          `\`${name}\` meets none of the ${runs.length} edges ${pair} share (${said}) at an end, so it does not say which`,
          pos.from.span,
        ),
        hints: hints(),
      });
      return undefined;
    }
    why = `\`${name}\` meets ${met.length} of them at an end, so it does not say which`;
  }
  ctx.diag({
    severity: "error",
    message: `${what} cannot tell which edge to stand on: ${pair} share ${runs.length} edges (${said}), and ${why}`,
    code: "E_OPENING_HOST_AMBIGUOUS",
    span: b.span,
    hints: hints(),
  });
  return undefined;
}

/** `x 4000` / `y 3000`: a run's line, as a reader looks it up. */
const lineText = (r: { vertical: boolean; c: number }): string => `${r.vertical ? "x" : "y"} ${numStr(r.c)}`;
/** A coordinate along a run: `y 1200` on a vertical run. */
const alongText = (r: Run, t: number): string => `${r.vertical ? "y" : "x"} ${numStr(t)}`;

/**
 * Where on `run` the position puts the opening's centre (a coordinate along the run), or
 * `undefined` after a diagnostic.
 */
/** A position on a run: its centre, and the end it is measured from with the word written. */
interface OnRun {
  c: number;
  anchor: { end: "r0" | "r1"; word: string };
}

function positionOnRun(
  pos: AttachPos,
  posSpan: Span,
  run: Run,
  kind: Kind,
  ctx: RelationCtx,
  what: string,
  runWord: string,
): OnRun | undefined {
  const start = { end: "r0", word: "start" } as const;
  switch (pos.kind) {
    case "default":
      if (kind === "window") return { c: (run.r0 + run.r1) / 2, anchor: start };
      ctx.diag(
        datumDiag(
          `${what} has no position: a ${kind === "door" ? "door" : "cased opening"} is held to an end of the ${runWord} or to a room edge, never centred by default; write \`at <mm> from start|end\`, \`at <mm> from <room>.<edge>\`, \`at axis <label>\` or \`at center\``,
          posSpan,
        ),
      );
      return undefined;
    case "center":
      return { c: (run.r0 + run.r1) / 2, anchor: start };
    case "mm":
    case "percent":
      ctx.diag(
        datumDiag(
          `${what} is placed \`at ${posText(pos)}\`, which names no datum: along ${runWord === "edge" ? "an" : "a"} ${runWord} write \`at <mm> from start|end\`, \`at <mm> from <room>.<edge>\`, \`at axis <label>\` or \`at center\``,
          posSpan,
        ),
      );
      return undefined;
    case "axis": {
      const line = axisLine(pos.label, pos.span, ctx, what);
      if (!line) return undefined;
      if (line.vertical === run.vertical || line.c < run.r0 || line.c > run.r1) {
        ctx.diag(
          datumDiag(
            line.vertical === run.vertical
              ? `\`axis ${pos.label}\` runs parallel to the ${runWord} (on ${lineText(run)}), so it marks no point on it`
              : `\`axis ${pos.label}\` (${lineText(line)}) does not cross the ${runWord}, which runs ${alongText(run, run.r0)}–${numStr(run.r1)}`,
            pos.span,
          ),
        );
        return undefined;
      }
      return { c: line.c, anchor: start };
    }
    case "corner":
      ctx.diag(cornerDiag(`${what} is placed \`at corner\`, and only a window turns a corner`, posSpan));
      return undefined;
    case "from": {
      const v = ctx.eval(pos.value);
      const axes = axisLabelsRead(pos.value);
      if (axes.length > 0) {
        // Only the declared labels: an undeclared one is the evaluator's E_UNKNOWN_REF already.
        const known = declaredAxes(axes, ctx);
        if (known.length > 0) ctx.diag(axisArithmeticDiag(what, pos, known, posSpan));
        return undefined;
      }
      if (!Number.isFinite(v)) {
        ctx.diag(datumDiag(`${what}'s offset is not a finite number (got ${v})`, posSpan));
        return undefined;
      }
      if ("word" in pos.from) {
        return pos.from.word === "start"
          ? { c: run.r0 + v, anchor: start }
          : { c: run.r1 - v, anchor: { end: "r1", word: "end" } };
      }
      const edge = readEdge(pos.from.datum, pos.from.span, ctx, what);
      if (!edge) return undefined;
      const end = runEndMet(edge, run);
      if (end === "r0") return { c: run.r0 + v, anchor: { end: "r0", word: pos.from.datum } };
      if (end === "r1") return { c: run.r1 - v, anchor: { end: "r1", word: pos.from.datum } };
      ctx.diag(
        datumDiag(
          edge.vertical === run.vertical
            ? `\`${pos.from.datum}\` runs parallel to the ${runWord}, so an offset cannot be measured from it: name an edge that meets one of its ends, or write \`from start|end\``
            : `\`${pos.from.datum}\` meets the ${runWord} (on ${lineText(run)}, ${alongText(run, run.r0)}–${numStr(run.r1)}) at neither of its ends, so an offset cannot be measured from it: name an edge through an end, or write \`from start|end\``,
          pos.from.span,
        ),
      );
      return undefined;
    }
  }
}

/** Every straight segment of the group's walls lying on the run's line with a positive
 *  overlap with it. Charged one step per wall and per point before the scan. */
function bodiesOn(run: Run, walls: readonly RWall[]): WallSegment[] {
  chargeSteps(walls.length + 1);
  let n = 0;
  for (const w of walls) n += w.points.length;
  chargeSteps(n);
  const out: WallSegment[] = [];
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc) continue;
      const on = run.vertical ? s.a.x === run.c && s.b.x === run.c : s.a.y === run.c && s.b.y === run.c;
      if (!on) continue;
      const [lo, hi] = extent(s, run.vertical);
      if (Math.min(hi, run.r1) > Math.max(lo, run.r0)) out.push(s);
    }
  }
  return out;
}

const extent = (s: WallSegment, vertical: boolean): [number, number] => {
  const a = vertical ? s.a.y : s.a.x;
  const b = vertical ? s.b.y : s.b.x;
  return [Math.min(a, b), Math.max(a, b)];
};

/** The bodies a span centred on `c` lies on by more than float dust. Charged before the scan. */
function bodiesUnder(bodies: readonly WallSegment[], c: number, width: number, run: Run): WallSegment[] {
  chargeSteps(bodies.length);
  const lo = c - width / 2;
  const hi = c + width / 2;
  return bodies.filter((s) => {
    const [bl, bh] = extent(s, run.vertical);
    return bl < hi - JUNCTION_EPS && bh > lo + JUNCTION_EPS;
  });
}

/** What the walls of the group leave an opening in one host, each read in run coordinates: the
 *  stretch of the run the host covers, where other walls meet it, and the nib a jamb needs. */
interface HostFit {
  R0: number;
  R1: number;
  js: JunctionSpan[];
  need: number;
}

/** {@link hostFit}'s reading of the group's walls, shared by every host of one placement. */
function meetingWalls(ctx: RelationCtx): { segs: WallSegment[]; voided: ReadonlySet<string> } {
  return { segs: ctx.walls.flatMap((w) => segmentsOfWall(w)), voided: openBoundaryIds(ctx.walls) };
}

function hostFit(host: WallSegment, run: Run, { segs, voided }: ReturnType<typeof meetingWalls>): HostFit {
  chargeSteps(segs.length + 1);
  if (voided.size > 0) chargeSteps(2 * segs.length); // a scan past each end of the host
  const [bl, bh] = extent(host, run.vertical);
  // The meeting walls, by the lint's own measure, in run coordinates.
  const sign = (run.vertical ? host.b.y - host.a.y : host.b.x - host.a.x) >= 0 ? 1 : -1;
  const a0 = run.vertical ? host.a.y : host.a.x;
  const js = standingJunctionSpans(host, segs, voided).map((j) => {
    const p = a0 + sign * j.lo;
    const q = a0 + sign * j.hi;
    return { ...j, lo: Math.min(p, q), hi: Math.max(p, q) };
  });
  const need = Math.max(
    JUNCTION_NIB_DEFAULTS.minJunctionNibMm,
    host.thickness * JUNCTION_NIB_DEFAULTS.junctionNibThicknessRatio,
  );
  return { R0: Math.max(run.r0, bl), R1: Math.min(run.r1, bh), js, need };
}

/** The wall a segment belongs to (by identity: its id and that exact segment). */
function wallOfSeg(walls: readonly RWall[], s: WallSegment): RWall | undefined {
  return walls.find(
    (w) =>
      w.id === s.wallId &&
      segmentsOfWall(w).some(
        (t) => t.index === s.index && t.a.x === s.a.x && t.a.y === s.a.y && t.b.x === s.b.x && t.b.y === s.b.y,
      ),
  );
}

/** What a placed relational opening resolves to. */
export interface Placed {
  at: Point;
  host: WallSegment;
  relation: OpeningRelation;
  corner?: WindowCorner;
}

/**
 * Place `door|opening … between <A> and <B> [at …]`: `null` after a diagnostic (the caller
 * then draws nothing for it, as an unresolvable attachment does).
 */
export function placeBetween(
  b: OpeningBetween,
  kind: Kind,
  width: number,
  ctx: RelationCtx,
  what: string,
): Placed | null {
  const A = pairRoom(b.a, ctx, what);
  const B = A ? pairRoom(b.b, ctx, what) : undefined;
  if (!A || !B) return null;
  const runs = b.a.id === b.b.id ? [] : runsBetween(b, A, B, ctx, what);
  if (runs === null) return null;
  if (runs.length === 0) {
    ctx.diag({
      severity: "error",
      message: `${what} cannot stand between "${b.a.id}" and "${b.b.id}": ${b.a.id === b.b.id ? "a room shares no edge with itself" : "the two rooms share no edge"}`,
      code: "E_WALL_BETWEEN_NOT_ADJACENT",
      span: b.span,
      hints: ["Name two rooms that meet along an edge, or place the opening `on <wall> at …` or `at (x,y)`."],
    });
    return null;
  }
  const run = runs.length === 1 ? runs[0] : pickRun(b, A, B, runs, ctx, what);
  if (!run) return null;
  return placeOnRun(run, b.pos, b.span, kind, width, ctx, what, "shared edge", relationOf({ between: b }), false);
}

/**
 * Place `door|window|opening … on <room>.<edge> [at …]`: the one exterior wall body on the
 * room's edge. `undefined` when `attach.wall` is not written as a room edge of the group (the
 * caller then reads it as a wall reference, as it always did); `null` after a diagnostic.
 */
export function placeOnEdge(
  attach: OpeningAttach,
  kind: Kind,
  width: number,
  ctx: RelationCtx,
  what: string,
): Placed | null {
  const span = attach.span;
  const edge = readEdge(attach.wall, span, ctx, what);
  if (!edge) return null;
  const run: Run = { vertical: edge.vertical, c: edge.c, r0: edge.lo, r1: edge.hi };
  if (attach.pos.kind === "corner") return placeCorner(attach, attach.pos, run, kind, width, ctx, what);
  return placeOnRun(
    run,
    attach.pos,
    span ?? { start: 0, end: 0 },
    kind,
    width,
    ctx,
    what,
    "edge",
    relationOf({ edge: attach }),
    true,
  );
}

function placeOnRun(
  run: Run,
  pos: AttachPos,
  span: Span,
  kind: Kind,
  width: number,
  ctx: RelationCtx,
  what: string,
  runWord: string,
  relation: OpeningRelation,
  exterior: boolean,
): Placed | null {
  const where = relationText({ ...relation, at: undefined });
  const placed = positionOnRun(pos, span, run, kind, ctx, what, runWord);
  if (placed === undefined) return null;
  const centre = placed.c;
  const bodies = bodiesOn(run, ctx.walls);
  if (bodies.length === 0) {
    ctx.diag({
      severity: "error",
      message: `${what} has no wall to stand in: no wall lies on the ${runWord} \`${where}\` names (on ${lineText(run)}, ${alongText(run, run.r0)}–${numStr(run.r1)})`,
      code: "E_OPENING_NO_SHARED_WALL",
      span,
      hints: [
        "Add the wall (`walls from rooms` derives it, or write it by hand on that line), or place the opening on a wall that exists.",
      ],
    });
    return null;
  }
  const phrase = (s: WallSegment): string => {
    const w = wallOfSeg(ctx.walls, s);
    return w ? wallPhraseOf(w) : `wall "${s.wallId}"`;
  };
  // The position, snapped as every coordinate is (ADR 0004), then judged where it lands.
  const at = ctx.snapPt(run.vertical ? { x: run.c, y: centre } : { x: centre, y: run.c });
  const c = run.vertical ? at.y : at.x;
  const flushOk = kind === "opening";
  let host = bodies[0]!;
  if (bodies.length > 1) {
    // On a room's edge the position has already named a point of it, so where the span lands can
    // settle the wall. A shared run keeps its one-wall rule: two bodies there are never told apart.
    const under = exterior ? bodiesUnder(bodies, c, width, run) : undefined;
    const lands = under?.length === 1 && under[0]!.category === "exterior" ? under[0] : undefined;
    if (lands === undefined) {
      if (under) {
        const landing = { c, width, flushOk, kind, anchor: placed.anchor, where, runWord, run };
        ctx.diag(refusalOnEdge(bodies, under, landing, what, span, ctx));
      } else {
        ctx.diag({
          severity: "error",
          message: `${what} cannot tell which wall to stand in: the ${runWord} \`${where}\` names carries ${wallRuns(bodies, phrase)}`,
          code: "E_OPENING_HOST_AMBIGUOUS",
          span,
          hints: [ONE_WALL_HINT],
        });
      }
      return null;
    }
    host = lands;
  }
  const hostWall = wallOfSeg(ctx.walls, host);
  if (exterior && host.category !== "exterior") {
    ctx.diag({
      severity: "error",
      message: `${what} needs an exterior wall on \`${where}\`, but the wall there is ${phrase(host)}, a ${host.category}: the edge is shared with another room`,
      code: "E_OPENING_NO_SHARED_WALL",
      span,
      hints: [
        "Place it `between <room> and <room>` for an opening into the neighbouring room, or on an edge of the room that faces outside.",
      ],
    });
    return null;
  }
  const open = hostWall?._derived?.open;
  if (open) {
    const [a, b] = hostWall._derived!.between!;
    ctx.diag({
      severity: "error",
      message: `${what} cannot stand between "${a}" and "${b}": \`walls from rooms\` declares that pair open, so the edge they share is already voided`,
      code: "E_WALL_BETWEEN_OPEN",
      span,
      ...(open.span ? { relatedSpans: [{ span: open.span, message: "the `open between` clause" }] } : {}),
      hints: [
        `Remove the ${kind} (the edge is already open), or remove the \`open between\` clause and keep the wall with the ${kind} in it.`,
      ],
    });
    return null;
  }
  const { R0, R1, js, need } = hostFit(host, run, meetingWalls(ctx));
  const fault = nibFault(c, width, R0, R1, js, need, flushOk, run);
  if (fault) {
    const legal = nearestLegal(c, width, R0, R1, js, need, flushOk, ctx.grid, run);
    // A wall lying on part of this host can take the nearest legal span too, and then it would refuse.
    const alone = legal === undefined || bodies.length === 1 || bodiesUnder(bodies, legal, width, run).length === 1;
    // Nor is a position in a demolished wall legal: it hosts nothing, wherever the span stands.
    const gone = hostWall?.status === "demolish";
    ctx.diag(
      nibRefusal(fault, host, need, what, span, ctx, [
        gone
          ? DEMOLISHED_HINT
          : !alone
            ? ONE_WALL_HINT
            : legal === undefined
              ? `No position along the ${runWord} \`${where}\` names fits a ${numStr(width)} mm opening with its nibs: narrow it, or move a wall that meets the ${runWord}.`
              : `The nearest legal position is \`${where} at ${legalText(placed.anchor, legal, run)}\` (centre at ${alongText(run, legal)}).`,
      ]),
    );
    return null;
  }
  return { at, host, relation };
}

/** `E_OPENING_NIB` for a span {@link nibFault} found wanting. */
function nibRefusal(
  fault: NonNullable<ReturnType<typeof nibFault>>,
  host: WallSegment,
  need: number,
  what: string,
  span: Span,
  ctx: RelationCtx,
  hints: string[],
): Diagnostic {
  const phrase = (s: WallSegment): string => {
    const w = wallOfSeg(ctx.walls, s);
    return w ? wallPhraseOf(w) : `wall "${s.wallId}"`;
  };
  const boundaryPhrase = (s: WallSegment): string => {
    const w = wallOfSeg(ctx.walls, s);
    return w ? openBoundaryPhraseOf(w) : `wall "${s.wallId}"`;
  };
  const name = (j: JunctionSpan): string => (j.boundary ? boundaryPhrase(j.wall) : phrase(j.wall));
  const measure = fault.atBoundary ? "that edge" : "a meeting wall's face";
  return {
    severity: "error",
    message: `${what} is refused, not moved: ${fault.say(name)}. A jamb needs at least ${numStr(need)} mm of wall to ${measure} (the larger of ${numStr(JUNCTION_NIB_DEFAULTS.minJunctionNibMm)} mm and half the ${numStr(host.thickness)} mm wall)`,
    code: "E_OPENING_NIB",
    span,
    hints,
  };
}

const cornerDiag = (message: string, span: Span | undefined, hints?: string[]): Diagnostic => ({
  severity: "error",
  message,
  code: "E_WINDOW_CORNER",
  ...(span ? { span } : {}),
  ...(hints ? { hints } : {}),
});

/** `on <wall> at corner …` was written: a corner is named by rooms' edges. */
export function cornerOnWall(wall: string, what: string, span: Span | undefined): Diagnostic {
  return cornerDiag(`${what} is placed \`on ${wall} at corner\`, but a corner is read from a room's edges`, span, [
    "Write `window on <room>.<edge> at corner <room>.<edge>`, naming the two edges of the room that meet there.",
  ]);
}

/** The plan-axis box the two walls make at their corner: each wall's thickness across it. */
export function cornerBlock(
  at: Point,
  host: WallSegment,
  other: WallSegment,
): { x0: number; y0: number; x1: number; y1: number } {
  const [hx, hy] =
    host.a.y === host.b.y ? [other.thickness / 2, host.thickness / 2] : [host.thickness / 2, other.thickness / 2];
  return { x0: at.x - hx, y0: at.y - hy, x1: at.x + hx, y1: at.y + hy };
}

/** Does a wall's band reach into `box`, by more than touching it? An axis-aligned wall exactly,
 *  its square caps included; any other by the disc round the box, which errs towards refusing. */
function standsInBlock(s: WallSegment, box: ReturnType<typeof cornerBlock>): boolean {
  const h = s.thickness / 2;
  if (!s.arc && (s.a.x === s.b.x || s.a.y === s.b.y)) {
    return (
      Math.min(s.a.x, s.b.x) - h < box.x1 &&
      box.x0 < Math.max(s.a.x, s.b.x) + h &&
      Math.min(s.a.y, s.b.y) - h < box.y1 &&
      box.y0 < Math.max(s.a.y, s.b.y) + h
    );
  }
  const middle = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  return distPointToWallSegment(middle, s) < h + Math.hypot(box.x1 - box.x0, box.y1 - box.y0) / 2;
}

/**
 * The widest window that fits, run to the corner at `outer`: what the run or the nearest meeting
 * wall's nib leaves, on the plan's grid, and only when that passes the same check a placement gets.
 * `undefined` when none clears the other wall's inner face. Charged before the scan.
 */
function widestLeg(
  outer: number,
  corner: "r0" | "r1",
  fit: HostFit,
  js: readonly JunctionSpan[],
  other: WallSegment,
  grid: number,
  run: Run,
): number | undefined {
  chargeSteps(2 * js.length + 1);
  const sign = corner === "r1" ? 1 : -1;
  const free =
    corner === "r1"
      ? Math.max(fit.R0, ...js.map((j) => j.hi + fit.need))
      : Math.min(fit.R1, ...js.map((j) => j.lo - fit.need));
  const room = sign * (outer - free);
  const width = grid > 0 ? Math.floor(room / grid) * grid : room;
  if (!(width > other.thickness)) return undefined;
  const [lo, hi] = corner === "r1" ? [fit.R0, outer] : [outer, fit.R1];
  return nibFault(outer - (sign * width) / 2, width, lo, hi, js, fit.need, false, run) ? undefined : width;
}

/**
 * Place `window … on <room>.<edge> at corner <room>.<edge>`: `null` after a diagnostic.
 *
 * The two edges name a corner of the room, and it must be a true corner of two walls: on each edge
 * one exterior wall that stays, ENDING exactly there, with no third wall in the block the two make.
 * `width` runs from the free jamb to the other wall's outer face, so the centre comes from that
 * face and is not snapped: snapping it would open the corner again. The free jamb keeps the rule of
 * every relational opening. Whether the window on the other wall is written is settled when the
 * group has resolved (`windowEl.settle`).
 */
function placeCorner(
  attach: OpeningAttach,
  pos: Extract<AttachPos, { kind: "corner" }>,
  run: Run,
  kind: Kind,
  width: number,
  ctx: RelationCtx,
  what: string,
): Placed | null {
  const span = attach.span ?? pos.span;
  const refuse = (message: string, hints?: string[]): null => {
    ctx.diag(cornerDiag(`${what} cannot run to a corner there: ${message}`, span, hints));
    return null;
  };
  if (kind !== "window") {
    ctx.diag(cornerDiag(`${what} is placed \`at corner\`, and only a window turns a corner`, span));
    return null;
  }
  if (!(width > 0)) return null; // Refused already, as a width.
  const roomOf = (name: string): string | undefined => splitDatum(name)?.room;
  const edge = readEdge(pos.edge, pos.span, ctx, what);
  if (!edge) return null;
  const room = roomOf(attach.wall);
  if (roomOf(pos.edge) !== room) {
    return refuse(`\`${pos.edge}\` is an edge of another room, and a corner is named by two edges of one room`, [
      `Name the edge of "${room}" that meets \`${attach.wall}\` at the corner: \`at corner ${room}.<edge>\`.`,
    ]);
  }
  const end = runEndMet(edge, run);
  if (end === undefined) {
    return refuse(`\`${pos.edge}\` does not meet \`${attach.wall}\` at an end of it, so the two make no corner`, [
      room !== undefined && ctx.datums?.table.rings.has(room)
        ? "A polygon's side words name its outermost runs, which meet only at convex corners, so a re-entrant corner has no word: stand the windows clear of it with `at <mm> from <room>.<edge>`."
        : `Name an edge of "${room}" that crosses \`${attach.wall}\` at one of its ends.`,
    ]);
  }
  const along = run[end];
  const corner: Point = run.vertical ? { x: run.c, y: along } : { x: along, y: run.c };
  const across: Run = { vertical: edge.vertical, c: edge.c, r0: edge.lo, r1: edge.hi };
  const bodies = bodiesOn(run, ctx.walls);
  const facing = bodiesOn(across, ctx.walls);
  chargeSteps((bodies.length + facing.length) * ctx.walls.length);
  const endsThere = (p: Point): boolean => p.x === corner.x && p.y === corner.y;
  /** The one wall on `list` ending at the corner, or why there is none. */
  const wallOn = (list: readonly WallSegment[], name: string, line: Run): WallSegment | string => {
    const ending = list.filter((s) => endsThere(s.a) || endsThere(s.b));
    if (ending.length === 0) {
      const at = line.vertical ? corner.y : corner.x;
      const passes = list.some((s) => {
        const [lo, hi] = extent(s, line.vertical);
        return lo < at && at < hi;
      });
      return passes ? `the wall on \`${name}\` runs on past the corner` : `no wall on \`${name}\` reaches the corner`;
    }
    if (ending.length > 1) return `${ending.length} walls on \`${name}\` end at the corner`;
    const s = ending[0]!;
    const w = wallOfSeg(ctx.walls, s);
    if (s.category !== "exterior") return `the wall on \`${name}\` there is a ${s.category}`;
    return w?.status === "demolish" ? `the wall on \`${name}\` there is marked \`status demolish\`` : s;
  };
  const host = wallOn(bodies, attach.wall, run);
  if (typeof host === "string") return refuse(host, [CORNER_HINT]);
  const other = wallOn(facing, pos.edge, across);
  if (typeof other === "string") return refuse(other, [CORNER_HINT]);
  if (!(width > other.thickness)) {
    return refuse(
      `its ${numStr(width)} mm would end inside the ${numStr(other.thickness)} mm wall on \`${pos.edge}\`: \`width\` runs from the free jamb to that wall's outer face`,
      [`Make it wider than ${numStr(other.thickness)} mm.`],
    );
  }
  const walls = meetingWalls(ctx);
  chargeSteps(walls.segs.length + 1);
  const box = cornerBlock(corner, host, other);
  const third = walls.segs.find(
    (s) => !sameSeg(s, host) && !sameSeg(s, other) && s.thickness > 0 && standsInBlock(s, box),
  );
  if (third) {
    const w = wallOfSeg(ctx.walls, third);
    return refuse(`${w ? wallPhraseOf(w) : `wall "${third.wallId}"`} stands at the corner too`, [CORNER_HINT]);
  }
  const fit = hostFit(host, run, walls);
  const js = fit.js.filter((j) => !sameSeg(j.wall, other));
  const sign = end === "r1" ? 1 : -1;
  const outer = along + (sign * other.thickness) / 2;
  const c = outer - (sign * width) / 2;
  const under = bodiesUnder(bodies, c, width, run);
  if (under.length > 1) return refuse(`${under.length} walls lie on its span`, [ONE_WALL_HINT]);
  chargeSteps(2 * js.length + 1);
  const [lo, hi] = end === "r1" ? [fit.R0, outer] : [outer, fit.R1];
  const fault = nibFault(c, width, lo, hi, js, fit.need, false, run);
  if (fault) {
    const widest = widestLeg(outer, end, fit, js, other, ctx.grid, run);
    ctx.diag(
      nibRefusal(fault, host, fit.need, what, span, ctx, [
        widest === undefined
          ? `No width fits between that corner and the walls that meet \`${attach.wall}\`: move a wall, or take the window off the corner.`
          : `The widest window that fits is \`on ${attach.wall} at corner ${pos.edge} width ${numStr(widest)}\`.`,
      ]),
    );
    return null;
  }
  return {
    at: run.vertical ? { x: run.c, y: c } : { x: c, y: run.c },
    host,
    relation: relationOf({ edge: attach }),
    corner: { at: corner, other },
  };
}

/** The advice for a corner that is not one of two walls alone. */
const CORNER_HINT =
  "A window runs to a corner where two exterior walls end and nothing else stands: place it `at <mm> from <room>.<edge>` clear of the junction, or change the walls.";

/** The advice for a run that carries two walls where no position can tell them apart. */
const ONE_WALL_HINT =
  "Make it one wall on that line (remove the authored wall lying on the derived one, or join the pieces), or place the opening `on <wall> at …` on the wall you mean.";

/** The advice for an opening whose only wall is coming down: no position there would resolve. */
const DEMOLISHED_HINT =
  "That wall is marked `status demolish` and hosts nothing: host the opening on a wall that stays, or keep the wall.";

/** `3 wall runs (…)`: what a run carries, each wall named once. */
function wallRuns(bodies: readonly WallSegment[], phrase: (s: WallSegment) => string): string {
  const names = [...new Set(bodies.map((s) => phrase(s)))];
  return `${bodies.length} wall runs (${names.join(", ")}${names.length < bodies.length ? ", in pieces" : ""})`;
}

/** `x 2400–3600`: an opening's span along its run. */
const spanText = (c: number, width: number, run: Run): string =>
  `${alongText(run, c - width / 2)}–${numStr(c + width / 2)}`;

/** Where an opening landed on a run, and the words a refusal quotes it in. */
interface Landing {
  c: number;
  width: number;
  flushOk: boolean;
  kind: Kind;
  anchor: OnRun["anchor"];
  where: string;
  runWord: string;
  run: Run;
}

/** Why a span on a room's edge has no wall of its own, given the bodies it lies on. */
function landingText(
  under: readonly WallSegment[],
  { c, width, run }: Landing,
  phrase: (s: WallSegment) => string,
): string {
  const span = `its span ${spanText(c, width, run)}`;
  if (under.length === 0) return `${span} stands on none of them`;
  return under.length === 1
    ? `${span} stands on ${phrase(under[0]!)}, not on an exterior wall`
    : `${span} lies on ${under.length} of them`;
}

/**
 * The refusal of an opening on a room's edge with several walls, none of which takes its span. With
 * an exterior wall standing somewhere on the edge the position is what failed, so it is the
 * ambiguity and the hint quotes positions. With none, no position could help: it is the refusal one
 * partition gets. A wall is named for what it is: an `open between` boundary voided over its whole
 * span has nothing built along it, and a `status demolish` wall is on the sheet but hosts nothing.
 * Reading each wall's status is charged before the scan, and only on this path.
 */
function refusalOnEdge(
  bodies: readonly WallSegment[],
  under: readonly WallSegment[],
  landing: Landing,
  what: string,
  span: Span,
  ctx: RelationCtx,
): Diagnostic {
  chargeSteps(bodies.length * ctx.walls.length);
  const walls = meetingWalls(ctx);
  const phrase = (s: WallSegment): string => {
    const w = wallOfSeg(ctx.walls, s);
    if (!w) return `wall "${s.wallId}"`;
    if (w.status === "demolish") return `${wallPhraseOf(w)} (\`status demolish\`)`;
    return walls.voided.has(w.id) ? openBoundaryPhraseOf(w) : wallPhraseOf(w);
  };
  const standing = bodies.filter((s) => s.category === "exterior" && wallOfSeg(ctx.walls, s)?.status !== "demolish");
  const carries = wallRuns(bodies, phrase);
  const { where, runWord, kind } = landing;
  const one = under.length === 1 ? wallOfSeg(ctx.walls, under[0]!) : undefined;
  // `between` refuses an open pair whatever `width` left of the wall, and a demolished wall hosts nothing.
  const between =
    kind !== "window" && one !== undefined && one._derived?.open === undefined && one.status !== "demolish"
      ? ["Place it `between <room> and <room>` for an opening into the neighbouring room."]
      : [];
  if (standing.length === 0) {
    return {
      severity: "error",
      message: `${what} needs an exterior wall on \`${where}\`, but none stands there: the ${runWord} carries ${carries}`,
      code: "E_OPENING_NO_SHARED_WALL",
      span,
      hints: [`Use an edge of the room that faces outside.`, ...between],
    };
  }
  return {
    severity: "error",
    message: `${what} cannot tell which wall to stand in: the ${runWord} \`${where}\` names carries ${carries}, and ${landingText(under, landing, phrase)}`,
    code: "E_OPENING_HOST_AMBIGUOUS",
    span,
    hints: [...edgeHints(bodies, standing, landing, walls, ctx), ...between],
  };
}

/**
 * What to write for each exterior wall that stands on a room's edge: the nearest position in it alone.
 * The position is read through {@link hostFit} and the same check a placement gets, so a quoted one
 * resolves. Each body's scan is charged before it runs.
 */
function edgeHints(
  bodies: readonly WallSegment[],
  standing: readonly WallSegment[],
  { c, width, flushOk, where, runWord, anchor, run }: Landing,
  walls: ReturnType<typeof meetingWalls>,
  ctx: RelationCtx,
): string[] {
  const exteriors = [...standing].sort((p, q) => extent(p, run.vertical)[0] - extent(q, run.vertical)[0]);
  const fits: string[] = [];
  let doubled = false;
  for (const s of exteriors) {
    const { R0, R1, js, need } = hostFit(s, run, walls);
    const legal = nearestLegal(c, width, R0, R1, js, need, flushOk, ctx.grid, run);
    if (legal === undefined) continue;
    if (bodiesUnder(bodies, legal, width, run).length === 1) {
      const on = `${alongText(run, R0)}–${numStr(R1)}`;
      fits.push(`\`${where} at ${legalText(anchor, legal, run)}\` stands in the exterior wall on ${on}.`);
    } else doubled = true;
  }
  if (fits.length > 0) return fits;
  if (doubled) return [ONE_WALL_HINT];
  return [
    `No position along the ${runWord} \`${where}\` names fits a ${numStr(width)} mm opening with its nibs in an exterior wall: narrow it, or move a wall that meets the ${runWord}.`,
  ];
}

/** Why a span fails its nibs (a phrase builder, and whether it reads an open boundary, which has
 *  no face to name), or `null` when it passes. */
function nibFault(
  c: number,
  width: number,
  R0: number,
  R1: number,
  js: readonly JunctionSpan[],
  need: number,
  flushOk: boolean,
  run: Run,
): { say: (name: (j: JunctionSpan) => string) => string; atBoundary: boolean } | null {
  const lo = c - width / 2;
  const hi = c + width / 2;
  const span = spanText(c, width, run);
  if (lo < R0 - JUNCTION_EPS || hi > R1 + JUNCTION_EPS) {
    return {
      say: () =>
        `its span ${span} runs past the end of the wall it can stand in there (${alongText(run, R0)}–${numStr(R1)})`,
      atBoundary: false,
    };
  }
  for (const j of js) {
    if (j.lo < hi - JUNCTION_EPS && j.hi > lo + JUNCTION_EPS) {
      return {
        say: (name) =>
          j.boundary
            ? `${name(j)}${atFreeEnd(j) && `${atFreeEnd(j)},`} lies inside its span ${span}`
            : `${name(j)} stands inside its span ${span}`,
        atBoundary: j.boundary !== undefined,
      };
    }
  }
  for (const j of js) {
    const nib = j.hi <= lo + JUNCTION_EPS ? Math.max(0, lo - j.hi) : Math.max(0, j.lo - hi);
    if (nib < need - JUNCTION_EPS && !(flushOk && nib <= FLUSH_MM)) {
      return {
        say: (name) =>
          j.boundary
            ? `its span ${span} leaves a jamb ${numStr(nib)} mm from the edge of ${name(j)}${atFreeEnd(j)}`
            : `its span ${span} leaves a jamb ${numStr(nib)} mm from the face of ${name(j)}`,
        atBoundary: j.boundary !== undefined,
      };
    }
  }
  return null;
}

/**
 * The nearest centre (along the run) whose span clears every nib, on the grid the position
 * snaps to, or `undefined` when none does. Candidates: the span pushed just clear of each
 * keep-out (a run end, or a meeting wall grown by the nib), moved onto the grid away from the
 * written centre; each candidate is checked before it is quoted.
 */
function nearestLegal(
  c: number,
  width: number,
  R0: number,
  R1: number,
  js: readonly JunctionSpan[],
  need: number,
  flushOk: boolean,
  grid: number,
  run: Run,
): number | undefined {
  const w2 = width / 2;
  const raw = [R0 + w2, R1 - w2];
  for (const j of js) raw.push(j.hi + need + w2, j.lo - need - w2);
  chargeSteps(raw.length * (2 * js.length + 1) + 1);
  let best: number | undefined;
  for (const t of raw) {
    const s = grid > 0 ? (t >= c ? Math.ceil(t / grid) : Math.floor(t / grid)) * grid : t;
    if (nibFault(s, width, R0, R1, js, need, flushOk, run)) continue;
    if (
      best === undefined ||
      Math.abs(s - c) < Math.abs(best - c) ||
      (Math.abs(s - c) === Math.abs(best - c) && s < best)
    ) {
      best = s;
    }
  }
  return best;
}

/** A legal centre, as an offset from the end the author measured from (`start` when the
 *  position named no end: `center`, an axis). */
function legalText(anchor: OnRun["anchor"], t: number, run: Run): string {
  return `${numStr(anchor.end === "r0" ? t - run.r0 : run.r1 - t)} from ${anchor.word}`;
}
