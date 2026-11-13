/**
 * `scene3d.schema.json`, the TypeScript types and the zero-dependency `validateScene3D` say the
 * same thing: every corpus Scene3D passes both judges, and each planted fault fails both (ajv is a
 * dev dependency only; the validator ships).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { adaptPlan, type Scene3D, validateScene3D } from "../src/index.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(HERE, "../src/scene3d/scene3d.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schemaValid = ajv.compile(schema);

const scenes: Array<[string, Scene3D]> = EXAMPLES_LIST.flatMap(([n, s]) => {
  const r = adaptPlan(s, { world: WORLD });
  return r.ok ? [[n, JSON.parse(JSON.stringify(r.scene)) as Scene3D] as [string, Scene3D]] : [];
});

describe("Scene3D v0: the schema and the validator agree", () => {
  it("adapts the whole corpus", () => {
    expect(scenes.length).toBe(EXAMPLES_LIST.length);
  });

  it("every corpus scene passes the JSON Schema and the validator", () => {
    for (const [n, sc] of scenes) {
      expect(schemaValid(sc) ? [] : schemaValid.errors, n).toEqual([]);
      expect(validateScene3D(sc), n).toEqual([]);
    }
  });

  type Plant = [name: string, mutate: (s: any) => void, schemaSees: boolean];
  const set =
    (f: (s: any) => void) =>
    (s: any): void => {
      f(s);
    };
  const PLANTS: Plant[] = [
    ["a non-integer length", set((s) => Object.assign(s.levels[0].walls[0], { height: 2999.5 })), true],
    ["a millimetre float in a ring", set((s) => s.levels[0].walls[0].footprint[0].outer[0].splice(0, 1, 0.25)), true],
    ["an unknown key", set((s) => Object.assign(s.levels[0].walls[0], { colour: "red" })), true],
    ["a two-point ring", set((s) => s.levels[0].openings[0].cut.splice(2)), true],
    [
      "an unknown door kind",
      set((s) =>
        Object.assign(
          s.levels[0].openings.find((o: any) => o.kind === "door"),
          { doorKind: "revolving" },
        ),
      ),
      true,
    ],
    ["a missing required field", set((s) => Reflect.deleteProperty(s.levels[0].walls[0], "height")), true],
    ["a wrong version", set((s) => Object.assign(s, { version: 1 })), true],
    ["an empty id", set((s) => Object.assign(s.levels[0].walls[0], { id: "" })), true],
    // `mirror` is recorded only as `true` (cards V5/V6): never a string, never `false`.
    ["a non-boolean mirror", set((s) => Object.assign(s.levels[0].furniture[0], { mirror: "yes" })), true],
    ["a false mirror", set((s) => Object.assign(s.levels[0].furniture[0], { mirror: false })), true],
    // What a JSON Schema cannot state, the validator still catches.
    [
      "an opening hosted by no wall",
      set((s) => Object.assign(s.levels[0].openings[0], { host: "no-such-wall" })),
      false,
    ],
    ["a duplicate wall id", set((s) => Object.assign(s.levels[0].walls[1], { id: s.levels[0].walls[0].id })), false],
    ["a cut naming no opening", set((s) => s.levels[0].walls[0].cuts.push("ghost")), false],
  ];

  it("accepts a pre-A7 two-point leaf (no open tip), and rejects a one-point or four-point one", () => {
    const base = scenes.find(([n]) => n === "laneway-house.arch")?.[1];
    const leafOf = (s: any) => s.levels[0].openings.find((o: any) => o.leaves).leaves[0];
    expect(leafOf(base)).toHaveLength(3);
    const two = structuredClone(base);
    leafOf(two).splice(2);
    expect(validateScene3D(two)).toEqual([]);
    expect(schemaValid(two) ? [] : schemaValid.errors).toEqual([]);
    for (const n of [1, 4]) {
      const bad = structuredClone(base);
      const leaf = leafOf(bad);
      if (n === 1) leaf.splice(1);
      else leaf.push(leaf[0]);
      expect(validateScene3D(bad).length, `${n} points`).toBeGreaterThan(0);
      expect(schemaValid(bad), `${n} points`).toBe(false);
    }
  });

  // Card RM1.2g: no shipped example has a `winders` landing, so the corpus never shows the field.
  it("accepts a winder landing's tapered treads, and rejects one tread or a millimetre float", () => {
    const r = adaptPlan(
      `plan "L" { units mm height 2750
        wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
        room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
        door at (3000,6000) width 900 wall shell
        stair id=s dir up width 1000 {
          flight at (1500,1100) size 1000x1100
          landing at (1500,100) size 1000x1000 winders 3
          flight at (620,100) size 880x1000
        } }`,
      { world: WORLD },
    );
    if (!r.ok) throw new Error(r.refusal.code);
    const sc = JSON.parse(JSON.stringify(r.scene));
    const winders = (s: any) => s.levels[0].stairs[0].landings[0].winders;
    expect(winders(sc)).toHaveLength(3);
    expect(validateScene3D(sc)).toEqual([]);
    expect(schemaValid(sc) ? [] : schemaValid.errors).toEqual([]);
    const one = structuredClone(sc);
    winders(one).splice(1);
    const float = structuredClone(sc);
    winders(float)[0][0].splice(0, 1, 0.25);
    for (const [name, bad] of [
      ["one tread", one],
      ["a float", float],
    ] as const) {
      expect(validateScene3D(bad).length, name).toBeGreaterThan(0);
      expect(schemaValid(bad), name).toBe(false);
    }
  });

  for (const [name, mutate, schemaSees] of PLANTS) {
    it(`rejects ${name}`, () => {
      const sc = structuredClone(scenes.find(([n]) => n === "laneway-house.arch")?.[1]);
      mutate(sc);
      expect(validateScene3D(sc).length).toBeGreaterThan(0);
      expect(schemaValid(sc)).toBe(!schemaSees);
    });
  }
});
