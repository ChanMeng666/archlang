/**
 * The taste budget is a COUNT set by measurement (ADR 0032; design §2.4), the way the step
 * budget was (ADR 0022, second addendum §3): `TASTE_BUDGET` is at least 1,000 times the largest
 * charge one `taste()` call makes over the examples, the defect corpus and the taste corpus.
 * The charge is each criterion's declared cost, summed over the call, charged before the work;
 * a criterion that would overspend reports `taste-budget`.
 *
 * A charge bounds work only if each declared cost really is an upper bound on what its judge
 * does. Each judge counts its work (one unit per loop step) on a counter, and the second law
 * here holds the counted work at or under the declared cost on every corpus plan and on a
 * generated probe plan, counted, never timed.
 *
 * Measured on PS5.1b (eleven criteria): the largest call charges {@link MEASURED_MAX} units (it was
 * 1,559 on `examples/terrace-row.arch` with PS5.1a's three). If the corpus grows a
 * plan that charges more, this test names it: re-measure, and raise the budget only with the
 * new measurement recorded here and in `TASTE_BUDGET`'s doc comment.
 */

import { describe, expect, it } from "vitest";
import { taste, TASTE_BUDGET } from "../src/index.js";
import { tasteCharges, tasteWork } from "../src/taste/index.js";
import { TASTE_SOURCES, TASTE_WORLD } from "./helpers/taste-sources.js";

/** The largest per-call charge over the corpus when the budget was set. */
const MEASURED_MAX = { charge: 6163, file: "examples/terrace-row.arch" };

/** What room `i` of the probe is: a living room, a kitchen or a bedroom, in a fixed rotation. */
const probeUse = (i: number): string => (i % 4 === 0 ? "living" : i % 4 === 1 ? "kitchen" : "bedroom");

/**
 * A generated storey: a corridor along the south with `n` rooms off it, every fourth a living
 * room, the next a kitchen (with a sink and a stove) and the rest bedrooms (each with a bed), each
 * with a door to the corridor and a window to the north.
 */
function probePlan(n: number): string {
  const lines = [
    `plan "Probe" {`,
    "  units mm",
    "  grid 100",
    `  room id=r_c at (0,4000) size ${n * 3000}x1500 label "Corridor" uses circulation`,
  ];
  for (let i = 0; i < n; i++)
    lines.push(`  room id=r_${i} at (${i * 3000},0) size 3000x4000 label "Room ${i}" uses ${probeUse(i)}`);
  lines.push("  walls from rooms exterior 200 partition 100");
  lines.push("  door id=d_front on r_c.left at center width 900 swing into r_c");
  for (let i = 0; i < n; i++) {
    lines.push(`  door id=d_${i} between r_c and r_${i} at center width 900 swing into r_${i}`);
    lines.push(`  window id=w_${i} on r_${i}.top at center width 1200`);
    if (probeUse(i) === "kitchen") {
      lines.push(`  furniture kitchen_sink against r_${i}.left offset 600 in r_${i}`);
      lines.push(`  furniture stove against r_${i}.left offset 1500 in r_${i}`);
    } else if (probeUse(i) === "bedroom")
      lines.push(`  furniture bed in r_${i} anchor top flush size 1400x2000 label "Bed"`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * A storey at the element cap (`MAX_ELEMENTS`, 5,000 per storey): `n` bedrooms in a 50-wide grid,
 * nothing else. R15's pairs (B²) and R14's all-pairs walk cannot be afforded, so both are skipped
 * as `taste-budget` before they run.
 */
function capPlan(n: number): string {
  const lines = [`plan "Cap" {`, "  units mm", "  grid 100"];
  for (let i = 0; i < n; i++)
    lines.push(
      `  room id=r_${i} at (${(i % 50) * 3000},${Math.floor(i / 50) * 3000}) size 3000x3000 label "Bedroom ${i}" uses bedroom`,
    );
  lines.push("}");
  return lines.join("\n");
}

describe("TASTE_BUDGET", () => {
  it("is at least 1,000 times the largest charge of any corpus plan, and the measurement still holds", () => {
    let max = 0;
    let file = "";
    for (const { name, src } of TASTE_SOURCES) {
      const charge = tasteCharges(src, { world: TASTE_WORLD }).reduce((a, b) => a + b, 0);
      if (charge > max) {
        max = charge;
        file = name;
      }
    }
    console.log(
      `taste budget: largest corpus charge ${max} (${file}); budget ${TASTE_BUDGET} = ${TASTE_BUDGET / max}×`,
    );
    expect(
      max,
      `${file} charges more than the measured maximum (${MEASURED_MAX.file}): re-measure`,
    ).toBeLessThanOrEqual(MEASURED_MAX.charge);
    expect(TASTE_BUDGET).toBeGreaterThanOrEqual(1000 * MEASURED_MAX.charge);
  }, 300_000);
});

describe("each criterion's declared cost bounds the work its judge counts", () => {
  it("on every corpus plan", () => {
    const over: string[] = [];
    let judged = 0;
    for (const { name, src } of TASTE_SOURCES) {
      for (const w of tasteWork(src, { world: TASTE_WORLD })) {
        judged++;
        if (w.work > w.cost) over.push(`${name} ${w.id}: work ${w.work} > cost ${w.cost}`);
      }
    }
    expect(judged).toBeGreaterThan(400);
    expect(over).toEqual([]);
  }, 300_000);

  it("on a generated 40-room storey, where every criterion does real work", () => {
    const src = probePlan(40);
    const rows = tasteWork(src);
    expect(rows.map((r) => r.id)).toEqual(["R3", "R6", "R7", "R9", "R11", "R12", "R14", "R15", "R16", "R17", "R18"]);
    for (const r of rows) {
      expect(r.work, r.id).toBeGreaterThan(40);
      expect(r.work, `${r.id}: work ${r.work} > cost ${r.cost}`).toBeLessThanOrEqual(r.cost);
    }
    // Evidence is collected up to eight entries and counted past that: 40 habitable rooms.
    const r7 = taste(src).criteria.find((c) => c.id === "R7")!;
    expect(r7.evidence).toHaveLength(8);
    expect(r7.evidence_more).toBe(32);
  }, 120_000);
});

describe("a 5,000-room storey (the element cap) is bounded by the count, not the clock", () => {
  it("charges each criterion before it runs and skips the ones it cannot afford as taste-budget", () => {
    const src = capPlan(5000);
    const charges = tasteCharges(src);
    const t = taste(src);
    expect(t.ok).toBe(true);
    expect(t.coverage.rooms).toBe(5000);
    const over = t.criteria.filter((c) => c.reason === "taste-budget").map((c) => c.id);
    // R14 walks all pairs (V·(V + E)) and R15 compares all bedroom pairs (B²): both over budget.
    expect(over).toEqual(["R14", "R15"]);
    for (const c of t.criteria) {
      const charge = charges[t.criteria.indexOf(c)]!;
      if (c.reason === "taste-budget") expect(charge, c.id).toBeGreaterThan(TASTE_BUDGET);
    }
    expect(t.coverage.skipped.filter((s) => s.reason === "taste-budget").map((s) => s.criterion)).toEqual(over);
    // Every criterion that ran did no more work than it was charged.
    for (const w of tasteWork(src).filter((w) => !over.includes(w.id)))
      expect(w.work, `${w.id}: work ${w.work} > cost ${w.cost}`).toBeLessThanOrEqual(w.cost);
  }, 300_000);
});
