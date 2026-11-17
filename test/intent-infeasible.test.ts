/** RM9.3 — an impossible brief is reported as impossible, with its arithmetic: proveInfeasible's sound rules, E_INTENT_INFEASIBLE first… */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Intent, feedbackForResult, nextDiagnostic, validateIntent } from "../src/index.js";
import { type Requirement, intentRequirements, proveInfeasible } from "../src/intent-feasibility.js";
import { loadFidelityCorpus } from "../eval/fidelity.js";
import { runArch } from "./helpers/cli.js";
import { runs } from "./setup/fast-check.js";

type NoQuote<T> = T extends unknown ? Omit<T, "quote"> : never;
const R = (r: NoQuote<Requirement>): Requirement => ({ ...r, quote: r.id }) as Requirement;

describe("proveInfeasible — the rules RM9.3 adds", () => {
  it("a plan-wide floor times the rooms the concepts require is a conflict (the backlog's case)", () => {
    // `{total ≤ 12, every room ≥ 5, exactly 3 bedrooms}`: 3 × 5 = 15 m² above 12.
    const reqs = [
      R({ id: "T", kind: "total-area", op: "at-most", m2: 12 }),
      R({ id: "F", kind: "room-area", op: "at-least", m2: 5 }),
      R({ id: "B", kind: "room-count", concept: "bedroom", exact: 3 }),
    ];
    const proofs = proveInfeasible(reqs);
    expect(proofs.map((p) => p.conflicts)).toEqual([["B", "F", "T"]]);
    expect(proofs[0]!.reason).toBe(
      "every room being at least its stated minimum, over the 3 rooms the stated counts require, demands 15 m² of floor, above the stated ceiling of 12 m²",
    );
    expect(proofs[0]!.demand).toEqual({
      terms: [{ ids: ["F", "B"], rooms: 3, m2: 5 }],
      m2: 15,
      ceiling: { id: "T", m2: 12 },
    });
    // Control: two bedrooms fit (2 × 5 = 10 ≤ 12).
    expect(proveInfeasible(reqs.map((r) => (r.id === "B" ? { ...r, exact: 2 } : r)) as Requirement[])).toEqual([]);
  });

  it("the concept rooms: overlapping concepts count once, at their largest; disjoint ones add", () => {
    // bathroom ~ wc share a room type: one group, max(2, 1) = 2 rooms; bedroom adds 2 → 4 × 4 = 16 > 15.
    const reqs = [
      R({ id: "T", kind: "total-area", op: "at-most", m2: 15 }),
      R({ id: "F", kind: "room-area", op: "at-least", m2: 4 }),
      R({ id: "W", kind: "room-count", concept: "bathroom", exact: 2 }),
      R({ id: "C", kind: "room-count", concept: "wc", exact: 1 }),
      R({ id: "B", kind: "room-count", concept: "bedroom", exact: 2 }),
    ];
    expect(proveInfeasible(reqs).map((p) => p.conflicts)).toEqual([["B", "F", "T", "W"]]);
    // At 16 the four rooms fit exactly: no conflict (the WC is not counted on its own).
    expect(proveInfeasible(reqs.map((r) => (r.id === "T" ? { ...r, m2: 16 } : r)) as Requirement[])).toEqual([]);
  });

  it("a plan-wide count that already binds keeps its old proof, and the concept rule adds none", () => {
    const reqs = [
      R({ id: "T", kind: "total-area", op: "at-most", m2: 12 }),
      R({ id: "F", kind: "room-area", op: "at-least", m2: 5 }),
      R({ id: "N", kind: "room-count", exact: 3 }),
      R({ id: "B", kind: "room-count", concept: "bedroom", exact: 3 }),
    ];
    expect(proveInfeasible(reqs).map((p) => [p.conflicts, p.reason])).toEqual([
      [
        ["F", "N", "T"],
        "every room being at least its stated minimum demands 15 m² of floor, above the stated ceiling of 12 m²",
      ],
    ]);
  });

  it("a demand within the display-rounding slack of its ceiling is no conflict (0.1 × 3 vs 0.3)", () => {
    // 0.1 * 3 is 0.30000000000000004 in floats, and three rooms of exactly 0.1 m² total 0.3 m².
    const reqs = [
      R({ id: "T", kind: "total-area", op: "at-most", m2: 0.3 }),
      R({ id: "B", kind: "room-area", concept: "bedroom", op: "at-least", m2: 0.1 }),
      R({ id: "C", kind: "room-count", concept: "bedroom", exact: 3 }),
    ];
    expect(0.1 * 3 > 0.3).toBe(true);
    expect(proveInfeasible(reqs)).toEqual([]);
    // The slack is 0.005 m² per counted room plus 0.005 m²: 0.02 m² here. Within it, no conflict;
    // past it, a conflict.
    const at = (m2: number) => proveInfeasible(reqs.map((r) => (r.id === "T" ? { ...r, m2 } : r)) as Requirement[]);
    expect(at(0.281)).toEqual([]);
    expect(at(0.279)).toHaveLength(1);
  });

  it("a capacity proof carries its arithmetic term by term", () => {
    const [proof] = proveInfeasible([
      R({ id: "T", kind: "total-area", op: "at-most", m2: 40 }),
      R({ id: "B", kind: "room-area", concept: "bedroom", op: "at-least", m2: 12 }),
      R({ id: "N", kind: "room-count", concept: "bedroom", exact: 3 }),
      R({ id: "L", kind: "room-area", concept: "living-room", op: "at-least", m2: 10 }),
    ]);
    expect(proof!.demand).toEqual({
      terms: [
        { ids: ["B", "N"], concept: "bedroom", rooms: 3, m2: 12 },
        { ids: ["L"], concept: "living-room", rooms: 1, m2: 10 },
      ],
      m2: 46,
      ceiling: { id: "T", m2: 40 },
    });
  });
});

// The growth trial's H4 brief: "three bedrooms of at least 12 m² each, a living room and a
// bathroom, all inside 40 m²", drawn as its best attempt (an 8 × 5 m box, 40.000 m² exactly).
const H4 = `plan "H4" {
  units mm
  room id=b1 at (0,0) size 2700x2500 label "Bedroom 1"
  room id=b2 at (2700,0) size 2600x2500 label "Bedroom 2"
  room id=b3 at (5300,0) size 2700x2500 label "Bedroom 3"
  room id=liv at (0,2500) size 5500x2500 label "Living room"
  room id=bath at (5500,2500) size 2500x2500 label "Bathroom"
}`;

/** The H4 contract, with a floor on the living room and the bathroom as given. */
const h4 = (living: number | undefined, bath: number | undefined): Intent => ({
  rooms: 5,
  roomsInclude: [
    {
      concept: "bedroom",
      count: { min: 3, max: 3 },
      areaM2: { min: 12, source: "three bedrooms of at least 12 m² each" },
    },
    { concept: "living-room", ...(living !== undefined ? { areaM2: { min: living, source: "a living room" } } : {}) },
    { concept: "bathroom", ...(bath !== undefined ? { areaM2: { min: bath, source: "a bathroom" } } : {}) },
  ],
  totalAreaM2: { max: 40, source: "all inside 40 m² total" },
});

const H4_MESSAGE =
  "intent /roomsInclude/0/areaM2 + /roomsInclude/0/count + /roomsInclude/1/areaM2 + /roomsInclude/2/areaM2 + /totalAreaM2: " +
  'no plan can meet these numbers together: 3 "bedroom" × at least 12 m² = 36 m² + 1 "living-room" × at least 10 m² = 10 m² ' +
  '+ 1 "bathroom" × at least 3.5 m² = 3.5 m² = 49.5 m² of rooms, above the total floor area of at most 40 m² (/totalAreaM2)';

const codes = (i: Intent, src = H4): string[] => validateIntent(src, i).violations.map((v) => v.code);

describe("validateIntent — E_INTENT_INFEASIBLE comes first, with the arithmetic", () => {
  it("the H4 shape (3 bedrooms ≥ 12 m², living ≥ 10, bath ≥ 3.5, total ≤ 40) is infeasible, root cause first", () => {
    const res = validateIntent(H4, h4(10, 3.5));
    const [first, ...rest] = res.violations;
    expect(first!.code).toBe("E_INTENT_INFEASIBLE");
    expect(first!.message).toBe(H4_MESSAGE);
    expect(first!.gate).toBe(true);
    expect(first!.conflicts).toEqual([
      "/roomsInclude/0/areaM2",
      "/roomsInclude/0/count",
      "/roomsInclude/1/areaM2",
      "/roomsInclude/2/areaM2",
      "/totalAreaM2",
    ]);
    // The band misses are still listed, after it, exactly as the assertions give them.
    expect(rest.map((v) => v.code)).toEqual(["E_INTENT_ROOM_AREA"]);
    expect(rest.length).toBe(res.assertions.filter((a) => !a.pass).length);
    // The meter is the assertions' alone: the contract check adds no assertion.
    expect([res.ok, res.satisfied, res.total]).toEqual([false, 7, 8]);
    // `next` names it, and its hint says to relax a number, not to redraw.
    const next = nextDiagnostic({ diagnostics: [], intent: res });
    expect(next?.code).toBe("E_INTENT_INFEASIBLE");
    expect(next?.hint).toBe(feedbackForResult(res)[0]);
    expect(next?.hint).toMatch(
      /^Relax one of: \/roomsInclude\/0\/areaM2, .*\/totalAreaM2\. These numbers cannot all hold/,
    );
  });

  it("is reported from the contract alone, whatever the source (a plan that does not compile too)", () => {
    const res = validateIntent("plan {{{ not archlang", h4(10, 3.5));
    expect(res.violations[0]?.message).toBe(H4_MESSAGE);
    expect(res.diagnostics.length).toBeGreaterThan(0);
  });

  it("the trial's own contract, with no floor on the living room or bath, is NOT called infeasible", () => {
    // 3 × 12 = 36 m² ≤ 40 m²: the contract leaves 4 m² for the other two rooms and states no
    // minimum for either, so no arithmetic proves it impossible.
    expect(codes(h4(undefined, undefined))).not.toContain("E_INTENT_INFEASIBLE");
  });

  it("a feasible near-miss (the floors add to the ceiling, or pass it within the slack) is not infeasible", () => {
    expect(codes(h4(4, undefined))).not.toContain("E_INTENT_INFEASIBLE");
    expect(codes(h4(4, 0))).not.toContain("E_INTENT_INFEASIBLE");
    // 40.01 m² against 40: within the slack of four counted rooms (0.025 m²), so not called impossible.
    expect(codes(h4(4.01, undefined))).not.toContain("E_INTENT_INFEASIBLE");
    // 40.1 m² against 40 is past it.
    expect(codes(h4(4.1, undefined))[0]).toBe("E_INTENT_INFEASIBLE");
  });

  it("the arithmetic prints every operand and sum exactly, as written", () => {
    const at = (bed: number, living: number): string =>
      validateIntent(H4, {
        roomsInclude: [
          { concept: "bedroom", count: { min: 3 }, areaM2: { min: bed, source: "b" } },
          { concept: "living-room", areaM2: { min: living, source: "l" } },
        ],
        totalAreaM2: { max: 40, source: "t" },
      }).violations[0]!.message;
    expect(at(12.001, 4.03)).toContain(
      '3 "bedroom" × at least 12.001 m² = 36.003 m² + 1 "living-room" × at least 4.03 m² = 4.03 m² = 40.033 m² of rooms, above the total floor area of at most 40 m²',
    );
    expect(at(12.006, 4.05)).toContain(
      '3 "bedroom" × at least 12.006 m² = 36.018 m² + 1 "living-room" × at least 4.05 m² = 4.05 m² = 40.068 m²',
    );
    expect(at(12.006, 4.05)).not.toMatch(/36\.02|e[+-]\d|0000000/);
  });

  it("a band whose count.min is 0 demands nothing", () => {
    const i: Intent = {
      roomsInclude: [{ concept: "bedroom", count: { min: 0 }, areaM2: { min: 50, source: "s" } }],
      totalAreaM2: { max: 40, source: "t" },
    };
    expect(intentRequirements(i)).toEqual([
      { id: "/totalAreaM2", kind: "total-area", op: "at-most", m2: 40, quote: "t" },
    ]);
    expect(codes(i)).not.toContain("E_INTENT_INFEASIBLE");
  });

  it("a concept named twice never lets one entry's count multiply the other's floor", () => {
    // Three plain bedrooms and one of at least 12 m²: 12 m² of floor is demanded, not 36.
    const i: Intent = {
      roomsInclude: [
        { concept: "bedroom", count: { min: 3 } },
        { concept: "bedroom", areaM2: { min: 12, source: "s" } },
      ],
      totalAreaM2: { max: 20, source: "t" },
    };
    expect(intentRequirements(i).filter((r) => r.kind === "room-count")).toEqual([]);
    expect(codes(i)).not.toContain("E_INTENT_INFEASIBLE");
  });

  it("a programmatic band with min above max is a contradiction on its own rooms", () => {
    const res = validateIntent(H4, {
      roomsInclude: [{ concept: "bedroom", areaM2: { min: 20, max: 10, source: "s" } }],
    });
    expect(res.violations[0]!.message).toBe(
      "intent /roomsInclude/0/areaM2: no plan can meet these numbers together: a floor of 20 m² (/roomsInclude/0/areaM2) sits above a ceiling of 10 m² (/roomsInclude/0/areaM2)",
    );
  });

  it("over the fidelity corpus: only an impossible brief's honest contract is flagged, a laundered one never", () => {
    const corpus = loadFidelityCorpus();
    const flagged: string[] = [];
    for (const e of corpus) {
      if (proveInfeasible(intentRequirements(e.statedContract)).length > 0) flagged.push(e.id);
      // A plan passes each laundered contract (test/eval-fidelity.test.ts), so it is feasible.
      expect(proveInfeasible(intentRequirements(e.references.launderedContract)), e.id).toEqual([]);
    }
    for (const id of flagged) expect(corpus.find((e) => e.id === id)?.infeasible, id).toBeDefined();
    // capped-wet-room's conflict is a plan-wide room ceiling, which `Intent` cannot state.
    expect(flagged).toEqual(["over-programmed-flat", "four-bed-cap"]);
  });
});

// The reviewer's repro (PR #948 round 1): three bedrooms of exactly 12.004 m² and a 49.996 × 100
// store whose exact area (4999.6 mm²) does not reproduce its printed one, so the total is judged
// on the printed figure, 36.00 m². The contract is met; 3 × 12.004 = 36.012 is not a conflict
// against 36.005.
const sideBySide = (rooms: readonly { w: number; h: number; label: string }[]): string => {
  let x = 0;
  const lines = rooms.map((r, i) => {
    const line = `  room id=r${i} at (${x},0) size ${r.w}x${r.h} label "${r.label}"`;
    x += Math.ceil(r.w) + 1000; // apart, so no two rooms touch
    return line;
  });
  return `plan "P" {\n  units mm\n${lines.join("\n")}\n}`;
};
const REPRO = sideBySide([
  { w: 3001, h: 4000, label: "Bedroom 1" },
  { w: 3001, h: 4000, label: "Bedroom 2" },
  { w: 3001, h: 4000, label: "Bedroom 3" },
  { w: 49.996, h: 100, label: "Store" },
]);
const bedrooms = (n: number, min: number, max: number): Intent => ({
  roomsInclude: [{ concept: "bedroom", count: { min: n }, areaM2: { min, source: "b" } }],
  totalAreaM2: { max, source: "t" },
});

describe("soundness — a plan that meets the contract never carries E_INTENT_INFEASIBLE", () => {
  it("the reviewer's repro: ok:true, and no infeasibility", () => {
    const res = validateIntent(REPRO, bedrooms(3, 12.004, 36.005));
    expect([res.ok, res.satisfied, res.total]).toEqual([true, 3, 3]);
    expect(res.violations.map((v) => v.code)).toEqual([]);
  });

  it("property: contracts at the band edges of the plan's own figures", () => {
    // Bedrooms of random sizes (to 0.001 mm), sometimes with a sliver room whose exact area does not
    // reproduce its printed one; the contract's floor and ceiling are put on, just inside and just
    // outside the plan's exact and printed figures. Whenever the plan passes, the contract is
    // feasible, so no proof may fire.
    let passed = 0;
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ w: fc.integer({ min: 2_000_000, max: 4_000_000 }), h: fc.integer({ min: 2000, max: 4000 }) }),
          {
            minLength: 1,
            maxLength: 4,
          },
        ),
        fc.option(fc.integer({ min: 10_000, max: 99_999 }), { nil: undefined }),
        fc.constantFrom(-0.006, -0.005, -0.001, 0, 0.001, 0.005),
        fc.constantFrom(-0.006, -0.005, -0.001, 0, 0.001, 0.005, 0.006),
        fc.boolean(),
        (beds, sliver, floorNudge, capNudge, onPrinted) => {
          const rooms = beds.map((b, i) => ({ w: b.w / 1000, h: b.h, label: `Bedroom ${i + 1}` }));
          if (sliver !== undefined) rooms.push({ w: sliver / 1000, h: 100, label: "Store" });
          const src = sideBySide(rooms);
          const exact = beds.map((b) => Math.round((b.w / 1000) * b.h) / 1e6);
          const printed = beds.map((b) => Math.round(((b.w / 1000) * b.h) / 1e4) / 100);
          const figures = onPrinted ? printed : exact;
          const floor = Math.min(...figures) + floorNudge;
          const total = figures.reduce((n, a) => n + a, 0);
          const cap = Math.round((total + capNudge) * 1e6) / 1e6;
          const res = validateIntent(src, bedrooms(beds.length, Math.max(0, floor), Math.max(0, cap)));
          if (res.ok) {
            passed++;
            expect(res.violations.map((v) => v.code)).not.toContain("E_INTENT_INFEASIBLE");
          }
        },
      ),
      { numRuns: runs(200), seed: 20261118 },
    );
    // The property bites only if plans pass: most of these contracts sit on a met edge.
    expect(passed).toBeGreaterThan(0);
  });
});

describe("arch validate --intent — the CLI reports it first", () => {
  const withFiles = async (args: (plan: string, intent: string) => string[]) => {
    const dir = mkdtempSync(join(tmpdir(), "arch-infeasible-"));
    try {
      const plan = join(dir, "h4.arch");
      const intent = join(dir, "h4.intent.json");
      writeFileSync(plan, H4);
      writeFileSync(intent, JSON.stringify(h4(10, 3.5)));
      return await runArch(args(plan, intent));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const CONFLICTS = [
    "/roomsInclude/0/areaM2",
    "/roomsInclude/0/count",
    "/roomsInclude/1/areaM2",
    "/roomsInclude/2/areaM2",
    "/totalAreaM2",
  ];
  type Out = { intent: { violations: Record<string, unknown>[] } };

  it("--json lists E_INTENT_INFEASIBLE first, a brief-stage finding, with its conflicts appended", async () => {
    const r = await withFiles((plan, intent) => ["validate", plan, "--intent", intent, "--json"]);
    expect(r.status).toBe(2);
    const [first, second] = (JSON.parse(r.stdout) as Out).intent.violations;
    expect(first).toEqual({
      code: "E_INTENT_INFEASIBLE",
      message: H4_MESSAGE,
      gate: true,
      conflicts: CONFLICTS,
      stage: "brief",
    });
    expect(Object.keys(first!)).toEqual(["code", "message", "gate", "conflicts", "stage"]);
    // Every other violation keeps its keys.
    expect(Object.keys(second!)).toEqual(["code", "message", "gate", "stage"]);
  });

  it("--stage brief shows it (it is decided from the brief alone) and holds the band misses back", async () => {
    const r = await withFiles((plan, intent) => ["validate", plan, "--intent", intent, "--stage", "brief", "--json"]);
    expect(r.status).toBe(2);
    const codes = (JSON.parse(r.stdout) as Out).intent.violations.map((v) => v.code);
    expect(codes).toEqual(["E_INTENT_INFEASIBLE"]);
  });
});
