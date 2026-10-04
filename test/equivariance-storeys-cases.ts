/**
 * The buildings `test/equivariance-storeys*.test.ts` hold to the D4 ⋉ Z² law storey by storey,
 * and the two-way pin assertion they share. The construction is `test/d4-oracle.ts`'s
 * ("Multi-storey buildings"); this module only names the cases.
 *
 *  - every shipped `level` example (COMPUTED: `MULTI_STOREY_EXAMPLES`), and
 *  - every building `test/shaft-equivariance.test.ts` runs (its `CASES`), as level bodies from
 *    `./shaft-equivariance-models.ts` — at 1× (a 100 mm nav cell, lattice-aligned, so the
 *    raster is compared under every element) and scaled (a larger cell that does not divide
 *    the plan, so the raster is compared under the translation only; the shaft suite owns
 *    their turned and flipped circulation, within its measured bounds).
 *
 * {@link defineScaledSuite} is the one suite body both scaled files run.
 */

import { describe, expect, it } from "vitest";
import { lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import {
  EXAMPLE_FILES,
  explain,
  gateFacts,
  idOfKey,
  levelPlanOf,
  MULTI_STOREY_EXAMPLES,
  type Observed,
  observeBuilding,
  pinAudit,
  pinDiff,
  type Run,
  runBuildingFacts,
  storeyWrapper,
  t0BuildingViolations,
  toObserved,
} from "./d4-oracle.js";
import { KNOWN, KNOWN_CLASSES } from "./equivariance-known.js";
import { type Building, hillside, P3, shell, townhouse } from "./shaft-equivariance-models.js";

/** One multi-storey case: its pin name (`townhouse.arch`, `model:Townhouse x1`) and source. */
export interface StoreyCase {
  name: string;
  src: string;
}

const model = (b: Building): StoreyCase => ({ name: `model:${b.name}`, src: levelPlanOf(b.name, b.storeys) });

export const SHIPPED_BUILDINGS: readonly StoreyCase[] = MULTI_STOREY_EXAMPLES.map((rel) => ({
  name: rel,
  src: EXAMPLE_FILES[rel]!,
}));

/** The shaft models on a 100 mm nav cell. */
export const MODEL_BUILDINGS: readonly Building[] = [townhouse(1), hillside(1), shell(20000, 15000, 300, true)];

/** The shaft models on a cell that does not divide the plan (118–220 mm): the scaled
 *  layouts and the plain shells (`test/equivariance-storeys-scaled.test.ts`)… */
export const SCALED_MODEL_BUILDINGS: readonly Building[] = [
  townhouse(8),
  hillside(5),
  shell(100000, 80000, 300, true),
  shell(120000, 100000, 200, true),
];

/** …and the 220 mm shells with something at the stair's head
 *  (`test/equivariance-storeys-head.test.ts`; two files only for wall time). */
export const HEAD_MODEL_BUILDINGS: readonly Building[] = [
  shell(120000, 100000, 300, true),
  P3.halfTable,
  P3.partitionAtHead,
  P3.openingAtHead,
  P3.perpendicularDoor,
];

export const MODEL_CASES: readonly StoreyCase[] = MODEL_BUILDINGS.map(model);
export const SCALED_MODEL_CASES: readonly StoreyCase[] = SCALED_MODEL_BUILDINGS.map(model);
export const HEAD_MODEL_CASES: readonly StoreyCase[] = HEAD_MODEL_BUILDINGS.map(model);

/** Every building a pin may name (the `<name>` of a `<name>@L<n>` / `<name>@building` scope). */
export const STOREY_BUILDING_NAMES: readonly string[] = [
  ...SHIPPED_BUILDINGS,
  ...MODEL_CASES,
  ...SCALED_MODEL_CASES,
  ...HEAD_MODEL_CASES,
].map((c) => c.name);

/** The building a pin scope names, or `null` when it is not a storey/building scope. */
export function scopeBuilding(where: string): string | null {
  const m = /^(.*)@(?:L-?\d+|building)$/.exec(where);
  return m ? m[1]! : null;
}

/**
 * The tiers a building's pins are held in, each its own scope: the facts (`T0`, `T1` —
 * T1 + T2) and the drawing (`T0-scene`, `T3`; `test/equivariance-storeys-scene.test.ts`).
 * A pin's tier is read off it: `g` is `T0` at the identity, and a `scene.` path is drawn.
 */
export type StoreyTier = "T0" | "T1" | "T0-scene" | "T3";

/**
 * The corpus suite's two-way pin assertion, over every scope of one building at once: an
 * observed violation no row pins is NEW, a row of this building no longer observed is FIXED,
 * and every pinned violation's class must account for it (the audit).
 */
export function assertBuildingPinned(name: string, tier: StoreyTier, runs: ReadonlyMap<string, readonly Run[]>): void {
  const identity = tier === "T0" || tier === "T0-scene";
  const drawn = tier === "T0-scene" || tier === "T3";
  const scope = (o: Pick<Observed, "where" | "g" | "path" | "id">): boolean =>
    scopeBuilding(o.where) === name && identity === (o.g === "T0") && drawn === o.path.startsWith("scene.");
  const all = [...runs].flatMap(([where, rs]) => rs.map((r) => ({ where, r })));
  const observed = all.flatMap(({ where, r }) => toObserved(where, r.tag, r.vs));
  const { added, vanished } = pinDiff(KNOWN, observed, scope);
  const detail = added
    .map((k) => {
      const [where, tag, path, idAndDelta = ""] = k.split(" | ");
      const id = idAndDelta.split("  ")[0];
      const vs =
        all
          .find(({ where: w, r }) => w === where && r.tag === tag)
          ?.r.vs.filter((v) => v.path === path && idOfKey(v.key) === id) ?? [];
      return `${k}\n${explain(vs, 3)}`;
    })
    .join("\n");
  expect(
    added,
    `NEW equivariance violation — pin it in test/equivariance-known.ts with a class, a witness and a why:\n${detail}`,
  ).toEqual([]);
  expect(vanished, `FIXED: delete the pin and its witness:\n${vanished.join("\n")}`).toEqual([]);
  for (const [where, rs] of runs) {
    expect(pinAudit(KNOWN, KNOWN_CLASSES, where, rs), `${where}: a pin whose class does not account for it`).toEqual(
      [],
    );
  }
}

/** T0's violations as runs, tagged `T0`. */
export const t0Runs = (c: StoreyCase): Map<string, Run[]> =>
  new Map([...t0BuildingViolations(c.name, c.src)].map(([where, vs]) => [where, [{ tag: "T0", vs }]]));

/** The number of `level` blocks a source declares. */
export const levelCount = (src: string): number => parse(src).plan!.body.filter((s) => s.kind === "level").length;

/** Generous: a scaled building's storeys each rasterise a 100 m-plus plan a dozen times. */
const SLOW = 120_000;

/**
 * The scaled shaft models' suite: `test/equivariance-storeys.test.ts`'s construction check,
 * T0 and T1 + T2 for each case — same comparison, same pin table. Their nav cell does not
 * divide the plan, so a turn or a flip moves the last cell's spill (`latticeAligned`): the
 * raster is compared under the translation only, and the shaft suite owns their turned and
 * flipped circulation within its measured bounds. Every other fact is compared under every
 * element.
 */
export function defineScaledSuite(title: string, cases: readonly StoreyCase[]): void {
  describe(`${title} — the construction holds`, () => {
    it.each(cases.map((c) => [c.name, c] as const))(
      "%s: the per-storey fold IS lint(), and the raster gate is closed by the spill",
      (_name, c) => {
        const src = storeyWrapper(c.src, null).src;
        const b = observeBuilding(src);
        expect([...b.storeys.values()].flatMap((o) => o.lint.flatMap((r) => r.diags))).toEqual(lint(src));
        expect([...b.storeys.values()].map((o) => gateFacts(o).aligned)).toEqual(
          [...b.storeys.keys()].map(() => false),
        );
      },
      SLOW,
    );
  });

  describe(`${title} — T0, then T1 + T2 under the group`, () => {
    it.each(cases.map((c) => [c.name, c] as const))(
      "%s",
      (_name, c) => {
        assertBuildingPinned(c.name, "T0", t0Runs(c));
        const runs = runBuildingFacts(c.name, c.src);
        expect(runs, `${c.name}: P₀ does not resolve (T0 owns that)`).not.toBeNull();
        expect(runs!.size).toBe(levelCount(c.src) + 1);
        expect([...runs!.values()][0]!.map((r) => r.tag)).toEqual([
          "r90",
          "r180",
          "r270",
          "mx",
          "r90mx",
          "r180mx",
          "r270mx",
          "t",
        ]);
        assertBuildingPinned(c.name, "T1", runs!);
      },
      SLOW,
    );
  });
}
