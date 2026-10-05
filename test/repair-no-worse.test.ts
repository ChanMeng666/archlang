import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lint, repair } from "../src/index.js";
import { archPlan } from "./arbitrary-plan.js";
import { HARD_CODES, hardConflicts, newConflicts } from "./repair-conflicts.js";

/**
 * **`repair()` never returns a source that is worse than its input.**
 *
 * "Worse" means: the repaired source holds a hard conflict — an instance of a fault
 * `repair()` itself exists to clear (`./repair-conflicts.ts`: two pieces overlapping, a
 * piece through a wall, a piece in a door's landing, a piece in a door's swing) — that
 * the input did not hold, identified by WHO is in it (the pair of pieces, the piece, the
 * door and the piece). A subset, not a count: trading the overlap the author drew for a
 * wall collision they did not draw is worse, even though the count stands still. So the
 * law is `hardConflicts(repair(s).source) ⊆ hardConflicts(s)`, and because every one of
 * the four lint codes is a function of those keys (per pair, per piece, per door), it
 * implies that no code's count rises — which is checked alongside, straight off `lint()`.
 *
 * It failed on `main` before the no-worse check in `src/repair.ts`: on the shipped
 * `hillside-villa` (`armchair#7` pushed into the `against wall` `tv_unit`) and
 * `furnished-flat` (three pieces), on 156 of 2000 generated plans (seed 42), and on the
 * SANDWICH case in `repair.test.ts`. A law that was green before the fix would prove nothing.
 */

const ROOT = resolvePath(__dirname, "..");

/** Per-(code, level) counts of the four hard codes in `lint(src)`. */
function hardCounts(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of lint(src)) {
    if (!(HARD_CODES as readonly string[]).includes(d.code!)) continue;
    const k = `${d.code}|${d.level ?? ""}`;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** The law, asserted with a message that names the plan and every new conflict. */
function expectNoWorse(name: string, src: string): void {
  const out = repair(src).source;
  expect(newConflicts(src, out), `repair() made "${name}" worse`).toEqual([]);
  const before = hardCounts(src);
  for (const [k, n] of hardCounts(out))
    expect(n, `repair() raised ${k} on "${name}"`).toBeLessThanOrEqual(before.get(k) ?? 0);
}

/** Every `.arch` the repo's corpus oracles iterate (`room-overlap-oracle.test.ts`). */
function corpus(): { name: string; src: string }[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : f.endsWith(".arch") ? [p] : [];
      });
  return [
    "examples",
    "test/fixtures",
    "test/recovery-corpus",
    "eval/goldens",
    "eval/faults",
    "eval/fidelity-plans",
  ].flatMap((d) => walk(join(ROOT, d)).map((p) => ({ name: p.slice(ROOT.length + 1), src: readFileSync(p, "utf8") })));
}

const VILLA = readFileSync(join(ROOT, "examples/hillside-villa.arch"), "utf8");
const FLAT = readFileSync(join(ROOT, "examples/furnished-flat.arch"), "utf8");

describe("repair — the villa witness", () => {
  it("introduces no hard conflict: armchair#7 is left in place, with a note that says why", () => {
    const r = repair(VILLA);
    // Before the fix: `Furniture "tv_unit" overlaps "armchair".` on level 1.
    expect(lint(r.source).filter((d) => d.code === "W_FURNITURE_OVERLAP")).toEqual([]);
    expect(newConflicts(VILLA, r.source)).toEqual([]);
    expect(r.changes.map((c) => c.id)).toEqual(["sofa_l#5", "coffee_table#6", "piano#9"]);
    expect(r.unresolved.find((u) => u.id === "armchair#7")).toEqual({
      id: "armchair#7",
      level: 1,
      span: expect.any(Object),
      reason:
        'moving it to (3600,5800) would overlap "tv_unit_10", which the plan does not have now — left in place; adjust manually',
    });
    expect(repair(r.source).source).toBe(r.source);
  });

  it("declines all three of furnished-flat's conflicting moves, and names each one", () => {
    const r = repair(FLAT);
    expect(r.changed).toBe(false);
    expect(r.unresolved.slice(0, 3).map((u) => [u.id, u.reason])).toEqual([
      [
        "sofa_l#3",
        'moving it to (300,3000) would overlap "piano_8", which the plan does not have now — left in place; adjust manually',
      ],
      [
        "coffee_table#4",
        'moving it to (900,100) would overlap "tv_unit_2", which the plan does not have now — left in place; adjust manually',
      ],
      [
        "sun_lounger#6",
        "moving it to (1950,-100) would push it into a wall, which the plan does not have now — left in place; adjust manually",
      ],
    ]);
  });
});

describe("repair — the no-worse law", () => {
  it("holds over every corpus plan, and repair stays idempotent there", () => {
    const plans = corpus();
    expect(plans.length).toBeGreaterThan(80);
    for (const { name, src } of plans) {
      expectNoWorse(name, src);
      const once = repair(src).source;
      expect(repair(once).source, `repair is not idempotent on "${name}"`).toBe(once);
    }
  });

  it("holds over generated plans", () => {
    fc.assert(
      fc.property(archPlan, (src) => expectNoWorse("<generated>", src)),
      { numRuns: 200 },
    );
  });

  it("the census agrees with lint, and sees all four kinds (the oracle is not vacuous)", () => {
    // Per plan, the census implies lint's count exactly for three codes — one diagnostic
    // per overlapping pair, per colliding piece, per door with a blocker — and bounds the
    // fourth from below (a swing is also obstructed by another door's swing, which no
    // piece is party to). So a census that silently returned nothing, or keyed the wrong
    // thing, would disagree with `lint()` here rather than keep the law above green.
    const plans = [
      ...corpus(),
      ...fc.sample(archPlan, { numRuns: 150, seed: 20261005 }).map((src) => ({ name: "<generated>", src })),
    ];
    const kinds = new Set<string>();
    for (const { name, src } of plans) {
      const keys = [...hardConflicts(src)].map((k) => k.split("|"));
      for (const [kind] of keys) kinds.add(kind!);
      const n = (kind: string, door: boolean): number =>
        new Set(keys.filter((k) => k[0] === kind).map((k) => (door ? `${k[1]}|${k[2]}` : k.join("|")))).size;
      const c = (code: string): number => lint(src).filter((d) => d.code === code).length;
      expect(n("overlap", false), name).toBe(c("W_FURNITURE_OVERLAP"));
      expect(n("wall", false), name).toBe(c("W_FURNITURE_WALL_COLLISION"));
      expect(n("doorway", true), name).toBe(c("W_DOORWAY_BLOCKED"));
      expect(n("swing", true), name).toBeLessThanOrEqual(c("W_SWING_OBSTRUCTED"));
    }
    expect([...kinds].sort()).toEqual(["doorway", "overlap", "swing", "wall"]);
  });
});

describe("repair — order dependence, stated rather than hidden", () => {
  // `b` overlaps `a`; separation yields the LATER piece, so `b` is pushed right — into
  // `c`, which repair may not move (expression coordinates). That move is declined. Write
  // `b` first and `a` is the one that yields, leftwards into open floor, and the overlap
  // is cleared. Same pieces, same room: the answer depends on source order, and the
  // no-worse check can decline a move another order would have placed safely.
  const plan = (first: string, second: string): string => `plan "Order" {
  units mm
  grid 100
  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r0 at (0,0) size 6000x4000
  ${first}
  ${second}
  furniture id=c cabinet at (2900 + 0, 1000) size 600x1000 in r0
}`;
  const A = "furniture id=a widget at (1000,1000) size 1000x1000 in r0";
  const B = "furniture id=b widget at (1800,1000) size 1000x1000 in r0";

  it("declines `b` when `a` comes first", () => {
    const r = repair(plan(A, B));
    expect(r.changed).toBe(false);
    expect(r.unresolved.map((u) => u.reason)).toContain(
      'moving it to (2000,1000) would overlap "c", which the plan does not have now — left in place; adjust manually',
    );
    expect(newConflicts(plan(A, B), r.source)).toEqual([]);
  });

  it("clears the overlap when `b` comes first", () => {
    const r = repair(plan(B, A));
    expect(r.changes.map((c) => [c.id, c.to])).toEqual([["a", { x: 800, y: 1000 }]]);
    expect(hardConflicts(r.source).size).toBe(0);
  });
});
