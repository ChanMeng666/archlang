/**
 * The intent channel — author-time checking of a brief's INTENT against a plan.
 *
 * This lifts the eval's judge-v2 scoring core into the core package so the same
 * intent contract a brief is measured against is checkable while authoring. A brief's
 * {@link Intent} (what the source text asked for, as data) compiles to a flat list of
 * {@link Predicate}s, each checked against a plan's {@link SceneSummary} — the same
 * `describe()` facts a text-only agent verifies against. {@link validateIntent} runs the
 * whole pipeline (`describe` → compile → check) and returns typed, catalogued
 * {@link IntentViolation}s with Nickel-style blame messages.
 *
 * Gating mirrors judge v2: room count / existence / area / total-area / windows gate
 * (a real deliverable miss), and so do the brief-bound measures (a room's width, depth or
 * exact size, the gross internal area: PS4.4); adjacency and reachability score as subscores but never
 * gate — one-shot topology is what the LOOP tools (`archlang fix`/`suggest`/`validate
 * --graph`) address, not one-shot generation. Whether a diagnostic feedback loop beats
 * equal-budget resampling is an open question; nothing here decides it.
 *
 * Pure, synchronous, deterministic; zero-dependency (no `node:` imports). Problems are
 * returned as violations/diagnostics, never thrown.
 */

import type { Diagnostic } from "./diagnostics.js";
import { describe } from "./describe.js";
import type { DescribeOptions, RoomSummary, SceneSummary, WindowSummary } from "./describe.js";
import type { GrossAreaReason } from "./analyze/gross-area.js";
import { polygonLabelPoint } from "./geometry/polygon.js";
import { isCirculationRoom, roomsMatchingConcept } from "./intent-concepts.js";
import { makeNaming, type NameableRoom, sizeWords } from "./naming.js";
import { fmt2 } from "./num-format.js";
import { type CompassLetter, type SiteFacts, SYMBOLIC_FACINGS, type SymbolicFacing } from "./site.js";

/** Bump when predicate kinds or their *corpus judgments* change (pinned by a test).
 *  Re-exported by the eval's `assertions.ts`; the byte-equivalence criterion is that
 *  every corpus per-assertion judgment is unchanged — new predicate kinds unused by the
 *  corpus (e.g. `room-windows`) do not bump it. */
export const JUDGE_VERSION = "2";

/** The `∞` upper bound for an open-ended area band. */
const INF = Number.POSITIVE_INFINITY;

/**
 * What a `windows.facing` may name: a plain TRUE-COMPASS letter, or one of the derived
 * direction names a plan's `site` block licenses ({@link SymbolicFacing}), which resolves
 * to a letter through `describe().site` at check time.
 *
 * A symbolic name is the SAME assertion written differently — "a window facing the
 * equator side" is "a window facing S" once the site is known — so it rides the existing
 * `room-windows` predicate rather than a new kind, and does not change its gating tier.
 * Asserting one against a plan with no `site` is `E_INTENT_NO_SITE`: unanswerable, never
 * a silent pass or a silent miss.
 *
 * **The `_side` names are a drafting heuristic, not a measured daylight outcome** — see
 * `src/site.ts`. `equator_side` asserts an aspect, not sunlight.
 */
export type IntentFacing = CompassLetter | SymbolicFacing;

/** Is this facing one of the site-derived names (as opposed to a bare compass letter)? */
function isSymbolicFacing(f: IntentFacing): f is SymbolicFacing {
  return (SYMBOLIC_FACINGS as readonly string[]).includes(f);
}

/** The letter a facing means for a given plan: itself when it is already a letter, else
 *  the site's value for that name — or `null` when the plan declares no `site`, which is
 *  the `E_INTENT_NO_SITE` condition. */
function facingLetter(f: IntentFacing, site: SiteFacts | undefined): CompassLetter | null {
  if (!isSymbolicFacing(f)) return f;
  return site ? site[f] : null;
}

// ---------------------------------------------------------------------------
// Intent — the brief's checkable expectations (the judge-v2 shape).
// ---------------------------------------------------------------------------

/**
 * A floor-plan brief's semantic expectations, as data. Every field is BRIEF-grounded
 * (derived from the prompt's words, not any golden's labels/geometry): concepts come
 * from the {@link import("./intent-concepts.js")} vocabulary, and quantitative bands
 * (`areaM2`/`totalAreaM2`) carry a `source` quote from the brief so a failure can cite
 * what licensed the number. `adjacency`/`reachable` are advisory (scored, never gating).
 *
 * Band conventions (normative — see `INTENT_JSON_SCHEMA`): "about/around/~N m²" or a
 * bare "N m²" → min/max at ±10% of N; "at least N m²" → `min` only (open top);
 * qualitative size words → no area assertion. Count discipline: assert `rooms` only when
 * the brief ENUMERATES the rooms.
 */
export interface Intent {
  /** Optional schema URI for editor tooling; ignored by the check. */
  $schema?: string;
  /** Optional identifier for the intent file; ignored by the check. */
  $id?: string;
  /** Exact expected room count, over every storey. Assert only when the brief enumerates the
   *  rooms. */
  rooms?: number;
  /** Rooms the brief names, as concepts, with optional count/area/window bands. Rooms on any
   *  storey count. */
  roomsInclude?: {
    concept: string;
    count?: { min?: number; max?: number };
    areaM2?: { min?: number; max?: number; source: string };
    /** Window presence/count the brief requires for this room (gating). `facing`, when
     *  present, restricts the count to windows whose host wall faces that TRUE COMPASS
     *  direction — `describe().windows[].facing`, which reads the page direction against
     *  the plan's `north` setting — so assert it only when the brief states an
     *  orientation. It may be a letter or one of the plan's site-derived names
     *  ({@link IntentFacing}); a symbolic name against a plan with no `site` is
     *  `E_INTENT_NO_SITE`. */
    windows?: { min?: number; max?: number; facing?: IntentFacing };
  }[];
  /** Total floor-area band, summed over every storey — only where the brief states a number.
   *  At least one bound; an open top ("at least N m²") sets `min` alone. */
  totalAreaM2?: { min?: number; max?: number; source: string };
  /** Interior-door adjacency the brief licenses, on any one storey: `{ conceptA: [conceptB, …] }`.
   *  Advisory. */
  adjacency?: { requiredEdges: Record<string, string[]>; source: string };
  /** Every room reachable from a modeled entrance — asserted only on brief license. Advisory. */
  reachable?: boolean;
  /**
   * Gross internal area band (m²): the floor inside the exterior walls' inner faces,
   * `describe().totals.gross_internal_area_m2` — the figure a brief's "about N m²" means. On a
   * plan with `level` blocks, the building's: `totals.gross_internal_area_all_levels_m2`.
   * Same band conventions and `source` rule as {@link totalAreaM2}. Gating.
   */
  grossInternalAreaM2?: { min?: number; max?: number; source: string };
  /**
   * Room sizes the brief STATES, bound to one room each (PS4.4). `room` is the room's id or
   * its exact label. Widths and depths are on wall centrelines (the room's own `size`):
   * `widthMm` is its extent along the page's x axis, `depthMm` along y; `sizeMm` is an exact
   * size, `w × h` in either orientation, within `tolerance` mm (default 0). A polygon or
   * circular room has no single width and is refused, never approximated. Gating.
   */
  roomDimensions?: RoomDimensionIntent[];
}

/** One {@link Intent.roomDimensions} entry: at least one of the three measures. */
export interface RoomDimensionIntent {
  /** The room's id, or its label exactly as written. */
  room: string;
  widthMm?: { min?: number; max?: number; source: string };
  depthMm?: { min?: number; max?: number; source: string };
  sizeMm?: { w: number; h: number; tolerance?: number; source: string };
}

/** Why a brief-bound measure has no value on a plan: the room selector found no room or more
 *  than one, the room is not a rectangle, the plan did not resolve, or the plan has no gross
 *  internal area (`describe().totals.gross_internal_area_omitted`). */
export type IntentUnmeasuredReason =
  | "room-not-found"
  | "room-ambiguous"
  | "room-not-rectangular"
  | "plan-unresolved"
  | GrossAreaReason;

/** What a brief-bound measure read off the plan ({@link AssertionResult.measure}). */
export interface IntentMeasureReading {
  /** What was measured, as a person names it: `"Bedroom 1" width`, `gross internal area`. */
  what: string;
  unit: "mm" | "m2";
  /** The value read: one for a band, `[w, h]` for an exact size. Absent when unmeasured. */
  measured?: number[];
  /**
   * Signed residual per value: `0` inside the band, `measured − min` below it (negative),
   * `measured − max` above it; for an exact size, `measured − target` on each axis (in the
   * orientation that fits best). Absent when unmeasured.
   */
  residual?: number[];
  /** Why there is no value. Present only then. */
  reason?: IntentUnmeasuredReason;
  /** The storey the measure reads (a bound room's, or the first storey with no gross internal
   *  area), present only on a multi-storey plan. */
  level?: number;
  /** An exact size matched with its sides swapped (the room stands turned); present only then. */
  turned?: true;
}

/** A row of {@link IntentCheckResult.measures}: the reading, its intent path and its verdict. */
export interface IntentMeasure extends IntentMeasureReading {
  path: string;
  pass: boolean;
}

/** A single checkable intent claim. `source` carries the brief phrase that licensed
 *  a quantitative band, so a failure message can cite it. `gate` marks whether the
 *  predicate contributes to the conjunctive pass/fail (vs. subscore-only). */
export type Predicate =
  | { kind: "room-count"; exact: number; expectedCirc: number; gate: true }
  | { kind: "room-exists"; concept: string; min: number; max?: number; gate: true }
  | { kind: "room-area"; concept: string; min: number; minM2?: number; maxM2?: number; source: string; gate: true }
  | { kind: "total-area"; minM2: number; maxM2: number; source: string; gate: true }
  | { kind: "adjacent"; a: string; b: string; source: string; gate: false }
  | { kind: "reachable"; gate: false }
  | { kind: "room-windows"; concept: string; min: number; max?: number; facing?: IntentFacing; gate: true }
  | { kind: "gross-area"; minM2: number; maxM2: number; source: string; gate: true }
  | {
      kind: "room-dimension";
      room: string;
      axis: "width" | "depth";
      minMm?: number;
      maxMm?: number;
      source: string;
      gate: true;
    }
  | { kind: "room-size"; room: string; w: number; h: number; toleranceMm: number; source: string; gate: true };

export interface AssertionResult {
  predicate: Predicate;
  pass: boolean;
  /** Human-readable outcome; on a failing gate predicate this becomes the failure line. */
  detail: string;
  /** Graded contribution for the rooms subscore (room-count only: 1 exact, 0.5 ±1, else 0). */
  score?: number;
  /** What a brief-bound measure (`gross-area`, `room-dimension`, `room-size`) read; absent
   *  on every other kind, so their results are what they always were. */
  measure?: IntentMeasureReading;
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

/** The twelve catalogued blame codes {@link validateIntent} emits. */
export type IntentCode =
  | "E_INTENT_ROOM_MISSING"
  | "E_INTENT_ROOM_COUNT"
  | "E_INTENT_ROOM_AREA"
  | "E_INTENT_TOTAL_AREA"
  | "E_INTENT_NOT_ADJACENT"
  | "E_INTENT_NO_DOOR"
  | "E_INTENT_UNREACHABLE"
  | "E_INTENT_NO_WINDOW"
  | "E_INTENT_NO_SITE"
  | "E_INTENT_GROSS_AREA"
  | "E_INTENT_ROOM_DIMENSION"
  | "E_INTENT_UNMEASURED";

/** A failed intent assertion, blamed to a code, message, and originating predicate.
 *  `gate` is false for advisory (adjacency/reachability) violations — they are reported
 *  and scored but never fail {@link IntentCheckResult.ok}. */
export interface IntentViolation {
  code: IntentCode;
  message: string;
  gate: boolean;
  predicate: Predicate;
}

/** The result of checking a brief's {@link Intent} against a plan. `ok` is true when the
 *  plan compiles and every GATING assertion passes (advisory misses do not clear it). */
export interface IntentCheckResult {
  ok: boolean;
  /** Passing assertions (gating and advisory). */
  satisfied: number;
  /** All assertions checked. */
  total: number;
  violations: IntentViolation[];
  subscores: Subscores;
  assertions: AssertionResult[];
  /** The plan's compile diagnostics (empty when it compiles). */
  diagnostics: Diagnostic[];
  /** One row per brief-bound measure (gross internal area, a room's width, depth or exact
   *  size), in assertion order: the value read and its residual, or why there is none.
   *  Present only when the intent asserts one, so every other result is unchanged. */
  measures?: IntentMeasure[];
}

// ---------------------------------------------------------------------------
// compileIntent — lower an Intent to the flat predicate list.
// ---------------------------------------------------------------------------

/** Concepts that count as circulation for the policy-B room-count band. */
const CIRCULATION_CONCEPTS = new Set(["hall", "corridor"]);

/** Lower an {@link Intent} to predicates AND a parallel array of JSON-pointer-ish paths
 *  (paths[i] blames predicates[i] to the originating Intent field). Kept internal so the
 *  exported {@link compileIntent} can return the bare `Predicate[]` (its object shapes are
 *  pinned by a fixture) while {@link validateIntent} still has a path per predicate. */
function compileWithPaths(e: Intent): { predicates: Predicate[]; paths: string[] } {
  const predicates: Predicate[] = [];
  const paths: string[] = [];
  const push = (p: Predicate, path: string): void => {
    predicates.push(p);
    paths.push(path);
  };

  if (e.rooms !== undefined) {
    // Expected circulation = the min counts of any circulation concepts the brief names.
    let expectedCirc = 0;
    for (const inc of e.roomsInclude ?? []) {
      if (CIRCULATION_CONCEPTS.has(inc.concept)) expectedCirc += inc.count?.min ?? 1;
    }
    push({ kind: "room-count", exact: e.rooms, expectedCirc, gate: true }, "/rooms");
  }

  (e.roomsInclude ?? []).forEach((inc, i) => {
    const min = inc.count?.min ?? 1;
    push(
      {
        kind: "room-exists",
        concept: inc.concept,
        min,
        ...(inc.count?.max !== undefined ? { max: inc.count.max } : {}),
        gate: true,
      },
      `/roomsInclude/${i}`,
    );
    if (inc.areaM2) {
      push(
        {
          kind: "room-area",
          concept: inc.concept,
          min,
          ...(inc.areaM2.min !== undefined ? { minM2: inc.areaM2.min } : {}),
          ...(inc.areaM2.max !== undefined ? { maxM2: inc.areaM2.max } : {}),
          source: inc.areaM2.source,
          gate: true,
        },
        `/roomsInclude/${i}/areaM2`,
      );
    }
    if (inc.windows) {
      push(
        {
          kind: "room-windows",
          concept: inc.concept,
          min: inc.windows.min ?? 1,
          ...(inc.windows.max !== undefined ? { max: inc.windows.max } : {}),
          ...(inc.windows.facing !== undefined ? { facing: inc.windows.facing } : {}),
          gate: true,
        },
        `/roomsInclude/${i}/windows`,
      );
    }
  });

  if (e.totalAreaM2) {
    push(
      {
        kind: "total-area",
        minM2: e.totalAreaM2.min ?? 0,
        maxM2: e.totalAreaM2.max ?? INF,
        source: e.totalAreaM2.source,
        gate: true,
      },
      "/totalAreaM2",
    );
  }

  if (e.grossInternalAreaM2) {
    push(
      {
        kind: "gross-area",
        minM2: e.grossInternalAreaM2.min ?? 0,
        maxM2: e.grossInternalAreaM2.max ?? INF,
        source: e.grossInternalAreaM2.source,
        gate: true,
      },
      "/grossInternalAreaM2",
    );
  }

  (e.roomDimensions ?? []).forEach((d, i) => {
    const path = `/roomDimensions/${i}`;
    for (const [axis, b] of [
      ["width", d.widthMm],
      ["depth", d.depthMm],
    ] as const) {
      if (!b) continue;
      push(
        {
          kind: "room-dimension",
          room: d.room,
          axis,
          ...(b.min !== undefined ? { minMm: b.min } : {}),
          ...(b.max !== undefined ? { maxMm: b.max } : {}),
          source: b.source,
          gate: true,
        },
        `${path}/${axis}Mm`,
      );
    }
    if (d.sizeMm) {
      push(
        {
          kind: "room-size",
          room: d.room,
          w: d.sizeMm.w,
          h: d.sizeMm.h,
          toleranceMm: d.sizeMm.tolerance ?? 0,
          source: d.sizeMm.source,
          gate: true,
        },
        `${path}/sizeMm`,
      );
    }
  });

  if (e.adjacency) {
    for (const [a, bs] of Object.entries(e.adjacency.requiredEdges)) {
      for (const b of bs) push({ kind: "adjacent", a, b, source: e.adjacency.source, gate: false }, "/adjacency");
    }
  }

  if (e.reachable) push({ kind: "reachable", gate: false }, "/reachable");

  return { predicates, paths };
}

/** Lower a brief's {@link Intent} into the flat predicate list. */
export function compileIntent(intent: Intent): Predicate[] {
  return compileWithPaths(intent).predicates;
}

// ---------------------------------------------------------------------------
// checkPredicates — evaluate predicates against a plan summary.
// ---------------------------------------------------------------------------

/** Format an area band `[lo, hi]` for a message, rendering `∞` for an open top. */
const band = (lo: number, hi: number): string => `[${lo}, ${hi === INF ? "∞" : hi}]`;

/** The facts of one storey an assertion over rooms reads. */
type StoreyFacts = Pick<SceneSummary, "rooms" | "windows" | "input_graph" | "totals">;

/** The storeys a brief is checked over, lowest first. `describe()`'s top-level facts are the
 *  LOWEST storey, so a plan with `level` blocks is read from `levels[]`; a plan with none is its
 *  one storey. A room id is unique only within a storey: never match one across two of these. */
const storeysOf = (summary: SceneSummary): readonly StoreyFacts[] =>
  summary.levels?.length ? summary.levels : [summary];

/** Every room of the plan, lowest storey first. */
const allRooms = (summary: SceneSummary): RoomSummary[] => storeysOf(summary).flatMap((s) => s.rooms);

/** The plan's total floor area: the storeys' figures summed and rounded as each already is, or
 *  the one storey's figure untouched. */
function totalFloorArea(summary: SceneSummary): number {
  const storeys = storeysOf(summary);
  if (storeys.length === 1) return storeys[0]!.totals.floor_area_m2;
  return r2(storeys.reduce((n, s) => n + s.totals.floor_area_m2, 0));
}

/** Whether `a` and `b` (concept ids) are joined by an interior door/opening in the
 *  plan's `input_graph`, on any one storey (a shaft joins storeys, a door never does).
 *  Existential over both concepts' matched rooms; checked in both directions defensively
 *  though `input_graph` is symmetric. */
function conceptsAdjacent(a: string, b: string, summary: SceneSummary): boolean {
  return storeysOf(summary).some((storey) => {
    const as = roomsMatchingConcept(a, storey.rooms);
    const bs = roomsMatchingConcept(b, storey.rooms);
    for (const ra of as) {
      const nbrs = storey.input_graph[ra.id] ?? [];
      for (const rb of bs) {
        if (ra.id === rb.id) continue;
        if (nbrs.includes(rb.id)) return true;
        if ((storey.input_graph[rb.id] ?? []).includes(ra.id)) return true;
      }
    }
    return false;
  });
}

/** Check one predicate that does NOT participate in the room assignment pool.
 *  (`room-exists`/`room-area`/`room-windows` are handled by their own checkers.) */
function checkOne(
  p: Exclude<Predicate, { kind: "room-exists" | "room-area" | "room-windows" | BriefMeasureKind }>,
  summary: SceneSummary,
): AssertionResult {
  switch (p.kind) {
    case "room-count": {
      // Policy B (approved rubric): exact, OR a surplus of up to one room per storey
      // attributable to circulation — the plan has at least that many more circulation
      // rooms than the brief's named circulation, because each storey needs its own hall or
      // landing and a brief rarely lists them. A surplus BEDROOM in a plan that already has
      // its hall still fails (the extra room is not circulation).
      const got = storeysOf(summary).reduce((n, s) => n + s.totals.rooms, 0);
      const exactMatch = got === p.exact;
      let pass = exactMatch;
      let note = "";
      const surplus = got - p.exact;
      if (surplus >= 1 && surplus <= storeysOf(summary).length) {
        const planCirc = allRooms(summary).filter(isCirculationRoom).length;
        if (planCirc >= p.expectedCirc + surplus) {
          pass = true;
          note =
            surplus === 1
              ? " (surplus is a circulation room — policy B)"
              : ` (surplus is ${surplus} circulation rooms — policy B)`;
        } else {
          note = " (surplus is not a circulation room)";
        }
      }
      // Subscore grading is stricter than the gate: only an exact match is a perfect
      // rooms score; a policy-B pass still records its delta as 0.5.
      const score = exactMatch ? 1 : pass || Math.abs(surplus) <= 1 ? 0.5 : 0;
      return { predicate: p, pass, detail: `rooms: expected ${p.exact}, got ${got}${note}`, score };
    }
    case "total-area": {
      const a = totalFloorArea(summary);
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
      // Multi-storey: the top-level `access` is the LOWEST storey only, so every storey must
      // also have a way in — its own exterior door, or a shaft from a reachable storey
      // (`vertical.reachable_levels`, the room-aware fixpoint in `src/vertical.ts`).
      // KNOWN LIMIT: per-room reachability on an upper storey is not checked here. Its
      // `levels[i].access.rooms[].reachable` counts only exterior doors, not shaft arrivals,
      // so reading it would fail every stair-served upper floor; answering it needs a new
      // describe fact (rooms reached per storey from the arrival rooms), deliberately not
      // added. A single-storey summary has no `levels` and is judged exactly as before.
      //
      // The storey check runs only when the base check found an entrance. Without one the
      // assertion already fails as "no modeled entrance" (and the lowest storey — the one
      // whose `access` was read — would be named a second time under another cause), so
      // the verdict, the detail and the violation code stay exactly the single-storey ones.
      const reachableLevels = new Set(summary.vertical?.reachable_levels ?? []);
      const cutOff = summary.access.hasEntrance
        ? (summary.levels ?? [])
            .filter((l) => !reachableLevels.has(l.level) && !l.access.hasEntrance)
            .map((l) => l.level)
        : [];
      const pass = summary.access.hasEntrance && unreachable.length === 0 && cutOff.length === 0;
      // Each cause that holds, in a fixed order; with no storey cut off this is exactly the
      // single-storey wording.
      const causes = !summary.access.hasEntrance
        ? ["no modeled entrance"]
        : unreachable.length > 0
          ? [`unreachable: ${unreachable.join(", ")}`]
          : [];
      if (cutOff.length > 0) {
        // A shaft can join a cut-off storey and still not count: it is live only from a
        // room you can reach on its other storey (a stair in a sealed store is dead).
        causes.push(
          `no way into storey(s): ${cutOff.join(", ")} (no exterior door and no live shaft — a shaft counts only from a room you can reach)`,
        );
      }
      const detail = pass
        ? `reachable: all ${summary.access.rooms.length} room(s) reachable`
        : `reachable: ${causes.join("; ")}`;
      return { predicate: p, pass, detail };
    }
  }
}

/** Assign rooms to the brief's `room-exists` predicates under rubric §2's
 *  one-room-one-concept rule. Returns one claim list per predicate index (an entry only
 *  for `room-exists` predicates); every room is claimed by at most one predicate.
 *
 *  Two phases, both deterministic:
 *
 *  1. **Feasibility matching.** Each `room-exists` predicate needs `min` distinct rooms, so
 *     it contributes `min` slots; a maximum bipartite matching of slots to matching rooms
 *     (Kuhn augmenting paths) credits as many of those needs as the plan can meet at once.
 *     Slots are tried in predicate order, so an earlier slot, once matched, stays matched
 *     (it may be moved to another room, never dropped). Each slot ranks its candidates as
 *     the rooms its predicate would have claimed on its own — rooms no EARLIER predicate
 *     matches — then the rest, each group in source order; it takes the first FREE room
 *     in that ranking, and only when none is free walks an augmenting path.
 *  2. **Leftovers.** Every room the matching did not use goes to the FIRST predicate, in
 *     predicate order, that matches it.
 *
 *  A room's first matching predicate is the one the old greedy pass handed it to, so when
 *  greedy already met every `min` the matching only picks rooms greedy gave the same
 *  predicate, and phase 2 hands back the rest — the claims are exactly greedy's. They
 *  differ only when greedy would let a concept swallow a room a later concept needs (rooms
 *  `uses storage` and `uses utility` share a room_type, so greedy lets `storage` claim
 *  both, starving `utility`). */
function assignRooms(preds: Predicate[], summary: SceneSummary): Map<number, RoomSummary[]> {
  const rooms = allRooms(summary);
  const idx = new Map<RoomSummary, number>(rooms.map((r, i) => [r, i]));

  // Which rooms each room-exists predicate matches, as source-ordered room indices.
  const exists: { pi: number; min: number; matches: number[] }[] = [];
  preds.forEach((p, pi) => {
    if (p.kind !== "room-exists") return;
    const matches = roomsMatchingConcept(p.concept, rooms)
      .map((r) => idx.get(r))
      .filter((i): i is number => i !== undefined);
    exists.push({ pi, min: p.min, matches });
  });

  // The first predicate (position in `exists`) that matches each room — its greedy owner.
  const firstOwner = new Array<number>(rooms.length).fill(-1);
  exists.forEach((e, k) => {
    for (const ri of e.matches) if (firstOwner[ri] === -1) firstOwner[ri] = k;
  });

  // Phase 1 — Kuhn's algorithm. `prefs[k]` lists predicate k's candidate rooms in
  // preference order: the rooms it owns, then the rooms an earlier predicate owns.
  const prefs = exists.map((e, k) => [
    ...e.matches.filter((ri) => firstOwner[ri] === k),
    ...e.matches.filter((ri) => firstOwner[ri] !== k),
  ]);
  const slotOwner: number[] = []; // slot → predicate position in `exists`
  exists.forEach((e, k) => {
    for (let n = 0; n < e.min; n++) slotOwner.push(k);
  });
  const roomSlot = new Array<number>(rooms.length).fill(-1); // room → matched slot
  const tryAugment = (slot: number, seen: boolean[]): boolean => {
    const cands = prefs[slotOwner[slot] as number] as number[];
    // A free room first, so a claim is only moved when no free room will do.
    for (const ri of cands) {
      if (!seen[ri] && roomSlot[ri] === -1) {
        roomSlot[ri] = slot;
        return true;
      }
    }
    for (const ri of cands) {
      if (seen[ri]) continue;
      seen[ri] = true;
      const held = roomSlot[ri] as number;
      if (held === -1 || tryAugment(held, seen)) {
        roomSlot[ri] = slot;
        return true;
      }
    }
    return false;
  };
  for (let slot = 0; slot < slotOwner.length; slot++) {
    tryAugment(slot, new Array<boolean>(rooms.length).fill(false));
  }

  // Phase 2 — each room's claimant: its matched slot's predicate, else its first owner.
  const claimant = rooms.map((_, ri) => {
    const slot = roomSlot[ri] as number;
    return slot !== -1 ? (slotOwner[slot] as number) : (firstOwner[ri] as number);
  });
  const claims = new Map<number, RoomSummary[]>();
  exists.forEach((e, k) => {
    claims.set(
      e.pi,
      e.matches.filter((ri) => claimant[ri] === k).map((ri) => rooms[ri] as RoomSummary),
    );
  });
  return claims;
}

/** A `room-exists` check over the rooms {@link assignRooms} credited to this predicate
 *  (rubric §2 one-room-one-concept — a single "WC" room can't clear both a `bathroom` and
 *  a `wc` expectation). Records the claim so this concept's `room-area`/`room-windows`
 *  checks score over exactly the rooms it was credited with. */
function checkRoomExists(
  p: Extract<Predicate, { kind: "room-exists" }>,
  assigned: RoomSummary[],
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  claims.set(p.concept, assigned);
  const n = assigned.length;
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
 *  `room-exists` preceded it (compileIntent always emits one, so this is defensive). */
function checkRoomArea(
  p: Extract<Predicate, { kind: "room-area" }>,
  summary: SceneSummary,
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  const lo = p.minM2 ?? 0;
  const hi = p.maxM2 ?? INF;
  const assigned = claims.get(p.concept) ?? roomsMatchingConcept(p.concept, allRooms(summary));
  const within = assigned.filter((r) => r.area_m2 >= lo && r.area_m2 <= hi).length;
  const pass = within >= p.min;
  const detail = pass
    ? `area: concept "${p.concept}" ok (${within} within ${band(lo, hi)} m²)`
    : `area: only ${within} room(s) matching "${p.concept}" within ${band(lo, hi)} m² (needed ${p.min}) (${p.source})`;
  return { predicate: p, pass, detail };
}

/** A `room-windows` check over a concept's ASSIGNED rooms (same claim pool as
 *  `room-area`): count the plan's windows whose host room is one this concept claimed;
 *  pass when the count is within `[min, max ?? ∞]`. A `facing` on the predicate restricts
 *  the count to windows whose wall faces that compass direction. Falls back to a full
 *  concept match if no `room-exists` preceded it (defensive; compileIntent always emits
 *  one). The no-facing detail strings are unchanged (the `facing` clause only appears when
 *  a facing is asserted).
 *
 *  A SYMBOLIC facing (`equator_side`, `street`, …) is resolved to its letter through the
 *  plan's own `describe().site` first, and the detail names both spellings so a reader can
 *  see the resolution. Against a plan with no `site` the assertion cannot be evaluated at
 *  all: it fails with a detail that says so, and {@link makeViolation} blames it to
 *  `E_INTENT_NO_SITE` rather than pretending the windows were counted and found wanting. */
function checkRoomWindows(
  p: Extract<Predicate, { kind: "room-windows" }>,
  summary: SceneSummary,
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  const assigned = new Set(claims.get(p.concept) ?? roomsMatchingConcept(p.concept, allRooms(summary)));
  const letter = p.facing === undefined ? undefined : facingLetter(p.facing, summary.site);
  if (letter === null) {
    return {
      predicate: p,
      pass: false,
      detail: `windows: facing "${p.facing}" needs a \`site\` block — the plan declares none, so the direction has no value`,
    };
  }
  const count = storeysOf(summary).reduce((n, storey) => {
    const ids = new Set(storey.rooms.filter((r) => assigned.has(r)).map((r) => r.id));
    return (
      n +
      storey.windows.filter(
        (w: WindowSummary) => w.room !== null && ids.has(w.room) && (letter === undefined || w.facing === letter),
      ).length
    );
  }, 0);
  const pass = count >= p.min && (p.max === undefined || count <= p.max);
  const want = p.max !== undefined ? `${p.min}–${p.max}` : `${p.min}`;
  // The letter is spelled out beside a symbolic name, and the bare-letter form is
  // byte-identical to what it has always been.
  const facing =
    p.facing === undefined ? "" : p.facing === letter ? ` facing ${letter}` : ` facing ${p.facing} (${letter})`;
  const detail = pass
    ? `windows: concept "${p.concept}" ok (found ${count}${facing})`
    : `windows: only ${count} window(s)${facing} in room(s) matching "${p.concept}" (needed ${want})`;
  return { predicate: p, pass, detail };
}

// ---------------------------------------------------------------------------
// Brief-bound measures (PS4.4): the gross internal area, a room's width/depth/exact size.
// ---------------------------------------------------------------------------

/** The predicate kinds that carry an {@link IntentMeasureReading}. */
type BriefMeasureKind = "gross-area" | "room-dimension" | "room-size";

/** Why each unmeasured reason leaves no value, as a clause of a detail line. */
const UNMEASURED_TEXT: Record<IntentUnmeasuredReason, string> = {
  "room-not-found": "no room on any storey has that id or label",
  "room-ambiguous": "more than one room has that id or label (bind it by an id no other room shares)",
  "room-not-rectangular": "the room is not a rectangle, so it has no single width or depth",
  "plan-unresolved": "the plan did not resolve",
  "no-closed-exterior-ring": "the plan has no closed exterior wall ring",
  "exterior-ring-subdivided": "an exterior wall divides the shell, so which side is the building is not stated",
  "nested-exterior-rings": "something is enclosed inside a courtyard ring",
  "too-much-work": "the measurement is over its counted cap",
  inconsistent: "the shell's joinery gave an inconsistent figure",
};

/** A signed residual against `[lo, hi]`: 0 inside, `v − lo` below, `v − hi` above. */
const bandResidual = (v: number, lo: number, hi: number): number => (v < lo ? v - lo : v > hi ? v - hi : 0);

/** Round to 2 decimals, as every printed figure is (`fmt2`), so a measure row and its message agree. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** A residual as a signed number: `+200`, `−100`, `0`. */
const signedText = (n: number): string => (n > 0 ? `+${fmt2(n)}` : n < 0 ? `−${fmt2(-n)}` : "0");

/** A room's centreline extent when its floor IS an axis-aligned rectangle (a `size` room, or a
 *  four-vertex polygon whose every edge is axis-parallel); `null` for any other floor. Read off
 *  the floor ring itself, never the bbox of a shape that is not one. */
function rectOfRoom(r: RoomSummary): { w: number; h: number } | null {
  if (r.floor_circle) return null;
  const ring = r.floor_polygon;
  if (ring.length !== 4) return null;
  for (let k = 0; k < 4; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % 4]!;
    if (a.x !== b.x && a.y !== b.y) return null;
  }
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** A room of the plan with the storey it stands on (`level` set only on a plan of several). */
interface StoreyRoom {
  room: RoomSummary;
  level?: number;
}

/** Every room of every storey, lowest storey first, each with its storey on a multi-storey plan.
 *  A plan with no `level` blocks is its one storey (`summary.rooms`). */
function storeyRooms(summary: SceneSummary): StoreyRoom[] {
  const levels = summary.levels ?? [];
  if (levels.length === 0) return summary.rooms.map((room) => ({ room }));
  const multi = levels.length > 1;
  return levels.flatMap((l) => l.rooms.map((room) => (multi ? { room, level: l.level } : { room })));
}

/** Each room's name as a person reads it (its quoted label, else the shared naming phrase of
 *  `src/naming.ts`), never its id; on a multi-storey plan, with its storey (`"Master" on level 2`).
 *  Built per storey from the summary, the way `taste()` builds it. */
function roomNames(rooms: readonly StoreyRoom[]): Map<RoomSummary, string> {
  const out = new Map<RoomSummary, string>();
  const byLevel = new Map<number | undefined, StoreyRoom[]>();
  for (const r of rooms) byLevel.set(r.level, [...(byLevel.get(r.level) ?? []), r]);
  for (const [level, group] of byLevel) {
    const list: NameableRoom[] = group.map(({ room: r }) => ({
      id: r.id,
      ...(r.label !== undefined ? { label: r.label } : {}),
      uses: r.uses,
      point: r.floor_circle
        ? { x: r.floor_circle.cx, y: r.floor_circle.cy }
        : r.floor_polygon.length >= 3
          ? polygonLabelPoint(r.floor_polygon)
          : { x: r.bbox.x + r.bbox.w / 2, y: r.bbox.y + r.bbox.h / 2 },
      bounds: { x0: r.bbox.x, y0: r.bbox.y, x1: r.bbox.x + r.bbox.w, y1: r.bbox.y + r.bbox.h },
      size: sizeWords(rectOfRoom(r), r.area_m2 * 1_000_000),
    }));
    const naming = makeNaming(list, level);
    const where = level !== undefined ? ` on level ${level}` : "";
    for (const [i, { room: r }] of group.entries())
      out.set(r, r.label !== undefined ? `"${r.label}"${where}` : naming.phrase(list[i]!));
  }
  return out;
}

/** What a room-bound measure reads: the rooms of every storey and their names, each built once. */
interface RoomIndex {
  rooms: () => StoreyRoom[];
  names: () => Map<RoomSummary, string>;
}

/** The one room a selector binds, on any storey, or why there is none. Every room whose id or
 *  exact label is the selector counts, so an id naming one room and a label naming another is
 *  `room-ambiguous`, never a silent pick. */
function boundRoom(
  sel: string,
  summary: SceneSummary,
  index: RoomIndex,
): { at: StoreyRoom; rect: { w: number; h: number } | null } | { reason: IntentUnmeasuredReason } {
  if (!summary.ok) return { reason: "plan-unresolved" };
  const hits = index.rooms().filter(({ room: r }) => r.id === sel || r.label === sel);
  if (hits.length === 0) return { reason: "room-not-found" };
  if (hits.length > 1) return { reason: "room-ambiguous" };
  const at = hits[0]!;
  return { at, rect: rectOfRoom(at.room) };
}

/** A failing result for a measure that has no value. `level` names the storey when it is one
 *  storey's figure that is missing. */
function unmeasured(
  p: Extract<Predicate, { kind: BriefMeasureKind }>,
  what: string,
  unit: "mm" | "m2",
  reason: IntentUnmeasuredReason,
  level?: number,
): AssertionResult {
  const where = level !== undefined ? `level ${level}: ` : "";
  return {
    predicate: p,
    pass: false,
    detail: `${p.kind === "gross-area" ? "area" : "size"}: cannot measure ${what}: ${where}${UNMEASURED_TEXT[reason]}`,
    measure: { what, unit, reason, ...(level !== undefined ? { level } : {}) },
  };
}

/** `gross-area`: the building's gross internal area against the band. On a plan with `level`
 *  blocks it is the sum over every storey (`totals.gross_internal_area_all_levels_m2`), else the
 *  one storey's figure; the detail says which. */
function checkGrossArea(p: Extract<Predicate, { kind: "gross-area" }>, summary: SceneSummary): AssertionResult {
  const storeys = summary.levels?.length ?? 0;
  const what = storeys > 1 ? `gross internal area over ${storeys} storeys` : "gross internal area";
  if (!summary.ok) return unmeasured(p, what, "m2", "plan-unresolved");
  const t = summary.totals;
  const a = storeys > 0 ? t.gross_internal_area_all_levels_m2 : t.gross_internal_area_m2;
  if (a === undefined) {
    const missing = t.gross_internal_area_all_levels_omitted;
    const reason = (storeys > 0 ? missing?.reason : t.gross_internal_area_omitted) ?? "no-closed-exterior-ring";
    return unmeasured(p, what, "m2", reason, storeys > 1 ? missing?.level : undefined);
  }
  // The figure is printed to 0.01 m², so the residual is too.
  const residual = r2(bandResidual(a, p.minM2, p.maxM2));
  const pass = a >= p.minM2 && a <= p.maxM2;
  const detail = pass
    ? `area: ${what} ${fmt2(a)} m² within ${band(p.minM2, p.maxM2)}`
    : `area: ${what} ${fmt2(a)} m² outside ${band(p.minM2, p.maxM2)}, residual ${signedText(residual)} m² (${p.source})`;
  return { predicate: p, pass, detail, measure: { what, unit: "m2", measured: [a], residual: [residual] } };
}

/** The name a room-bound measure speaks: the bound room's, else a neutral "the room". */
const nameOfBound = (bound: ReturnType<typeof boundRoom>, index: RoomIndex): string =>
  "at" in bound ? (index.names().get(bound.at.room) ?? "the room") : "the room";

/** The storey a bound room stands on, for the measure row (multi-storey plans only). */
const levelOf = (bound: ReturnType<typeof boundRoom>): { level?: number } =>
  "at" in bound && bound.at.level !== undefined ? { level: bound.at.level } : {};

/** `room-dimension`: one room's centreline width (x extent) or depth (y extent) against the band. */
function checkRoomDimension(
  p: Extract<Predicate, { kind: "room-dimension" }>,
  summary: SceneSummary,
  index: RoomIndex,
): AssertionResult {
  const bound = boundRoom(p.room, summary, index);
  const what = `${nameOfBound(bound, index)} ${p.axis}`;
  if ("reason" in bound) return unmeasured(p, what, "mm", bound.reason);
  if (!bound.rect) return unmeasured(p, what, "mm", "room-not-rectangular", levelOf(bound).level);
  const v = r2(p.axis === "width" ? bound.rect.w : bound.rect.h);
  const lo = p.minMm ?? 0;
  const hi = p.maxMm ?? INF;
  const residual = r2(bandResidual(v, lo, hi));
  const pass = v >= lo && v <= hi;
  const detail = pass
    ? `size: ${what} ${fmt2(v)} mm on centrelines within ${band(lo, hi)} mm`
    : `size: ${what} ${fmt2(v)} mm on centrelines outside ${band(lo, hi)} mm, residual ${signedText(residual)} mm (${p.source})`;
  return {
    predicate: p,
    pass,
    detail,
    measure: { what, unit: "mm", measured: [v], residual: [residual], ...levelOf(bound) },
  };
}

/** `room-size`: one room's centreline `w × h`, in the orientation that fits best, within the
 *  tolerance on both axes. A tie keeps the orientation as written. */
function checkRoomSize(
  p: Extract<Predicate, { kind: "room-size" }>,
  summary: SceneSummary,
  index: RoomIndex,
): AssertionResult {
  const bound = boundRoom(p.room, summary, index);
  const what = `${nameOfBound(bound, index)} size`;
  if ("reason" in bound) return unmeasured(p, what, "mm", bound.reason);
  if (!bound.rect) return unmeasured(p, what, "mm", "room-not-rectangular", levelOf(bound).level);
  const w = r2(bound.rect.w);
  const h = r2(bound.rect.h);
  const asWritten = [r2(w - p.w), r2(h - p.h)];
  const turned = [r2(h - p.w), r2(w - p.h)];
  const worst = (r: number[]): number => Math.max(Math.abs(r[0]!), Math.abs(r[1]!));
  const isTurned = worst(turned) < worst(asWritten);
  const residual = isTurned ? turned : asWritten;
  const measured = isTurned ? [h, w] : [w, h];
  const pass = worst(residual) <= p.toleranceMm;
  const tol = p.toleranceMm > 0 ? ` ± ${fmt2(p.toleranceMm)}` : "";
  const turnedNote = isTurned ? " (turned)" : "";
  const got = `${fmt2(w)} × ${fmt2(h)} mm on centrelines`;
  const want = `${fmt2(p.w)} × ${fmt2(p.h)}${tol} mm`;
  const detail = pass
    ? `size: ${what} ${got} matches ${want}${turnedNote}`
    : `size: ${what} ${got}, wanted ${want}${turnedNote}, residual ${signedText(residual[0]!)} × ${signedText(residual[1]!)} mm (${p.source})`;
  return {
    predicate: p,
    pass,
    detail,
    measure: {
      what,
      unit: "mm",
      measured,
      residual,
      ...(isTurned ? { turned: true as const } : {}),
      ...levelOf(bound),
    },
  };
}

/**
 * Check every predicate against a plan summary. `room-exists`/`room-area`/`room-windows`
 * are resolved over a one-room-one-concept assignment (rubric §2) computed up front by
 * {@link assignRooms}: a matching that lets every concept reach its `min` wherever the
 * plan's rooms allow it, then each spare room to the first concept that matches it.
 * `adjacent` deliberately matches over ALL rooms (rubric §4 — required-edge subset
 * semantics); `total-area`/`room-count` are plan-wide. On a plan with `level` blocks all of
 * these read every storey ({@link storeysOf}), so a summary's `levels[]` outranks its
 * top-level `rooms`, `windows`, `totals` and `input_graph`.
 */
export function checkPredicates(preds: Predicate[], summary: SceneSummary): AssertionResult[] {
  const assignment = assignRooms(preds, summary);
  const claims = new Map<string, RoomSummary[]>();
  // Built only when a room-bound measure asks for one.
  let rooms: StoreyRoom[] | undefined;
  let names: Map<RoomSummary, string> | undefined;
  const index: RoomIndex = {
    rooms: () => (rooms ??= storeyRooms(summary)),
    names: () => (names ??= roomNames(index.rooms())),
  };
  return preds.map((p, i) => {
    if (p.kind === "room-exists") return checkRoomExists(p, assignment.get(i) ?? [], claims);
    if (p.kind === "room-area") return checkRoomArea(p, summary, claims);
    if (p.kind === "room-windows") return checkRoomWindows(p, summary, claims);
    if (p.kind === "gross-area") return checkGrossArea(p, summary);
    if (p.kind === "room-dimension") return checkRoomDimension(p, summary, index);
    if (p.kind === "room-size") return checkRoomSize(p, summary, index);
    return checkOne(p, summary);
  });
}

/** Fraction of a group of results that passed, or `null` when the group is empty. */
const frac = (rs: AssertionResult[]): number | null =>
  rs.length === 0 ? null : rs.filter((r) => r.pass).length / rs.length;

/** Project the four scored dimensions from a checked predicate list. `rooms`/`labels`
 *  default to a full 1 when the brief pins neither (nothing to penalize). `room-windows`
 *  joins the `labels` fraction — it is an existence/count-family claim, and (like every
 *  new-kind predicate) it is unused by the current corpus, so the projection is unchanged
 *  for the six lifted kinds. */
export function projectSubscores(results: AssertionResult[]): Subscores {
  const of = (k: Predicate["kind"]): AssertionResult[] => results.filter((r) => r.predicate.kind === k);

  const roomCount = of("room-count")[0];
  const labelRs = [...of("room-exists"), ...of("room-windows")];
  const areaRs = [
    ...of("room-area"),
    ...of("total-area"),
    ...of("gross-area"),
    ...of("room-dimension"),
    ...of("room-size"),
  ];
  const adjRs = [...of("adjacent"), ...of("reachable")];

  return {
    rooms: roomCount?.score ?? 1,
    labels: frac(labelRs) ?? 1,
    area: frac(areaRs),
    adjacency: frac(adjRs),
  };
}

// ---------------------------------------------------------------------------
// validateIntent — the author-time entry point (describe → compile → check → blame).
// ---------------------------------------------------------------------------

/** Strip the dimension prefix (`rooms:`/`label:`/`area:`/…) from an assertion detail so
 *  it reads as a bare measured fact inside a blame message. */
const DIMENSION_PREFIX = /^(?:rooms|label|area|adjacency|reachable|windows|size): /;
const factOf = (detail: string): string => detail.replace(DIMENSION_PREFIX, "");

/** Blame a failed assertion to a typed, catalogued {@link IntentViolation}. `reachable`
 *  splits by cause: no modeled entrance → `E_INTENT_NO_DOOR`, else `E_INTENT_UNREACHABLE`.
 *  The codes are written as `code:` literals so the catalog-closure test
 *  (`test/explain.test.ts`) sees each one raised. */
function makeViolation(a: AssertionResult, path: string, summary: SceneSummary): IntentViolation {
  const message = `intent ${path}: ${factOf(a.detail)}`;
  const gate = a.predicate.gate;
  const predicate = a.predicate;
  switch (predicate.kind) {
    case "room-count":
      return { code: "E_INTENT_ROOM_COUNT", message, gate, predicate };
    case "room-exists":
      return { code: "E_INTENT_ROOM_MISSING", message, gate, predicate };
    case "room-area":
      return { code: "E_INTENT_ROOM_AREA", message, gate, predicate };
    case "total-area":
      return { code: "E_INTENT_TOTAL_AREA", message, gate, predicate };
    case "adjacent":
      return { code: "E_INTENT_NOT_ADJACENT", message, gate, predicate };
    case "room-windows":
      // Split by cause, like `reachable` below: a SYMBOLIC facing against a plan with no
      // `site` is an unanswerable question (`E_INTENT_NO_SITE`), not a window that was
      // counted and found missing.
      return predicate.facing !== undefined && facingLetter(predicate.facing, summary.site) === null
        ? { code: "E_INTENT_NO_SITE", message, gate, predicate }
        : { code: "E_INTENT_NO_WINDOW", message, gate, predicate };
    case "reachable":
      return summary.access.hasEntrance
        ? { code: "E_INTENT_UNREACHABLE", message, gate, predicate }
        : { code: "E_INTENT_NO_DOOR", message, gate, predicate };
    case "gross-area":
    case "room-dimension":
    case "room-size":
      // Split by cause, like `room-windows`: a measure with no value is an unanswerable
      // question (`E_INTENT_UNMEASURED`), not a size that was read and found wrong.
      if (a.measure?.reason !== undefined) return { code: "E_INTENT_UNMEASURED", message, gate, predicate };
      return predicate.kind === "gross-area"
        ? { code: "E_INTENT_GROSS_AREA", message, gate, predicate }
        : { code: "E_INTENT_ROOM_DIMENSION", message, gate, predicate };
  }
}

/**
 * Check a brief's {@link Intent} against ArchLang `source`. Compiles the intent to
 * predicates, evaluates them over `describe(source)`'s facts, and returns the passes,
 * subscores, and catalogued violations. A non-compiling plan yields an empty summary, so
 * every gating assertion fails naturally and `diagnostics` carries the compile errors.
 *
 * `ok` is true when the plan compiled AND no GATING assertion failed (advisory
 * adjacency/reachability misses are listed and scored but never clear `ok`).
 */
export function validateIntent(source: string, intent: Intent, opts: DescribeOptions = {}): IntentCheckResult {
  const summary = describe(source, opts);
  const { predicates, paths } = compileWithPaths(intent);
  const assertions = checkPredicates(predicates, summary);
  const subscores = projectSubscores(assertions);

  const violations: IntentViolation[] = [];
  assertions.forEach((a, i) => {
    if (!a.pass) violations.push(makeViolation(a, paths[i] ?? "", summary));
  });

  const ok = summary.ok && assertions.every((a) => !(a.predicate.gate && !a.pass));
  const satisfied = assertions.filter((a) => a.pass).length;
  const measures: IntentMeasure[] = [];
  assertions.forEach((a, i) => {
    if (a.measure) measures.push({ path: paths[i] ?? "", ...a.measure, pass: a.pass });
  });

  return {
    ok,
    satisfied,
    total: assertions.length,
    violations,
    subscores,
    assertions,
    diagnostics: summary.diagnostics,
    ...(measures.length > 0 ? { measures } : {}),
  };
}

// ---------------------------------------------------------------------------
// feedbackForResult — advisory, per-violation correction prompts (ADR 0005).
// ---------------------------------------------------------------------------

/** One correction prompt for a single violation. `result` supplies the measured fact
 *  (matched to its assertion by predicate identity). Pure; exhaustive over the codes. */
function feedbackForViolation(v: IntentViolation, result: IntentCheckResult): string {
  const p = v.predicate;
  const a = result.assertions.find((x) => x.predicate === p);
  const fact = a ? factOf(a.detail) : "";
  switch (v.code) {
    case "E_INTENT_ROOM_MISSING": {
      const concept = p.kind === "room-exists" ? p.concept : "";
      return `Add a room for "${concept}" — a \`room\` whose label, \`uses\`, or type matches the concept (${fact}).`;
    }
    case "E_INTENT_ROOM_COUNT":
      return `Room count is off (${fact}). Add or remove rooms to hit the target; one extra circulation room (a hall/corridor) is allowed (policy B).`;
    case "E_INTENT_ROOM_AREA": {
      const concept = p.kind === "room-area" ? p.concept : "";
      return `Resize the "${concept}" room(s) so their floor area falls in the target band (${fact}).`;
    }
    case "E_INTENT_TOTAL_AREA":
      return `Adjust room sizes so the total floor area lands in the target band (${fact}).`;
    case "E_INTENT_NOT_ADJACENT": {
      const a2 = p.kind === "adjacent" ? p.a : "";
      const b2 = p.kind === "adjacent" ? p.b : "";
      return `Connect "${a2}" and "${b2}" with an interior door on their shared wall so the rooms are adjacent (${fact}).`;
    }
    case "E_INTENT_NO_DOOR":
      return `Add an exterior entrance — a \`door\` on a perimeter wall — so the plan is enterable (${fact}).`;
    case "E_INTENT_UNREACHABLE":
      return `Add interior doors to connect the unreachable room(s) to the rest of the plan (${fact}).`;
    case "E_INTENT_NO_WINDOW": {
      const concept = p.kind === "room-windows" ? p.concept : "";
      const facing = p.kind === "room-windows" && p.facing !== undefined ? ` facing ${p.facing}` : "";
      return `Add a window${facing} to the "${concept}" room — e.g. \`window on <wall> at <pos>\` (${fact}).`;
    }
    case "E_INTENT_NO_SITE": {
      const facing = p.kind === "room-windows" && p.facing !== undefined ? p.facing : "";
      return (
        `Declare the plan's site so "${facing}" has a direction — add \`site { street north|south|east|west }\` ` +
        `(and \`hemisphere south\` below the equator), or assert a plain compass letter instead (${fact}).`
      );
    }
    case "E_INTENT_GROSS_AREA":
      return `Grow or shrink the shell so the floor inside the exterior walls' inner faces lands in the brief's band; the partitions inside it do not change this figure (${fact}).`;
    case "E_INTENT_ROOM_DIMENSION":
      return `Resize that room's \`size\` (on centrelines) to the dimension the brief states; every other number may flex around it (${fact}).`;
    case "E_INTENT_UNMEASURED":
      return (
        `The plan has no value for this brief-bound measure (${fact}). Bind a room by its id or a unique label, ` +
        `give it a rectangular \`size\`, or close the shell with one \`exterior\` wall ring (\`walls from rooms\` derives one).`
      );
  }
}

/** A deterministic, actionable correction prompt per violation (advisory data, ADR
 *  0005 — never auto-applied). One string per violation, in violation order. Each names
 *  the measured fact so the author sees current-vs-target without re-running the tool. */
export function feedbackForResult(result: IntentCheckResult): string[] {
  return result.violations.map((v) => feedbackForViolation(v, result));
}

// ---------------------------------------------------------------------------
// intentFromJson — validate an untrusted Intent shape (zero-dep, pathed errors).
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Accumulates pathed shape errors while walking an untrusted Intent value. */
class IntentErrors {
  readonly errors: string[] = [];
  push(path: string, msg: string): void {
    this.errors.push(`${path || "/"}: ${msg}`);
  }
  ok(): boolean {
    return this.errors.length === 0;
  }
}

/** Validate an optional `{ min?, max? }` band of a given number kind, enforcing min ≤ max
 *  and (when `requireOne`) at least one bound + a `source` string. Unknown keys error. */
function checkBand(
  v: unknown,
  path: string,
  errs: IntentErrors,
  opts: { integer: boolean; requireSource: boolean; requireOne: boolean; extraKeys?: string[] },
): void {
  if (!isObj(v)) {
    errs.push(path, "expected an object");
    return;
  }
  const allowed = new Set(["min", "max", ...(opts.requireSource ? ["source"] : []), ...(opts.extraKeys ?? [])]);
  for (const k of Object.keys(v)) if (!allowed.has(k)) errs.push(`${path}/${k}`, "unknown key");
  const okNum = opts.integer ? isInt : isNum;
  const label = opts.integer ? "an integer" : "a number";
  let hasMin = false;
  let hasMax = false;
  if (v.min !== undefined) {
    if (!okNum(v.min) || (v.min as number) < 0) errs.push(`${path}/min`, `expected ${label} ≥ 0`);
    else hasMin = true;
  }
  if (v.max !== undefined) {
    if (!okNum(v.max) || (v.max as number) < 0) errs.push(`${path}/max`, `expected ${label} ≥ 0`);
    else hasMax = true;
  }
  if (hasMin && hasMax && (v.min as number) > (v.max as number)) errs.push(path, "min must be ≤ max");
  if (opts.requireSource) {
    if (!isStr(v.source)) errs.push(`${path}/source`, "expected a string");
  }
  if (opts.requireOne && !hasMin && !hasMax) errs.push(path, "expected at least one of min/max");
}

/** Everything a `windows.facing` may take: the four compass letters, plus the five
 *  site-derived names that resolve to one. Order fixed so the error message reads the
 *  same way every time. */
const FACING_VALUES: readonly string[] = ["N", "S", "E", "W", ...SYMBOLIC_FACINGS];
const FACINGS = new Set(FACING_VALUES);

const ROOMS_INCLUDE_KEYS = new Set(["concept", "count", "areaM2", "windows"]);
/** `$schema`/`$id` are accepted (as strings) so an intent file can point an editor at
 *  `schemas/intent.schema.json`; they carry no meaning for the check. */
const INTENT_KEYS = new Set([
  "$schema",
  "$id",
  "rooms",
  "roomsInclude",
  "totalAreaM2",
  "adjacency",
  "reachable",
  "grossInternalAreaM2",
  "roomDimensions",
]);
const ROOM_DIMENSION_KEYS = new Set(["room", "widthMm", "depthMm", "sizeMm"]);
const SIZE_KEYS = new Set(["w", "h", "tolerance", "source"]);

/**
 * Validate an untrusted value as an {@link Intent} (zero-dep, no throw). Returns the typed
 * intent (or null on any error) plus pathed error strings (e.g.
 * `/roomsInclude/0/concept: expected a string`). Unknown keys are errors
 * (additionalProperties-false discipline); `areaM2`/`totalAreaM2` require a `source` and
 * at least one bound; counts are integers ≥ 0 with min ≤ max.
 */
export function intentFromJson(value: unknown): { intent: Intent | null; errors: string[] } {
  const errs = new IntentErrors();
  if (!isObj(value)) {
    errs.push("", "expected a top-level object");
    return { intent: null, errors: errs.errors };
  }
  for (const k of Object.keys(value)) if (!INTENT_KEYS.has(k)) errs.push(`/${k}`, "unknown key");
  for (const k of ["$schema", "$id"] as const) {
    if (value[k] !== undefined && !isStr(value[k])) errs.push(`/${k}`, "expected a string");
  }

  if (value.rooms !== undefined && (!isInt(value.rooms) || value.rooms < 0)) {
    errs.push("/rooms", "expected an integer ≥ 0");
  }

  if (value.roomsInclude !== undefined) {
    if (!Array.isArray(value.roomsInclude)) {
      errs.push("/roomsInclude", "expected an array");
    } else {
      value.roomsInclude.forEach((inc, i) => {
        const path = `/roomsInclude/${i}`;
        if (!isObj(inc)) {
          errs.push(path, "expected an object");
          return;
        }
        for (const k of Object.keys(inc)) if (!ROOMS_INCLUDE_KEYS.has(k)) errs.push(`${path}/${k}`, "unknown key");
        if (!isStr(inc.concept)) errs.push(`${path}/concept`, "expected a string");
        if (inc.count !== undefined)
          checkBand(inc.count, `${path}/count`, errs, { integer: true, requireSource: false, requireOne: false });
        if (inc.areaM2 !== undefined)
          checkBand(inc.areaM2, `${path}/areaM2`, errs, { integer: false, requireSource: true, requireOne: true });
        if (inc.windows !== undefined) {
          checkBand(inc.windows, `${path}/windows`, errs, {
            integer: true,
            requireSource: false,
            requireOne: false,
            extraKeys: ["facing"],
          });
          if (isObj(inc.windows) && inc.windows.facing !== undefined) {
            if (!isStr(inc.windows.facing) || !FACINGS.has(inc.windows.facing))
              errs.push(`${path}/windows/facing`, `expected one of ${FACING_VALUES.map((v) => `"${v}"`).join(", ")}`);
          }
        }
      });
    }
  }

  if (value.totalAreaM2 !== undefined)
    checkBand(value.totalAreaM2, "/totalAreaM2", errs, { integer: false, requireSource: true, requireOne: true });

  if (value.adjacency !== undefined) {
    const adj = value.adjacency;
    if (!isObj(adj)) {
      errs.push("/adjacency", "expected an object");
    } else {
      for (const k of Object.keys(adj))
        if (k !== "requiredEdges" && k !== "source") errs.push(`/adjacency/${k}`, "unknown key");
      if (!isStr(adj.source)) errs.push("/adjacency/source", "expected a string");
      if (!isObj(adj.requiredEdges)) {
        errs.push("/adjacency/requiredEdges", "expected an object of concept → concept[]");
      } else {
        for (const [key, list] of Object.entries(adj.requiredEdges)) {
          if (!Array.isArray(list) || !list.every(isStr))
            errs.push(`/adjacency/requiredEdges/${key}`, "expected an array of strings");
        }
      }
    }
  }

  if (value.reachable !== undefined && typeof value.reachable !== "boolean") {
    errs.push("/reachable", "expected a boolean");
  }

  if (value.grossInternalAreaM2 !== undefined)
    checkBand(value.grossInternalAreaM2, "/grossInternalAreaM2", errs, {
      integer: false,
      requireSource: true,
      requireOne: true,
    });

  if (value.roomDimensions !== undefined) {
    if (!Array.isArray(value.roomDimensions)) {
      errs.push("/roomDimensions", "expected an array");
    } else {
      value.roomDimensions.forEach((d, i) => {
        const path = `/roomDimensions/${i}`;
        if (!isObj(d)) {
          errs.push(path, "expected an object");
          return;
        }
        for (const k of Object.keys(d)) if (!ROOM_DIMENSION_KEYS.has(k)) errs.push(`${path}/${k}`, "unknown key");
        if (!isStr(d.room) || d.room === "") errs.push(`${path}/room`, "expected a room id or label");
        for (const k of ["widthMm", "depthMm"] as const)
          if (d[k] !== undefined)
            checkBand(d[k], `${path}/${k}`, errs, { integer: false, requireSource: true, requireOne: true });
        if (d.sizeMm !== undefined) {
          const sz = d.sizeMm;
          if (!isObj(sz)) {
            errs.push(`${path}/sizeMm`, "expected an object");
          } else {
            for (const k of Object.keys(sz)) if (!SIZE_KEYS.has(k)) errs.push(`${path}/sizeMm/${k}`, "unknown key");
            for (const k of ["w", "h"] as const)
              if (!isNum(sz[k]) || (sz[k] as number) <= 0) errs.push(`${path}/sizeMm/${k}`, "expected a number > 0");
            if (sz.tolerance !== undefined && (!isNum(sz.tolerance) || sz.tolerance < 0))
              errs.push(`${path}/sizeMm/tolerance`, "expected a number ≥ 0");
            if (!isStr(sz.source)) errs.push(`${path}/sizeMm/source`, "expected a string");
          }
        }
        if (d.widthMm === undefined && d.depthMm === undefined && d.sizeMm === undefined)
          errs.push(path, "expected at least one of widthMm/depthMm/sizeMm");
      });
    }
  }

  if (!errs.ok()) return { intent: null, errors: errs.errors };
  return { intent: value as unknown as Intent, errors: [] };
}

// ---------------------------------------------------------------------------
// INTENT_JSON_SCHEMA — the description-rich contract a generator is prompted with.
// ---------------------------------------------------------------------------

/**
 * The JSON Schema (2020-12) for an {@link Intent}, description-rich for LLM consumption.
 * The single source of truth: `scripts/gen-intent-schema.ts` writes it to
 * `schemas/intent.schema.json` and a drift test regenerates it in-memory to compare.
 *
 * The field descriptions carry Gate G1's two NORMATIVE requirements (stated as rules):
 * the area BAND CONVENTIONS and the room-count DISCIPLINE. `additionalProperties: false`
 * throughout, mirroring `intentFromJson`.
 */
export const INTENT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://archlang.uk/intent.schema.json",
  title: "ArchLang Intent",
  description:
    'A floor-plan brief\'s checkable INTENT as structured data — what the source TEXT asked for, independent of any one drawing. Every field is BRIEF-grounded (derived from the prompt\'s words, not a golden\'s geometry). Area bands follow one convention everywhere: a brief\'s "about/around/~N m²" or a bare "N m²" sets both bounds to ±10% of N; "at least N m²" sets `min` only (open top); qualitative size words (compact, generous, large, spacious) license NO area assertion — omit the band rather than invent bounds. Assertions are checked against `describe()` facts; room count / existence / area / windows / gross internal area / room dimensions GATE (a real deliverable miss), while `adjacency`/`reachable` are ADVISORY (scored, never gating).',
  type: "object",
  additionalProperties: false,
  properties: {
    $schema: {
      type: "string",
      description:
        "Optional. The URI of the schema this file follows (e.g. this schema's `$id`), for editor tooling; ignored by the check.",
    },
    $id: {
      type: "string",
      description: "Optional. An identifier for this intent file; ignored by the check.",
    },
    rooms: {
      type: "integer",
      minimum: 0,
      description:
        'Exact expected room count, over every storey of a plan with `level` blocks. RULE: assert a count ONLY when the brief ENUMERATES the rooms; do not derive a count from under-determined wording ("a few rooms", "some bedrooms"). A single surplus room is tolerated only when it is pure circulation (a hall/corridor) — policy B.',
    },
    roomsInclude: {
      type: "array",
      description:
        "Rooms the brief names, as CONCEPTS (bathroom, master-bedroom, tea-point, …) rather than literal labels, each optionally carrying a count band, area band, and window requirement. Rooms on any storey count.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concept"],
        properties: {
          concept: {
            type: "string",
            description:
              'A brief-level room concept the plan must contain (e.g. "bathroom", "living-room"). Matched against produced rooms by label → room_type → uses.',
          },
          count: {
            type: "object",
            additionalProperties: false,
            description: "How many rooms of this concept the brief calls for (default: at least 1).",
            properties: {
              min: { type: "integer", minimum: 0, description: "Minimum rooms of this concept (default 1)." },
              max: { type: "integer", minimum: 0, description: "Maximum rooms of this concept." },
            },
          },
          areaM2: {
            type: "object",
            additionalProperties: false,
            required: ["source"],
            anyOf: [{ required: ["min"] }, { required: ["max"] }],
            description:
              'Per-room floor-area band in square metres. RULE — assert ONLY where the brief gives a number for this room: "about/around/~N m²" or a bare "N m²" → min/max at ±10% of N; "at least N m²" → `min` only; qualitative words (compact/generous/large) → assert NOTHING (omit areaM2).',
            properties: {
              min: { type: "number", description: "Lower bound (m²)." },
              max: { type: "number", description: 'Upper bound (m²); omit for an open "at least" band.' },
              source: {
                type: "string",
                description: "The brief phrase that licensed the band, quoted, so a failure can cite it.",
              },
            },
          },
          windows: {
            type: "object",
            additionalProperties: false,
            description:
              'Window presence/count the brief requires for this room (GATING). Assert only where the brief asks for a window ("give the bedroom a window").',
            properties: {
              min: {
                type: "integer",
                minimum: 0,
                description: "Minimum windows (defaults to 1 when `windows` is present).",
              },
              max: { type: "integer", minimum: 0, description: "Maximum windows in the room." },
              facing: {
                type: "string",
                enum: [...FACING_VALUES],
                description:
                  "TRUE COMPASS direction the window's wall faces, read against the plan's `north` setting. Under the default `north up` the page's top is north, so a top-edge window faces N, bottom S, left W, right E; under e.g. `north right` a right-edge window faces N instead. Restricts the count to windows facing this way. Assert ONLY when the brief states an orientation. The five NAMES (`street`, `back`, `equator_side`, `sunrise_side`, `sunset_side`) are the same assertion written against the plan's `site` block, which resolves each to a letter — asserting one against a plan with no `site` is E_INTENT_NO_SITE, not a silent miss. NOTE: `equator_side`/`sunrise_side`/`sunset_side` are a DRAFTING HEURISTIC for an aspect, NOT a measured daylight outcome — ArchLang has no sun model, latitude or date, so `equator_side` asserts \"a window on the equator-facing facade\" and nothing more. Prefer them only where the brief itself speaks in those terms.",
              },
            },
          },
        },
      },
    },
    totalAreaM2: {
      type: "object",
      additionalProperties: false,
      required: ["source"],
      anyOf: [{ required: ["min"] }, { required: ["max"] }],
      description:
        'Total floor-area band in square metres, summed over every storey of a plan with `level` blocks. Same band conventions as `areaM2`: "about/~N" or bare N → ±10%; "at least N" → `min` only; qualitative words → omit. At least one of min/max is required.',
      properties: {
        min: { type: "number", description: "Lower bound (m²)." },
        max: { type: "number", description: 'Upper bound (m²); omit for an open "at least" band.' },
        source: { type: "string", description: "The brief phrase that licensed the band, quoted." },
      },
    },
    adjacency: {
      type: "object",
      additionalProperties: false,
      required: ["requiredEdges", "source"],
      description:
        "Interior-door adjacency the brief licenses. ADVISORY tier: each edge scores as a subscore but NEVER gates (a one-shot topology miss is what the loop tools — `archlang fix`/`suggest`/`validate --graph` — address, not a hard fail). Assert only where the brief's words license it.",
      properties: {
        requiredEdges: {
          type: "object",
          description:
            "{ conceptA: [conceptB, …] } — each named pair of concepts must share an interior door or cased opening in the plan, on any one storey.",
          additionalProperties: { type: "array", items: { type: "string" } },
        },
        source: { type: "string", description: "The brief phrase that licensed the adjacency, quoted." },
      },
    },
    reachable: {
      type: "boolean",
      description:
        'Assert that every room is reachable from a modeled entrance. ADVISORY tier: scored, never gating. Assert only where the brief\'s words license it (e.g. "no room reached through another").',
    },
    grossInternalAreaM2: {
      type: "object",
      additionalProperties: false,
      required: ["source"],
      anyOf: [{ required: ["min"] }, { required: ["max"] }],
      description:
        "Gross internal area band in square metres: the floor inside the exterior walls' INNER FACES (`describe().totals.gross_internal_area_m2`), which is what a client's \"about 70 m²\" means — `totalAreaM2` runs to wall centrelines and reads several per cent larger. On a plan with `level` blocks it binds the BUILDING: the sum over every storey (`totals.gross_internal_area_all_levels_m2`). Same band conventions as `areaM2`. GATING. A plan with no closed exterior wall ring has no such figure and fails as E_INTENT_UNMEASURED, never a silent pass.",
      properties: {
        min: { type: "number", description: "Lower bound (m²)." },
        max: { type: "number", description: 'Upper bound (m²); omit for an open "at least" band.' },
        source: { type: "string", description: "The brief phrase that licensed the band, quoted." },
      },
    },
    roomDimensions: {
      type: "array",
      description:
        'Room sizes the brief STATES, each bound to one room (GATING): "the living room at least 4 m wide", "a 3.2 × 3.6 m bedroom". Measured on wall centrelines from the room\'s own rectangle; every number the brief does not state is free to flex. A polygon or circular room has no single width and fails as E_INTENT_UNMEASURED, as does a selector that names no room or more than one. Assert only numbers the brief gives.',
      items: {
        type: "object",
        additionalProperties: false,
        required: ["room"],
        anyOf: [{ required: ["widthMm"] }, { required: ["depthMm"] }, { required: ["sizeMm"] }],
        properties: {
          room: {
            type: "string",
            minLength: 1,
            description:
              "The room's id, or its label exactly as written, on any storey. A selector that matches more than one room (a shared label, an id repeated on two storeys, an id of one room that is another's label) is refused: bind by an id no other room shares.",
          },
          widthMm: {
            type: "object",
            additionalProperties: false,
            required: ["source"],
            anyOf: [{ required: ["min"] }, { required: ["max"] }],
            description: "Band on the room's extent along the page's x axis (its `size` W), in mm.",
            properties: {
              min: { type: "number", description: "Lower bound (mm)." },
              max: { type: "number", description: "Upper bound (mm)." },
              source: { type: "string", description: "The brief phrase that licensed the band, quoted." },
            },
          },
          depthMm: {
            type: "object",
            additionalProperties: false,
            required: ["source"],
            anyOf: [{ required: ["min"] }, { required: ["max"] }],
            description: "Band on the room's extent along the page's y axis (its `size` H), in mm.",
            properties: {
              min: { type: "number", description: "Lower bound (mm)." },
              max: { type: "number", description: "Upper bound (mm)." },
              source: { type: "string", description: "The brief phrase that licensed the band, quoted." },
            },
          },
          sizeMm: {
            type: "object",
            additionalProperties: false,
            required: ["w", "h", "source"],
            description:
              "An exact size: the room's rectangle is `w × h` mm in EITHER orientation (a brief's \"3.2 × 3.6 m\" names a rectangle, not which way it faces), each side within `tolerance` mm. Use `widthMm`/`depthMm` to bind an orientation.",
            properties: {
              w: { type: "number", exclusiveMinimum: 0, description: "One side (mm)." },
              h: { type: "number", exclusiveMinimum: 0, description: "The other side (mm)." },
              tolerance: { type: "number", minimum: 0, description: "Allowed difference per side (mm); default 0." },
              source: { type: "string", description: "The brief phrase that licensed the size, quoted." },
            },
          },
        },
      },
    },
  },
} as const;
