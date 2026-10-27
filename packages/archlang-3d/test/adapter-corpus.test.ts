import { describe, expect, it } from "vitest";
import { adaptPlan, validateScene3D, wallOwnership } from "../src/index.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

describe("every shipped example adapts to a valid Scene3D, or is refused by name", () => {
  it("reads the whole corpus (34 examples)", () => {
    expect(EXAMPLES_LIST.length).toBe(34);
  });

  for (const [name, source] of EXAMPLES_LIST) {
    it(name, () => {
      const r = adaptPlan(source, { world: WORLD });
      if (!r.ok) {
        // A refusal is legitimate only with a code and a reason; none is expected today.
        expect.fail(`${name} refused: ${r.refusal.code} — ${r.refusal.message}`);
        return;
      }
      expect(validateScene3D(JSON.parse(JSON.stringify(r.scene)))).toEqual([]);
      r.scene.levels.forEach((lv, i) => {
        const ir = r.storeys[i]?.ir;
        expect(ir, `${name}: level ${i} has a storey`).toBeDefined();
        if (!ir) return;
        // Nothing is dropped: each collection is counted against the core's own facts, never
        // against another view of the scene (PR #325 review round 1).
        const n = (k: string): number => ir.elements.filter((e) => e.kind === k).length;
        expect(lv.openings.length, "openings = the joinery's cuts").toBe(wallOwnership(ir.walls).cuts.length);
        expect(lv.walls.length).toBe(ir.walls.length);
        const kinds = ["room", "furniture", "stair", "void", "column", "outdoor", "fence", "roof"];
        const got = [lv.floors, lv.furniture, lv.stairs, lv.voids, lv.columns, lv.outdoor, lv.fences, lv.roofs];
        expect(got.map((c) => c.length)).toEqual(kinds.map(n));
        // Every cut is an opening of the scene, hosted by its wall.
        expect(lv.openings.map((o) => o.id).sort()).toEqual(lv.walls.flatMap((w) => w.cuts).sort());
        expect(lv.walls.every((w) => w.footprint.length > 0)).toBe(true);
      });
    });
  }

  it("is deterministic: the same source gives the same bytes", () => {
    for (const [, source] of EXAMPLES_LIST.slice(0, 6)) {
      const a = adaptPlan(source, { world: WORLD });
      const b = adaptPlan(source, { world: WORLD });
      expect(JSON.stringify(a.ok && a.scene)).toBe(JSON.stringify(b.ok && b.scene));
    }
  });

  it("keeps imported content (imports.arch through the World, not the unlinked tree)", () => {
    const src = EXAMPLES_LIST.find(([n]) => n === "imports.arch")?.[1] ?? "";
    const withWorld = adaptPlan(src, { world: WORLD });
    expect(withWorld.ok && withWorld.scene.levels[0]?.furniture.length).toBe(3);
    // Without the World the imports cannot resolve: a named refusal, never a silent drop.
    const without = adaptPlan(src);
    expect(without.ok ? "adapted" : without.refusal.code).toBe("E3D_PLAN_ERRORS");
  });

  it("refuses a plan with errors, and one with no walls, by name", () => {
    const broken = adaptPlan('plan "x" { units mm wall { (0,0) ');
    expect(broken.ok ? "adapted" : broken.refusal.code).toBe("E3D_PLAN_ERRORS");
    expect(!broken.ok && broken.refusal.diagnostics?.length).toBeGreaterThan(0);
    const roomsOnly = adaptPlan('plan "x" { units mm room id=r at (0,0) size 3000x3000 label "Room" }');
    expect(roomsOnly.ok ? "adapted" : roomsOnly.refusal.code).toBe("E3D_NO_WALLS");
  });

  it("keeps every storey of a multi-storey plan, lowest first, with its elevation", () => {
    const src = EXAMPLES_LIST.find(([n]) => n === "townhouse.arch")?.[1] ?? "";
    const r = adaptPlan(src, { world: WORLD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lv = r.scene.levels;
    expect(lv.map((l) => l.level)).toEqual([1, 2, 3]);
    expect(lv.map((l) => l.elevation)).toEqual([...lv.map((l) => l.elevation)].sort((a, b) => a - b));
    expect(lv[0]?.elevation).toBe(0);
  });
});
