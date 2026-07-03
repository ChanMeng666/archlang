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

import { describe, type DescribeOptions, type RoomSummary } from "./describe.js";
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

function matchRooms(before: RoomSummary[], after: RoomSummary[]): Array<[RoomSummary | null, RoomSummary | null]> {
  const pairs: Array<[RoomSummary | null, RoomSummary | null]> = [];
  const unmatchedAfter = new Map(after.map((r) => [r.id, r]));
  const leftoverBefore: RoomSummary[] = [];
  for (const a of before) {
    const hit = unmatchedAfter.get(a.id);
    if (hit) {
      pairs.push([a, hit]);
      unmatchedAfter.delete(a.id);
    } else leftoverBefore.push(a);
  }
  // Fallback: positional auto-ids can shift; rescue pairs whose label matches uniquely.
  for (const a of leftoverBefore) {
    const byLabel = a.label ? [...unmatchedAfter.values()].filter((r) => r.label === a.label) : [];
    if (byLabel.length === 1) {
      const b = byLabel[0]!;
      pairs.push([a, b]);
      unmatchedAfter.delete(b.id);
    } else pairs.push([a, null]);
  }
  for (const b of unmatchedAfter.values()) pairs.push([null, b]);
  return pairs;
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
  const before = describe(sourceA, opts);
  const after = describe(sourceB, opts);
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

  for (const [a, b] of matchRooms(before.rooms, after.rooms)) {
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

  if (before.circulation && after.circulation) {
    const afterByRoom = new Map(after.circulation.rooms.map((r) => [r.roomId, r]));
    for (const a of before.circulation.rooms) {
      const b = afterByRoom.get(a.roomId);
      if (!b) continue;
      if (
        Math.abs(b.walkDistanceMm - a.walkDistanceMm) > WALK_EPS_MM ||
        Math.abs(b.bottleneckClearWidthMm - a.bottleneckClearWidthMm) > PINCH_EPS_MM
      ) {
        base.circulation.push({
          roomId: a.roomId,
          walkDistanceBeforeMm: a.walkDistanceMm,
          walkDistanceAfterMm: b.walkDistanceMm,
          bottleneckBeforeMm: a.bottleneckClearWidthMm,
          bottleneckAfterMm: b.bottleneckClearWidthMm,
        });
      }
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

  return base;
}
