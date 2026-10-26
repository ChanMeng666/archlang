/**
 * Furniture placement rules: physical collisions (piece↔piece, piece↔wall),
 * frontal clearance, floating wall-fixtures, and `in <room>` drift. One rule per
 * export so each is individually testable; their relative order is fixed by
 * `rules/index.ts`.
 */

import { isDerivedWall, wallRef } from "../../wall-ref.js";
import {
  backCandidateEdges,
  backedEdgeList,
  backEdgeForRotate,
  frontClearanceRect,
  isAgainstWall,
  rectInRoomBox,
  rectOf,
  rotateForBackEdge,
  type RectEdge,
  wallBackedEdges,
} from "../../analyze.js";
import { actOnQuarterTurn, type D4, inverse } from "../../algebra/d4.js";
import type { Diagnostic } from "../../diagnostics.js";
import { type BBox, doorLandingRect, rectsOverlap, wallIntrusionDepth } from "../../geometry/rect.js";
import { doorSwing } from "../../geometry.js";
import type { WallSegment } from "../../geometry.js";
import type { RFurniture } from "../../ir.js";
import { pointInPolygon } from "../../geometry/polygon.js";
import { fmt2 } from "../../num-format.js";
import { fixesFrom, fixtureRotateFix } from "../../fix-producers.js";
import {
  cutPlaneLayer,
  defaultFootprint,
  backsOntoWall,
  frontClearanceMm,
  isUnderlay,
  orientationMatters,
  requiresWall,
} from "../../fixtures-catalog.js";
import type { LintContext, LintRule } from "../context.js";
import { placementClear, WALL_COLLISION_SLACK_MM } from "../fixture-paste.js";
import { frontGapMm, mm, shortfall } from "../measure.js";

/** Furniture that overlaps another piece — a physical collision (each unordered
 *  pair reported once, in source order, against the second piece's span).
 *
 *  **Two pieces can only collide when they sit on the same side of the plane the drawing is
 *  cut at**, which is the one question this rule asks of the catalogue ({@link cutPlaneLayer}).
 *  An underlay (a rug) is below it and a piece standing on the rug is at it; an extract hood
 *  and a wall cabinet are above it and the hob and worktop under them are at it. Both of those
 *  overlaps are the arrangement rather than a collision, and neither is a special case of the
 *  other — a rug is walked on, a hood is walked under.
 *
 *  The test is on the PAIR, not on either piece, so two rugs overlapping each other still warn,
 *  and so do two wall cabinets: those pairs are not the exempt case, and one piece half through
 *  another at the same height is a drawing mistake whatever height that is. */
export const furnitureOverlap: LintRule = {
  name: "furniture-overlap",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FURNITURE_OVERLAP"],
  check({ furniture, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (let i = 0; i < furniture.length; i++) {
      for (let j = i + 1; j < furniture.length; j++) {
        if (cutPlaneLayer(furniture[i]!.category) !== cutPlaneLayer(furniture[j]!.category)) continue;
        if (rectsOverlap(rectOf(furniture[i]!), rectOf(furniture[j]!))) {
          const nameI = furniture[i]!.label ?? furniture[i]!.category;
          const nameJ = furniture[j]!.label ?? furniture[j]!.category;
          out.push({
            severity: "warning",
            code: "W_FURNITURE_OVERLAP",
            ...at(furniture[j]!),
            message: `Furniture "${nameJ}" overlaps "${nameI}".`,
            hints: ["Move or resize one piece so they don't intersect; leave a walkway between them."],
          });
        }
      }
    }
    return out;
  },
};

/**
 * A fixture's frontal activity clearance blocked by a *free-standing* piece of
 * furniture (a sofa parked in front of the stove). Conservative on purpose: it
 * ignores other plumbing/kitchen fixtures, so a compactly-packed bathroom or
 * kitchen run never trips it — only a movable object in the use-space does.
 *
 * The message states the catalogued clearance, the depth actually left, and the
 * shortfall. Every remedy stays a **hint**: moving or shrinking the obstruction is a
 * choice of geometry, and turning the fixture is not the bounded rewrite it looks
 * like — for a fixture whose facing means anything, the back-against-a-wall rule
 * already pins the front, so a rotation that frees the use-space either lifts its back
 * off the wall (trading this warning for `W_FIXTURE_BACK_TO_ROOM`) or lands in the
 * two-walls corner case that {@link fixtureBackToRoom} itself declines to guess at.
 */
export const furnClearance: LintRule = {
  name: "furn-clearance",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FURN_CLEARANCE"],
  check({ furniture, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      const clear = frontClearanceMm(f.category);
      if (clear <= 0) continue;
      // The catalogue's number is a FLOOR (ADR 0029 §4, amended 2026-10-23): a declared `clear
      // front` at least as deep replaces it (that piece is judged by `W_FURN_CLEAR_FRONT`); a
      // shallower one cannot silence it, and both are measured.
      if (f._clear?.front !== undefined && f._clear.front >= clear) continue;
      const zone = frontClearanceRect(f, clear);
      for (const g of furniture) {
        // Ignore other services fixtures — and an underlay, which you stand on rather than
        // step round, so a rug reaching under the basin blocks nothing.
        //
        // An OVERHEAD piece (a hood, a wall cabinet, a mirror) is above the use-space rather
        // than in it and should never block one either — but it needs no arm here, because
        // every overhead family is also `requiresWall` and is already skipped one test to the
        // left. Adding a second, currently unreachable condition would ship untested code.
        // Revisit if an overhead family is ever NOT wall-requiring (a ceiling pendant hangs
        // off the slab, not the fabric) — see `FixtureSpec.overhead`.
        if (g === f || requiresWall(g.category) || isUnderlay(g.category)) continue;
        if (rectsOverlap(zone, rectOf(g))) {
          const fn = f.label ?? f.category;
          const gn = g.label ?? g.category;
          const gap = frontGapMm(rectOf(f), zone, rectOf(g), clear);
          const short = shortfall(clear, gap);
          out.push({
            severity: "warning",
            code: "W_FURN_CLEARANCE",
            ...at(f),
            message: `Fixture "${fn}" needs ${mm(clear)} mm of clear space in front but "${gn}" leaves ${mm(gap)} mm (${mm(short)} mm short).`,
            hints: [
              `Move "${gn}" ${mm(short)} mm further from the front of "${fn}".`,
              `Or shrink "${gn}" by ${mm(short)} mm on the axis facing "${fn}".`,
              `Or turn "${fn}" (\`rotate 0|90|180|270\`) so its front faces clear floor — its back must stay on a wall.`,
              `Or move "${fn}" to a wall run with ${mm(clear)} mm of free floor in front of it.`,
            ],
          });
          break; // one warning per fixture
        }
      }
    }
    return out;
  },
};

/** A wall-requiring fixture (WC, basin, sink, counter, stove, fridge…) placed with
 *  no wall behind any edge — it floats in the room. */
export const fixtureFloating: LintRule = {
  name: "fixture-floating",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FIXTURE_FLOATING"],
  check({ furniture, ir, rules, wallSegs, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      if (requiresWall(f.category) && !isAgainstWall(rectOf(f), ir.walls, rules.fixtureWallTolMm, wallSegs)) {
        const name = f.label ?? f.category;
        out.push({
          severity: "warning",
          code: "W_FIXTURE_FLOATING",
          ...at(f),
          message: `Fixture "${name}" is not against a wall.`,
          hints: ["Place it so one edge backs onto a wall — plumbing/venting runs in the wall."],
        });
      }
    }
    return out;
  },
};

/**
 * The `W_FIXTURE_BACK_TO_ROOM` hint when EVERY walled edge is ruled out by the footprint's
 * aspect ({@link backCandidateEdges}): the size is the wrong way round, so the fix is to swap
 * it, not to pick a `rotate`. Since PS2.50 it is reached only for a piece whose back must reach
 * any wall it touches ({@link backsOntoWall}) or whose drawn front is on a wall; a piece
 * standing side-on or end-on is declined before it. A `rotate` alone would silence the rule while drawing the symbol
 * squashed into the box (`furniture.render()` swaps the pre-rotation footprint for 90/270).
 *
 * The numbers are written in the statement's own frame: a placed component's quarter-turn
 * swaps the plan axes (`g.k` odd), and the rotation is pulled back through g⁻¹ exactly as the
 * machine-applicable fix's is. No frame (`g === null`) means no numbers, only the rule.
 */
function sizeTurnHint(
  size: { w: number; h: number },
  walled: readonly RectEdge[],
  g: D4 | null,
  anchored: boolean,
): string {
  const side = walled.join("/");
  const why = "a fixture's catalogued depth runs away from the wall it backs onto";
  // An anchored piece's rotation is DERIVED once the size fits its edge, so it is not
  // asked for a `rotate` it does not need.
  const then = anchored ? "the anchor then derives the rotation" : null;
  if (g === null)
    return `Its plan \`size\` runs its depth along the wall on its ${side} side: swap W and H (${why}); ${then ?? "then add the `rotate` that backs it onto that wall"}.`;
  const local = g.k % 2 === 1 ? { w: size.h, h: size.w } : size;
  const turn =
    then ??
    (walled.length === 1
      ? `then add \`rotate ${actOnQuarterTurn(inverse(g), rotateForBackEdge(walled[0]!))}\``
      : "then add the `rotate` that backs it onto the wall you mean");
  return `Its ${fmt2(local.w)}x${fmt2(local.h)} size puts its depth along the wall on its ${side} side, so its symbol cannot face that wall without being squashed: write \`size ${fmt2(local.h)}x${fmt2(local.w)}\` (${why}); ${turn}.`;
}

/**
 * A wall-requiring fixture that IS touching a wall but has its **back to the room**
 * — the WC whose cistern faces the space instead of the wall it stands on. Distinct
 * from `W_FIXTURE_FLOATING` (which is about a fixture touching no wall at all): here
 * the position is right and only the quarter-turn is wrong, so the fix is a `rotate`.
 *
 * It fires only for a category whose symbol has a distinguishable back
 * ({@link orientationMatters} — a shower tray is symmetric, so its facing means
 * nothing), and only when at least one other edge *is* walled. The
 * machine-applicable `rotate <n>` fix is attached only when the target is UNIQUE:
 * exactly one walled edge that the footprint's aspect also allows as a back
 * ({@link backCandidateEdges} — a 400×700 WC can only back onto a horizontal edge).
 * A corner with two valid walls, or a walled edge the shape rules out, leaves the
 * warning standing on its own for the author to resolve — lint never guesses between
 * alternatives (ADR 0005).
 *
 * When NO walled edge is a back candidate and the drawn front is off the wall too, the piece
 * touches the wall with a side or an end, and the rule declines (a bed side-on to a wall, a
 * wardrobe end-on to one: plan-soundness PS2.50), unless its back must reach any wall it
 * touches ({@link backsOntoWall}: a services or wall-mounted piece).
 */
export const fixtureBackToRoom: LintRule = {
  name: "fixture-back-to-room",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FIXTURE_BACK_TO_ROOM"],
  readsFurniture: true,
  check({ furniture, ir, rooms, rules, wallSegs, at, frameOf, skip }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    // A POLYGON room has no north/south/east/west sides, so "which edge is the back?"
    // has no answer there — the rule declines rather than derive a rotation from a
    // bounding box the room does not have (ADR 0005: no invisible architect), and says so
    // to the coverage report (PS2.13).
    const polyRooms = rooms.filter((r) => r.poly);
    for (const f of furniture) {
      if (!orientationMatters(f.category)) continue;
      const cx = f.at.x + f.size.w / 2;
      const cy = f.at.y + f.size.h / 2;
      const inPoly = polyRooms.find((r) => pointInPolygon(cx, cy, r.poly!));
      if (inPoly) {
        skip("non-rectangular-room", inPoly);
        continue;
      }
      const backing = wallBackedEdges(rectOf(f), ir.walls, rules.fixtureWallTolMm, wallSegs);
      const back = backEdgeForRotate(f.rotate);
      if (backing[back] !== null) continue; // back is on a wall — correctly oriented
      const walled = backedEdgeList(backing);
      if (walled.length === 0) continue; // touches no wall at all — W_FIXTURE_FLOATING's business
      const name = f.label ?? f.category;
      const shape = backCandidateEdges(f.size, defaultFootprint(f.category));
      const targets = walled.filter((e) => shape.includes(e));
      // No walled edge could be this piece's back, and its drawn front is off the wall too: it
      // stands side-on or end-on to the wall (a bed lengthwise along it, a wardrobe touching it
      // with its end), which is a layout, not a back turned to the room. A piece whose drawn
      // FRONT is on a wall still warns, whatever its aspect (a nightstand `400x450 rotate 180`
      // facing the wall). So does a piece whose back must reach any wall it touches
      // (`backsOntoWall`: a WC, a basin or a washer for its services; a radiator, a fireplace,
      // a TV or an EV charger because it mounts by its back), for which the walled edge says
      // its size is the wrong way round (the size-turn hint).
      const front = backEdgeForRotate((f.rotate ?? 0) + 180);
      if (targets.length === 0 && !backsOntoWall(f.category) && !walled.includes(front)) continue;
      const facing = targets.length === 1 ? rotateForBackEdge(targets[0]!) : null;
      // `facing` is the quarter-turn in PLAN space, but the edit lands in the statement's
      // own source, which for a placed component is its local frame: pull it back through
      // g⁻¹ (the identity at root, which returns `facing` unchanged).
      const g = frameOf(f);
      // A piece whose turn is stated by `facing` (ADR 0029 §3) takes no `rotate` fix: adding
      // one would state the turn twice (`E_FACING_CONFLICT`). The warning and its hint stay.
      const unique =
        facing !== null && g !== null && f._facing === undefined ? actOnQuarterTurn(inverse(g), facing) : null;
      out.push({
        severity: "warning",
        code: "W_FIXTURE_BACK_TO_ROOM",
        ...at(f),
        message: `Fixture "${name}" has its back to the room — the wall it stands against is on its ${walled.join("/")} side.`,
        hints: [
          unique !== null
            ? `Add \`rotate ${unique}\` so the symbol's back faces the wall (rotate 0 = back to the north).`
            : targets.length === 0
              ? sizeTurnHint(f.size, walled, g, f._authored?.mode === "anchor")
              : "Give it an explicit `rotate` for the wall you mean it to back onto, or place it with `against wall <id>` / `in <room> anchor <edge>` and let the rotation be derived.",
        ],
        ...(unique !== null ? fixesFrom(fixtureRotateFix(f, unique)) : {}),
      });
    }
    return out;
  },
};

/**
 * A fixture declared `in <room>` whose FOOTPRINT does not sit on that room's floor
 * (an unknown room id is the harder E_FURN_ROOM error, handled at resolve).
 *
 * It used to ask only where the piece's centre was, which is a much weaker question than
 * it looks: a corner placement can leave three quarters of the footprint in other rooms
 * with the centre still 50 mm inside the declared one. {@link rectInRoomBox} asks about
 * the whole rectangle, with a named slack for the wall band a room edge runs down.
 */
export const fixtureWrongRoom: LintRule = {
  name: "fixture-wrong-room",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FIXTURE_WRONG_ROOM"],
  check({ furniture, roomRects, rooms, nameOf, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      if (f.room === undefined) continue;
      const rect = roomRects.get(f.room);
      if (!rect) continue;
      if (!rectInRoomBox(rectOf(f), rect)) {
        const name = f.label ?? f.category;
        const declared = rooms.find((r) => r.id === f.room);
        out.push({
          severity: "warning",
          code: "W_FIXTURE_WRONG_ROOM",
          ...at(f),
          message: `Fixture "${name}" is not inside ${declared ? `${nameOf(declared)}, the room it is declared in` : "its declared room"}.`,
          hints: [`Move it inside that room, or correct the \`in <roomId>\` (it says \`${f.room}\`).`],
        });
      }
    }
    return out;
  },
};

/** Furniture that penetrates a wall solid (the sofa drawn straddling a partition).
 *  A piece flush against a wall face is fine; only a piece intruding into the wall's
 *  thickness band — past snap noise — trips. Reported once per piece, on the first
 *  wall it hits, in source order. */
export const furnitureWallCollision: LintRule = {
  name: "furniture-wall-collision",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FURNITURE_WALL_COLLISION"],
  check(ctx: LintContext): Diagnostic[] {
    const { furniture, wallSegs, wallOpenings, at } = ctx;
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      const fr = rectOf(f);
      // The FIRST segment it intrudes past the slack, in segment order — the same wall the
      // `.some()` this replaced stopped at, now kept so the message can name it.
      let hit: WallSegment | undefined;
      let depth = 0;
      for (const s of wallSegs) {
        const d = wallIntrusionDepth(fr, s, wallOpenings);
        if (d > WALL_COLLISION_SLACK_MM) {
          hit = s;
          depth = d;
          break;
        }
      }
      if (hit) {
        const name = f.label ?? f.category;
        const where = axisLine(hit);
        // The wall is named by its kind and the line it runs on, never its id: a consumer may
        // show the message to someone who never sees the source. The hint names it by id.
        out.push({
          severity: "warning",
          code: "W_FURNITURE_WALL_COLLISION",
          ...at(f),
          message: `Furniture "${name}" penetrates ${where ? "the" : /^[aeiou]/i.test(hit.category) ? "an" : "a"} ${hit.category} wall${where} — ${mm(depth)} mm into its ${mm(hit.thickness)} mm thickness.`,
          hints: [collisionHint(f, fr, hit, ctx)],
        });
      }
    }
    return out;
  },
};

/** ` at x 4000` / ` at y 3000` for a straight axis-aligned segment, else nothing. */
function axisLine(s: WallSegment): string {
  if (s.arc) return "";
  if (s.a.x === s.b.x && s.a.y !== s.b.y) return ` at x ${mm(s.a.x)}`;
  if (s.a.y === s.b.y && s.a.x !== s.b.x) return ` at y ${mm(s.a.y)}`;
  return "";
}

/**
 * The remedy for a wall collision. For a piece placed `against wall …` the usual cause is
 * reading `offset` as an edge when it is the piece's CENTRE (`placeAgainst`,
 * `elements/furniture.ts`), so the hint says so with the run the piece actually covers and,
 * when there is one, the nearest `offset` that is CHECKED clear.
 *
 * The host segment is found from the authored clause and accepted only if it reproduces the
 * piece's own centre along it (to 1 mm): a `place`d component's wall names are local, and a
 * lookup that found a different wall must not produce numbers. Anything it cannot verify
 * falls back to the generic sentence.
 *
 * A suggested `offset` is never a guess. The candidates are the positions that put the piece
 * just clear of each wall standing square across its strip, each other piece of furniture,
 * each doorway landing and the box round each door's swing (either side), plus the two ends of
 * the segment. Each is moved to and re-measured: inside the segment's run; when the piece is
 * declared `in` a room, its footprint still on that room's floor ({@link rectInRoomBox}, the
 * room's own shape, which also keeps its `side` inferable); and {@link placementClear}, the
 * terms of the wall-collision, overlap, swing, doorway and clearance rules. The nearest that
 * passes wins (the lower on a tie); when none does, the hint says so instead of quoting a
 * number that would trade this warning for another one.
 */
function collisionHint(f: RFurniture, fr: BBox, hit: WallSegment, ctx: LintContext): string {
  const { wallSegs, roomRects } = ctx;
  // A derived wall has no id `against wall` could name (ADR 0028 §3): offer the room anchor only.
  const generic = isDerivedWall(ctx.ir.walls, hit)
    ? `Move or resize it so it clears ${wallRef(ctx.ir.walls, hit)} — against its face, not through it — or place it with \`in <room> anchor <edge> flush\`.`
    : `Move or resize it so it clears ${wallRef(ctx.ir.walls, hit)} — against its face, not through it — or place it with \`against wall <id>\` (whose \`offset\` is the distance along the wall to the piece's CENTRE) or \`in <room> anchor <edge> flush\`.`;
  const ag = f._authored;
  if (ag?.mode !== "against") return generic;
  const hosts = wallSegs.filter((s) => s.wallId === ag.wall || s.category === ag.wall);
  const wallIds = new Set(hosts.map((s) => s.wallId));
  if (wallIds.size !== 1) return generic;
  const host = hosts.find((s) => s.index === (ag.segment ?? 0));
  if (!host || host.arc) return generic;
  const d = unitOf(host);
  if (d === null) return generic;
  const len = Math.hypot(host.b.x - host.a.x, host.b.y - host.a.y);
  const n = { x: -d.y, y: d.x };
  const along = (p: { x: number; y: number }): number => (p.x - host.a.x) * d.x + (p.y - host.a.y) * d.y;
  const across = (p: { x: number; y: number }): number => (p.x - host.a.x) * n.x + (p.y - host.a.y) * n.y;
  const corners = [
    { x: fr.x, y: fr.y },
    { x: fr.x + fr.w, y: fr.y + fr.h },
  ];
  const lo = Math.min(...corners.map(along));
  const hi = Math.max(...corners.map(along));
  const centre = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  const written = ag.offset ?? len / 2;
  if (Math.abs(written - centre) > 1) return generic;
  const run = `\`offset\` is the distance along "${host.wallId}" to the piece's CENTRE, not its edge: at ${mm(centre)} this ${mm(hi - lo)} mm piece spans ${mm(lo)}–${mm(hi)} along it, through ${wallRef(ctx.ir.walls, hit)}`;
  const hd = hit.arc ? null : unitOf(hit);
  // A wall that runs ALONG the host is a depth problem: no `offset` can clear it.
  if (hd !== null && Math.abs(hd.x * d.x + hd.y * d.y) > 1 - 1e-9)
    return `${run}, which runs along it: reduce the piece's depth.`;
  const nlo = Math.min(...corners.map(across));
  const nhi = Math.max(...corners.map(across));
  const raw: number[] = [Math.ceil(half), Math.floor(len - half)];
  for (const s of wallSegs) {
    const sd = s.arc ? null : unitOf(s);
    if (sd === null || Math.abs(sd.x * d.x + sd.y * d.y) > 1e-9) continue; // not square across the run
    const a = across(s.a);
    const b = across(s.b);
    if (Math.max(a, b) <= nlo || Math.min(a, b) >= nhi) continue; // misses the piece's strip
    const p = along(s.a);
    raw.push(Math.floor(p - s.thickness / 2 - half), Math.ceil(p + s.thickness / 2 + half));
  }
  const room = f.room !== undefined ? roomRects.get(f.room) : undefined;
  // Other obstacles in the strip: the piece just clear of each, either side. Their rects are
  // the other furniture, each door's doorway landing, and the box round each door's swing.
  const obstacles: BBox[] = ctx.furniture.filter((o) => o !== f).map((o) => rectOf(o));
  for (const door of ctx.doors) {
    const landing = doorLandingRect(door, ctx.rules.doorwayLandingMm);
    if (landing) obstacles.push(landing);
    const sw = doorSwing(door);
    if (sw) {
      const r = sw.radius + ctx.rules.swingClearanceMm;
      obstacles.push({ x: sw.hinge.x - r, y: sw.hinge.y - r, w: 2 * r, h: 2 * r });
    }
  }
  for (const o of obstacles) {
    const oc = [
      { x: o.x, y: o.y },
      { x: o.x + o.w, y: o.y + o.h },
    ];
    if (Math.max(...oc.map(across)) <= nlo || Math.min(...oc.map(across)) >= nhi) continue;
    raw.push(Math.floor(Math.min(...oc.map(along)) - half), Math.ceil(Math.max(...oc.map(along)) + half));
  }
  const clear = (o: number): boolean => {
    if (o - half < 0 || o + half > len) return false;
    const shift = o - centre;
    const moved = { x: fr.x + d.x * shift, y: fr.y + d.y * shift, w: fr.w, h: fr.h };
    if (room !== undefined && !rectInRoomBox(moved, room)) return false;
    return placementClear(ctx, moved, f.category, f.rotate ?? 0, f);
  };
  const valid = [...new Set(raw)].filter(clear).sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);
  if (valid.length > 0) return `${run}. \`offset ${mm(valid[0]!)}\` clears it.`;
  const where = f.room !== undefined ? ` inside "${f.room}"` : "";
  return `${run}, and no position along "${host.wallId}"${where} clears every wall: move it to another wall or shorten it.`;
}

/** A straight segment's unit direction, or `null` for an arc or a degenerate segment. */
function unitOf(s: WallSegment): { x: number; y: number } | null {
  if (s.arc) return null;
  const l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  return l > 0 ? { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l } : null;
}
