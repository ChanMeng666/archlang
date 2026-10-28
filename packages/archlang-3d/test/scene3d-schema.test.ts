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

  for (const [name, mutate, schemaSees] of PLANTS) {
    it(`rejects ${name}`, () => {
      const sc = structuredClone(scenes.find(([n]) => n === "laneway-house.arch")?.[1]);
      mutate(sc);
      expect(validateScene3D(sc).length).toBeGreaterThan(0);
      expect(schemaValid(sc)).toBe(!schemaSees);
    });
  }
});
