/**
 * `walls from rooms exterior <t_ext> partition <t_int> [{ except <room> … }]` — derive the
 * whole wall set of a group from its rooms (ADR 0028 §3, plan decision D5).
 *
 * One statement per group (the root storey, or one `place`d component). It reads the rooms
 * the group itself declares, never a descendant's (ADR 0016), and derives the exterior ring
 * on the outline of their union (a second, counter-clockwise ring round a courtyard covered
 * exactly by `outdoor` surfaces; nothing round a hole covered by a `void`) and one partition
 * on every shared edge run of two rooms. A room is a rectangle or a rectilinear polygon; any
 * other room is refused or left out. The derivation itself is `src/room-tiling.ts`; this module
 * turns its runs into walls and its refusals into diagnostics naming the rooms.
 *
 * The statement draws nothing itself. Its derived walls join the group's wall list the moment
 * it resolves (`ElementDef.yieldsWalls`, which also moves the group's resolve order: rooms,
 * the hole covers, the authored walls, then this statement, then the openings), and from
 * there `ResolvedPlan.walls`: they are drawn, hosted on, measured and reported like any wall,
 * but they are never `elements`, have no author-facing id, and carry `_derived`.
 *
 * An authored wall lying exactly on a derived line wins over the shared span (coexistence);
 * the drop is reported in `describe().derived_walls[]`.
 */

import type { Point, WallsFromRoomsNode, WallsPairClause, WallsPairRoom } from "../ast.js";
import type { Expr } from "../expr.js";
import type { ElementDef, ParseCtx, ResolveCtx, TransformCtx } from "../registry.js";
import type { DerivedWallRow, ROpening, ROutdoor, RRoom, RVoid, RWall, RWallsFromRooms } from "../ir.js";
import { DEFAULT_MATERIAL } from "../hatches.js";
import { segmentsOfWall } from "../geometry.js";
import { fmt3 as numStr } from "../num-format.js";
import { JUNCTION_NIB_DEFAULTS } from "../opening-junctions.js";
import {
  deriveWallsFromRooms,
  rectilinear,
  ringParts,
  runMiddle,
  type RunPick,
  type TileCover,
  type TilePair,
  type TileRoom,
  type TileWallSeg,
} from "../room-tiling.js";
import { opening } from "./opening.js";
import { parseWallStatus, wall } from "./wall.js";

/** The words that lead a clause of the statement's body. */
const BODY_CLAUSES = ["except", "open", "between"] as const;

export const wallsFromRooms: ElementDef = {
  kind: "walls",
  keyword: "walls",
  doc: "Derive every wall of this group from its rooms: the exterior ring on their outline, a partition on each shared edge.",
  params: [
    { name: "exterior", type: "number", doc: "Thickness of the derived exterior ring, in mm." },
    { name: "partition", type: "number", doc: "Thickness of every derived partition, in mm." },
    {
      name: "except",
      type: "room…",
      optional: true,
      doc: "Rooms left out of the derivation (a terrace, a slanted polygon or circle room).",
    },
  ],

  parse(ctx: ParseCtx): WallsFromRoomsNode {
    const kw = ctx.eatKeyword("walls");
    ctx.eatKeyword("from");
    ctx.eatKeyword("rooms");
    ctx.eatKeyword("exterior");
    const exterior = ctx.parseExpr();
    ctx.eatKeyword("partition");
    const partition = ctx.parseExpr();
    // `status <s>` (preview-and-remodel B3a): every wall the statement derives takes it.
    const status = parseWallStatus(ctx);
    const except: WallsFromRoomsNode["except"] = [];
    let pairs: WallsPairClause[] | undefined;
    if (ctx.isType("lcurly")) {
      ctx.next();
      while (!ctx.isType("rcurly") && !ctx.isType("eof")) {
        if (ctx.isKeyword("except")) {
          const ex = ctx.next();
          if (!ctx.isType("ident") || (BODY_CLAUSES as readonly string[]).includes(ctx.peek().value)) {
            ctx.fail("`except` needs at least one room id", ex);
          }
          while (ctx.isType("ident") && !(BODY_CLAUSES as readonly string[]).includes(ctx.peek().value)) {
            const t = ctx.next();
            except.push({ id: t.value, span: { start: t.start, end: t.end } });
          }
          continue;
        }
        if (ctx.isKeyword("open") || ctx.isKeyword("between")) {
          if (pairs === undefined) pairs = [];
          pairs.push(parsePair(ctx));
          continue;
        }
        const t = ctx.peek();
        ctx.fail(
          `Expected "except", "open" or "between" in the \`walls from rooms\` body but found ${t.type === "eof" ? "end of input" : `"${t.value}"`}`,
        );
      }
      ctx.eat("rcurly");
    }
    return {
      kind: "walls",
      id: "",
      exterior,
      partition,
      except,
      ...(pairs ? { pairs } : {}),
      ...(status !== undefined ? { status } : {}),
      line: kw.line,
    };
  },

  idPrefix: () => "walls",

  resolve(node, ctx: ResolveCtx): RWallsFromRooms {
    const n = node as WallsFromRoomsNode;
    const thick = (e: WallsFromRoomsNode["exterior"], what: string, span = n.span): number => {
      const v = ctx.eval(e);
      const t = ctx.snap(v) || v;
      if (!(t > 0)) {
        ctx.diag({
          severity: "error",
          message: `\`walls from rooms\` needs a positive ${what} thickness`,
          code: "E_WALL_THICKNESS",
          span,
        });
      }
      return t;
    };
    const tExt = thick(n.exterior, "exterior");
    const tInt = thick(n.partition, "partition");
    const out: RWallsFromRooms = {
      kind: "walls",
      id: ctx.id,
      exterior: tExt,
      partition: tInt,
      except: n.except.map((x) => x.id),
      _derivedWalls: [],
      _derivedRows: [],
      _derivedOpenings: [],
      span: n.span,
      ...(n.status !== undefined ? { status: n.status } : {}),
    };
    const own = ctx.group?.() ?? [];
    if (own.some((e) => e.kind === "walls")) {
      ctx.diag({
        severity: "error",
        message:
          "A group may hold one `walls from rooms` statement: the first one already derives every wall of these rooms, so this one derives nothing",
        code: "E_WALLS_FROM_ROOMS_DUP",
        span: n.span,
      });
      return out;
    }
    const rooms = own.filter((e): e is RRoom => e.kind === "room" && e._unplaced !== true);
    const roomIds = new Set(rooms.map((r) => r.id));
    for (const x of n.except) {
      if (roomIds.has(x.id)) continue;
      ctx.diag({
        severity: "error",
        message: `\`except ${x.id}\` names no room written beside it: \`walls from rooms\` derives from the rooms of the plan or component it is written in, so only those can be left out`,
        code: "E_WALL_BETWEEN_ROOM",
        span: x.span,
      });
    }
    const excluded = new Set(n.except.map((x) => x.id));
    // A rectilinear room that reported its own ring has no floor to derive from, so it is out of
    // the set, quietly: the plan already says why, and the gap it leaves is that error, not a
    // second one. A slanted ring stays in, and is refused as any slanted polygon is.
    const broken = new Set(
      rooms.filter((r) => r._ringRefused && !excluded.has(r.id) && rectilinear(r.poly!)).map((r) => r.id),
    );
    const { pairs, clauses, bad } = resolvePairs(n, rooms, excluded, broken, ctx);
    if (pairs.length > 0) {
      out.pairs = pairs.map((p, k) =>
        p.kind === "open"
          ? {
              kind: "open",
              between: [p.a, p.b],
              ...(clauses[k]!.kind === "open" && clauses[k]!.id ? { id: clauses[k]!.id!.id } : {}),
              ...(p.width !== undefined ? { width: p.width } : {}),
            }
          : { kind: "thickness", between: [p.a, p.b], thickness: p.thickness },
      );
    }
    if (!(tExt > 0) || !(tInt > 0)) return out;
    const set: TileRoom[] = rooms.filter((r) => !excluded.has(r.id) && !broken.has(r.id)).map(tileRoom);
    if (set.length === 0) {
      if (broken.size > 0) return out;
      ctx.diag({
        severity: "error",
        message:
          rooms.length === 0
            ? "`walls from rooms` has no room to derive walls from: no room is written beside it in this plan or component"
            : "`walls from rooms` has no room to derive walls from: `except` leaves out every room written beside it",
        code: "E_WALLS_FROM_NO_ROOMS",
        span: n.span,
      });
      return out;
    }
    const covers: TileCover[] = own.flatMap((e): TileCover[] => {
      if (e.kind === "void") return [coverOfVoid(e)];
      if (e.kind === "outdoor") return [coverOfOutdoor(e)];
      return [];
    });
    const authored: TileWallSeg[] = own.flatMap((e) =>
      e.kind === "wall"
        ? segmentsOfWall(e).flatMap((s) => (s.arc ? [] : [{ a: s.a, b: s.b, wallId: e.id, thickness: e.thickness }]))
        : [],
    );
    const res = deriveWallsFromRooms(set, covers, authored, tInt, ctx.elementBudget, { tExt, pairs });
    if (!res.ok) {
      for (const r of res.refusals) {
        if (broken.size > 0 && r.code === "E_ROOMS_NOT_TILING") continue;
        const clause = r.clause === undefined ? undefined : clauses[r.clause]!;
        const onEdge = r.picks ? openOneEdge(r.picks, r.clause!, clauses, pairs, tExt, tInt, ctx.grid) : [];
        ctx.diag({ severity: "error", ...refusalText(r, onEdge), code: r.code, span: clause?.span ?? n.span });
      }
      return out;
    }
    // A clause the statement refused above (a room it cannot name, a pair named twice, a
    // thickness or width that is not positive) derives nothing: the plan is already an error.
    if (bad) return out;
    for (const spec of res.walls) {
      out._derivedRows.push({
        from: "rooms",
        name: spec.name,
        ...(spec.between ? { between: spec.between } : {}),
        ...(spec.dropped.length > 0 ? { dropped: spec.dropped } : {}),
      });
      for (const piece of spec.pieces) {
        const w: RWall = {
          kind: "wall",
          id: piece.name,
          category: spec.role,
          thickness: spec.role === "exterior" ? tExt : (spec.thickness ?? tInt),
          material: DEFAULT_MATERIAL,
          hatchScale: 1,
          hatchAngle: 0,
          height: ctx.storeyHeight,
          points: piece.points,
          closed: piece.closed,
          openings: [],
          span: n.span,
          ...(n.status !== undefined ? { status: n.status } : {}),
          _idAuthored: false,
          _derived: {
            from: "rooms",
            ...(spec.ring ? { ring: spec.ring } : {}),
            ...(spec.between ? { between: spec.between } : {}),
            ...(spec.open
              ? {
                  open: {
                    span: clauses[spec.open.clause]!.span,
                    ...(spec.open.whole ? { whole: true as const } : {}),
                  },
                }
              : {}),
          },
        };
        out._derivedWalls.push(w);
        // The opening an `open between` clause voids the run with: hosted on the run (whole,
        // since an authored wall on an open run is refused), across its clear span.
        if (spec.open && piece.name === spec.name) {
          const clause = clauses[spec.open.clause] as Extract<WallsPairClause, { kind: "open" }>;
          out._derivedOpenings.push({
            kind: "opening",
            id: clause.id?.id ?? `${spec.name}:open`,
            at: spec.open.at,
            width: spec.open.width,
            host: segmentsOfWall(w)[0]!,
            head: w.height,
            span: clause.span,
            _derived: {
              from: "rooms",
              between: spec.between!,
              idAuthored: clause.id !== undefined,
              written: [clause.a.id, clause.b.id],
            },
          });
        }
      }
    }
    return out;
  },

  /** The openings `open between` derives: ordinary openings, entered in the plan's elements
   *  right after the statement (`ElementDef.yieldsElements`). */
  yieldsElements: (resolved) => (resolved as RWallsFromRooms)._derivedOpenings,
  authoredChildIds: (node) =>
    ((node as WallsFromRoomsNode).pairs ?? []).flatMap((c) => (c.kind === "open" && c.id ? [c.id] : [])),

  /** An authored door, window or opening hosted by position on the span an `open between`
   *  clause voids would close what the clause opened: refused, on the clause
   *  (`E_WALL_BETWEEN_OPEN`). One beside it, on the partition a `width` leaves, is fine. */
  auditGroup(resolved, own, diag): void {
    const s = resolved as RWallsFromRooms;
    if (s._derivedOpenings.length === 0) return;
    const byWall = new Map(s._derivedOpenings.map((o) => [o.host!.wallId, o]));
    for (const e of own) {
      if (e.kind !== "door" && e.kind !== "window" && e.kind !== "opening") continue;
      const o = e.host ? byWall.get(e.host.wallId) : undefined;
      if (!o) continue;
      // Only over the voided span: the partition a `width` leaves beside it is ordinary wall,
      // and a jamb touching the opening's is allowed (positive overlap, exactly).
      const vertical = o.host!.a.x === o.host!.b.x;
      const along = (p: Point): number => (vertical ? p.y : p.x);
      const lo = Math.max(along(o.at) - o.width / 2, along(e.at) - e.width / 2);
      const hi = Math.min(along(o.at) + o.width / 2, along(e.at) + e.width / 2);
      if (!(hi > lo)) continue;
      const [a, b] = o._derived!.between;
      diag({
        severity: "error",
        message: `\`walls from rooms\` cannot open the pair: ${e.kind} "${e.id}" stands on the edge "${a}" and "${b}" share, which the clause declares open`,
        code: "E_WALL_BETWEEN_OPEN",
        span: o.span,
        ...(e.span ? { relatedSpans: [{ span: e.span, message: `the ${e.kind} on the open edge` }] } : {}),
        hints: [
          `Remove the ${e.kind} (the edge is already open), or remove the \`open between\` clause and keep the wall with the ${e.kind} in it.`,
        ],
      });
    }
  },

  yieldsWalls: (resolved) => (resolved as RWallsFromRooms)._derivedWalls,
  dependsOn: ["void", "outdoor"],
  // `A|B`, `exterior#2` and the `~n` runs cannot be spelled by an identifier; `exterior` can.
  reservedIds: ["exterior"],

  /** Every derived wall's drawn band: the page must contain what the walls draw. */
  bounds(resolved): Point[] {
    return (resolved as RWallsFromRooms)._derivedWalls.flatMap((w) => wall.bounds(w));
  },

  /** The two thicknesses and every derived wall's own measures. */
  measures(resolved): number[] {
    const s = resolved as RWallsFromRooms;
    return [s.exterior, s.partition, ...s._derivedWalls.flatMap((w) => wall.measures!(w))];
  },

  /** Each derived wall as a wall costs (`wall.drawCost`, 2); the statement draws nothing else. */
  drawCost: (resolved) => 2 * (resolved as RWallsFromRooms)._derivedWalls.length,

  /** Nothing: the derived walls are drawn with every other wall, from `ResolvedPlan.walls`. */
  render: () => [],

  /** The frame's action: each derived wall rides as a wall, its name namespaced. */
  transform(resolved, t: TransformCtx): RWallsFromRooms {
    const s = resolved as RWallsFromRooms;
    const f = t.frame as { prefix?: string; component?: string };
    return {
      ...s,
      id: t.id,
      _derivedWalls: s._derivedWalls.map((w) => {
        const moved = wall.transform!(w, { ...t, id: t.nsId(w.id) }) as RWall;
        // The rooms it stands between are named as the plan names them (`west.a`).
        if (w._derived?.between) {
          moved._derived = { ...w._derived, between: [t.nsId(w._derived.between[0]), t.nsId(w._derived.between[1])] };
        }
        if (f.prefix !== undefined) moved._instance = f.prefix;
        if (f.component !== undefined) moved._component = f.component;
        return moved;
      }),
      _derivedRows: s._derivedRows.map((r): DerivedWallRow => {
        const row: DerivedWallRow = { ...r, name: t.nsId(r.name) };
        if (r.between) row.between = [t.nsId(r.between[0]), t.nsId(r.between[1])];
        if (r.dropped) {
          row.dropped = r.dropped.map((d) => {
            const a = t.point({ x: d.x1, y: d.y1 });
            const b = t.point({ x: d.x2, y: d.y2 });
            return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, by: t.nsId(d.by) };
          });
        }
        return row;
      }),
      _derivedOpenings: s._derivedOpenings.map((o) => {
        const moved = opening.transform!(o, { ...t, id: t.nsId(o.id) }) as ROpening;
        moved._derived = { ...o._derived!, between: [t.nsId(o._derived!.between[0]), t.nsId(o._derived!.between[1])] };
        if (f.prefix !== undefined) moved._instance = f.prefix;
        if (f.component !== undefined) moved._component = f.component;
        return moved;
      }),
    };
  },
};

/** `open [id=<name>] between <A> and <B> [width <mm>]` or `between <A> and <B> thickness <mm>`. */
function parsePair(ctx: ParseCtx): WallsPairClause {
  const first = ctx.peek();
  let id: { id: string; span: { start: number; end: number } } | undefined;
  const open = ctx.isKeyword("open");
  if (open) {
    ctx.next();
    const name = ctx.parseIdOpt();
    if (name) {
      const t = ctx.peek(-1);
      id = { id: name, span: { start: t.start, end: t.end } };
    }
  }
  ctx.eatKeyword("between");
  const room = (): WallsPairRoom => {
    const t = ctx.eatIdent();
    return { id: t.value, span: { start: t.start, end: t.end } };
  };
  const a = room();
  ctx.eatKeyword("and");
  const b = room();
  const span = (): { start: number; end: number } => ({ start: first.start, end: ctx.peek(-1).end });
  if (open) {
    let width: Expr | undefined;
    if (ctx.isKeyword("width")) {
      ctx.next();
      width = ctx.parseExpr();
    }
    return { kind: "open", ...(id ? { id } : {}), a, b, ...(width ? { width } : {}), span: span() };
  }
  ctx.eatKeyword("thickness");
  const thickness = ctx.parseExpr();
  return { kind: "thickness", a, b, thickness, span: span() };
}

/**
 * The statement's pair clauses, checked and evaluated in source order: each must name two
 * rectangular or rectilinear rooms of the derivation (`E_WALL_BETWEEN_ROOM`, on the name) and no
 * pair twice (`E_WALL_BETWEEN_DUP`, on the later clause); a thickness is judged as a wall's is
 * (`E_WALL_THICKNESS`), a width as an opening's (`E_OPENING_WIDTH`). Returns the clauses that
 * passed, as the derivation reads them, beside their source clauses; `bad` when any failed.
 */
function resolvePairs(
  n: WallsFromRoomsNode,
  rooms: readonly RRoom[],
  excluded: ReadonlySet<string>,
  broken: ReadonlySet<string>,
  ctx: ResolveCtx,
): { pairs: TilePair[]; clauses: WallsPairClause[]; bad: boolean } {
  const pairs: TilePair[] = [];
  const clauses: WallsPairClause[] = [];
  let bad = false;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  // Decided once per room: a clause may name one many times.
  const slanted = n.pairs
    ? new Set(rooms.filter((r) => r.poly && !r.circle && !rectilinear(r.poly)).map((r) => r.id))
    : null;
  const seen = new Set<string>();
  for (const c of n.pairs ?? []) {
    let ok = true;
    const word = c.kind === "open" ? "open between" : "between";
    for (const x of [c.a, c.b]) {
      // Refused already, on the room: the clause cannot act, and has nothing to add.
      if (broken.has(x.id)) {
        ok = false;
        continue;
      }
      const r = byId.get(x.id);
      const why = !r
        ? "names no room written beside it: a clause names rooms of the plan or component the statement is written in"
        : r.circle || slanted?.has(x.id)
          ? `is a ${r.circle ? "circle room" : "polygon room with an edge that is neither horizontal nor vertical"}: only rectangular and rectilinear rooms share an edge run`
          : excluded.has(x.id)
            ? "is left out by `except`, so no wall is derived round it"
            : undefined;
      if (why === undefined) continue;
      ok = false;
      ctx.diag({
        severity: "error",
        message: `\`${word} ${c.a.id} and ${c.b.id}\` cannot name "${x.id}": it ${why}`,
        code: "E_WALL_BETWEEN_ROOM",
        span: x.span,
      });
    }
    const key = JSON.stringify([c.a.id, c.b.id].sort());
    if (seen.has(key)) {
      ok = false;
      ctx.diag({
        severity: "error",
        message: `"${c.a.id}" and "${c.b.id}" are already named by an earlier clause of this \`walls from rooms\`: a pair takes one clause, \`open between\` or \`between … thickness\``,
        code: "E_WALL_BETWEEN_DUP",
        span: c.span,
      });
    }
    seen.add(key);
    if (c.kind === "thickness") {
      const v = ctx.eval(c.thickness);
      const t = ctx.snap(v) || v;
      if (!(t > 0)) {
        ok = false;
        ctx.diag({
          severity: "error",
          message: `\`between ${c.a.id} and ${c.b.id} thickness\` needs a positive thickness`,
          code: "E_WALL_THICKNESS",
          span: c.span,
        });
      }
      if (ok) pairs.push({ kind: "thickness", a: c.a.id, b: c.b.id, thickness: t });
    } else {
      let width: number | undefined;
      if (c.width) {
        const v = ctx.eval(c.width);
        width = ctx.snap(v) || v;
        if (!(width > 0)) {
          ok = false;
          ctx.diag({
            severity: "error",
            message: `\`open between ${c.a.id} and ${c.b.id} width\` needs a positive width`,
            code: "E_OPENING_WIDTH",
            span: c.span,
          });
        }
      }
      if (ok) pairs.push({ kind: "open", a: c.a.id, b: c.b.id, ...(width !== undefined ? { width } : {}) });
    }
    if (ok) clauses.push(c);
    else bad = true;
  }
  return { pairs, clauses, bad };
}

/** A room as the derivation reads it. A circle's `poly` is its 48-gon: never read as a ring here. */
function tileRoom(r: RRoom): TileRoom {
  if (r.circle) return { id: r.id, shape: "circle" };
  if (!r.poly) return { id: r.id, rect: { x0: r.at.x, y0: r.at.y, x1: r.at.x + r.size.w, y1: r.at.y + r.size.h } };
  const parts = ringParts(r.poly);
  return parts ? { id: r.id, parts } : { id: r.id, shape: "polygon" };
}

function coverOfVoid(v: RVoid): TileCover {
  return { kind: "void", rect: { x0: v.at.x, y0: v.at.y, x1: v.at.x + v.size.w, y1: v.at.y + v.size.h } };
}

function coverOfOutdoor(o: ROutdoor): TileCover {
  if (o.poly) return { kind: "outdoor", poly: o.poly };
  return { kind: "outdoor", rect: { x0: o.at.x, y0: o.at.y, x1: o.at.x + o.size.w, y1: o.at.y + o.size.h } };
}

/**
 * What opens one edge of a pair an `open` clause cannot, one statement per run, ready to paste
 * once the clause is gone. Its width keeps a nib at each end whatever meets the run there: half
 * the thickest wall the statement can derive, plus the nib a relational opening needs. A
 * statement with no room for that says `width <mm>`.
 */
function openOneEdge(
  picks: readonly RunPick[],
  k: number,
  clauses: readonly WallsPairClause[],
  pairs: readonly TilePair[],
  tExt: number,
  tInt: number,
  grid: number,
): string[] {
  const { id, a, b } = clauses[k] as Extract<WallsPairClause, { kind: "open" }>;
  const written = pairs[k]!.kind === "open" ? (pairs[k] as Extract<TilePair, { kind: "open" }>).width : undefined;
  const name = id?.id ?? "o";
  let thickest = Math.max(tExt, tInt);
  for (const p of pairs) if (p.kind === "thickness") thickest = Math.max(thickest, p.thickness);
  const { minJunctionNibMm, junctionNibThicknessRatio } = JUNCTION_NIB_DEFAULTS;
  const nib = Math.max(minJunctionNibMm, tInt * junctionNibThicknessRatio);
  return picks.map(({ run, from }) => {
    const length = run.r1 - run.r0;
    const fits = length - thickest - 2 * nib;
    const wide = written ?? (grid > 0 ? Math.floor(fits / grid) * grid : fits);
    const width = wide > 0 ? numStr(wide) : "<mm>";
    return from
      ? `opening id=${name} between ${a.id} and ${b.id} at ${numStr(length / 2)} from ${from} width ${width}`
      : `opening id=${name} at ${runMiddle(run)} width ${width}`;
  });
}

/** A refusal in words: what is refused, the rooms, and what to do. */
function refusalText(
  r: { code: string; rooms: string[]; why: string },
  onEdge: readonly string[],
): { message: string; hints: string[] } {
  switch (r.code) {
    case "E_ROOM_NOT_RECTANGLE":
      return {
        message: `\`walls from rooms\` derives walls from rectangular or rectilinear rooms only: ${r.why}`,
        hints: [
          `Leave the room out with \`except ${r.rooms.join(" ")}\` and draw its walls by hand, or split it into rectangles.`,
        ],
      };
    case "E_ROOMS_OVERLAP":
      return {
        message: `\`walls from rooms\` cannot derive walls between rooms that overlap: ${r.why}`,
        hints: ["Move or resize the rooms so they meet edge to edge; a shared edge becomes the partition."],
      };
    case "E_ROOMS_NOT_TILING":
      return {
        message: `\`walls from rooms\` needs the rooms to tile one connected floor: ${r.why}`,
        hints: [
          "Write the leftover floor (a corridor, a lobby) as a room of its own, so every part of the floor belongs to a room and the rooms meet edge to edge.",
        ],
      };
    case "E_ELEMENT_LIMIT":
      return {
        message: `Plan expands past its element budget: \`walls from rooms\` derives none, because ${r.why}`,
        hints: [
          "Remove the short authored walls lying on the derived lines, or write those walls by hand without the statement.",
        ],
      };
    case "E_WALL_BETWEEN_NOT_ADJACENT":
      return {
        message: `\`walls from rooms\` cannot apply the clause: ${r.why}`,
        hints: ["Name two rooms that meet along an edge, or remove the clause."],
      };
    case "E_WALL_BETWEEN_OPEN":
      return {
        message: `\`walls from rooms\` cannot open the pair: ${r.why}`,
        hints: [
          "Remove the authored wall (or the door, window or opening on that edge), or remove the `open between` clause and keep the wall.",
        ],
      };
    case "E_OPENING_HOST_AMBIGUOUS":
      return {
        message: `\`walls from rooms\` cannot open the pair: ${r.why}`,
        hints: [
          "If no boundary should stand between them, write the two rooms as one room.",
          ...onEdge.map((s, k) => `To open edge ${k + 1}, remove the clause and write \`${s}\`.`),
        ],
      };
    case "E_WALL_BETWEEN_WIDTH":
      return {
        message: `\`walls from rooms\` cannot derive the opening: ${r.why}`,
        hints: ["Give a `width` no larger than the clear span, or leave `width` out to open the whole clear span."],
      };
    default:
      return {
        message: `\`walls from rooms\` cannot fit a partition on a shared edge shorter than its thickness: ${r.why}`,
        hints: ["Line the rooms' edges up, or make the shared edge at least as long as the partition is thick."],
      };
  }
}
