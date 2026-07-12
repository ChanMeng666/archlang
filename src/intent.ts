/**
 * The intent channel — author-time checking of a brief's INTENT against a plan
 * (v1.14, Tranche 4).
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
 * (a real deliverable miss); adjacency and reachability score as subscores but never
 * gate — one-shot topology is what v1.13's LOOP tools (`arch fix`/`suggest`/`validate
 * --graph`) address, not one-shot generation. Whether a diagnostic feedback loop beats
 * equal-budget resampling is an open question; nothing here decides it.
 *
 * Pure, synchronous, deterministic; zero-dependency (no `node:` imports). Problems are
 * returned as violations/diagnostics, never thrown.
 */

import type { Diagnostic } from "./diagnostics.js";
import { describe } from "./describe.js";
import type { DescribeOptions, RoomSummary, SceneSummary, WindowSummary } from "./describe.js";
import { isCirculationRoom, roomsMatchingConcept } from "./intent-concepts.js";

/** Bump when predicate kinds or their *corpus judgments* change (pinned by a test).
 *  Re-exported by the eval's `assertions.ts`; the byte-equivalence criterion is that
 *  every corpus per-assertion judgment is unchanged — new predicate kinds unused by the
 *  corpus (e.g. `room-windows`) do not bump it. */
export const JUDGE_VERSION = "2";

/** The `∞` upper bound for an open-ended area band. */
const INF = Number.POSITIVE_INFINITY;

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
  /** Exact expected room count. Assert only when the brief enumerates the rooms. */
  rooms?: number;
  /** Rooms the brief names, as concepts, with optional count/area/window bands. */
  roomsInclude?: {
    concept: string;
    count?: { min?: number; max?: number };
    areaM2?: { min?: number; max?: number; source: string };
    /** Window presence/count the brief requires for this room (gating). */
    windows?: { min?: number; max?: number };
  }[];
  /** Total floor-area band — only where the brief states a number. At least one bound;
   *  an open top ("at least N m²") sets `min` alone. */
  totalAreaM2?: { min?: number; max?: number; source: string };
  /** Interior-door adjacency the brief licenses: `{ conceptA: [conceptB, …] }`. Advisory. */
  adjacency?: { requiredEdges: Record<string, string[]>; source: string };
  /** Every room reachable from a modeled entrance — asserted only on brief license. Advisory. */
  reachable?: boolean;
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
  | { kind: "room-windows"; concept: string; min: number; max?: number; gate: true };

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

/** The eight catalogued blame codes {@link validateIntent} emits. */
export type IntentCode =
  | "E_INTENT_ROOM_MISSING"
  | "E_INTENT_ROOM_COUNT"
  | "E_INTENT_ROOM_AREA"
  | "E_INTENT_TOTAL_AREA"
  | "E_INTENT_NOT_ADJACENT"
  | "E_INTENT_NO_DOOR"
  | "E_INTENT_UNREACHABLE"
  | "E_INTENT_NO_WINDOW";

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

/** Whether `a` and `b` (concept ids) are joined by an interior door/opening in the
 *  plan's `input_graph`. Existential over both concepts' matched rooms; checked in
 *  both directions defensively though `input_graph` is symmetric. */
function conceptsAdjacent(a: string, b: string, summary: SceneSummary): boolean {
  const as = roomsMatchingConcept(a, summary.rooms);
  const bs = roomsMatchingConcept(b, summary.rooms);
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
 *  (`room-exists`/`room-area`/`room-windows` are handled by their own checkers.) */
function checkOne(
  p: Exclude<Predicate, { kind: "room-exists" | "room-area" | "room-windows" }>,
  summary: SceneSummary,
): AssertionResult {
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
 *  `wc` expectation — and records the claim so this concept's `room-area`/`room-windows`
 *  checks score over exactly the rooms it was credited with. */
function checkRoomExists(
  p: Extract<Predicate, { kind: "room-exists" }>,
  summary: SceneSummary,
  consumed: Set<string>,
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  const available = roomsMatchingConcept(p.concept, summary.rooms).filter((r) => !consumed.has(r.id));
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
 *  `room-exists` preceded it (compileIntent always emits one, so this is defensive). */
function checkRoomArea(
  p: Extract<Predicate, { kind: "room-area" }>,
  summary: SceneSummary,
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  const lo = p.minM2 ?? 0;
  const hi = p.maxM2 ?? INF;
  const assigned = claims.get(p.concept) ?? roomsMatchingConcept(p.concept, summary.rooms);
  const within = assigned.filter((r) => r.area_m2 >= lo && r.area_m2 <= hi).length;
  const pass = within >= p.min;
  const detail = pass
    ? `area: concept "${p.concept}" ok (${within} within ${band(lo, hi)} m²)`
    : `area: only ${within} room(s) matching "${p.concept}" within ${band(lo, hi)} m² (needed ${p.min}) (${p.source})`;
  return { predicate: p, pass, detail };
}

/** A `room-windows` check over a concept's ASSIGNED rooms (same claim pool as
 *  `room-area`): count the plan's windows whose host room is one this concept claimed;
 *  pass when the count is within `[min, max ?? ∞]`. Falls back to a full concept match if
 *  no `room-exists` preceded it (defensive; compileIntent always emits one). */
function checkRoomWindows(
  p: Extract<Predicate, { kind: "room-windows" }>,
  summary: SceneSummary,
  claims: Map<string, RoomSummary[]>,
): AssertionResult {
  const assigned = claims.get(p.concept) ?? roomsMatchingConcept(p.concept, summary.rooms);
  const ids = new Set(assigned.map((r) => r.id));
  const count = summary.windows.filter((w: WindowSummary) => w.room !== null && ids.has(w.room)).length;
  const pass = count >= p.min && (p.max === undefined || count <= p.max);
  const want = p.max !== undefined ? `${p.min}–${p.max}` : `${p.min}`;
  const detail = pass
    ? `windows: concept "${p.concept}" ok (found ${count})`
    : `windows: only ${count} window(s) in room(s) matching "${p.concept}" (needed ${want})`;
  return { predicate: p, pass, detail };
}

/**
 * Check every predicate against a plan summary. `room-exists`/`room-area`/`room-windows`
 * are resolved with a GREEDY one-room-one-concept assignment in predicate order (rubric
 * §2): each concept claims its still-unclaimed matching rooms, and a claimed room is
 * unavailable to later concepts. `adjacent` deliberately matches over ALL rooms (rubric
 * §4 — required-edge subset semantics); `total-area`/`room-count` are plan-wide.
 */
export function checkPredicates(preds: Predicate[], summary: SceneSummary): AssertionResult[] {
  const consumed = new Set<string>();
  const claims = new Map<string, RoomSummary[]>();
  return preds.map((p) => {
    if (p.kind === "room-exists") return checkRoomExists(p, summary, consumed, claims);
    if (p.kind === "room-area") return checkRoomArea(p, summary, claims);
    if (p.kind === "room-windows") return checkRoomWindows(p, summary, claims);
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
  const areaRs = [...of("room-area"), ...of("total-area")];
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
const DIMENSION_PREFIX = /^(?:rooms|label|area|adjacency|reachable|windows): /;
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
      return { code: "E_INTENT_NO_WINDOW", message, gate, predicate };
    case "reachable":
      return summary.access.hasEntrance
        ? { code: "E_INTENT_UNREACHABLE", message, gate, predicate }
        : { code: "E_INTENT_NO_DOOR", message, gate, predicate };
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

  return {
    ok,
    satisfied,
    total: assertions.length,
    violations,
    subscores,
    assertions,
    diagnostics: summary.diagnostics,
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
      return `Add a window to the "${concept}" room — e.g. \`window on <wall> at <pos>\` (${fact}).`;
    }
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

const ROOMS_INCLUDE_KEYS = new Set(["concept", "count", "areaM2", "windows"]);
const INTENT_KEYS = new Set(["rooms", "roomsInclude", "totalAreaM2", "adjacency", "reachable"]);

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
        if (inc.windows !== undefined)
          checkBand(inc.windows, `${path}/windows`, errs, { integer: true, requireSource: false, requireOne: false });
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
  $id: "https://archlang-docs.vercel.app/intent.schema.json",
  title: "ArchLang Intent",
  description:
    'A floor-plan brief\'s checkable INTENT as structured data — what the source TEXT asked for, independent of any one drawing. Every field is BRIEF-grounded (derived from the prompt\'s words, not a golden\'s geometry). Area bands follow one convention everywhere: a brief\'s "about/around/~N m²" or a bare "N m²" sets both bounds to ±10% of N; "at least N m²" sets `min` only (open top); qualitative size words (compact, generous, large, spacious) license NO area assertion — omit the band rather than invent bounds. Assertions are checked against `describe()` facts; room count / existence / area / windows GATE (a real deliverable miss), while `adjacency`/`reachable` are ADVISORY (scored, never gating).',
  type: "object",
  additionalProperties: false,
  properties: {
    rooms: {
      type: "integer",
      minimum: 0,
      description:
        'Exact expected room count. RULE: assert a count ONLY when the brief ENUMERATES the rooms; do not derive a count from under-determined wording ("a few rooms", "some bedrooms"). A single surplus room is tolerated only when it is pure circulation (a hall/corridor) — policy B.',
    },
    roomsInclude: {
      type: "array",
      description:
        "Rooms the brief names, as CONCEPTS (bathroom, master-bedroom, tea-point, …) rather than literal labels, each optionally carrying a count band, area band, and window requirement.",
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
        'Total floor-area band in square metres. Same band conventions as `areaM2`: "about/~N" or bare N → ±10%; "at least N" → `min` only; qualitative words → omit. At least one of min/max is required.',
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
        "Interior-door adjacency the brief licenses. ADVISORY tier: each edge scores as a subscore but NEVER gates (a one-shot topology miss is what the loop tools — `arch fix`/`suggest`/`validate --graph` — address, not a hard fail). Assert only where the brief's words license it.",
      properties: {
        requiredEdges: {
          type: "object",
          description:
            "{ conceptA: [conceptB, …] } — each named pair of concepts must share an interior door or cased opening in the plan.",
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
  },
} as const;
