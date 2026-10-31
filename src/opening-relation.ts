/**
 * Openings by relation (ADR 0028 §5): where a `door|window|opening` stands when its position
 * is written against the rooms rather than against a wall.
 *
 * - `between <A> and <B> [at <pos>]` (door, cased opening): the one wall body on the shared
 *   edge run of two rooms, rectangular or rectilinear, derived or authored, at a position
 *   measured along that run. A polygon can share several runs with a room: the position then
 *   has to pick one, which only `<mm> from <room>.<edge>` can, and any other is refused.
 * - `on <room>.<edge> [at <pos>]` (door, window, cased opening): the one EXTERIOR wall body on
 *   that edge of the room, at a position measured along the edge.
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
 */

import type { AttachPos, OpeningAttach, OpeningBetween, Point, WallsPairRoom } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { chargeSteps } from "./expr.js";
import type { Expr } from "./expr.js";
import { segmentsOfWall, type WallSegment } from "./geometry.js";
import type { OpeningRelation, RWall } from "./ir.js";
import { fmt3 as numStr } from "./num-format.js";
import {
  atFreeEnd,
  FLUSH_MM,
  JUNCTION_EPS,
  JUNCTION_NIB_DEFAULTS,
  type JunctionSpan,
  openBoundaryIds,
  standingJunctionSpans,
} from "./opening-junctions.js";
import type { DatumTable, RoomDatums } from "./room-datums.js";
import { COMPASS_DATUM_ALIASES, splitDatum } from "./room-datums.js";
import {
  pickAt,
  ringParts,
  type RunLine,
  type RunPick,
  runEndMet,
  runPicks,
  runText,
  sharedRuns,
  type TileRoom,
} from "./room-tiling.js";
import { attachPosStr } from "./statement-print.js";
import { openBoundaryPhraseOf, wallPhraseOf } from "./wall-ref.js";

/** The four edge words, and the line each lies on. */
type EdgeWord = "top" | "bottom" | "left" | "right";

/** A straight axis-aligned line `x = c` (`vertical`) or `y = c`, with an extent on it. */
export interface EdgeLine {
  vertical: boolean;
  c: number;
  lo: number;
  hi: number;
}

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

const EDGE_OF: Record<EdgeWord, (r: RoomDatums) => EdgeLine> = {
  top: (r) => ({ vertical: false, c: r.top, lo: r.left, hi: r.right }),
  bottom: (r) => ({ vertical: false, c: r.bottom, lo: r.left, hi: r.right }),
  left: (r) => ({ vertical: true, c: r.left, lo: r.top, hi: r.bottom }),
  right: (r) => ({ vertical: true, c: r.right, lo: r.top, hi: r.bottom }),
};

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
    const l = d ? lines(d.room) : undefined;
    return l && word && word in EDGE_OF ? EDGE_OF[word as EdgeWord](l) : undefined;
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
  const word = (COMPASS_DATUM_ALIASES[d.word] ?? d.word) as EdgeWord | "cx" | "cy";
  if (word === "cx" || word === "cy") {
    ctx.diag(
      datumDiag(
        `${what} is measured from \`${name}\`, a room's centre line, not an edge: an offset runs from a room edge or an end of the run`,
        span,
      ),
    );
    return undefined;
  }
  const lines = access.table.rooms.get(d.room)!;
  return EDGE_OF[word](lines);
}

const datumDiag = (message: string, span: Span | undefined): Diagnostic => ({
  severity: "error",
  message,
  code: "E_OPENING_DATUM",
  ...(span ? { span } : {}),
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
  // through the group's own reader, on the room's name. A shape it refuses is said in this line's
  // words: the `.top` it reads to get there is no word the author wrote.
  const reword = (d: Diagnostic): Diagnostic => {
    if (d.code !== "E_ROOM_NOT_RECTANGLE") return d;
    const circle = ctx.datums?.table.refused.get(room.id) === "circle";
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
    ctx.diag({
      severity: "error",
      message: `${what} names "${room.id}", which is not a room this plan or component can see`,
      code: "E_UNKNOWN_REF",
      span: room.span,
    });
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

/** A room of a pair as {@link runPicks} reads it: only a rectangle has edge words. */
const edgesOf = (id: string, r: PairRoom): TileRoom =>
  "ring" in r ? { id, shape: "polygon" } : { id, rect: rectOf(r) };

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
          `${what} is placed \`at ${posText(pos)}\`, which names no datum: along a ${runWord} write \`at <mm> from start|end\`, \`at <mm> from <room>.<edge>\`, \`at axis <label>\` or \`at center\``,
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
    case "from": {
      const v = ctx.eval(pos.value);
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
  if (bodies.length > 1) {
    const names = [...new Set(bodies.map((s) => phrase(s)))];
    ctx.diag({
      severity: "error",
      message: `${what} cannot tell which wall to stand in: the ${runWord} \`${where}\` names carries ${bodies.length} wall runs (${names.join(", ")}${names.length < bodies.length ? ", in pieces" : ""})`,
      code: "E_OPENING_HOST_AMBIGUOUS",
      span,
      hints: [
        "Make it one wall on that line (remove the authored wall lying on the derived one, or join the pieces), or place the opening `on <wall> at …` on the wall you mean.",
      ],
    });
    return null;
  }
  const host = bodies[0]!;
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
  // The position, snapped as every coordinate is (ADR 0004), then judged where it lands.
  const at = ctx.snapPt(run.vertical ? { x: run.c, y: centre } : { x: centre, y: run.c });
  const c = run.vertical ? at.y : at.x;
  const [bl, bh] = extent(host, run.vertical);
  const R0 = Math.max(run.r0, bl);
  const R1 = Math.min(run.r1, bh);
  // The meeting walls, by the lint's own measure, in run coordinates.
  const segs = ctx.walls.flatMap((w) => segmentsOfWall(w));
  chargeSteps(segs.length + 1);
  const voided = openBoundaryIds(ctx.walls);
  if (voided.size > 0) chargeSteps(2 * segs.length); // a scan past each end of the host
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
  const flushOk = kind === "opening";
  const fault = nibFault(c, width, R0, R1, js, need, flushOk, run);
  if (fault) {
    const legal = nearestLegal(c, width, R0, R1, js, need, flushOk, ctx.grid, run);
    const boundaryPhrase = (s: WallSegment): string => {
      const w = wallOfSeg(ctx.walls, s);
      return w ? openBoundaryPhraseOf(w) : `wall "${s.wallId}"`;
    };
    const name = (j: JunctionSpan): string => (j.boundary ? boundaryPhrase(j.wall) : phrase(j.wall));
    const measure = fault.atBoundary ? "that edge" : "a meeting wall's face";
    ctx.diag({
      severity: "error",
      message: `${what} is refused, not moved: ${fault.say(name)}. A jamb needs at least ${numStr(need)} mm of wall to ${measure} (the larger of ${numStr(JUNCTION_NIB_DEFAULTS.minJunctionNibMm)} mm and half the ${numStr(host.thickness)} mm wall)`,
      code: "E_OPENING_NIB",
      span,
      hints: [
        legal === undefined
          ? `No position along the ${runWord} \`${where}\` names fits a ${numStr(width)} mm opening with its nibs: narrow it, or move a wall that meets the ${runWord}.`
          : `The nearest legal position is \`${where} at ${legalText(placed.anchor, legal, run)}\` (centre at ${alongText(run, legal)}).`,
      ],
    });
    return null;
  }
  return { at, host, relation };
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
  const span = `${alongText(run, lo)}–${numStr(hi)}`;
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
