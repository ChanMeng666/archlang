import { readFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compile, openPlan3dToArch } from "../src/index.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { MAX_IMPORT_LEVELS } from "../src/import/limits.js";
import { MUTATION_KINDS, type MutationKind, applyMutations, mutationsArb, protoSnapshot } from "./json-mutate.js";

/**
 * Malformed OpenPlan3D input never throws (EH1.10, T-F3 / S-FZ-5).
 *
 * The fixtures in `test/fixtures/openplan3d` are mutated by the shared seeded mutators
 * (`test/json-mutate.ts`), plus two shape attacks: nesting 500 deep and arrays of 10k empty
 * objects. Laws: `openPlan3dToArch` never throws; every diagnostic carries a catalogued code; a
 * result with `source` has no error diagnostic and that source compiles without throwing; no
 * prototype gains an own key; the big inputs end in a result (the step meter / level cap), not a hang.
 */

const SEED = 20261110;
const NUM_RUNS = 300;
const DIR = join(__dirname, "fixtures", "openplan3d");
const FIXTURES = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ name: f, json: JSON.parse(readFileSync(join(DIR, f), "utf8")) as unknown }));

function check(doc: unknown): string | undefined {
  const before = protoSnapshot();
  let r: ReturnType<typeof openPlan3dToArch>;
  try {
    r = openPlan3dToArch(doc);
  } catch (e) {
    return `openPlan3dToArch threw: ${(e as Error)?.stack ?? e}`;
  }
  const uncatalogued = r.diagnostics.filter((d) => !d.code || !(d.code in ERROR_CATALOG));
  if (uncatalogued.length > 0) return `uncatalogued diagnostic: ${JSON.stringify(uncatalogued[0])}`;
  const errors = r.diagnostics.filter((d) => d.severity === "error");
  if (r.source !== undefined) {
    if (errors.length > 0) return "source returned alongside an error diagnostic";
    try {
      compile(r.source);
    } catch (e) {
      return `compile threw on the imported source: ${(e as Error)?.stack ?? e}`;
    }
  } else if (errors.length === 0) {
    return "no source and no error diagnostic";
  }
  if (protoSnapshot() !== before) return "a prototype gained an own key";
  return undefined;
}

describe("malformed OpenPlan3D input", () => {
  it("fixtures are present and unmutated ones pass the laws", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(10);
    for (const f of FIXTURES) expect(check(f.json), f.name).toBeUndefined();
  });

  it(`1-3 seeded mutations of each fixture (seed ${SEED}, ${NUM_RUNS} runs)`, () => {
    const histogram = new Map<MutationKind, number>();
    let runs = 0;
    let changed = 0;
    fc.assert(
      fc.property(fc.nat(FIXTURES.length - 1), mutationsArb(1, 3), (fi, ms) => {
        const { value, applied, kinds } = applyMutations(FIXTURES[fi]!.json, ms);
        runs++;
        if (!isDeepStrictEqual(value, FIXTURES[fi]!.json)) changed++;
        for (const k of kinds) histogram.set(k, (histogram.get(k) ?? 0) + 1);
        const bad = check(value);
        if (bad) throw new Error(`${FIXTURES[fi]!.name}: ${applied.join("; ")}\n${bad}`);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
    console.info(`openplan3d-malformed mutation histogram: ${JSON.stringify(Object.fromEntries(histogram))}`);
    expect(changed / runs).toBeGreaterThanOrEqual(0.9);
    expect(histogram.size).toBe(MUTATION_KINDS.length);
  });

  it("hostile roots", () => {
    for (const v of [
      undefined,
      null,
      0,
      Number.NaN,
      "x",
      true,
      [],
      {},
      [{}],
      { floors: null },
      { floors: {} },
      { floors: [null] },
    ]) {
      expect(check(v), String(JSON.stringify(v))).toBeUndefined();
    }
  });

  it("nesting 500 deep inside fields the converter walks gives a result", () => {
    const nest = (wrap: (inner: unknown) => unknown): unknown => {
      let v: unknown = {};
      for (let n = 0; n < 500; n++) v = wrap(v);
      return v;
    };
    const objChain = nest((x) => ({ child: x }));
    const arrChain = nest((x) => [x]);
    const base = FIXTURES.find((f) => f.name === "two-room-web-project.json")!.json as any;
    // Where the converter reads: a wall's own fields, a room's `walls` and `details`, a floor's
    // arrays and its unknown fields (all walked by `leftover`/`elements`).
    const sites: Record<string, (d: any) => void> = {
      "wall.start": (d) => (d.floors[0].walls[0].start = objChain),
      "wall.thickness": (d) => (d.floors[0].walls[0].thickness = arrChain),
      "wall unknown field": (d) => (d.floors[0].walls[0].extra = objChain),
      "room.walls": (d) => (d.floors[0].rooms[0].walls = arrChain),
      "room.details": (d) => (d.floors[0].rooms[0].details = { roomType: "indoor", deep: objChain, deep2: arrChain }),
      "floor unknown field": (d) => (d.floors[0].extra = arrChain),
      "floor.walls entry": (d) => d.floors[0].walls.push(arrChain),
      "floors entry": (d) => d.floors.push(objChain),
      "floors itself": (d) => (d.floors = arrChain),
    };
    for (const [site, apply] of Object.entries(sites)) {
      const d = JSON.parse(JSON.stringify(base));
      apply(d);
      expect(check(d), site).toBeUndefined();
      const r = openPlan3dToArch(d);
      expect(r.source !== undefined || r.diagnostics.length > 0, site).toBe(true);
    }
  });

  it("10k empty objects per array end in a result, not a hang", () => {
    const many = Array.from({ length: 10_000 }, () => ({}));
    for (const key of ["walls", "doors", "windows", "rooms", "furniture", "stairs", "columns"]) {
      const doc = { id: "p", name: "p", floors: [{ id: "g", name: "G", level: 0, [key]: many }] };
      expect(check(doc), key).toBeUndefined();
    }
    expect(check({ id: "p", name: "p", floors: many })).toBeUndefined();
  });

  it(`more than ${MAX_IMPORT_LEVELS} storeys stop at the level cap with E_IMPORT_LIMIT`, () => {
    const floors = Array.from({ length: MAX_IMPORT_LEVELS + 5 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, level: i }));
    const r = openPlan3dToArch({ id: "p", name: "p", floors });
    expect(r.source).toBeUndefined();
    expect(r.diagnostics.some((d) => d.code === "E_IMPORT_LIMIT")).toBe(true);
  });
});
