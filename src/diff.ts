/**
 * `diffPlans(sourceA, sourceB)` — a pure, structural semantic diff of two plans.
 *
 * Where {@link import("./describe.js").describe} turns one source into *facts*, this
 * turns two sources into the *delta* between them: which rooms were added, removed,
 * resized or relabeled; which doors/windows/openings appeared, vanished or changed
 * width; which furniture came and went; and the before/after plan totals. It runs
 * entirely on top of `describe()` — no geometry code of its own — so it inherits the
 * same purity, determinism and never-throw contract.
 *
 * Pure, synchronous, deterministic. It never throws on bad input: a side that fails
 * to resolve yields `{ ok: false, …empty… }`.
 *
 * Task 4 layers circulation deltas and human-readable summary sentences on top of the
 * {@link PlanDiff} returned here; those fields (`circulation`, `summary`) are present
 * but stay empty in this task. **The exported type shapes are frozen API** — ArchCanvas
 * consumes `PlanDiff` verbatim.
 */

import { describeWithAutoIds, type DescribeOptions, type RoomSummary, type SceneSummary } from "./describe.js";
import type { Diagnostic } from "./diagnostics.js";

/** A room's area may drift by this much (m²) before it counts as resized. */
const AREA_EPS_M2 = 0.05;
/** A bbox edge may drift by this much (mm) before it counts as resized. */
const EDGE_EPS_MM = 10;

export interface RoomChange {
  id: string;
  label?: string;
  change: "added" | "removed" | "resized" | "relabeled";
  areaBeforeM2?: number;
  areaAfterM2?: number;
  /** Signed mm delta of each bbox edge in plan coordinates (after − before); "resized" only. */
  edges?: { top: number; bottom: number; left: number; right: number };
}
export interface OpeningChange {
  id: string;
  kind: "door" | "window" | "opening";
  change: "added" | "removed" | "resized";
  widthBeforeMm?: number;
  widthAfterMm?: number;
  between?: string[];
}
export interface FurnitureChange {
  id: string;
  category: string;
  change: "added" | "removed";
}
export interface CirculationChange {
  roomId: string;
  walkDistanceBeforeMm: number;
  walkDistanceAfterMm: number;
  bottleneckBeforeMm: number;
  bottleneckAfterMm: number;
}
export interface PlanDiff {
  ok: boolean;
  diagnostics: Diagnostic[];
  rooms: RoomChange[];
  openings: OpeningChange[];
  furniture: FurnitureChange[];
  totals: { floorAreaBeforeM2: number; floorAreaAfterM2: number; roomsBefore: number; roomsAfter: number };
  circulation: CirculationChange[]; // populated in Task 4
  summary: string[]; // populated in Task 4
}

/** Adapt here (only here) if BBox is min/max-shaped — see plan Task 3 Step 2.
 *  The real `BBox` (src/geometry/rect.ts) is `{ x, y, w, h }` in mm, so this is a
 *  straight edge derivation. */
function edgesOf(b: RoomSummary["bbox"]): { top: number; bottom: number; left: number; right: number } {
  return { top: b.y, bottom: b.y + b.h, left: b.x, right: b.x + b.w };
}

/** The labels that name exactly one room of `rooms` — ALL of them, authored ids included.
 *  An empty label is "no label" (see the rescue below) and never counts. */
function uniqueLabels(rooms: RoomSummary[]): Set<string> {
  const count = new Map<string, number>();
  for (const r of rooms) if (r.label) count.set(r.label, (count.get(r.label) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n === 1).map(([l]) => l));
}

function matchRooms(
  before: RoomSummary[],
  after: RoomSummary[],
  autoBefore: ReadonlySet<string>,
  autoAfter: ReadonlySet<string>,
): Array<[RoomSummary | null, RoomSummary | null]> {
  const pairs: Array<[RoomSummary | null, RoomSummary | null]> = [];
  const unmatchedAfter = new Map(after.map((r) => [r.id, r]));
  // Pass 1 — an auto-id is POSITIONAL (`room_<n>` numbers rooms in source order), so it is a
  // false key the moment a room is inserted or removed ahead of it: matching by it first
  // paired every later room with its predecessor's successor. When a room's id is auto on
  // BOTH sides and its non-empty label names exactly one room among ALL rooms on EACH side,
  // the label is the better key, so those pairs match by label before any id is consulted.
  // The rule reads both sides identically (auto on both, unique on both), so swapping
  // "before" and "after" yields the same pairs — the antisymmetry law's precondition.
  const uniqBefore = uniqueLabels(before);
  const uniqAfter = uniqueLabels(after);
  const autoByLabelAfter = new Map<string, RoomSummary>();
  for (const b of after) if (b.label && uniqAfter.has(b.label) && autoAfter.has(b.id)) autoByLabelAfter.set(b.label, b);
  // Claimed up front (so no id match below can take an after-room a later label pair
  // needs), but EMITTED in the id loop below, in `before` order — a plan whose pairing
  // this pass does not change keeps the change order it had.
  const labelPartner = new Map<RoomSummary, RoomSummary>();
  for (const a of before) {
    if (!a.label || !uniqBefore.has(a.label) || !autoBefore.has(a.id)) continue;
    const b = autoByLabelAfter.get(a.label);
    if (!b) continue;
    labelPartner.set(a, b);
    unmatchedAfter.delete(b.id);
  }
  const leftoverBefore: RoomSummary[] = [];
  for (const a of before) {
    const partner = labelPartner.get(a);
    if (partner) {
      pairs.push([a, partner]);
      continue;
    }
    const hit = unmatchedAfter.get(a.id);
    if (hit) {
      pairs.push([a, hit]);
      unmatchedAfter.delete(a.id);
    } else leftoverBefore.push(a);
  }
  // Fallback: positional auto-ids can shift; rescue pairs whose label matches uniquely —
  // on BOTH sides. Checking only the after side made this order-dependent (and so not
  // antisymmetric: `diffPlans(A, B)` could rescue a pair that `diffPlans(B, A)` could
  // not, purely because `leftoverBefore`'s OTHER entries differ by direction). Two
  // same-labelled rooms on either side are an equally real ambiguity — the label alone
  // does not say which pairs with which — so neither side rescues, and every one of them
  // reports as a separate add/remove instead of a guessed match.
  for (const a of leftoverBefore) {
    // `a.label` (not `!== undefined`): an EMPTY label is "no label" everywhere else in
    // this file (the relabel check below reads both sides through `?? ""`), so it must
    // not become a rescue key here either — that would be a second, inconsistent
    // definition of "no label" for the one type this module treats as frozen API.
    const uniqueBefore = !!a.label && leftoverBefore.filter((r) => r.label === a.label).length === 1;
    const byLabel = uniqueBefore ? [...unmatchedAfter.values()].filter((r) => r.label === a.label) : [];
    if (byLabel.length === 1) {
      const b = byLabel[0]!;
      pairs.push([a, b]);
      unmatchedAfter.delete(b.id);
    } else pairs.push([a, null]);
  }
  for (const b of unmatchedAfter.values()) pairs.push([null, b]);
  return pairs;
}

/** One room's circulation verdict, named by the `describe().circulation` key it comes from:
 *  measured (`rooms[]`), blocked by furniture (`blocked[]`) or not measured, with the
 *  model's own reason code (`unmeasured[]`). */
type CirculationState =
  | { kind: "measured"; walkMm: number; pinchMm: number }
  | { kind: "blocked"; wayInMm: number }
  | { kind: "unmeasured"; reason: string };

function circulationStates(c: NonNullable<SceneSummary["circulation"]>): Map<string, CirculationState> {
  const out = new Map<string, CirculationState>();
  for (const r of c.rooms)
    out.set(r.roomId, { kind: "measured", walkMm: r.walkDistanceMm, pinchMm: r.bottleneckClearWidthMm });
  for (const r of c.blocked ?? []) out.set(r.roomId, { kind: "blocked", wayInMm: r.widestWayInMm });
  for (const r of c.unmeasured ?? []) out.set(r.roomId, { kind: "unmeasured", reason: r.reason });
  return out;
}

/** Same verdict: both measured (their numbers are `CirculationChange`'s business), both
 *  blocked, or both unmeasured for the same reason. */
function sameVerdict(a: CirculationState, b: CirculationState): boolean {
  if (a.kind === "unmeasured" && b.kind === "unmeasured") return a.reason === b.reason;
  return a.kind === b.kind;
}

function statePhrase(s: CirculationState, mm: (v: number) => string): string {
  if (s.kind === "measured") return `${mm(s.walkMm)} (pinch ${mm(s.pinchMm)})`;
  if (s.kind === "blocked") return `blocked (widest way in ${mm(s.wayInMm)})`;
  return `unmeasured (${s.reason})`;
}

/** Structural superset of {@link import("./describe.js").DoorSummary},
 *  `WindowSummary` and `OpeningSummary` — enough to diff any of the three by id. */
interface OpeningLike {
  id: string;
  width: number;
  between?: string[];
  room?: string | null;
}

function diffOpenings(
  kind: "door" | "window" | "opening",
  before: OpeningLike[],
  after: OpeningLike[],
): OpeningChange[] {
  const out: OpeningChange[] = [];
  const afterById = new Map(after.map((o) => [o.id, o]));
  for (const a of before) {
    const b = afterById.get(a.id);
    if (!b) {
      out.push({ id: a.id, kind, change: "removed", widthBeforeMm: a.width, between: a.between });
      continue;
    }
    afterById.delete(a.id);
    if (a.width !== b.width)
      out.push({
        id: a.id,
        kind,
        change: "resized",
        widthBeforeMm: a.width,
        widthAfterMm: b.width,
        between: b.between,
      });
  }
  for (const b of afterById.values())
    out.push({ id: b.id, kind, change: "added", widthAfterMm: b.width, between: b.between });
  return out;
}

/**
 * Diff two ArchLang sources into a {@link PlanDiff}. Never throws: if either side
 * fails to resolve, returns `{ ok: false, …empty arrays… }` with the collected
 * error diagnostics.
 *
 * @example
 * const d = diffPlans(oldSrc, newSrc);
 * if (d.ok) for (const r of d.rooms) console.log(r.id, r.change);
 */
export function diffPlans(sourceA: string, sourceB: string, opts: DescribeOptions = {}): PlanDiff {
  const { summary: before, autoRoomIds: autoBefore } = describeWithAutoIds(sourceA, opts);
  const { summary: after, autoRoomIds: autoAfter } = describeWithAutoIds(sourceB, opts);
  const base: PlanDiff = {
    ok: before.ok && after.ok,
    diagnostics: [...before.diagnostics, ...after.diagnostics].filter((d) => d.severity === "error"),
    rooms: [],
    openings: [],
    furniture: [],
    totals: {
      floorAreaBeforeM2: before.totals?.floor_area_m2 ?? 0,
      floorAreaAfterM2: after.totals?.floor_area_m2 ?? 0,
      roomsBefore: before.totals?.rooms ?? 0,
      roomsAfter: after.totals?.rooms ?? 0,
    },
    circulation: [],
    summary: [],
  };
  if (!base.ok) return base;

  const pairs = matchRooms(before.rooms, after.rooms, autoBefore, autoAfter);
  for (const [a, b] of pairs) {
    if (a && !b) base.rooms.push({ id: a.id, label: a.label, change: "removed", areaBeforeM2: a.area_m2 });
    else if (!a && b) base.rooms.push({ id: b.id, label: b.label, change: "added", areaAfterM2: b.area_m2 });
    else if (a && b) {
      const ea = edgesOf(a.bbox);
      const eb = edgesOf(b.bbox);
      const edges = {
        top: eb.top - ea.top,
        bottom: eb.bottom - ea.bottom,
        left: eb.left - ea.left,
        right: eb.right - ea.right,
      };
      const geometryChanged =
        Math.abs(b.area_m2 - a.area_m2) > AREA_EPS_M2 || Object.values(edges).some((v) => Math.abs(v) > EDGE_EPS_MM);
      if (geometryChanged)
        base.rooms.push({
          id: b.id,
          label: b.label,
          change: "resized",
          areaBeforeM2: a.area_m2,
          areaAfterM2: b.area_m2,
          edges,
        });
      else if ((a.label ?? "") !== (b.label ?? "")) base.rooms.push({ id: b.id, label: b.label, change: "relabeled" });
    }
  }

  base.openings = [
    ...diffOpenings("door", before.doors, after.doors),
    ...diffOpenings("window", before.windows, after.windows),
    ...diffOpenings("opening", before.openings, after.openings),
  ];

  const afterFurn = new Map(after.furniture.map((f) => [f.id, f]));
  for (const f of before.furniture) {
    if (!afterFurn.delete(f.id)) base.furniture.push({ id: f.id, category: f.category, change: "removed" });
  }
  for (const f of afterFurn.values()) base.furniture.push({ id: f.id, category: f.category, change: "added" });

  const WALK_EPS_MM = 250;
  const PINCH_EPS_MM = 50;
  const name = (id: string, label?: string) => label ?? id;
  const mm = (v: number) => `${Math.round(v)} mm`;
  const m2 = (v: number) => `${v.toFixed(1)} m²`;

  // A room's circulation is compared against its MATCHED room (the pairing above), not
  // whatever room holds the same id on the other side: under a shifted auto-id the same id
  // names a different room, and comparing by id reported one room's walk against another's.
  const partnerOf = new Map<string, RoomSummary>();
  for (const [a, b] of pairs) if (a && b) partnerOf.set(a.id, b);
  const stateSentences: string[] = [];

  if (before.circulation && after.circulation) {
    const afterByRoom = new Map(after.circulation.rooms.map((r) => [r.roomId, r]));
    for (const a of before.circulation.rooms) {
      const partner = partnerOf.get(a.roomId);
      const b = partner ? afterByRoom.get(partner.id) : undefined;
      // Not measured on the after side: a state change (blocked/unmeasured), reported below.
      if (!partner || !b) continue;
      if (
        Math.abs(b.walkDistanceMm - a.walkDistanceMm) > WALK_EPS_MM ||
        Math.abs(b.bottleneckClearWidthMm - a.bottleneckClearWidthMm) > PINCH_EPS_MM
      ) {
        base.circulation.push({
          roomId: partner.id,
          walkDistanceBeforeMm: a.walkDistanceMm,
          walkDistanceAfterMm: b.walkDistanceMm,
          bottleneckBeforeMm: a.bottleneckClearWidthMm,
          bottleneckAfterMm: b.bottleneckClearWidthMm,
        });
      }
    }

    // A matched room that is measured on one side and blocked/unmeasured on the other (or
    // unmeasured for a different reason) has no `CirculationChange` — that shape is frozen
    // API and carries two walks, which such a room does not have. It used to vanish from the
    // diff entirely; it is reported here as a sentence built from each side's own verdict
    // (`rooms[]`, `blocked[]` or `unmeasured[]`, which are total over the plan's rooms).
    const beforeState = circulationStates(before.circulation);
    const afterState = circulationStates(after.circulation);
    for (const [a, b] of pairs) {
      if (!a || !b) continue;
      const sa = beforeState.get(a.id);
      const sb = afterState.get(b.id);
      if (!sa || !sb || sameVerdict(sa, sb)) continue;
      stateSentences.push(`Walk to ${b.id}: ${statePhrase(sa, mm)} → ${statePhrase(sb, mm)}`);
    }
  }

  for (const r of base.rooms) {
    if (r.change === "added") base.summary.push(`Added ${name(r.id, r.label)} (${m2(r.areaAfterM2!)})`);
    else if (r.change === "removed") base.summary.push(`Removed ${name(r.id, r.label)} (${m2(r.areaBeforeM2!)})`);
    else if (r.change === "relabeled") base.summary.push(`Relabeled ${r.id} to "${r.label ?? ""}"`);
    else {
      const delta = r.areaAfterM2! - r.areaBeforeM2!;
      const edge = Object.entries(r.edges!).reduce((m, e) => (Math.abs(e[1]) > Math.abs(m[1]) ? e : m));
      const edgeNote =
        Math.abs(edge[1]) > EDGE_EPS_MM ? `; ${edge[0]} edge ${edge[1] > 0 ? "+" : ""}${mm(edge[1])}` : "";
      base.summary.push(`${name(r.id, r.label)} ${delta >= 0 ? "+" : ""}${m2(delta)}${edgeNote}`);
    }
  }
  for (const o of base.openings) {
    if (o.change === "added") base.summary.push(`Added ${o.kind} ${o.id} (${mm(o.widthAfterMm!)})`);
    else if (o.change === "removed") base.summary.push(`Removed ${o.kind} ${o.id}`);
    else base.summary.push(`${o.kind} ${o.id} width ${mm(o.widthBeforeMm!)} → ${mm(o.widthAfterMm!)}`);
  }
  for (const f of base.furniture)
    base.summary.push(`${f.change === "added" ? "Added" : "Removed"} ${f.category} ${f.id}`);
  for (const c of base.circulation) {
    base.summary.push(
      `Walk to ${c.roomId}: ${mm(c.walkDistanceBeforeMm)} → ${mm(c.walkDistanceAfterMm)} (pinch ${mm(c.bottleneckBeforeMm)} → ${mm(c.bottleneckAfterMm)})`,
    );
  }
  // After the measured deltas, still inside the trailing "Walk to" block.
  base.summary.push(...stateSentences);

  return base;
}
