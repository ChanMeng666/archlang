/**
 * The eleven taste criteria of PS5.1 (R3, R6, R7, R9, R11, R12, R14, R15, R16, R17, R18), as
 * defined in `docs/plans/plan-soundness/research/2026-10-24-ps5-taste-design.md` §3. Each reads
 * `describe()` facts (what an agent sees) and, where `describe()` rounds or omits, the resolved
 * IR: window sizes and heights (R7), room rings at full precision (R6, R9, R16, R17, R18), door
 * positions and hosts (R16), wall centrelines (R17), furniture footprints (R6). None reads an id
 * or a label as meaning (uses come from `describe().rooms[].uses`, which is `roomUses`). Pure,
 * deterministic, integer arithmetic (`./arith.ts`, `../geometry/min-rect.ts`).
 *
 * A criterion is a COST and a judge. The cost is an upper bound on the judge's work, in the
 * units the judge counts on its {@link Work} counter (one unit per loop step: a room, a window,
 * an element, an edge, a pair, a BFS visit), charged against the call's counted budget BEFORE
 * the judge runs (design §2.4); `test/taste-budget.test.ts` holds work ≤ cost on a probe plan.
 * Every lookup the judge repeats goes through a map it builds once and counts. Evidence is
 * collected up to {@link MAX_EVIDENCE} entries and only counted past that. Rooms are named in
 * messages by label; ids go only in `evidence[].ids`.
 */

import { accessDigraph } from "../analyze.js";
import { dwellingReading } from "../analyze/dwelling.js";
import { WINDOW_HEAD, WINDOW_SILL } from "../datum.js";
import type { UseKind } from "../ast.js";
import type { LevelSummary, SceneSummary } from "../describe.js";
import { fixtureSpec } from "../fixtures-catalog.js";
import { segmentsOfWall } from "../geometry.js";
import { type LatticePoint, latticeArea2, minAreaRect, minRectCost } from "../geometry/min-rect.js";
import type { RDoor, ResolvedPlan, RFurniture, RRoom, RWindow } from "../ir.js";
import { definingItems } from "../lint/defining.js";
import { capFirst, unlabelledRoomPhrases } from "../lint/phrases.js";
import { polygonLabelPoint } from "../geometry/polygon.js";
import { type CompassLetter, FACINGS, oppositeLetter, type SiteFacts } from "../site.js";
import { fmtRatio, lattice, meanPermyriad, ONE, type Ratio, ramp } from "./arith.js";
import { adviceOf } from "./advice.js";
import { MAX_EVIDENCE, type TasteEvidence, type TasteSkip, type TasteSkipReason } from "./report.js";

/** One storey as taste reads it: its `describe()` summary and its resolved IR. */
export interface TasteStorey {
  /** The authored level, on a multi-storey plan only. */
  level?: number;
  summary: SceneSummary | LevelSummary;
  ir: ResolvedPlan;
  /** Not the lowest storey of a multi-storey plan (its depths wait for PS0.3). */
  upper: boolean;
}

/** A profile's taste numbers (PS5.2 adds `cn-`, `uk-`, `us-residential-advisory`). */
export interface TasteProfile {
  /** R7's target glazing-to-floor ratio (generic: 8 %, IRC R303.1 [S]). */
  daylightTarget: Ratio;
}

/** The judge's work counter: one unit per counted loop step. */
export interface Work {
  n: number;
}

/** What one criterion found. `p` is a permyriad, `null` when not assessable. */
export interface CriterionResult {
  reason?: TasteSkipReason;
  measured: { num: number; den: number } | null;
  p: number | null;
  message: string;
  /** At most {@link MAX_EVIDENCE} entries. */
  evidence: TasteEvidence[];
  /** How many more evidence entries there were (counted, not collected). */
  evidenceMore: number;
  /** Storey- or room-level skips that did not stop the criterion (or did, with `reason`). */
  skips: TasteSkip[];
}

export interface TasteCriterionDef {
  id: string;
  weight: number;
  /** An upper bound on the work {@link judge} counts; charged before it runs. */
  cost(storeys: readonly TasteStorey[]): number;
  judge(storeys: readonly TasteStorey[], profile: TasteProfile, work: Work): CriterionResult;
}

// ---------------------------------------------------------------------------
// Shared readings
// ---------------------------------------------------------------------------

const PUBLIC_USES = new Set(["living", "dining", "kitchen"]);
const HABITABLE_USES = new Set(["living", "dining", "kitchen", "bedroom", "office"]);
const COMMON_USES = new Set(["living", "dining"]);

/** A public room: living, dining or kitchen use (`privacy.ts`'s "public"). */
const isPublic = (uses: readonly string[]): boolean => uses.some((u) => PUBLIC_USES.has(u));
/** A bedroom: bedroom use and no public use (`privacy.ts`'s "private" bedroom test). */
const isBedroomOnly = (uses: readonly string[]): boolean => uses.includes("bedroom") && !isPublic(uses);
const isHabitable = (uses: readonly string[]): boolean => uses.some((u) => HABITABLE_USES.has(u));
const isCommon = (uses: readonly string[]): boolean => uses.some((u) => COMMON_USES.has(u));

/** Each room's name as a person reads it, built once per storey: one unit per room. A labelled
 *  room is its quoted label; an unlabelled one is named by what the plan knows of it (its use, its
 *  place), never by its id (PS2.29; the one builder `lint()` uses, `src/lint/phrases.ts`). The
 *  phrase starts in lower case: a sentence that opens with it uses {@link capFirst}. */
function namesOf(s: TasteStorey, work: Work): Map<string, string> {
  const rooms = s.summary.rooms;
  const phrases = unlabelledRoomPhrases(
    rooms.map((r) => ({
      id: r.id,
      ...(r.label !== undefined ? { label: r.label } : {}),
      uses: r.uses,
      point: summaryPoint(r),
    })),
    s.level,
  );
  const out = new Map<string, string>();
  for (const r of rooms) {
    work.n++;
    out.set(r.id, r.label !== undefined ? `"${r.label}"` : (phrases.get(r.id) ?? "an unlabelled room"));
  }
  return out;
}

/** A point inside the room's floor: a circle's centre, the ring's label point, else the box centre. */
function summaryPoint(r: {
  bbox: { x: number; y: number; w: number; h: number };
  floor_polygon: { x: number; y: number }[];
  floor_circle?: { cx: number; cy: number };
}): { x: number; y: number } {
  if (r.floor_circle) return { x: r.floor_circle.cx, y: r.floor_circle.cy };
  if (r.floor_polygon.length >= 3) return polygonLabelPoint(r.floor_polygon);
  return { x: r.bbox.x + r.bbox.w / 2, y: r.bbox.y + r.bbox.h / 2 };
}

/** Evidence collected up to {@link MAX_EVIDENCE} entries and counted past that. */
class EvidenceList {
  readonly items: TasteEvidence[] = [];
  more = 0;
  add(s: TasteStorey, ids: string[], fact: string): void {
    if (this.items.length >= MAX_EVIDENCE) {
      this.more++;
      return;
    }
    this.items.push({ ids, fact, ...(s.level !== undefined ? { level: s.level } : {}) });
  }
}

/** The words a skip reason is explained by in a message. */
export const TASTE_SKIP_WHY: Readonly<Record<TasteSkipReason, string>> = {
  "no-entrance": "the plan has no way in",
  "too-few-items": "there is not enough to compare",
  "too-small": "the room's floor area rounds to 0 m²",
  "upper-storey": "upper storeys are not judged until their entrance depths are reliable",
  "taste-budget": "the call's counted taste budget is spent",
  "non-dwelling": "the plan reads as a non-residential building",
  "non-rectangular-room": "the room is not rectilinear",
  "curved-room": "the room is curved",
  "door-off-ring": "the door stands on no edge of the room's floor",
};

/** The message of a criterion that cannot judge. */
export function notJudged(id: string, reason: TasteSkipReason): string {
  return `Not judged: ${TASTE_SKIP_WHY[reason]}. The criterion asks for ${adviceOf(id).asks}.`;
}

function skipped(id: string, reason: TasteSkipReason, skips: TasteSkip[] = []): CriterionResult {
  return { reason, measured: null, p: null, message: notJudged(id, reason), evidence: [], evidenceMore: 0, skips };
}

/** The storeys a depth-reading criterion judges, and the upper ones it files as skipped. */
function groundStoreys(id: string, storeys: readonly TasteStorey[]): { judged: TasteStorey[]; skips: TasteSkip[] } {
  const judged = storeys.filter((s) => !s.upper);
  const skips: TasteSkip[] = storeys
    .filter((s) => s.upper)
    .map((s) => ({ criterion: id, reason: "upper-storey", ...(s.level !== undefined ? { level: s.level } : {}) }));
  return { judged, skips };
}

/**
 * Each room's door depth as `describe().access` reports it, built once per storey (one unit per
 * access node): from the MAIN entrance when the storey names one (PS0.10; `null` for a room
 * reached only through another way in), otherwise from the nearest entrance. `null` means not
 * reached.
 */
function depthsOf(s: TasteStorey, work: Work): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const node of s.summary.access.rooms) {
    work.n++;
    out.set(node.id, "depthFromMainEntrance" in node ? (node.depthFromMainEntrance ?? null) : node.depthFromEntrance);
  }
  return out;
}

// ---------------------------------------------------------------------------
// R3 · intimacy gradient (zoning)
// ---------------------------------------------------------------------------

const R3: TasteCriterionDef = {
  id: "R3",
  weight: 1,
  // names (V) + depths (access nodes) + the use scan (V) + the pairs (P·B), per judged storey.
  cost: (storeys) =>
    storeys
      .filter((s) => !s.upper)
      .reduce((n, s) => {
        const rooms = s.summary.rooms;
        const pub = rooms.filter((r) => isPublic(r.uses)).length;
        const bed = rooms.filter((r) => isBedroomOnly(r.uses)).length;
        return n + 2 * rooms.length + s.summary.access.rooms.length + pub * bed;
      }, 1),
  judge(storeys, _profile, work) {
    const { judged, skips } = groundStoreys("R3", storeys);
    let pairs = 0;
    let inversions = 0;
    let anyEntrance = false;
    const evidence = new EvidenceList();
    let first: { names: Map<string, string>; p: string; dp: number; b: string; db: number } | null = null;
    for (const s of judged) {
      if (!s.summary.access.hasEntrance) continue;
      anyEntrance = true;
      const names = namesOf(s, work);
      const depth = depthsOf(s, work);
      const pubs: Array<{ id: string; d: number }> = [];
      const beds: Array<{ id: string; d: number }> = [];
      for (const r of s.summary.rooms) {
        work.n++;
        const d = depth.get(r.id) ?? null;
        if (d === null) continue;
        if (isPublic(r.uses)) pubs.push({ id: r.id, d });
        else if (isBedroomOnly(r.uses)) beds.push({ id: r.id, d });
      }
      for (const p of pubs) {
        for (const b of beds) {
          work.n++;
          pairs++;
          // Equal depth is no inversion: two rooms off one hall is the ideal.
          if (p.d > b.d) {
            inversions++;
            evidence.add(s, [p.id, b.id], `depth ${p.d} > depth ${b.d}`);
            first ??= { names, p: p.id, dp: p.d, b: b.id, db: b.d };
          }
        }
      }
    }
    if (!anyEntrance) return skipped("R3", judged.length === 0 ? "upper-storey" : "no-entrance", skips);
    if (pairs === 0) return skipped("R3", "too-few-items", skips);
    const good = pairs - inversions;
    const p = ramp({ num: BigInt(good), den: BigInt(pairs) }, { num: 0n, den: 1n }, { num: 1n, den: 1n });
    const message = first
      ? `${capFirst(first.names.get(first.p)!)} is ${first.dp} doors in from the entrance and ${first.names.get(first.b)} ${first.db}: ` +
        `${inversions} of ${pairs} living-to-bedroom pair${pairs === 1 ? "" : "s"} ${inversions === 1 ? "puts" : "put"} the public room deeper than the bedroom.`
      : `No living, dining or kitchen room is deeper from the entrance than a bedroom (${pairs} pair${pairs === 1 ? "" : "s"}).`;
    return {
      measured: { num: good, den: pairs },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips,
    };
  },
};

// ---------------------------------------------------------------------------
// R7 · daylight ratio (light)
// ---------------------------------------------------------------------------

/** One window as R7 reads it: its id and its resolved width, sill and head. */
interface Glazing {
  id: string;
  el: RWindow;
}

/**
 * The windows serving each room, built once per storey: one unit per IR element (to find the
 * windows) and one per `describe()` window (to attribute it). `describe().windows` is the IR's
 * windows in order, one for one (`summarizeResolved`); a window whose id does not pair is left
 * out rather than guessed.
 */
function windowsByRoom(s: TasteStorey, work: Work): Map<string, Glazing[]> {
  const irWindows: RWindow[] = [];
  for (const e of s.ir.elements) {
    work.n++;
    if (e.kind === "window") irWindows.push(e as RWindow);
  }
  const out = new Map<string, Glazing[]>();
  s.summary.windows.forEach((w, i) => {
    work.n++;
    const el = irWindows[i];
    if (w.room === null || el === undefined || el.id !== w.id) return;
    const list = out.get(w.room) ?? [];
    list.push({ id: w.id, el });
    out.set(w.room, list);
  });
  return out;
}

const R7: TasteCriterionDef = {
  id: "R7",
  weight: 1,
  // names (V) + the IR elements (E) + the window index (W) + the rooms (V) + each room's own
  // windows (at most W in all), per storey.
  cost: (storeys) =>
    storeys.reduce((n, s) => n + 2 * s.summary.rooms.length + s.ir.elements.length + 2 * s.summary.windows.length, 1),
  judge(storeys, profile, work) {
    const target = profile.daylightTarget;
    const pct = `${fmtRatio(target.num * 100n, target.den, 2)} %`;
    const items: number[] = [];
    const skips: TasteSkip[] = [];
    let meeting = 0;
    let worst: { names: Map<string, string>; id: string; v: Ratio } | null = null;
    const evidence = new EvidenceList();
    for (const s of storeys) {
      const names = namesOf(s, work);
      const byRoom = windowsByRoom(s, work);
      for (const r of s.summary.rooms) {
        work.n++;
        if (!isHabitable(r.uses)) continue;
        const net = r.net_area_m2 !== undefined;
        // A centi-square-metre integer: `describe()` prints areas to 2 decimals, so this is exact.
        const aC = BigInt(Math.round((net ? r.net_area_m2! : r.area_m2) * 100));
        if (aC <= 0n) {
          skips.push({
            criterion: "R7",
            reason: "too-small",
            room: r.id,
            ...(s.level !== undefined ? { level: s.level } : {}),
          });
          continue;
        }
        const own = byRoom.get(r.id) ?? [];
        let g = 0n;
        // "heights default" when every window of THIS room stands at the default 900/2100 datum.
        let defaults = own.length > 0;
        for (const { el } of own) {
          work.n++;
          g += lattice(el.width) * (lattice(el.head) - lattice(el.sill));
          if (el.sill !== WINDOW_SILL || el.head !== WINDOW_HEAD) defaults = false;
        }
        // v = G / A with G in mm²·10⁶ and A in m²/100 = mm²·10⁴: v = g / (aC · 10¹⁰).
        const v: Ratio = { num: g, den: aC * 10n ** 10n };
        const p = ramp(v, { num: 0n, den: 1n }, target);
        items.push(p);
        if (p === ONE) meeting++;
        if (worst === null || v.num * worst.v.den < worst.v.num * v.den) worst = { names, id: r.id, v };
        evidence.add(
          s,
          [r.id, ...own.map((w) => w.id)],
          `glazing ${fmtRatio(g, 10n ** 12n, 2)} m² / ${net ? "net" : "centreline"} floor ${fmtRatio(aC, 100n, 2)} m² = ` +
            `${fmtRatio(v.num, v.den, 4)} (target ${fmtRatio(target.num, target.den, 4)})${defaults ? "; heights default" : ""}`,
        );
      }
    }
    if (items.length === 0) return skipped("R7", "too-few-items", skips);
    const p = meanPermyriad(items.map((x) => ({ p: x, w: 1 })))!;
    const n = items.length;
    const message =
      meeting === n
        ? `${n === 1 ? "The habitable room has" : `All ${n} habitable rooms have`} glazing of at least ${pct} of the floor area.`
        : `${meeting} of ${n} habitable room${n === 1 ? "" : "s"} ${meeting === 1 || n === 1 ? "reaches" : "reach"} glazing of ${pct} of the floor area; ` +
          `${worst!.names.get(worst!.id)} has ${fmtRatio(worst!.v.num * 100n, worst!.v.den, 2)} %.`;
    return {
      measured: { num: meeting, den: n },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips,
    };
  },
};

// ---------------------------------------------------------------------------
// R14 · common area at the heart (circulation)
// ---------------------------------------------------------------------------

/**
 * Each system room's integer TOTAL DEPTH T: the sum of step distances to every other node of
 * the system (the component of `exterior`, the carrier included), on the simple access graph
 * `describe --facts syntax` reads (`accessDigraph`, an ambiguous connector joining nothing).
 * Within one storey, ranking by T is ranking by RRA (RRA = 2(T/(k−1) − 1)/((k−2)·D_k), one
 * D_k per storey), with no `log2`. Work: E for the graph, V + 2E for the neighbour lists, V for
 * the system, then V + 2E per system room's breadth-first walk.
 */
function totalDepths(s: TasteStorey, work: Work): Map<string, number> {
  const access = s.summary.access;
  work.n += access.edges.length;
  const g = accessDigraph(
    access.rooms.map((r) => r.id),
    access.edges,
  );
  const nbrs = new Map<string, string[]>();
  for (const n of g.nodes) {
    const out = g.out(n);
    work.n += 1 + out.length;
    nbrs.set(n, [...new Set(out.map((e) => e.to))]);
  }
  const system: string[] = [];
  for (const r of access.rooms) {
    work.n++;
    if (r.depthFromEntrance !== null) system.push(r.id);
  }
  const out = new Map<string, number>();
  for (const id of system) {
    const dist = new Map<string, number>([[id, 0]]);
    const queue = [id];
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i]!;
      const next = nbrs.get(n) ?? [];
      work.n += 1 + next.length;
      for (const m of next) {
        if (dist.has(m)) continue;
        dist.set(m, dist.get(n)! + 1);
        queue.push(m);
      }
    }
    let t = 0;
    for (const d of dist.values()) t += d;
    out.set(id, t);
  }
  return out;
}

const R14: TasteCriterionDef = {
  id: "R14",
  weight: 1,
  // names (V) + the graph and walks ((V + 2)·(V + 1 + 2E) bounds E + (V + 1 + 2E) + V + V·(V + 1
  // + 2E)) + the ranks (V²) + the common-room scan (V), on the one judged storey.
  cost: (storeys) => {
    const s = storeys.find((x) => !x.upper);
    if (!s) return 1;
    const v = s.summary.access.rooms.length;
    const e = s.summary.access.edges.length;
    return 1 + 2 * s.summary.rooms.length + (v + 2) * (v + 1 + 2 * e) + v * v;
  },
  judge(storeys, _profile, work) {
    const { judged, skips } = groundStoreys("R14", storeys);
    if (judged.length === 0) return skipped("R14", "upper-storey", skips);
    // PS5.1a judges one storey (the lowest); a single-storey plan is that storey.
    const s = judged[0]!;
    if (!s.summary.access.hasEntrance) return skipped("R14", "no-entrance", skips);
    const t = totalDepths(s, work);
    const n = t.size;
    if (n < 3) return skipped("R14", "too-few-items", skips);
    // Rank 1 = the smallest T; ties share the better rank. One pass over the others per room.
    const rank = new Map<string, number>();
    for (const [id, ti] of t) {
      let r = 1;
      for (const v of t.values()) {
        work.n++;
        if (v < ti) r++;
      }
      rank.set(id, r);
    }
    const names = namesOf(s, work);
    let best: { id: string; r: number } | null = null;
    for (const room of s.summary.rooms) {
      work.n++;
      const r = rank.get(room.id);
      if (!isCommon(room.uses) || r === undefined) continue;
      if (best === null || r < best.r) best = { id: room.id, r };
    }
    if (best === null) return skipped("R14", "too-few-items", skips);
    const c = Math.ceil(n / 3);
    // 1 at rank ⌈n/3⌉ or better, linear to 0 at rank n.
    const p =
      best.r <= c
        ? ONE
        : ramp({ num: BigInt(best.r), den: 1n }, { num: BigInt(n), den: 1n }, { num: BigInt(c), den: 1n });
    const evidence = new EvidenceList();
    evidence.add(s, [best.id], `total depth ${t.get(best.id)}, rank ${best.r} of ${n}`);
    const heart = [...rank].filter(([, r]) => r === 1).map(([id]) => id);
    if (best.r > 1) evidence.add(s, heart, `total depth ${t.get(heart[0]!)}, rank 1 of ${n}`);
    // At most three rooms are named; the rest are counted.
    const named = heart.slice(0, 3).map((id) => names.get(id));
    const others = heart.length > 3 ? ` and ${heart.length - 3} more` : "";
    const message =
      best.r <= c
        ? `${capFirst(names.get(best.id)!)} ranks ${best.r} of ${n} rooms by total depth to every other space: at the heart of the plan.`
        : `${capFirst(names.get(best.id)!)} ranks ${best.r} of ${n} rooms by total depth to every other space; ` +
          `${named.join(" and ")}${others} ${heart.length === 1 ? "ranks" : "rank"} 1.`;
    return {
      measured: { num: best.r, den: n },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips,
    };
  },
};

// ---------------------------------------------------------------------------
// Shared readings of PS5.1b: room rings on the lattice, wet uses, circulation rooms
// ---------------------------------------------------------------------------

const WET_USES = new Set(["bath", "wc", "utility"]);
const CIRCULATION_USES = new Set(["hall", "circulation", "entry"]);
const isWetUse = (uses: readonly string[]): boolean => uses.some((u) => WET_USES.has(u));
/** A circulation room: a hall, circulation or entry use, and no public or bedroom use (a
 *  "living hall" is a living room for zoning). */
const isCirculationRoom = (uses: readonly string[]): boolean =>
  uses.some((u) => CIRCULATION_USES.has(u)) && !isPublic(uses) && !uses.includes("bedroom");

/** The storey's IR rooms, in source order. */
const irRoomsOf = (s: TasteStorey): RRoom[] => s.ir.elements.filter((e): e is RRoom => e.kind === "room");

/** How many vertices a room's ring has (a rectangle has four; a circle its tessellation). */
const ringSize = (r: RRoom): number => r.poly?.length ?? 4;

/**
 * A room's floor ring on the 0.001 mm lattice, from the SHAPE: the polygon a polygonal or
 * circular room carries, else the rectangle the room IS (`at`/`size` of a rectangular room is
 * its floor, not a box around one). One unit of work per vertex.
 */
function latticeRing(r: RRoom, work: Work): LatticePoint[] {
  const pts = r.poly ?? [
    { x: r.at.x, y: r.at.y },
    { x: r.at.x + r.size.w, y: r.at.y },
    { x: r.at.x + r.size.w, y: r.at.y + r.size.h },
    { x: r.at.x, y: r.at.y + r.size.h },
  ];
  work.n += pts.length;
  return pts.map((p) => ({ x: lattice(p.x), y: lattice(p.y) }));
}

/** The ring with repeated and collinear vertices dropped, so every vertex left is a corner. */
function cornersOf(ring: readonly LatticePoint[], work: Work): LatticePoint[] {
  const out: LatticePoint[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    work.n++;
    const a = ring[(i + n - 1) % n]!;
    const b = ring[i]!;
    const c = ring[(i + 1) % n]!;
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cr !== 0n) out.push(b);
  }
  return out;
}

/** Each room's uses by id, from `describe()` (`roomUses`), built once per storey: one unit per room. */
function usesOf(s: TasteStorey, work: Work): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  for (const r of s.summary.rooms) {
    work.n++;
    out.set(r.id, r.uses);
  }
  return out;
}

/** Does the plan read as a non-residential building (lint's PS2.18 reading, every storey's
 *  rooms)? One unit of work per room. */
function nonDwelling(storeys: readonly TasteStorey[], work: Work): boolean {
  const all = storeys.flatMap((s) => s.summary.rooms);
  work.n += all.length;
  return (
    dwellingReading(all.map((r) => ({ id: r.id, label: r.label, uses: r.uses as UseKind[] }))) === "non-residential"
  );
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const levelOf = (s: TasteStorey): { level?: number } => (s.level !== undefined ? { level: s.level } : {});

// ---------------------------------------------------------------------------
// R6 · furniture–use match (furnishing)
// ---------------------------------------------------------------------------

/** The words a bedroom's defining piece is written with (`bed` and its `or` words), from the
 *  table `finish` furnishes from (`src/lint/defining.ts`). */
const BED_WORDS: ReadonlySet<string> = new Set(definingItems("bedroom").flatMap((i) => [i.category, ...(i.or ?? [])]));

/**
 * Kitchen-zoned categories R6 does not judge: a bare work surface. The catalogue zones `counter`
 * and `worktop` as kitchen so a kitchen's worktop counts as its fixture, but a counter is also a
 * laundry bench, a workshop bench or a desk (`examples/bungalow.arch`'s laundry,
 * `examples/materials.arch`'s workshop), so its presence outside a kitchen claims nothing.
 */
const R6_SURFACES: ReadonlySet<string> = new Set(["counter", "worktop"]);

/** The zones R6 reads a piece by (none for a bare work surface). */
const r6Zones = (category: string): readonly string[] =>
  R6_SURFACES.has(category) ? [] : (fixtureSpec(category)?.zones ?? []);
/** Does R6 judge a piece of this category: a zoned piece or a bedroom's defining piece? */
const r6Judges = (category: string): boolean => r6Zones(category).length > 0 || BED_WORDS.has(category);

/**
 * Is the lattice point strictly inside the ring? An exact even-odd ray cast in integers; a point
 * on the ring's boundary is in no room (it cannot be told which), so it is not judged.
 */
function strictlyInside(p: LatticePoint, ring: readonly LatticePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    // On the edge a–b: collinear and within its extent.
    const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (
      cr === 0n &&
      (a.x < b.x ? a.x : b.x) <= p.x &&
      p.x <= (a.x < b.x ? b.x : a.x) &&
      (a.y < b.y ? a.y : b.y) <= p.y &&
      p.y <= (a.y < b.y ? b.y : a.y)
    )
      return false;
    if (a.y > p.y !== b.y > p.y) {
      // The crossing's x against p.x, cross-multiplied by the sign of (b.y − a.y).
      const lhs = (p.x - a.x) * (b.y - a.y);
      const rhs = (b.x - a.x) * (p.y - a.y);
      if (b.y > a.y ? lhs < rhs : lhs > rhs) inside = !inside;
    }
  }
  return inside;
}

/**
 * R6 · furniture–use match. Judged pieces: a catalogue piece with a `wet` or `kitchen` zone
 * (`src/fixtures-catalog.ts`), and a bedroom's defining piece (`bed` and its `or` words). A
 * zoned piece matches a room with a use of one of its zones (wet = bath, WC or utility); a bed
 * mismatches only a room with no bedroom use AND a public or wet use (a bed in a study or an
 * unnamed spare room is no claim). Sofas and dining tables carry no zone, so they are not judged
 * (design §3: out of PS5.1), and neither is a bare work surface ({@link R6_SURFACES}). A piece
 * belongs to its declared room (`in <room>`), else to the room whose floor strictly contains its
 * footprint's centre; a piece in an unclassified room or in no room is not an item. v = 1 −
 * mismatches/pieces; ramp 0 → 1. A plan that reads as non-residential is skipped (`non-dwelling`):
 * the table describes a home's rooms, and a clinic's consulting-room basin is not a bath fitting
 * out of place (`examples/clinic.arch`).
 *
 * Source: the catalogue's own semantics (zones, the defining table), read in `src/` [V]; there is
 * no external threshold.
 */
const R6: TasteCriterionDef = {
  id: "R6",
  weight: 1,
  // the dwelling reading (V) + names (V) + uses (V) + the elements (E) + the rings (Σ ring
  // vertices) + per piece: one unit, plus a containment test over every ring when the piece names
  // no room.
  cost: (storeys) =>
    storeys.reduce((n, s) => {
      const rooms = irRoomsOf(s);
      const verts = rooms.reduce((k, r) => k + ringSize(r), 0);
      const pieces = s.ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
      // Only a judged piece that names no room is looked up in the rings.
      const lookups = pieces.filter((f) => f.room === undefined && r6Judges(f.category)).length;
      return (
        n + 3 * s.summary.rooms.length + s.ir.elements.length + verts + pieces.length + lookups * (rooms.length + verts)
      );
    }, 1),
  judge(storeys, _profile, work) {
    if (nonDwelling(storeys, work)) return skipped("R6", "non-dwelling");
    let pieces = 0;
    let mismatches = 0;
    const evidence = new EvidenceList();
    let first: { names: Map<string, string>; room: string; category: string } | null = null;
    for (const s of storeys) {
      const names = namesOf(s, work);
      const uses = usesOf(s, work);
      const rings: Array<{ id: string; ring: LatticePoint[] }> = [];
      const furniture: RFurniture[] = [];
      for (const e of s.ir.elements) {
        work.n++;
        if (e.kind === "room") rings.push({ id: e.id, ring: latticeRing(e as RRoom, work) });
        else if (e.kind === "furniture") furniture.push(e as RFurniture);
      }
      for (const f of furniture) {
        work.n++;
        if (!r6Judges(f.category)) continue;
        const zones = r6Zones(f.category);
        let room = f.room;
        if (room === undefined) {
          // The footprint's centre, doubled so it stays on the lattice; the rings are doubled too.
          const c = { x: 2n * lattice(f.at.x) + lattice(f.size.w), y: 2n * lattice(f.at.y) + lattice(f.size.h) };
          for (const r of rings) {
            work.n += 1 + r.ring.length;
            if (
              strictlyInside(
                c,
                r.ring.map((p) => ({ x: 2n * p.x, y: 2n * p.y })),
              )
            ) {
              room = r.id;
              break;
            }
          }
        }
        const u = room === undefined ? undefined : uses.get(room);
        if (room === undefined || u === undefined || u.length === 0) continue;
        pieces++;
        const ok =
          zones.length > 0
            ? (zones.includes("wet") && isWetUse(u)) || (zones.includes("kitchen") && u.includes("kitchen"))
            : u.includes("bedroom") || !(isPublic(u) || isWetUse(u));
        if (ok) continue;
        mismatches++;
        const want =
          zones.length > 0
            ? zones.map((z) => (z === "wet" ? "a bath, WC or utility" : "a kitchen")).join(" or ")
            : "a bedroom";
        evidence.add(s, [f.id, room], `${f.category} in a room with uses ${u.join(" ")}: wants ${want} use`);
        first ??= { names, room, category: f.category };
      }
    }
    if (pieces === 0) return skipped("R6", "too-few-items");
    const good = pieces - mismatches;
    const p = ramp({ num: BigInt(good), den: BigInt(pieces) }, { num: 0n, den: 1n }, { num: 1n, den: 1n });
    const message = first
      ? `A ${first.category} stands in ${first.names.get(first.room)}, whose uses do not fit it: ` +
        `${mismatches} of ${plural(pieces, "judged piece")} ${mismatches === 1 ? "is" : "are"} in a room of the wrong use.`
      : `Every judged piece (${plural(pieces, "piece")}: plumbing, kitchen fittings, beds) stands in a room of its use.`;
    return {
      measured: { num: good, den: pieces },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips: [],
    };
  },
};

// ---------------------------------------------------------------------------
// R9 · proportion and R18 · shape regularity (geometry): the exact minimum rectangle
// ---------------------------------------------------------------------------

/** The rooms R9 judges: a habitable, bath or WC use (circulation and storage are exempt). */
const r9Judges = (uses: readonly string[]): boolean =>
  isHabitable(uses) || uses.includes("bath") || uses.includes("wc");
/** The rooms R18 judges: a bedroom, bath or kitchen use. */
const r18Judges = (uses: readonly string[]): boolean =>
  uses.includes("bedroom") || uses.includes("bath") || uses.includes("kitchen");

/** R9's ramp: habitable 3 → 2, a bath or WC alone 3.5 → 2.5. */
const r9Ramp = (habitable: boolean): { zero: Ratio; one: Ratio } =>
  habitable
    ? { zero: { num: 3n, den: 1n }, one: { num: 2n, den: 1n } }
    : { zero: { num: 7n, den: 2n }, one: { num: 5n, den: 2n } };

/** The cost of judging the rooms `pick` selects by their minimum rectangle. */
const minRectCriterionCost =
  (pick: (uses: readonly string[]) => boolean) =>
  (storeys: readonly TasteStorey[]): number =>
    storeys.reduce((n, s) => {
      const uses = new Map(s.summary.rooms.map((r) => [r.id, r.uses]));
      let k = n + 2 * s.summary.rooms.length + s.ir.elements.length;
      for (const r of irRoomsOf(s)) {
        if (!pick(uses.get(r.id) ?? [])) continue;
        k += 1 + ringSize(r) + minRectCost(ringSize(r));
      }
      return k;
    }, 1);

/**
 * R9 · proportion. Per room with a habitable, bath or WC use: aspect = long / short side of the
 * MINIMUM-AREA ENCLOSING RECTANGLE of the room's ring (`src/geometry/min-rect.ts`: exact, from
 * the shape, never the bounding box). A circular room reads 1. Ramps: habitable 3 → 2, bath or
 * WC alone 3.5 → 2.5. The criterion is the mean of its rooms; `measured` counts the rooms at 1.
 *
 * Sources: Palladio, I Quattro Libri dell'Architettura I.xxi (Book I, § 52 in the 1997
 * translation): the preferred room shapes are circular, square, or rectangles of 2/1, 3/2, 4/3,
 * 5/3 or √2/1, the longest 2:1, as read in Branko Mitrović, "Andrea Palladio's Villa Cornaro in
 * Piombino Dese", Nexus Network Journal 6(2), 2004,
 * https://www.maths.tcd.ie/EMIS/journals/NNJ/Mitrovic.html [S]; the anchors
 * are ResPlan priors, "Aspect ratio (min rotated rectangle) p50/p95 bedroom 1.19/1.57; kitchen
 * 1.29/1.90; bath 1.58/2.24; living 1.32/2.26" [ResPlan prior, design-taste.md §4]: the habitable
 * `one` at 2 sits above every habitable p95 but living's (2.26), the bath `one` at 2.5 above the
 * bath p95 (2.24); each `zero` is one unit further out.
 */
const R9: TasteCriterionDef = {
  id: "R9",
  weight: 1,
  cost: minRectCriterionCost(r9Judges),
  judge(storeys, _profile, work) {
    const items: number[] = [];
    const skips: TasteSkip[] = [];
    let meeting = 0;
    let worst: { names: Map<string, string>; id: string; long: bigint; short: bigint } | null = null;
    const evidence = new EvidenceList();
    for (const s of storeys) {
      const names = namesOf(s, work);
      const uses = usesOf(s, work);
      for (const r of s.ir.elements) {
        work.n++;
        if (r.kind !== "room") continue;
        const room = r as RRoom;
        const u = uses.get(room.id) ?? [];
        if (!r9Judges(u)) continue;
        const { zero, one } = r9Ramp(isHabitable(u));
        let long = 1n;
        let short = 1n;
        if (!room.circle) {
          const mr = minAreaRect(latticeRing(room, work), work);
          if (mr === null) {
            skips.push({ criterion: "R9", reason: "too-small", room: room.id, ...levelOf(s) });
            continue;
          }
          long = mr.long;
          short = mr.short;
        }
        const p = ramp({ num: long, den: short }, zero, one);
        items.push(p);
        if (p === ONE) meeting++;
        if (worst === null || long * worst.short > worst.long * short) worst = { names, id: room.id, long, short };
        evidence.add(
          s,
          [room.id],
          `aspect ${fmtRatio(long, short, 2)} of the ${room.circle ? "circle" : "minimum enclosing rectangle"} ` +
            `(score 1 at ${fmtRatio(one.num, one.den, 1)}, 0 at ${fmtRatio(zero.num, zero.den, 1)})`,
        );
      }
    }
    if (items.length === 0) return skipped("R9", "too-few-items", skips);
    const p = meanPermyriad(items.map((x) => ({ p: x, w: 1 })))!;
    const n = items.length;
    const message =
      meeting === n
        ? `${n === 1 ? "The judged room is" : `All ${n} judged rooms are`} no longer than 2:1 (2.5:1 for a bathroom or WC).`
        : `${meeting} of ${plural(n, "room")} ${meeting === 1 || n === 1 ? "keeps" : "keep"} to 2:1 (2.5:1 for a bathroom or WC); ` +
          `${worst!.names.get(worst!.id)} is ${fmtRatio(worst!.long, worst!.short, 2)}:1.`;
    return {
      measured: { num: meeting, den: n },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips,
    };
  },
};

/**
 * R18 · shape regularity. Per room with a bedroom, bath or kitchen use: rectangularity = ring
 * area / area of its minimum enclosing rectangle (the R9 helper), exact:
 * `area2 · |e|² / (2 · long · short)`. Ramp 0.75 → 0.9. A circular room is skipped
 * (`curved-room`): a circle is regular, and its rectangle would say π/4.
 *
 * Source: Alexander, A Pattern Language, 191 (the shape of indoor space) [V]; the anchors are
 * ResPlan priors, "Rectangularity p10 bedroom 0.83, bath 0.98, kitchen 0.93" [ResPlan prior,
 * design-taste.md §4]: the `one` at 0.9 sits between the bedroom and kitchen p10s, the `zero` at
 * 0.75 is an L that has lost a quarter of its rectangle.
 */
const R18: TasteCriterionDef = {
  id: "R18",
  weight: 1,
  cost: minRectCriterionCost(r18Judges),
  judge(storeys, _profile, work) {
    const items: number[] = [];
    const skips: TasteSkip[] = [];
    let meeting = 0;
    let worst: { names: Map<string, string>; id: string; v: Ratio } | null = null;
    const evidence = new EvidenceList();
    for (const s of storeys) {
      const names = namesOf(s, work);
      const uses = usesOf(s, work);
      for (const r of s.ir.elements) {
        work.n++;
        if (r.kind !== "room") continue;
        const room = r as RRoom;
        if (!r18Judges(uses.get(room.id) ?? [])) continue;
        if (room.circle) {
          skips.push({ criterion: "R18", reason: "curved-room", room: room.id, ...levelOf(s) });
          continue;
        }
        const ring = latticeRing(room, work);
        const mr = minAreaRect(ring, work);
        if (mr === null) {
          skips.push({ criterion: "R18", reason: "too-small", room: room.id, ...levelOf(s) });
          continue;
        }
        const v: Ratio = { num: latticeArea2(ring) * mr.norm2, den: 2n * mr.long * mr.short };
        const p = ramp(v, { num: 3n, den: 4n }, { num: 9n, den: 10n });
        items.push(p);
        if (p === ONE) meeting++;
        if (worst === null || v.num * worst.v.den < worst.v.num * v.den) worst = { names, id: room.id, v };
        evidence.add(
          s,
          [room.id],
          `floor / minimum enclosing rectangle = ${fmtRatio(v.num, v.den, 4)} (score 1 at 0.9, 0 at 0.75)`,
        );
      }
    }
    if (items.length === 0) return skipped("R18", "too-few-items", skips);
    const p = meanPermyriad(items.map((x) => ({ p: x, w: 1 })))!;
    const n = items.length;
    const message =
      meeting === n
        ? `${n === 1 ? "The judged room fills" : `All ${n} judged rooms fill`} at least 90 % of ${n === 1 ? "its" : "their"} enclosing rectangle.`
        : `${meeting} of ${plural(n, "bedroom, bathroom or kitchen", "bedrooms, bathrooms or kitchens")} ` +
          `${meeting === 1 || n === 1 ? "fills" : "fill"} 90 % of the enclosing rectangle; ` +
          `${worst!.names.get(worst!.id)} fills ${fmtRatio(worst!.v.num * 100n, worst!.v.den, 1)} %.`;
    return {
      measured: { num: meeting, den: n },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips,
    };
  },
};

// ---------------------------------------------------------------------------
// R11 · kitchen–dining link (zoning)
// ---------------------------------------------------------------------------

/**
 * R11 · kitchen–dining link. Per room with a kitchen use: linked iff it also has a living or
 * dining use (open plan), or an access edge (a door or an opening, a derived `open between`
 * included; an ambiguous connector joins nothing) joins it to a room with a living or dining
 * use. v = linked / kitchens; ramp 0 → 1. A plan that reads as non-residential is skipped
 * (`non-dwelling`): the pattern is a home's (a café's kitchen serves a seating area, which no use
 * names, `examples/corner-cafe.arch`).
 *
 * Sources: Alexander, A Pattern Language, 139 (farmhouse kitchen) [V]; "Kitchen ↔ living 99 %
 * touch, 79 % open plan" [ResPlan prior, design-taste.md §4].
 */
const R11: TasteCriterionDef = {
  id: "R11",
  weight: 1,
  // the dwelling reading (V) + names (V) + uses (V) + the room scan (V) + each kitchen's edge
  // scan (K·E).
  cost: (storeys) =>
    storeys.reduce((n, s) => {
      const k = s.summary.rooms.filter((r) => r.uses.includes("kitchen")).length;
      return n + 4 * s.summary.rooms.length + k * s.summary.access.edges.length;
    }, 1),
  judge(storeys, _profile, work) {
    if (nonDwelling(storeys, work)) return skipped("R11", "non-dwelling");
    let kitchens = 0;
    let linked = 0;
    const evidence = new EvidenceList();
    let first: { names: Map<string, string>; id: string } | null = null;
    for (const s of storeys) {
      const names = namesOf(s, work);
      const uses = usesOf(s, work);
      for (const r of s.summary.rooms) {
        work.n++;
        if (!r.uses.includes("kitchen")) continue;
        kitchens++;
        if (isCommon(r.uses)) {
          linked++;
          evidence.add(s, [r.id], "open plan: the kitchen has a living or dining use");
          continue;
        }
        let via: { edge: string; room: string } | null = null;
        for (const e of s.summary.access.edges) {
          work.n++;
          if (via || e.ambiguous) continue;
          const [a, b] = e.between;
          const other = a === r.id ? b : b === r.id ? a : null;
          if (other !== null && isCommon(uses.get(other) ?? [])) via = { edge: e.doorId, room: other };
        }
        if (via) {
          linked++;
          evidence.add(s, [r.id, via.edge, via.room], "a door or opening joins the kitchen to a living or dining room");
        } else {
          evidence.add(s, [r.id], "no door or opening to a living or dining room");
          first ??= { names, id: r.id };
        }
      }
    }
    if (kitchens === 0) return skipped("R11", "too-few-items");
    const p = ramp({ num: BigInt(linked), den: BigInt(kitchens) }, { num: 0n, den: 1n }, { num: 1n, den: 1n });
    const message = first
      ? `${capFirst(first.names.get(first.id)!)} has no door or opening to a living or dining room: ` +
        `${linked} of ${plural(kitchens, "kitchen")} ${linked === 1 || kitchens === 1 ? "is" : "are"} linked to where people eat.`
      : kitchens === 1
        ? "The kitchen opens onto a living or dining room, or shares one."
        : `All ${kitchens} kitchens open onto a living or dining room, or share one.`;
    return {
      measured: { num: linked, den: kitchens },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips: [],
    };
  },
};

// ---------------------------------------------------------------------------
// R12 · dwelling aspect (light)
// ---------------------------------------------------------------------------

/**
 * R12 · dwelling aspect. Over the windows of habitable rooms (living, dining, kitchen, bedroom,
 * office), pooled over storeys: the number of distinct compass `facing`s
 * (`describe().windows[].facing`). 0 → 0; 1 → 0.5, or 0 when the plan declares `site` and that
 * one facing is the POLE side (the opposite of the site's `equator_side`); 2 or more → 1. A plan
 * that reads as non-residential (`dwellingReading`, PS2.18) is skipped (`non-dwelling`); a
 * multi-dwelling plan is read as one dwelling until PS2.14 (known-coarse, ADR 0032). The only
 * criterion that reads the compass: under a D4 frame with `north` fixed, it alone may move.
 *
 * Source: London Plan Policy D6 and the London Plan Guidance on housing design (C4.1: dual
 * aspect; single-aspect homes facing north avoided) [S]. "Windows on ≥ 2 sides bedroom 18 %,
 * living 41 %, kitchen 19 %" [ResPlan prior, design-taste.md §4], per room; this criterion asks
 * it of the dwelling.
 */
const R12: TasteCriterionDef = {
  id: "R12",
  weight: 1,
  // the dwelling reading (V) + uses (V) + the room scan (V) + the windows (W), per storey.
  cost: (storeys) => storeys.reduce((n, s) => n + 3 * s.summary.rooms.length + s.summary.windows.length, 1),
  judge(storeys, _profile, work) {
    if (nonDwelling(storeys, work)) return skipped("R12", "non-dwelling");
    const facings: CompassLetter[] = [];
    const ids: string[] = [];
    let habitable = 0;
    let site: SiteFacts | undefined;
    for (const s of storeys) {
      site ??= s.summary.site;
      const uses = usesOf(s, work);
      for (const r of s.summary.rooms) {
        work.n++;
        if (isHabitable(r.uses)) habitable++;
      }
      for (const w of s.summary.windows) {
        work.n++;
        if (w.room === null || !isHabitable(uses.get(w.room) ?? [])) continue;
        if (ids.length < MAX_EVIDENCE) ids.push(w.id);
        if (!facings.includes(w.facing)) facings.push(w.facing);
      }
    }
    if (habitable === 0) return skipped("R12", "too-few-items");
    // In compass order (N, E, S, W), never in the order windows were met.
    const sorted = FACINGS.filter((f) => facings.includes(f));
    const pole = site ? oppositeLetter(site.equator_side) : null;
    const p = sorted.length === 0 ? 0 : sorted.length >= 2 ? ONE : sorted[0] === pole ? 0 : ONE / 2;
    const evidence = new EvidenceList();
    evidence.add(
      storeys[0]!,
      ids,
      `habitable windows face ${sorted.length === 0 ? "nothing" : sorted.join(", ")}` +
        (pole ? `; the pole side is ${pole}` : ""),
    );
    const message =
      sorted.length === 0
        ? "No habitable room has a window: the dwelling has no aspect."
        : sorted.length >= 2
          ? `The habitable rooms look out on ${sorted.length} sides (${sorted.join(", ")}): a dual-aspect dwelling.`
          : sorted[0] === pole
            ? `Every habitable window faces ${sorted[0]}, the pole side: a single-aspect dwelling turned away from the sun.`
            : `Every habitable window faces ${sorted[0]}: a single-aspect dwelling.`;
    return {
      measured: { num: sorted.length, den: 1 },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips: [],
    };
  },
};

// ---------------------------------------------------------------------------
// R15 · night-zone contiguity (zoning)
// ---------------------------------------------------------------------------

/**
 * Connected components by breadth-first search, labelled by the first node of each component in
 * `nodes` order (so the labels do not depend on edge order). Only nodes `keep` admits are walked
 * and only edges between two of them followed. One unit per node and per neighbour scanned:
 * at most `nodes + Σ degree`.
 */
function componentsOf(
  nodes: readonly string[],
  nbrs: ReadonlyMap<string, readonly string[]>,
  keep: (id: string) => boolean,
  work: Work,
): Map<string, string> {
  const label = new Map<string, string>();
  for (const start of nodes) {
    work.n++;
    if (label.has(start) || !keep(start)) continue;
    label.set(start, start);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      for (const m of nbrs.get(queue[q]!) ?? []) {
        work.n++;
        if (label.has(m) || !keep(m)) continue;
        label.set(m, start);
        queue.push(m);
      }
    }
  }
  return label;
}

/**
 * R15 · night-zone contiguity. Bedroom pairs (bedroom use, no public use) JOINED in the access
 * graph without the exterior node (a proxy for "same dwelling" until PS2.14: `terrace-row`'s
 * houses are not paired across). A pair is ZONED iff a path joins them whose every intermediate
 * room is a circulation room (hall, circulation, entry; no public or bedroom use) and which has
 * at least one: a bedroom-to-bedroom door is not zoning. Computed by components of the
 * circulation-only subgraph: zoned iff both bedrooms open onto a common component. v = zoned /
 * joined pairs; ramp 0 → 1. Needs two bedrooms joined. Upper storeys skip until PS0.3.
 *
 * Sources: 动静分区 (the practice of keeping the night zone apart from the day zone);
 * Alexander, A Pattern Language, 136 (couple's realm) [V]. Redefined from `design-taste.md` R15,
 * which rewarded a bedroom-to-bedroom door (design §0.5).
 */
const R15: TasteCriterionDef = {
  id: "R15",
  weight: 1,
  // names (V) + uses (V) + the edge filter (E) + the neighbour lists (2E) + two component
  // passes (each ≤ V + 2E) + the bedroom scan (V) + the touch sets (2E) + the pairs (B², and
  // each pair's touch scan, ≤ B·2E in all), with V counting the rooms and the access nodes.
  cost: (storeys) =>
    storeys
      .filter((s) => !s.upper)
      .reduce((n, s) => {
        const v = s.summary.rooms.length + s.summary.access.rooms.length;
        const e = s.summary.access.edges.length;
        const b = s.summary.rooms.filter((r) => isBedroomOnly(r.uses)).length;
        return n + 5 * v + 9 * e + b * b + 2 * b * e;
      }, 1),
  judge(storeys, _profile, work) {
    const { judged, skips } = groundStoreys("R15", storeys);
    if (judged.length === 0) return skipped("R15", "upper-storey", skips);
    let bedroomsSeen = 0;
    let pairs = 0;
    let zoned = 0;
    const evidence = new EvidenceList();
    let first: { names: Map<string, string>; a: string; b: string } | null = null;
    for (const s of judged) {
      const names = namesOf(s, work);
      const uses = usesOf(s, work);
      const isCirc = (id: string): boolean => isCirculationRoom(uses.get(id) ?? []);
      work.n += s.summary.access.edges.length;
      // The access graph without the exterior node (and without an ambiguous connector).
      const nbrs = new Map<string, string[]>();
      for (const e of s.summary.access.edges) {
        if (e.ambiguous || e.between.includes("exterior")) continue;
        const [a, b] = e.between;
        work.n += 2;
        for (const [x, y] of [
          [a, b],
          [b, a],
        ] as const) {
          const list = nbrs.get(x);
          if (list) list.push(y);
          else nbrs.set(x, [y]);
        }
      }
      const ids = [...s.summary.rooms.map((r) => r.id), ...s.summary.access.rooms.map((r) => r.id)];
      const joined = componentsOf(ids, nbrs, () => true, work);
      const circ = componentsOf(ids, nbrs, isCirc, work);
      const beds: string[] = [];
      for (const r of s.summary.rooms) {
        work.n++;
        if (isBedroomOnly(r.uses)) beds.push(r.id);
      }
      bedroomsSeen += beds.length;
      // Each bedroom's touch set: the circulation components it opens onto.
      const touches = new Map<string, string[]>();
      for (const bed of beds) {
        const t: string[] = [];
        for (const m of nbrs.get(bed) ?? []) {
          work.n++;
          const c = circ.get(m);
          if (c !== undefined && !t.includes(c)) t.push(c);
        }
        touches.set(bed, t);
      }
      for (let i = 0; i < beds.length; i++) {
        for (let j = i + 1; j < beds.length; j++) {
          work.n++;
          const a = beds[i]!;
          const b = beds[j]!;
          const ja = joined.get(a);
          if (ja === undefined || ja !== joined.get(b)) continue;
          pairs++;
          const ta = touches.get(a)!;
          const tb = touches.get(b)!;
          work.n += ta.length;
          if (ta.some((c) => tb.includes(c))) {
            zoned++;
            evidence.add(s, [a, b], "joined through circulation rooms only");
          } else {
            evidence.add(s, [a, b], "every path between them passes a room that is not circulation");
            first ??= { names, a, b };
          }
        }
      }
    }
    if (bedroomsSeen < 2 || pairs === 0) return skipped("R15", "too-few-items", skips);
    const p = ramp({ num: BigInt(zoned), den: BigInt(pairs) }, { num: 0n, den: 1n }, { num: 1n, den: 1n });
    const message = first
      ? `${capFirst(first.names.get(first.a)!)} and ${first.names.get(first.b)} are not joined through a hall or corridor alone: ` +
        `${zoned} of ${plural(pairs, "bedroom pair")} ${zoned === 1 || pairs === 1 ? "shares" : "share"} a night zone.`
      : `Every bedroom pair (${plural(pairs, "pair")}) opens off a common hall or corridor: one night zone.`;
    return {
      measured: { num: zoned, den: pairs },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips,
    };
  },
};

// ---------------------------------------------------------------------------
// R16 · corner doors (circulation)
// ---------------------------------------------------------------------------

/** 15 m² in centi-square-metres: R16 judges side rooms smaller than this (design §3). */
const R16_SMALL_ROOM_CM2 = 1500n;
/** 600 mm on the lattice: the corner allowance when the host wall is thinner. */
const R16_CORNER = lattice(600);

/**
 * R16 · corner doors. Per door joining two rooms, per side room whose centreline area is under
 * 15 m² and that is not a circulation room (a corridor's doors stand along its run by necessity;
 * the pattern is about rooms, as R9 exempts circulation): the room-ring edge the door stands on (an axis-parallel edge parallel to the host wall,
 * within half the host's thickness of the door's centre, which projects inside it), and the
 * distance along that edge from the nearer jamb to the nearer ring CORNER (the room's own
 * corner, not a wall corner: the datum PS2.25 debates). Pass iff that nib ≤ max(host thickness,
 * 600 mm). Rectilinear rooms only (else `non-rectangular-room`); a door whose centre is on no
 * edge of the room's ring is `door-off-ring`. v = passes / items; ramp 0 → 1.
 *
 * Sources: Alexander, A Pattern Language, 196 (corner doors) [V]; "Door jamb to nearest room
 * corner p50/p75 bedroom 0.09/0.81 m; bath 0.04/0.12 m; living 0.19/0.74 m" [ResPlan prior,
 * design-taste.md §4]: 600 mm passes every p50 and fails the bedroom p75.
 */
const R16: TasteCriterionDef = {
  id: "R16",
  weight: 1,
  // names (V) + the IR elements (E) + the corner rings (2 · Σ ring vertices) + the door index
  // (D) + per door, two sides each scanning its room's corners.
  cost: (storeys) =>
    storeys.reduce((n, s) => {
      const rooms = irRoomsOf(s);
      const verts = rooms.reduce((k, r) => k + ringSize(r), 0);
      const maxRing = rooms.reduce((k, r) => Math.max(k, ringSize(r)), 0);
      const d = s.summary.doors.length;
      return n + s.summary.rooms.length + s.ir.elements.length + 2 * verts + d * (3 + 2 * maxRing);
    }, 1),
  judge(storeys, _profile, work) {
    let items = 0;
    let passes = 0;
    const skips: TasteSkip[] = [];
    const evidence = new EvidenceList();
    let first: { names: Map<string, string>; room: string; nib: bigint } | null = null;
    for (const s of storeys) {
      const names = namesOf(s, work);
      const skippedRooms = new Set<string>();
      const rooms = new Map<string, LatticePoint[] | null>();
      const irDoors: RDoor[] = [];
      for (const e of s.ir.elements) {
        work.n++;
        if (e.kind === "door") irDoors.push(e as RDoor);
        if (e.kind !== "room") continue;
        const room = e as RRoom;
        if (room.circle) {
          rooms.set(room.id, null);
          continue;
        }
        const corners = cornersOf(latticeRing(room, work), work);
        const rectilinear = corners.every((c, i) => {
          const d = corners[(i + 1) % corners.length]!;
          return c.x === d.x || c.y === d.y;
        });
        rooms.set(room.id, rectilinear && corners.length >= 4 ? corners : null);
      }
      // A centi-square-metre integer: `describe()` prints areas to 2 decimals, so this is exact.
      // A circulation side room is not judged: it reads as unbounded here.
      const area = new Map(
        s.summary.rooms.map((r) => [
          r.id,
          isCirculationRoom(r.uses) ? R16_SMALL_ROOM_CM2 : BigInt(Math.round(r.area_m2 * 100)),
        ]),
      );
      for (let i = 0; i < s.summary.doors.length; i++) {
        work.n++;
        const sd = s.summary.doors[i]!;
        const d = irDoors[i];
        if (d === undefined || d.id !== sd.id || sd.between.length !== 2 || sd.between.includes("exterior")) continue;
        const t = d.host ? lattice(d.host.thickness) : 0n;
        const limit = t > R16_CORNER ? t : R16_CORNER;
        const half = t / 2n;
        const at = { x: lattice(d.at.x), y: lattice(d.at.y) };
        const w = lattice(d.width);
        // The host's axis: a horizontal wall takes horizontal ring edges.
        const horizontal = d.host ? Math.abs(d.host.b.x - d.host.a.x) >= Math.abs(d.host.b.y - d.host.a.y) : null;
        for (const side of sd.between) {
          work.n++;
          const a = area.get(side);
          const c = rooms.get(side);
          if (a === undefined || c === undefined || a >= R16_SMALL_ROOM_CM2) continue;
          if (c === null) {
            if (!skippedRooms.has(side)) {
              skippedRooms.add(side);
              skips.push({ criterion: "R16", reason: "non-rectangular-room", room: side, ...levelOf(s) });
            }
            continue;
          }
          let best: { off: bigint; nib: bigint } | null = null;
          for (let k = 0; k < c.length; k++) {
            work.n++;
            const p = c[k]!;
            const q = c[(k + 1) % c.length]!;
            const hz = p.y === q.y;
            if (horizontal !== null && hz !== horizontal) continue;
            const lo = hz ? (p.x < q.x ? p.x : q.x) : p.y < q.y ? p.y : q.y;
            const hi = hz ? (p.x < q.x ? q.x : p.x) : p.y < q.y ? q.y : p.y;
            const u = hz ? at.x : at.y;
            const offRaw = hz ? at.y - p.y : at.x - p.x;
            const off = offRaw < 0n ? -offRaw : offRaw;
            if (u < lo || u > hi || off > half) continue;
            // Jamb to corner: exact on the lattice (2·nib avoids halving the width).
            const toLo = 2n * (u - lo) - w;
            const toHi = 2n * (hi - u) - w;
            let nib2 = toLo < toHi ? toLo : toHi;
            if (nib2 < 0n) nib2 = 0n;
            const nib = nib2 / 2n;
            if (best === null || off < best.off) best = { off, nib };
          }
          if (best === null) {
            skips.push({ criterion: "R16", reason: "door-off-ring", room: side, ...levelOf(s) });
            continue;
          }
          items++;
          if (best.nib <= limit) passes++;
          else first ??= { names, room: side, nib: best.nib };
          evidence.add(
            s,
            [d.id, side],
            `jamb ${fmtRatio(best.nib, 1000n, 0)} mm from the room's nearest corner (a corner door at most ${fmtRatio(limit, 1000n, 0)} mm)`,
          );
        }
      }
    }
    if (items === 0) return skipped("R16", "too-few-items", skips);
    const p = ramp({ num: BigInt(passes), den: BigInt(items) }, { num: 0n, den: 1n }, { num: 1n, den: 1n });
    const message = first
      ? `A door into ${first.names.get(first.room)} stands ${fmtRatio(first.nib, 1000n, 0)} mm from the room's nearest corner: ` +
        `${passes} of ${plural(items, "door")} into a room under 15 m² ${passes === 1 || items === 1 ? "sits" : "sit"} at a corner.`
      : `Every door into a room under 15 m² (${plural(items, "door")}) sits at a corner, leaving the walls whole.`;
    return {
      measured: { num: passes, den: items },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips,
    };
  },
};

// ---------------------------------------------------------------------------
// R17 · axis economy (geometry)
// ---------------------------------------------------------------------------

/** 100 mm on the lattice: two lines this close are one axis (single linkage). */
const R17_GAP = lattice(100);

/**
 * The fewest counted rooms R17 judges. `n` rectangles tiling an `a × b` grid need at least
 * `a + b + 2` axes, so the best value `n` rooms can reach is 4 for one room, 5/2 for two and 2 for
 * three: all above the ramp's `one` (1.5), so below four rooms the criterion would score the room
 * count, not the order. Four rooms in a 2 × 2 grid reach 6/4 = 1.5 exactly.
 */
const R17_MIN_ROOMS = 4;

/**
 * R17 · axis economy. Per storey: the x of every vertical and the y of every horizontal edge of
 * the room rings (circles left out) and of the straight wall centreline segments
 * (`segmentsOfWall`), as lattice integers, sorted; single-linkage clusters with gap ≤ 100 mm
 * (order-independent on sorted values). v = (clusters_x + clusters_y) / rooms, counting the
 * classified rooms that are not circulation (every classified room when all are circulation); a
 * storey with fewer than four such rooms is not judged ({@link R17_MIN_ROOMS}), though an
 * unclassified room's edges still count as lines (so relabelling a room to nothing never helps).
 * Ramp 2.5 → 1.5. Oblique edges are left
 * out and counted in the evidence. The criterion is the mean of its storeys; `measured` is
 * Σ clusters / Σ rooms.
 *
 * Sources: Brandão 2008 (wall segments) [S]. Ching, Architecture: Form, Space, and Order, ch. 7
 * "Principles" (the datum) [M] not shipped: the primary text was not read, only catalogue tables
 * of contents and lecture notes, so the criterion's shipped `source` does not cite it; "Distinct wall axes per plan p50/p95 15/23 (axes per non-hall room 2.33/3.0).
 * ArchLang's counting differs (room centrelines), so calibrate on the corpus: examples run
 * 0.7–2.0" [ResPlan prior, design-taste.md §4]: `one` at 1.5 and `zero` at 2.5 bracket that.
 */
const R17: TasteCriterionDef = {
  id: "R17",
  weight: 1,
  // uses (V) + the elements (E) + the walls + the lines (L ≤ ring vertices + wall segments),
  // added (L), sorted (L·(⌈log₂(L+1)⌉ + 1)) and walked (L).
  cost: (storeys) =>
    storeys.reduce((n, s) => {
      const verts = irRoomsOf(s).reduce((k, r) => k + ringSize(r), 0);
      const segs = s.ir.walls.reduce((k, w) => k + w.points.length, 0);
      const l = verts + segs;
      let lg = 0;
      while (2 ** lg < l + 1) lg++;
      return n + s.summary.rooms.length + s.ir.elements.length + s.ir.walls.length + 3 * l + l * (lg + 1);
    }, 1),
  judge(storeys, _profile, work) {
    const items: number[] = [];
    let clustersAll = 0;
    let roomsAll = 0;
    const evidence = new EvidenceList();
    let worst: { s: TasteStorey; v: Ratio } | null = null;
    for (const s of storeys) {
      const uses = usesOf(s, work);
      const xs: bigint[] = [];
      const ys: bigint[] = [];
      let oblique = 0;
      const ids: string[] = [];
      const addEdge = (p: LatticePoint, q: LatticePoint): void => {
        work.n++;
        if (p.x === q.x && p.y === q.y) return;
        if (p.x === q.x) xs.push(p.x);
        else if (p.y === q.y) ys.push(p.y);
        else oblique++;
      };
      let rooms = 0;
      let nonCirc = 0;
      for (const e of s.ir.elements) {
        work.n++;
        if (e.kind !== "room") continue;
        const room = e as RRoom;
        // Only classified rooms count (design §6 Q9: relabelling a room to nothing removes an
        // item); every room's edges are lines all the same.
        const u = uses.get(room.id) ?? [];
        if (u.length > 0) {
          rooms++;
          if (!isCirculationRoom(u)) nonCirc++;
        }
        if (room.circle) continue;
        if (ids.length < MAX_EVIDENCE) ids.push(room.id);
        const ring = latticeRing(room, work);
        for (let i = 0; i < ring.length; i++) addEdge(ring[i]!, ring[(i + 1) % ring.length]!);
      }
      for (const w of s.ir.walls) {
        work.n++;
        for (const seg of segmentsOfWall(w)) {
          if (seg.arc) {
            work.n++;
            continue;
          }
          addEdge({ x: lattice(seg.a.x), y: lattice(seg.a.y) }, { x: lattice(seg.b.x), y: lattice(seg.b.y) });
        }
      }
      const denom = nonCirc > 0 ? nonCirc : rooms;
      if (denom < R17_MIN_ROOMS) continue;
      const clusters = (vals: bigint[]): number => {
        vals.sort((a, b) => {
          work.n++;
          return a < b ? -1 : a > b ? 1 : 0;
        });
        let c = 0;
        for (let i = 0; i < vals.length; i++) {
          work.n++;
          if (i === 0 || vals[i]! - vals[i - 1]! > R17_GAP) c++;
        }
        return c;
      };
      const cx = clusters(xs);
      const cy = clusters(ys);
      const v: Ratio = { num: BigInt(cx + cy), den: BigInt(denom) };
      items.push(ramp(v, { num: 5n, den: 2n }, { num: 3n, den: 2n }));
      clustersAll += cx + cy;
      roomsAll += denom;
      if (worst === null || v.num * worst.v.den > worst.v.num * v.den) worst = { s, v };
      evidence.add(
        s,
        ids,
        // The two directions' counts, smaller first: a quarter turn swaps x and y, never the pair.
        `${Math.min(cx, cy)} + ${Math.max(cx, cy)} axes in the two directions over ${plural(denom, "room")} = ${fmtRatio(v.num, v.den, 2)} (score 1 at 1.5, 0 at 2.5)` +
          (oblique > 0 ? `; ${plural(oblique, "oblique edge")} not counted` : ""),
      );
    }
    if (items.length === 0) return skipped("R17", "too-few-items");
    const p = meanPermyriad(items.map((x) => ({ p: x, w: 1 })))!;
    const v = worst!.v;
    const at = worst!.s.level !== undefined && storeys.length > 1 ? ` on level ${worst!.s.level}` : "";
    const message =
      p === ONE
        ? `The edges fall on ${fmtRatio(v.num, v.den, 2)} axes per room${at} at most: a few shared datums.`
        : `The edges fall on ${fmtRatio(v.num, v.den, 2)} distinct axes per room${at}; ` +
          "walls lined up within 100 mm on fewer axes read as one ordered plan.";
    return {
      measured: { num: clustersAll, den: roomsAll },
      p,
      message,
      evidence: evidence.items,
      evidenceMore: evidence.more,
      skips: [],
    };
  },
};

/** The criteria of PS5.1, in R-number order. */
export const TASTE_CRITERIA: readonly TasteCriterionDef[] = [R3, R6, R7, R9, R11, R12, R14, R15, R16, R17, R18];
