/**
 * Infeasibility of a brief's stated numbers: the arithmetic that makes "this brief is
 * impossible" checkable, before any plan exists.
 *
 * {@link proveInfeasible} derives, from a list of one-sided requirements, every way the list
 * contradicts itself, and returns `[]` for a list it cannot prove impossible. It was written for
 * the eval's fidelity slice (`eval/fidelity.ts`, which re-exports it and these types unchanged)
 * and lives here so the intent channel (`validateIntent`, `E_INTENT_INFEASIBLE`) runs the same
 * derivation on a brief's intent contract.
 *
 * Pure, synchronous, deterministic; zero-dependency (no `node:` imports). It never solves a
 * layout and never reads a plan: it adds and compares the numbers the brief states.
 */

import { CONCEPTS } from "./intent-concepts.js";
import { synonymMatchesLabel } from "./vocabulary.js";

/**
 * A requirement is always a ONE-SIDED HARD BOUND (or an exact count). That restriction is
 * the whole reason this measure needs no tolerance and invents no band: "at least 1000 mm"
 * and "at most 30 m²" are numbers a user stated and a loop can only honour or move. A
 * brief's "about 42 m²" is an aspiration, not a constraint — it is the judge's business
 * (±10% band), never fidelity's.
 */
export type Op = "at-least" | "at-most";

/** The four compass directions a window requirement may name. */
export type Facing = "N" | "S" | "E" | "W";

/**
 * One numbered requirement from a brief's requirement sheet. `id` is the label the BRIEF
 * itself prints (`R1`, `R2`, …) so a model can cite it when declaring infeasibility —
 * which is why publishing the ids leaks no oracle: they are part of the request, not part
 * of the scorer. `quote` is the brief line verbatim, so a failure cites what licensed the
 * number.
 *
 * Scope conventions: an omitted `concept` means EVERY room (or every door) in the plan;
 * a named concept is resolved through the eval's private vocabulary shim, which throws on
 * an unknown key so a corpus typo fails loudly.
 */
export type Requirement =
  | { id: string; kind: "room-area"; concept?: string; op: Op; m2: number; quote: string }
  | { id: string; kind: "total-area"; op: Op; m2: number; quote: string }
  | { id: string; kind: "room-count"; concept?: string; exact: number; quote: string }
  | { id: string; kind: "door-width"; concept?: string; op: Op; mm: number; quote: string }
  | { id: string; kind: "room-windows"; concept: string; op: Op; count: number; facing?: Facing; quote: string };

/** Deterministic 2-decimal rounding (areas are already rounded by `describe()`; this
 *  keeps a computed drift from printing float noise). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** One derivation that a requirement set cannot all hold at once. */
export interface InfeasibilityProof {
  /** `capacity` — demanded floor area exceeds a stated cap. `contradiction` — a stated
   *  floor is above a stated ceiling on the same scope. */
  rule: "capacity" | "contradiction";
  /** The requirement ids that participate, sorted — the set a correct refusal must name. */
  conflicts: string[];
  reason: string;
}

/**
 * Whether ONE room could satisfy both concepts under `roomsMatchingConcept`'s semantics
 * (label, then room_type, then uses), judged CONSERVATIVELY from the table: they overlap if
 * they share a room_type or a use, or if a label of one token-matches a label of the other
 * (either direction — a room labelled with the longer wording matches both). A concept absent
 * from the table overlaps everything. NOT modelled: a room whose label belongs to one concept
 * while its room_type or uses belong to another (a describe()d room's type follows its label).
 */
function conceptsMayOverlap(a: string, b: string): boolean {
  const ca = CONCEPTS[a];
  const cb = CONCEPTS[b];
  if (ca === undefined || cb === undefined) return true;
  if (ca.roomTypes?.some((t) => cb.roomTypes?.includes(t))) return true;
  if (ca.uses?.some((u) => cb.uses?.includes(u))) return true;
  return ca.labels.some((x) => cb.labels.some((y) => synonymMatchesLabel(x, y) || synonymMatchesLabel(y, x)));
}

const sortUnique = (ids: string[]): string[] => [...new Set(ids)].sort();

/**
 * Derive, arithmetically, every way this requirement set contradicts itself. Returns `[]`
 * for a satisfiable set.
 *
 * **Capacity.** Room floor areas do not overlap (an overlap raises `W_ROOM_OVERLAP`), so the
 * minima of concepts that no single room can satisfy together add. Fidelity scopes a concept
 * by a plain filter (a room may match several concepts, e.g. bathroom / wet-room / wc), so
 * concepts that {@link conceptsMayOverlap} are grouped and a group demands only its largest
 * (floor × count). If the total exceeds the TIGHTEST stated total-area ceiling, no plan can
 * hold both. The demand is computed two ways — over concept-scoped minima (each multiplied by
 * the count the brief states for that concept; several floors on one concept count once, at
 * the largest; ties go to the first in requirement order) and over a plan-wide "every room at
 * least m" minimum (the largest such floor) multiplied by a stated exact room count — and each
 * way that exceeds the cap is its own proof. The two are never summed: that would
 * double-count a room. A plan-wide floor is never combined with a concept's count.
 *
 * **Contradiction.** An `at-least m` and an `at-most M` whose scopes overlap (same concept,
 * or one of them plan-wide) with `m > M` is unsatisfiable directly.
 *
 * Both rules are sound in the "only reports real conflicts" direction, which is the
 * direction that matters: a brief this function calls infeasible IS infeasible, up to the
 * overlap model's one stated gap (see {@link conceptsMayOverlap}). It is
 * deliberately NOT complete — it will not notice every impossible brief, only the classes
 * the corpus uses. A corpus entry whose declared conflicts this function cannot derive
 * fails the offline suite rather than being taken on trust.
 */
export function proveInfeasible(requirements: readonly Requirement[]): InfeasibilityProof[] {
  const proofs: InfeasibilityProof[] = [];
  const areaFloors = requirements.filter((r) => r.kind === "room-area" && r.op === "at-least");
  const areaCeils = requirements.filter((r) => r.kind === "room-area" && r.op === "at-most");
  const counts = requirements.filter((r) => r.kind === "room-count");
  // The TIGHTEST stated total-area ceiling (ties: first in requirement order).
  let cap: Requirement | undefined;
  for (const r of requirements) {
    if (
      r.kind === "total-area" &&
      r.op === "at-most" &&
      (cap === undefined || (cap.kind === "total-area" && r.m2 < cap.m2))
    )
      cap = r;
  }

  if (cap !== undefined && cap.kind === "total-area") {
    // (a) Concept-scoped demand. Several at-least floors on ONE concept are met by the largest
    // (never summed), and concepts whose room sets can overlap (one room matching both, e.g.
    // bathroom / wet-room / wc) form a component in which a single room serves every concept,
    // so a component contributes only its largest (floor × count). Only genuinely disjoint
    // components add. Ties go to the first in requirement order.
    const byConcept = new Map<string, Requirement & { kind: "room-area" }>();
    for (const r of areaFloors) {
      if (r.kind !== "room-area" || r.concept === undefined) continue;
      const cur = byConcept.get(r.concept);
      if (cur === undefined || r.m2 > cur.m2) byConcept.set(r.concept, r);
    }
    const names = [...byConcept.keys()];
    const parent = names.map((_, i) => i);
    const find = (i: number): number => {
      let r = i;
      while (parent[r] !== r) r = parent[r]!;
      return r;
    };
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        if (conceptsMayOverlap(names[i]!, names[j]!)) parent[find(j)] = find(i);
    const best = new Map<number, { demand: number; ids: string[] }>();
    names.forEach((concept, i) => {
      const floor = byConcept.get(concept)!;
      const c = counts.find((x) => x.kind === "room-count" && x.concept === concept);
      const n = c !== undefined && c.kind === "room-count" ? c.exact : 1;
      const demand = floor.m2 * n;
      const root = find(i);
      const cur = best.get(root);
      if (cur === undefined || demand > cur.demand)
        best.set(root, { demand, ids: c !== undefined ? [floor.id, c.id] : [floor.id] });
    });
    let specific = 0;
    const specificIds: string[] = [];
    for (const { demand, ids } of best.values()) {
      specific += demand;
      specificIds.push(...ids);
    }
    if (specificIds.length > 0 && specific > cap.m2) {
      proofs.push({
        rule: "capacity",
        conflicts: sortUnique([...specificIds, cap.id]),
        reason: `the stated per-room minima demand ${round2(specific)} m² of floor, above the stated ceiling of ${cap.m2} m²`,
      });
    }
    // (b) Plan-wide demand: "every room at least m" × a stated exact room count. The binding
    // floor is the largest plan-wide one (ties: first in requirement order).
    const planCount = counts.find((x) => x.kind === "room-count" && x.concept === undefined);
    let widest: (Requirement & { kind: "room-area" }) | undefined;
    for (const r of areaFloors) {
      if (r.kind !== "room-area" || r.concept !== undefined) continue;
      if (widest === undefined || r.m2 > widest.m2) widest = r;
    }
    if (widest !== undefined) {
      const n = planCount !== undefined && planCount.kind === "room-count" ? planCount.exact : 1;
      const wide = widest.m2 * n;
      if (wide > cap.m2) {
        proofs.push({
          rule: "capacity",
          conflicts: sortUnique([widest.id, ...(planCount !== undefined ? [planCount.id] : []), cap.id]),
          reason: `every room being at least its stated minimum demands ${round2(wide)} m² of floor, above the stated ceiling of ${cap.m2} m²`,
        });
      }
    }
  }

  for (const lo of areaFloors) {
    if (lo.kind !== "room-area") continue;
    for (const hi of areaCeils) {
      if (hi.kind !== "room-area") continue;
      const overlaps = hi.concept === undefined || lo.concept === undefined || hi.concept === lo.concept;
      if (overlaps && lo.m2 > hi.m2) {
        proofs.push({
          rule: "contradiction",
          conflicts: sortUnique([lo.id, hi.id]),
          reason: `a floor of ${lo.m2} m² sits above a ceiling of ${hi.m2} m² on the same room(s)`,
        });
      }
    }
  }

  const totalFloor = requirements.find((r) => r.kind === "total-area" && r.op === "at-least");
  if (totalFloor !== undefined && cap !== undefined && totalFloor.kind === "total-area" && cap.kind === "total-area") {
    if (totalFloor.m2 > cap.m2) {
      proofs.push({
        rule: "contradiction",
        conflicts: sortUnique([totalFloor.id, cap.id]),
        reason: `a total-area floor of ${totalFloor.m2} m² sits above a ceiling of ${cap.m2} m²`,
      });
    }
  }

  return proofs;
}
