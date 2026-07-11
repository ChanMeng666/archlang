/**
 * Intent assertions — the judge-v2 scoring core.
 *
 * A brief's `Expect` block compiles to a flat list of {@link Predicate}s, each checked
 * against a plan's {@link SceneSummary} (the same `describe()` facts an agent verifies
 * against). This is deliberately a SHALLOW, five-kind boundary: room count, room
 * existence, room area, total area, adjacency, reachability. A future `src/intent.ts`
 * is meant to LIFT exactly this predicate set into the core so the same intent contract
 * is checkable at author time — so keep predicates data-only and side-effect-free.
 *
 * Gating: `gate:true` predicates are conjunctive pass/fail (they decide `semanticPass`).
 * `adjacent`/`reachable` are `gate:false` in Tier 1 — scored as subscores only, never
 * failing a plan — because one-shot topology is the dimension v1.13's *loop* tools
 * (`arch fix`/`suggest`/`validate --graph`) address, not one-shot generation. The
 * documented T4 hook is to promote them to gating once the loop-vs-one-shot split is
 * measured.
 *
 * Tier-b size hook: qualitative size words in a brief ("generous", "compact", "large")
 * carry NO area cap here — a band is only asserted when the brief gives a number. A
 * real oversized/undersized instance is what would calibrate a qualitative cap; until
 * one exists, inventing bounds would measure the oracle's guesswork, not the plan.
 */

import type { RoomSummary, SceneSummary } from "../src/index.js";
import { isCirculationRoom, roomsMatching } from "./synonyms.js";
import type { Expect } from "./run.js";

/** Bump when predicate kinds or their semantics change (pinned by a test). */
export const JUDGE_VERSION = "2";

/** The `∞` upper bound for an open-ended area band. */
const INF = Number.POSITIVE_INFINITY;

/** A single checkable intent claim. `source` carries the brief phrase that licensed
 *  a quantitative band, so a failure message can cite it. `gate` marks whether the
 *  predicate contributes to the conjunctive pass/fail (vs. subscore-only). */
export type Predicate =
  | { kind: "room-count"; exact: number; expectedCirc: number; gate: true }
  | { kind: "room-exists"; concept: string; min: number; max?: number; gate: true }
  | { kind: "room-area"; concept: string; min: number; minM2?: number; maxM2?: number; source: string; gate: true }
  | { kind: "total-area"; minM2: number; maxM2: number; source: string; gate: true }
  | { kind: "adjacent"; a: string; b: string; source: string; gate: false }
  | { kind: "reachable"; gate: false };

export interface AssertionResult {
  predicate: Predicate;
  pass: boolean;
  /** Human-readable outcome; on a failing gate predicate this becomes the failure line. */
  detail: string;
  /** Graded contribution for the rooms subscore (room-count only: 1 exact, 0.5 ±1, else 0). */
  score?: number;
}

/** The four scored dimensions. `rooms`/`labels` are always present (every brief pins a
 *  room count and named rooms); `area`/`adjacency` are `null` when the brief asserts
 *  neither, so an unasserted dimension is not counted as a perfect (or failing) score. */
export interface Subscores {
  rooms: number;
  labels: number;
  area: number | null;
  adjacency: number | null;
}

/** Concepts that count as circulation for the policy-B room-count band. */
const CIRCULATION_CONCEPTS = new Set(["hall", "corridor"]);

/** Lower a brief's `Expect` block into the flat predicate list. */
export function compileExpect(e: Expect): Predicate[] {
  const preds: Predicate[] = [];

  if (e.rooms !== undefined) {
    // Expected circulation = the min counts of any circulation concepts the brief names.
    let expectedCirc = 0;
    for (const inc of e.roomsInclude ?? []) {
      if (CIRCULATION_CONCEPTS.has(inc.concept)) expectedCirc += inc.count?.min ?? 1;
    }
    preds.push({ kind: "room-count", exact: e.rooms, expectedCirc, gate: true });
  }

  for (const inc of e.roomsInclude ?? []) {
    const min = inc.count?.min ?? 1;
    preds.push({
      kind: "room-exists",
      concept: inc.concept,
      min,
      ...(inc.count?.max !== undefined ? { max: inc.count.max } : {}),
      gate: true,
    });
    if (inc.areaM2) {
      preds.push({
        kind: "room-area",
        concept: inc.concept,
        min,
        ...(inc.areaM2.min !== undefined ? { minM2: inc.areaM2.min } : {}),
        ...(inc.areaM2.max !== undefined ? { maxM2: inc.areaM2.max } : {}),
        source: inc.areaM2.source,
        gate: true,
      });
    }
  }

  if (e.totalAreaM2) {
    preds.push({
      kind: "total-area",
      minM2: e.totalAreaM2.min,
      maxM2: e.totalAreaM2.max,
      source: e.totalAreaM2.source,
      gate: true,
    });
  }

  if (e.adjacency) {
    for (const [a, bs] of Object.entries(e.adjacency.requiredEdges)) {
      for (const b of bs) preds.push({ kind: "adjacent", a, b, source: e.adjacency.source, gate: false });
    }
  }

  if (e.reachable) preds.push({ kind: "reachable", gate: false });

  return preds;
}

/** Format an area band `[lo, hi]` for a message, rendering `∞` for an open top. */
const band = (lo: number, hi: number): string => `[${lo}, ${hi === INF ? "∞" : hi}]`;

/** Whether `a` and `b` (concept ids) are joined by an interior door/opening in the
 *  plan's `input_graph`. Existential over both concepts' matched rooms; checked in
 *  both directions defensively though `input_graph` is symmetric. */
function conceptsAdjacent(a: string, b: string, summary: SceneSummary): boolean {
  const as = roomsMatching(a, summary.rooms);
  const bs = roomsMatching(b, summary.rooms);
  for (const ra of as) {
    const nbrs = summary.input_graph[ra.id] ?? [];
    for (const rb of bs) {
      if (ra.id === rb.id) continue;
      if (nbrs.includes(rb.id)) return true;
      if ((summary.input_graph[rb.id] ?? []).includes(ra.id)) return true;
    }
  }
  return false;
}

/** Check one predicate that does NOT participate in the room assignment pool.
 *  (`room-exists`/`room-area` are handled in {@link checkRoomExists}/{@link checkRoomArea}.) */
function checkOne(p: Exclude<Predicate, { kind: "room-exists" | "room-area" }>, summary: SceneSummary): AssertionResult {
  switch (p.kind) {
    case "room-count": {
      // Policy B (approved rubric): exact, OR one surplus room attributable to
      // circulation — got === exact + 1 AND the plan has at least one more
      // circulation room than the brief's named circulation. A surplus BEDROOM in a
      // plan that already has its hall still fails (the extra room is not circulation).
      const got = summary.totals.rooms;
      const exactMatch = got === p.exact;
      let pass = exactMatch;
      let note = "";
      if (!exactMatch && got === p.exact + 1) {
        const planCirc = summary.rooms.filter(isCirculationRoom).length;
        if (planCirc >= p.expectedCirc + 1) {
          pass = true;
          note = " (surplus is a circulation room — policy B)";
        } else {
          note = " (surplus is not a circulation room)";
        }
      }
      // Subscore grading is stricter than the gate: only an exact match is a perfect
      // rooms score; a policy-B pass still records the +1 delta as 0.5.
      const score = exactMatch ? 1 : Math.abs(got - p.exact) <= 1 ? 0.5 : 0;
      return { predicate: p, pass, detail: `rooms: expected ${p.exact}, got ${got}${note}`, score };
    }
    case "total-area": {
      const a = summary.totals.floor_area_m2;
      const pass = a >= p.minM2 && a <= p.maxM2;
      const detail = pass
        ? `area: total ${a} m² within ${band(p.minM2, p.maxM2)}`
        : `area: total ${a} m² outside ${band(p.minM2, p.maxM2)} (${p.source})`;
      return { predicate: p, pass, detail };
    }
    case "adjacent": {
      const pass = conceptsAdjacent(p.a, p.b, summary);
      const detail = pass
        ? `adjacency: "${p.a}" ↔ "${p.b}" connected`
        : `adjacency: "${p.a}" not connected to "${p.b}" (${p.source})`;
      return { predicate: p, pass, detail };
    }
    case "reachable": {
      const unreachable = summary.access.rooms.filter((r) => !r.reachable).map((r) => r.id);
      const pass = summary.access.hasEntrance && unreachable.length === 0;
      const detail = pass
        ? `reachable: all ${summary.access.rooms.length} room(s) reachable`
        : `reachable: ${
            !summary.access.hasEntrance ? "no modeled entrance" : `unreachable: ${unreachable.join(", ")}`
          }`;
      return { predicate: p, pass, detail };
    }
  }
}

/** A `room-exists` check against the pool of rooms not yet claimed by an earlier
 *  concept (rubric §2 one-room-one-concept). Consumes its available matches so a later
 *  concept can't re-count them — a single "WC" room can't clear both a `bathroom` and a
 *  `wc` expectation — and records the claim so this concept's `room-area` check (if any)
 *  scores over exactly the rooms it was credited with. */
function checkRoomExists(
  p: Extract<Predicate, { kind: "room-exists" }>,
  summary: SceneSummary,
  consumed: Set<string>,
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  const available = roomsMatching(p.concept, summary.rooms).filter((r) => !consumed.has(r.id));
  for (const r of available) consumed.add(r.id);
  claims.set(p.concept, available);
  const n = available.length;
  const pass = n >= p.min && (p.max === undefined || n <= p.max);
  const want = p.max !== undefined ? `${p.min}–${p.max}` : `${p.min}`;
  const detail = pass
    ? `label: concept "${p.concept}" ok (found ${n})`
    : `label: no room matching concept "${p.concept}" (needed ${want}, found ${n})`;
  return { predicate: p, pass, detail };
}

/** A `room-area` check over a concept's ASSIGNED rooms (rubric §2 — the same rooms its
 *  `room-exists` claimed), so an area band is measured against the rooms credited to
 *  this concept, not any room that merely matches it. Falls back to a full match if no
 *  `room-exists` preceded it (compileExpect always emits one, so this is defensive). */
function checkRoomArea(
  p: Extract<Predicate, { kind: "room-area" }>,
  summary: SceneSummary,
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  const lo = p.minM2 ?? 0;
  const hi = p.maxM2 ?? INF;
  const assigned = claims.get(p.concept) ?? roomsMatching(p.concept, summary.rooms);
  const within = assigned.filter((r) => r.area_m2 >= lo && r.area_m2 <= hi).length;
  const pass = within >= p.min;
  const detail = pass
    ? `area: concept "${p.concept}" ok (${within} within ${band(lo, hi)} m²)`
    : `area: only ${within} room(s) matching "${p.concept}" within ${band(lo, hi)} m² (needed ${p.min}) (${p.source})`;
  return { predicate: p, pass, detail };
}

/**
 * Check every predicate against a plan summary. `room-exists`/`room-area` are resolved
 * with a GREEDY one-room-one-concept assignment in corpus (predicate) order (rubric §2):
 * each concept claims its still-unclaimed matching rooms, and a claimed room is
 * unavailable to later concepts. `adjacent` deliberately matches over ALL rooms (rubric
 * §4 — required-edge subset semantics; it asks "is there a bathroom next to the hall?",
 * not "how many are left"); `total-area`/`room-count` are plan-wide.
 */
export function checkPredicates(preds: Predicate[], summary: SceneSummary): AssertionResult[] {
  const consumed = new Set<string>();
  const claims = new Map<string, RoomSummary[]>();
  return preds.map((p) => {
    if (p.kind === "room-exists") return checkRoomExists(p, summary, consumed, claims);
    if (p.kind === "room-area") return checkRoomArea(p, summary, claims);
    return checkOne(p, summary);
  });
}

/** Fraction of a group of results that passed, or `null` when the group is empty. */
const frac = (rs: AssertionResult[]): number | null =>
  rs.length === 0 ? null : rs.filter((r) => r.pass).length / rs.length;

/** Project the four scored dimensions from a checked predicate list. `rooms`/`labels`
 *  default to a full 1 when the brief pins neither (nothing to penalize). */
export function projectSubscores(results: AssertionResult[]): Subscores {
  const of = (k: Predicate["kind"]): AssertionResult[] => results.filter((r) => r.predicate.kind === k);

  const roomCount = of("room-count")[0];
  const labelRs = of("room-exists");
  const areaRs = [...of("room-area"), ...of("total-area")];
  const adjRs = [...of("adjacent"), ...of("reachable")];

  return {
    rooms: roomCount?.score ?? 1,
    labels: frac(labelRs) ?? 1,
    area: frac(areaRs),
    adjacency: frac(adjRs),
  };
}
