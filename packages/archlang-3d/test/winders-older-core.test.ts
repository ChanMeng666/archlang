/**
 * On a core with no `winderTreads` at all (the export is ADR 0031's amendment of 2026-11-14, in core
 * 1.61.0, the package's peer floor; the read stays feature-detected), a `winders` landing is built
 * level and ledgered `stair-winders-not-read` (card RM1.2g, PR #751 review). The mock stands for
 * that older core: every export is the core's own except `winderTreads`, which is `undefined`, as
 * it reads off an older core's namespace (vitest refuses a read of an export a mock leaves out, so
 * it is set, not dropped). A module mock, so this case lives in its own file.
 */
import { describe, expect, it, vi } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { WORLD } from "./corpus.js";

vi.mock("@chanmeng666/archlang", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chanmeng666/archlang")>()),
  winderTreads: undefined,
}));

const plan = `plan "L" {
  units mm
  height 2750
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
  door at (3000,6000) width 900 wall shell
  stair id=s dir up width 1000 {
    flight at (1500,1100) size 1000x1100
    landing at (1500,100) size 1000x1000 winders 5
    flight at (620,100) size 880x1000
  }
}`;

describe("a winder landing on a core without `winderTreads` (card RM1.2g)", () => {
  it("builds the landing level and ledgers it, the rest of the stair as before", async () => {
    expect((await import("@chanmeng666/archlang")).winderTreads).toBeUndefined();
    const r = adaptPlan(plan, { world: WORLD });
    if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
    const landing = r.scene.levels[0]?.stairs[0]?.landings?.[0];
    expect(landing).toBeDefined();
    expect(landing).not.toHaveProperty("winders");
    const row = {
      kind: "stair",
      id: "s",
      field: "winders(landing 1)",
      value: "level",
      provenance: "default",
      rule: "stair-winders-not-read",
    };
    expect(r.scene.meta.assumptions.filter((a) => a.rule === row.rule)).toEqual([row]);
    const mesh = buildMesh(r.scene);
    expect(mesh.assumptions.filter((a) => a.rule === row.rule)).toEqual([row]);
    const stair = mesh.nodes.find((n) => n.kind === "stair" && n.part === undefined);
    // 4 + 3 treads and two head risers on a level landing: one step, 9 risers.
    expect(stair?.extras.risers).toBe(9);
    expect(stair?.shells).toHaveLength(4 + 1 + 3);
    expect(
      mesh.assumptions.filter((a) => a.rule === "stair-winders-from-drawing" || a.rule === "stair-winders-solid"),
    ).toEqual([]);
  });
});
