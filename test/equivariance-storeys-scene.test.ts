/**
 * Tier T3 of the D4 ⋉ Z² equivariance oracle for MULTI-STOREY plans: each storey's DRAWN
 * SCENE under the group (backlog M.5), and T0 for the drawing.
 *
 * The per-storey facts suite (`test/equivariance-storeys.test.ts`) compares `describe()`
 * and `lint()`, which do not carry a door's swing, hinge or position, a window's position,
 * or the roof at all (drawing-only). This suite compares what each storey DRAWS, with the
 * single-storey tier's own machinery (`test/equivariance-scene.test.ts`): every storey
 * of P₀ and of gP built by the same byte surgery (`storeyWrapper`, `test/d4-oracle.ts`),
 * drawn on the same fixed sheet (`withFixedSheetStoreys` — `FIXED_SHEET`), and compared
 * storey by storey through `compareScenes` — the same `sceneGroups` split (the label pass,
 * hatches, texts but a hand-written dim's number, and the `dims auto` chains left out, for
 * the reasons given there), the same canonical form, every element of D4 and the
 * translation.
 *
 *  - T0 (the drawing) — P₀ draws what P draws, storey by storey, on P's own sheet: every
 *    node and scene key, the excluded groups included, once the construction's own marks
 *    are taken out (`t0BuildingScenes`: the `g.` prefix, spans carried back onto P's
 *    bytes, the instance's zone on a schedule row).
 *  - T3 — `runBuildingScenes`.
 *
 * Every violation is held to `test/equivariance-known.ts` in both directions, by scope
 * (`hillside-villa.arch@L1`), and audited by its class predicate. The buildings are the
 * facts suites' sixteen: the shipped `level` examples and every shaft model, 1×, scaled
 * and with something at the stair head — drawing a storey is cheap, so one file holds them.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import {
  BUILDING_ELEMENTS,
  buildingScope,
  compareBuildings,
  compareScenes,
  elementNamed,
  frameFor,
  observeBuilding,
  pinDiff,
  runBuildingScenes,
  sceneGroups,
  storeyScenes,
  storeyScope,
  storeyWrapper,
  t0BuildingScenes,
  toObserved,
  type Violation,
  withFixedSheetStoreys,
} from "./d4-oracle.js";
import {
  assertBuildingPinned,
  HEAD_MODEL_CASES,
  levelCount,
  MODEL_CASES,
  SCALED_MODEL_CASES,
  SHIPPED_BUILDINGS,
  STOREY_BUILDING_NAMES,
  type StoreyCase,
} from "./equivariance-storeys-cases.js";
import { KNOWN } from "./equivariance-known.js";

/** Generous: a building draws every storey nine times. */
const SLOW = 120_000;

const CASES: readonly StoreyCase[] = [...SHIPPED_BUILDINGS, ...MODEL_CASES, ...SCALED_MODEL_CASES, ...HEAD_MODEL_CASES];
const named = (name: string): StoreyCase => CASES.find((c) => c.name === name)!;

/** `src` with `from` replaced by `to` inside storey N's component only (the plant). */
function inStorey(src: string, level: number, from: string, to: string): string {
  const at = src.indexOf(`component storey_${level}()`);
  const end = src.indexOf("\n  }\n", at);
  expect(at, `storey ${level}`).toBeGreaterThan(0);
  const body = src.slice(at, end);
  expect(body, `storey ${level} has \`${from}\``).toContain(from);
  return src.slice(0, at) + body.replace(from, to) + src.slice(end);
}

/** One building's T3 comparison, P₀ against the gP `observedSrc` (planted or not), by storey. */
function sceneViolations(c: StoreyCase, g: string, observedSrc: (gP: string) => string): Map<number, Violation[]> {
  const sheet = withFixedSheetStoreys(c.src);
  const f = frameFor(elementNamed(g), parse(c.src).plan!.grid);
  const s0 = storeyScenes(storeyWrapper(sheet, null).src);
  const sG = storeyScenes(observedSrc(storeyWrapper(sheet, elementNamed(g)).src));
  return new Map([...s0].map(([level, s]) => [level, compareScenes(s, sG.get(level)!, f)]));
}

/** The same plant, seen by the FACTS tier (T1 + T2) on the same storey. */
function factViolations(c: StoreyCase, g: string, observedSrc: (gP: string) => string): Map<number, Violation[]> {
  const ge = elementNamed(g);
  const f = frameFor(ge, parse(c.src).plan!.grid);
  const b0 = observeBuilding(storeyWrapper(c.src, null).src);
  const bG = observeBuilding(observedSrc(storeyWrapper(c.src, ge).src));
  const out = compareBuildings(c.name, b0, bG, ge, f, parse(c.src).plan!.north, false);
  return new Map([...b0.storeys.keys()].map((level) => [level, out.get(storeyScope(c.name, level))!.vs]));
}

describe("the per-storey scene's own construction", () => {
  it("covers every building the per-storey facts suites cover — the shipped `level` examples and every shaft model", () => {
    expect(CASES.map((c) => c.name)).toEqual(STOREY_BUILDING_NAMES);
    expect(CASES.length).toBe(16);
  });

  it("every storey is drawn on the fixed sheet, and P₀ and gP still differ only in their closing `level` lines", () => {
    for (const c of CASES) {
      const sheet = withFixedSheetStoreys(c.src);
      const plan = parse(sheet).plan!;
      expect([plan.paper, plan.scale], c.name).toEqual([{ size: "A0", orientation: "landscape" }, "1:100"]);
      const p0 = storeyWrapper(sheet, null).src;
      const gP = storeyWrapper(sheet, elementNamed("r90mx")).src;
      expect(gP.startsWith(p0.slice(0, p0.indexOf("\n  level "))), c.name).toBe(true);
      // One sheet: every storey of every element is drawn at the same render sizes.
      const sizes = new Set(
        [null, ...BUILDING_ELEMENTS].flatMap((g) =>
          [...storeyScenes(storeyWrapper(sheet, g).src).values()].map((s) => JSON.stringify(s.sizes)),
        ),
      );
      expect(sizes.size, c.name).toBe(1);
    }
  });

  it("the blind spots are compared groups: every shipped storey draws its doors and windows, and its top storey its roof", () => {
    // M.5's three: a door's swing/hinge/position and a window's position (`describe()`
    // carries neither), and the roof (drawing-only). Each is a group T3 compares.
    for (const c of SHIPPED_BUILDINGS) {
      const scenes = storeyScenes(storeyWrapper(withFixedSheetStoreys(c.src), null).src);
      const top = Math.max(...scenes.keys());
      for (const [level, s] of scenes) {
        const kinds = [...sceneGroups(s).values()].map((g) => g.kind);
        expect(kinds.filter((k) => k === "door").length, `${c.name} L${level}`).toBeGreaterThan(0);
        expect(kinds.filter((k) => k === "window").length, `${c.name} L${level}`).toBeGreaterThan(0);
        expect(kinds.includes("roof"), `${c.name} L${level}`).toBe(level === top);
      }
    }
    // The roof stays in the `level` block (the building's), so its id carries no prefix.
    const top = storeyScenes(storeyWrapper(withFixedSheetStoreys(named("townhouse.arch").src), null).src).get(3)!;
    expect([...sceneGroups(top).keys()]).toContain("roof_1");
  });

  it("toSource carries a relocated roof statement's span onto the source's roof statement", () => {
    for (const c of SHIPPED_BUILDINGS) {
      const w = storeyWrapper(c.src, null);
      const roof = parse(c.src)
        .plan!.body.flatMap((l) => (l.kind === "level" ? l.body.filter((x) => x.kind === "roof") : []))
        .map((r) => r.span!)[0]!;
      const placed = parse(w.src)
        .plan!.body.flatMap((l) => (l.kind === "level" ? l.body.filter((x) => x.kind === "roof") : []))
        .map((r) => r.span!)[0]!;
      expect([w.toSource(placed.start), w.toSource(placed.end)], c.name).toEqual([roof.start, roof.end]);
    }
  });
});

describe("planted violations — the scene tier goes red where the facts tier cannot", () => {
  const town = named("townhouse.arch");

  it("the prediction can FAIL: every storey of every shipped building observed under r270 against r90's prediction is caught", () => {
    for (const c of SHIPPED_BUILDINGS) {
      const sheet = withFixedSheetStoreys(c.src);
      const s0 = storeyScenes(storeyWrapper(sheet, null).src);
      const s270 = storeyScenes(storeyWrapper(sheet, elementNamed("r270")).src);
      const wrong = frameFor(elementNamed("r90"), parse(c.src).plan!.grid);
      for (const [level, s] of s0) {
        const paths = compareScenes(s, s270.get(level)!, wrong).map((v) => v.path);
        expect(paths, `${c.name} L${level}`).toContain("scene.walls");
        expect(paths, `${c.name} L${level}`).toContain("scene.room[]");
      }
    }
  });

  it("ONE storey turned by a different element is caught on that storey alone — and fails the pin table as NEW", () => {
    const planted = (gP: string) =>
      gP.replace("place storey_2() as g at (0, 0) rotate 180", "place storey_2() as g at (0, 0) rotate 90");
    const vs = sceneViolations(town, "r180", planted);
    expect(vs.get(1)).toEqual([]);
    expect(vs.get(3)).toEqual([]);
    expect(vs.get(2)!.map((v) => v.key)).toContain("scene.stair[g.st]");
    const observed = [...vs].flatMap(([level, v]) => toObserved(storeyScope(town.name, level), "r180", v));
    const { added } = pinDiff(KNOWN, observed, (o) => o.where.startsWith(`${town.name}@`));
    expect(added.length).toBe(observed.length);
    expect(added.length).toBeGreaterThan(5);
  });

  // M.5's blind spots, planted in gP's SOURCE (the `src/` plants are reported in backlog M.5):
  // each is caught on its storey, by its element alone, under an element the facts tier
  // compares in full — and the facts tier stays green on that storey.
  const blind: [string, number, string, string, string, string[]][] = [
    // a door's swing: d_bed1 opens into the landing instead of the bedroom
    [
      "a door's swing",
      2,
      "r90mx",
      "d_bed1 on spine  at 1800 width 800 swing into r_bed1",
      "d_bed1 on spine  at 1800 width 800 swing into r_landing",
      ["scene.door[g.d_bed1]"],
    ],
    // a door's hinge: the front door hinged on its other jamb
    [
      "a door's hinge",
      1,
      "mx",
      "hinge left swing into r_hall",
      "hinge right swing into r_hall",
      ["scene.door[g.d_front]"],
    ],
    // a window's position: 100 mm along its wall — its glazing, and the cut it makes in the wall fabric
    [
      "a window's position",
      2,
      "r90",
      "window id=n_bed1    at (1600,0)",
      "window id=n_bed1    at (1700,0)",
      ["scene.walls", "scene.window[g.n_bed1]"],
    ],
  ];
  it.each(blind)(
    "%s, planted on L%i under %s, is a scene violation of that element alone, unseen by the facts",
    (_what, level, g, from, to, keys) => {
      const plant = (gP: string) => inStorey(gP, level, from, to);
      const scene = sceneViolations(town, g, plant);
      for (const [l, vs] of scene)
        expect(
          vs.map((v) => v.key),
          `L${l}`,
        ).toEqual(l === level ? keys : []);
      expect(factViolations(town, g, plant).get(level)).toEqual([]);
    },
  );

  it("the roof, carried wrongly under a quarter-turn (its overhang changed in gP), is caught on the top storey alone — and by no fact", () => {
    const plant = (gP: string) => gP.replace("roof overhang 400", "roof overhang 500");
    const scene = sceneViolations(town, "r90", plant);
    expect(scene.get(1)).toEqual([]);
    expect(scene.get(2)).toEqual([]);
    expect(scene.get(3)!.map((v) => v.key)).toEqual(["scene.roof[roof_1]"]);
    const facts = factViolations(town, "r90", plant);
    for (const vs of facts.values()) expect(vs).toEqual([]);
  });

  it("T0 can fail: a P₀ whose second storey draws one window 100 mm along is caught on that storey alone", () => {
    const plant = (p0: string) => inStorey(p0, 2, "window id=n_bed1    at (1600,0)", "window id=n_bed1    at (1700,0)");
    const t0 = t0BuildingScenes(town.name, town.src, { plant });
    expect(t0.get(storeyScope(town.name, 1))![0]!.vs).toEqual([]);
    expect(t0.get(storeyScope(town.name, 3))![0]!.vs).toEqual([]);
    expect(t0.get(storeyScope(town.name, 2))![0]!.vs.map((v) => v.key)).toContain("scene.window[n_bed1]");
  });
});

describe("T0 — each storey of P₀ draws what P draws", () => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s",
    (_name, c) => {
      const runs = t0BuildingScenes(c.name, c.src);
      expect(runs.size, c.name).toBe(levelCount(c.src));
      assertBuildingPinned(c.name, "T0-scene", runs);
    },
    SLOW,
  );
});

describe("T3 — every storey's drawn scene, under the group", () => {
  it.each(CASES.map((c) => [c.name, c] as const))(
    "%s",
    (_name, c) => {
      const runs = runBuildingScenes(c.name, c.src);
      expect(runs, `${c.name}: P₀ does not compile (T0 owns that)`).not.toBeNull();
      // Every storey, the building, and every element are really compared.
      expect(runs!.size, c.name).toBe(levelCount(c.src) + 1);
      expect(runs!.has(buildingScope(c.name))).toBe(true);
      for (const rs of runs!.values()) {
        expect(rs.map((r) => r.tag)).toEqual(["r90", "r180", "r270", "mx", "r90mx", "r180mx", "r270mx", "t"]);
      }
      assertBuildingPinned(c.name, "T3", runs!);
    },
    SLOW,
  );
});
