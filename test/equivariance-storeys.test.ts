/**
 * The D4 ⋉ Z² equivariance oracle for MULTI-STOREY plans — tiers T0, T1 and T2, storey by
 * storey (backlog M.5).
 *
 * The corpus suite places each example as a whole-file import, which drops `level` blocks,
 * so a `level` plan had no oracle but its circulation's (`test/shaft-equivariance.test.ts`).
 * Here every storey's body becomes an inline component and every storey places it with the
 * SAME frame, `place storey_N() as g at t rotate r mirror m` — one building turned or
 * flipped, the shafts keeping their ids (`g.<id>`) on every storey. See `test/d4-oracle.ts`,
 * "Multi-storey buildings", for the construction (byte-preserving surgery on the source) and
 * why it is not the corpus's.
 *
 *  - T0 — P₀ (the storeys placed at the origin) is a faithful proxy for P, storey by storey
 *    and for the building (`vertical`, the storeys, the diagnostics no storey owns).
 *  - T1 + T2 — each storey's `describe()` facts, every lint rule's slice of that storey, and
 *    (lattice-aligned or translated) its circulation, compared exactly as the corpus compares
 *    a single-storey plan: the same fact kinds, rule classes, gates (per storey) and
 *    `compareObservations`; plus the building's facts. All eight elements of D4 and the
 *    translation, and, for a plan with a `site`, the three rotations with north turned too.
 *
 * Every violation is held to `test/equivariance-known.ts` in both directions, by scope
 * (`townhouse.arch@L2`, `townhouse.arch@building`), and audited by its class predicate.
 * The scaled shaft models are `test/equivariance-storeys-{scaled,head}.test.ts` (split for wall time);
 * each storey's DRAWING (T0 and T3) is `test/equivariance-storeys-scene.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import {
  buildingFacts,
  compareBuildings,
  ELIGIBLE_EXAMPLES,
  elementNamed,
  frameFor,
  gateFacts,
  MULTI_STOREY_EXAMPLES,
  observeBuilding,
  pinDiff,
  runBuildingFacts,
  SHIPPED_EXAMPLES,
  storeyScope,
  storeyWrapper,
  t0BuildingViolations,
  toObserved,
} from "./d4-oracle.js";
import {
  assertBuildingPinned,
  FIXTURE_BUILDINGS,
  MODEL_BUILDINGS,
  MODEL_CASES,
  SHIPPED_BUILDINGS,
  type StoreyCase,
  t0Runs,
} from "./equivariance-storeys-cases.js";
import { KNOWN } from "./equivariance-known.js";
import { placed } from "./shaft-equivariance-models.js";

/** Generous: a building runs a dozen full describe() + lint() passes over every storey. */
const SLOW = 120_000;

/**
 * `garden-house` as it was before fix/examples-sound (2026-10-27) relabelled its street-side
 * bedroom a study: the one storey whose compass rule (`W_ROOM_NOT_EQUATOR_FACING`) fires, so
 * `+N` has something to compare now that every shipped example is warning-free.
 */
const GARDEN_AS_WAS: StoreyCase = (() => {
  const now = 'room id=r_study2  at (2500,4500) size 4300x4500 label "Study"     uses office';
  const src = SHIPPED_BUILDINGS.find((c) => c.name === "garden-house.arch")!.src;
  if (src.split(now).length !== 2) throw new Error("garden-house: the study line is not found exactly once");
  return {
    name: "garden-house.arch",
    src: src.replace(now, 'room id=r_study2  at (2500,4500) size 4300x4500 label "Bedroom 3" uses bedroom'),
  };
})();
const CASES: readonly StoreyCase[] = [...SHIPPED_BUILDINGS, ...FIXTURE_BUILDINGS, ...MODEL_CASES];
const named = (name: string): StoreyCase => CASES.find((c) => c.name === name)!;

describe("the per-storey oracle's own construction", () => {
  it("the cases are COMPUTED: every shipped example with a `level` block — the corpus suite's complement — is covered", () => {
    expect(MULTI_STOREY_EXAMPLES.length).toBeGreaterThanOrEqual(4);
    expect([...MULTI_STOREY_EXAMPLES, ...ELIGIBLE_EXAMPLES].sort()).toEqual([...SHIPPED_EXAMPLES].sort());
    for (const rel of ["hillside-villa.arch", "townhouse.arch", "two-storey.arch"]) {
      expect(MULTI_STOREY_EXAMPLES).toContain(rel);
    }
    expect(SHIPPED_BUILDINGS.map((c) => c.name)).toEqual(MULTI_STOREY_EXAMPLES);
  });

  it(
    "the per-storey fold IS lint(), for P and for P₀ (so the rule and storey a violation names raised it)",
    () => {
      for (const c of CASES) {
        for (const src of [c.src, storeyWrapper(c.src, null).src]) {
          const b = observeBuilding(src);
          expect(b.storeys.size, c.name).toBe(parse(src).plan!.body.filter((s) => s.kind === "level").length);
          const fold = [...b.storeys.values()].flatMap((o) => o.lint.flatMap((r) => r.diags));
          expect(fold, c.name).toEqual(lint(src));
        }
      }
    },
    SLOW,
  );

  it("the surgery copies every storey statement byte for byte, and toSource maps it back onto P", () => {
    let statements = 0;
    for (const c of CASES) {
      const w = storeyWrapper(c.src, null);
      const comps = [...parse(w.src).plan!.components.values()].filter((d) => d.name.startsWith("storey_"));
      expect(comps.length, c.name).toBe(parse(c.src).plan!.body.filter((s) => s.kind === "level").length);
      for (const d of comps) {
        for (const s of d.body) {
          const { start, end } = s.span!;
          expect(c.src.slice(w.toSource(start), w.toSource(end)), `${c.name} ${d.name}`).toBe(w.src.slice(start, end));
          statements++;
        }
      }
      // P₀ and gP differ only in the closing `level` lines: every storey byte has one offset.
      const gP = storeyWrapper(c.src, elementNamed("r90mx")).src;
      const head = w.src.slice(0, w.src.indexOf("\n  level "));
      expect(gP.startsWith(head), c.name).toBe(true);
    }
    expect(statements).toBeGreaterThan(300);
  });

  it("a storey's `roof` stays in its `level` block (a component may not hold one), as the building's", () => {
    // Every shipped example roofs its top storey; inside the component it is E_ROOF_PLACEMENT.
    for (const c of SHIPPED_BUILDINGS) {
      const w = storeyWrapper(c.src, null).src;
      expect(w, c.name).toMatch(/\n {2}level [^\n]*\{\n {4}place storey_\d+\(\) as g at \(0, 0\)\n {4}roof /);
      expect(
        describePlan(w).diagnostics.map((d) => d.code),
        c.name,
      ).not.toContain("E_ROOF_PLACEMENT");
    }
    // `hillside-villa` names its roof's ring, which in the level block is the PLACED wall.
    expect(storeyWrapper(named("hillside-villa.arch").src, null).src).toContain("roof overhang 700 wall g.shell");
  });

  it("the roof is unobserved: removing it moves no fact", () => {
    // A roof is drawing-only (no describe() key, no lint rule); it reaches the facts only
    // through the drawing bounds. So the roof surgery is checked by the absence of
    // E_ROOF_PLACEMENT above, and by facts only where the eaves move the sheet fit: no
    // shipped example's do, the fixture's below (PS2.77) do. Those facts are gated
    // (`sheet`, compared under the elements that keep the axes), so a roof carried wrongly
    // under a quarter-turn would be seen by no fact here: the scene sees it
    // (`test/equivariance-storeys-scene.test.ts`).
    const view = (src: string) =>
      [...observeBuilding(storeyWrapper(src, null).src).storeys].map(([level, o]) => ({
        level,
        summary: o.summary,
        lint: o.lint,
      }));
    for (const c of SHIPPED_BUILDINGS) {
      const roofs = parse(c.src)
        .plan!.body.flatMap((l) => (l.kind === "level" ? l.body.filter((x) => x.kind === "roof") : []))
        .map((r) => r.span!);
      expect(roofs.length, c.name).toBe(1);
      const bare = roofs.reduceRight((src, r) => src.slice(0, r.start) + src.slice(r.end), c.src);
      const [withRoof, without] = [view(c.src), view(bare)];
      // `hillside-villa`'s eaves overran its old A2 sheet, the one fact a roof moved, until
      // fix/examples-sound (2026-10-27) issued it on A1; the page growing past its sheet is
      // `test/drawing-overflow.test.ts`'s.
      expect(without, c.name).toEqual(withRoof);
    }
  });

  it("…except where the eaves alone overrun the sheet: the fixture's roof raises the building-level W_DRAWING_OVERFLOW", () => {
    // The fact `hillside-villa`'s eaves carried before fix/examples-sound (PS2.77), kept by a
    // fixture: the building fits its fixed A4 at 1:75, the upper storey's eaves do not. The
    // warning is the building's (no `level`), on the `paper` statement, so it is compared
    // under the group as `diagnostics.sheet` wherever the sheet gate is open.
    const c = named("fixture:storeys-eaves-overflow.arch");
    const roofs = parse(c.src)
      .plan!.body.flatMap((l) => (l.kind === "level" ? l.body.filter((x) => x.kind === "roof") : []))
      .map((r) => r.span!);
    expect(roofs.length).toBe(1);
    const bare = c.src.slice(0, roofs[0]!.start) + c.src.slice(roofs[0]!.end);
    const sheetDiags = (src: string) => {
      const b = observeBuilding(storeyWrapper(src, null).src);
      const own = b.summary.diagnostics.filter((d) => d.code === "W_DRAWING_OVERFLOW");
      expect(own.every((d) => d.level === undefined)).toBe(true);
      const facts = buildingFacts(b, { sheet: true }).get("diagnostics.sheet")!.value as { code?: string }[];
      expect(facts.filter((d) => d.code === "W_DRAWING_OVERFLOW")).toHaveLength(own.length);
      return { codes: b.summary.diagnostics.map((d) => d.code), overflow: own.length };
    };
    expect(sheetDiags(c.src)).toEqual({ codes: ["W_DRAWING_OVERFLOW"], overflow: 1 });
    expect(sheetDiags(bare)).toEqual({ codes: [], overflow: 0 });
  });

  it('the models are the shaft suite\'s buildings: P₀ describes every storey as `placed(b, "", 0)` does', () => {
    const comp = (s: string) => s.replace(/"component":"(?:storey_|s)(\d+)"/g, '"component":"$1"');
    for (const [i, b] of MODEL_BUILDINGS.entries()) {
      const mine = describePlan(storeyWrapper(MODEL_CASES[i]!.src, null).src);
      const theirs = describePlan(placed(b, "", 0));
      expect(comp(JSON.stringify(mine.levels)), b.name).toBe(comp(JSON.stringify(theirs.levels)));
      expect(mine.vertical, b.name).toEqual(theirs.vertical);
    }
  });

  it("the gates are open: every shipped and 1× model storey is lattice-aligned and measured, so its raster is compared under every element", () => {
    // The 1× models too: a model edit that broke alignment would otherwise close the raster
    // gate on them silently, and their circulation would be compared under the translation only.
    for (const c of CASES) {
      for (const [level, o] of observeBuilding(storeyWrapper(c.src, null).src).storeys) {
        expect(gateFacts(o).aligned, `${c.name} L${level}`).toBe(true);
        expect(o.summary.circulation?.rooms.length ?? 0, `${c.name} L${level}`).toBeGreaterThan(0);
      }
    }
    // …and the compass rule has something to compare under `+N`: garden-house's first floor.
    const garden = observeBuilding(storeyWrapper(GARDEN_AS_WAS.src, null).src).storeys.get(2)!;
    expect(garden.lint.find((r) => r.name === "room-not-equator-facing")!.diags.length).toBeGreaterThan(0);
  });
});

describe("planted violations — the oracle and the pin table go red", () => {
  const rel = "townhouse.arch";
  const src = named(rel).src;
  const grid = parse(src).plan!.grid;

  it("the prediction can FAIL: every storey observed under r270 against r90's prediction is caught", () => {
    const b0 = observeBuilding(storeyWrapper(src, null).src);
    const bG = observeBuilding(storeyWrapper(src, elementNamed("r270")).src);
    const wrong = frameFor(elementNamed("r90"), grid);
    const out = compareBuildings(rel, b0, bG, elementNamed("r90"), wrong, "up", false);
    for (const level of [1, 2, 3]) {
      const paths = out.get(storeyScope(rel, level))!.vs.map((v) => v.path);
      expect(paths, `L${level}`).toContain("rooms[].bbox");
      expect(paths, `L${level}`).toContain("windows[].facing");
      expect(paths, `L${level}`).toContain("verticals[].bbox");
    }
  });

  it("ONE storey turned by a different element is caught on that storey alone — and fails the pin table as NEW", () => {
    // The law's own failure mode: a building whose storeys are not carried by one g. L2 is
    // placed `rotate 90` while L1 and L3 are placed `rotate 180`.
    const g = elementNamed("r180");
    const good = storeyWrapper(src, g).src;
    const planted = good.replace(
      "place storey_2() as g at (0, 0) rotate 180",
      "place storey_2() as g at (0, 0) rotate 90",
    );
    expect(planted).not.toBe(good);
    const b0 = observeBuilding(storeyWrapper(src, null).src);
    const out = compareBuildings(rel, b0, observeBuilding(planted), g, frameFor(g, grid), "up", false);
    expect(out.get(storeyScope(rel, 1))!.vs).toEqual([]);
    // L3 sees only the one cross-storey rule (PS2.15): its stair no longer stands over the turned
    // L2's, and `W_SHAFT_FOOTPRINT_MISMATCH` reports a pair on its UPPER stop. Nothing of L3's own.
    const l3 = out.get(storeyScope(rel, 3))!.vs;
    expect(l3.length).toBeGreaterThan(0);
    expect(l3.every((v) => v.key.startsWith("lint.shaft-footprint-mismatch"))).toBe(true);
    const l2 = out.get(storeyScope(rel, 2))!.vs;
    expect(l2.map((v) => v.key)).toContain("rooms[g.r_bed1].bbox");
    expect(l2.map((v) => v.key)).toContain("verticals[g.st].bbox");
    // …and the suite's assertion would report it: none of it is pinned.
    const observed = [...out].flatMap(([where, r]) => toObserved(where, "r180", r.vs));
    const { added } = pinDiff(KNOWN, observed, (o) => o.where.startsWith(`${rel}@`));
    expect(added.length).toBe(
      toObserved(storeyScope(rel, 2), "r180", l2).length + toObserved(storeyScope(rel, 3), "r180", l3).length,
    );
    expect(added.length).toBeGreaterThan(5);
  });

  it("T0 can fail: a P₀ whose second storey differs by one door width is caught on that storey alone", () => {
    const plant = (p0: string): string => {
      const at = p0.indexOf("component storey_2()");
      const tail = p0
        .slice(at)
        .replace("door id=d_bath on spine  at 5200 width 800", "door id=d_bath on spine  at 5200 width 900");
      return p0.slice(0, at) + tail;
    };
    expect(plant(storeyWrapper(src, null).src)).not.toBe(storeyWrapper(src, null).src);
    const t0 = t0BuildingViolations(rel, src, { plant });
    expect(t0.get(storeyScope(rel, 1))).toEqual([]);
    expect(t0.get(storeyScope(rel, 3))).toEqual([]);
    expect(t0.get(storeyScope(rel, 2))!.map((v) => v.key)).toContain("doors");
  });
});

describe("T0 — each storey of P₀ (every storey a component, placed at the origin) is faithful to P", () => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s",
    (_name, c) => assertBuildingPinned(c.name, "T0", t0Runs(c)),
    SLOW,
  );
});

describe("T1 + T2 — every storey's describe(), every lint rule's slice of it, and its raster, under the group", () => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s",
    (_name, c) => {
      const runs = runBuildingFacts(c.name, c.src);
      expect(runs, `${c.name}: P₀ does not resolve (T0 owns that)`).not.toBeNull();
      // Every storey, the building, and every element of the run plan are really compared.
      const levels = parse(c.src).plan!.body.filter((s) => s.kind === "level").length;
      expect(runs!.size, c.name).toBe(levels + 1);
      const tags = [...runs!.values()][0]!.map((r) => r.tag);
      expect(tags.filter((t) => !t.endsWith("+N"))).toEqual([
        "r90",
        "r180",
        "r270",
        "mx",
        "r90mx",
        "r180mx",
        "r270mx",
        "t",
      ]);
      if (parse(c.src).plan!.site) expect(tags.filter((t) => t.endsWith("+N"))).toEqual(["r90+N", "r180+N", "r270+N"]);
      assertBuildingPinned(c.name, "T1", runs!);
    },
    SLOW,
  );
  // The compass rule's comparison under `+N`, on the one storey where it fires (see GARDEN_AS_WAS).
  it(
    "garden-house.arch as it was (its street-side bedroom)",
    () => {
      const runs = runBuildingFacts(GARDEN_AS_WAS.name, GARDEN_AS_WAS.src);
      expect(runs).not.toBeNull();
      const tags = [...runs!.values()][0]!.map((r) => r.tag);
      expect(tags.filter((t) => t.endsWith("+N"))).toEqual(["r90+N", "r180+N", "r270+N"]);
      assertBuildingPinned(GARDEN_AS_WAS.name, "T1", runs!);
    },
    SLOW,
  );
});
