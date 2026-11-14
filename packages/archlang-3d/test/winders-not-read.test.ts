/**
 * A `winders` landing whose tread lines cannot be read (card RM1.2g, PR #751 review m1) is built
 * level and says so in the ledger (`stair-winders-not-read`), never quietly. The core's own
 * `winderTreads` never fails on a plan it resolved, so the failure is forced here by standing in for
 * that one export: `short` gives one line fewer than `n - 1`, `none` gives none (as a core whose
 * function cannot place the landing would). `real` passes the core's lines through unchanged. Every
 * other export is the core's own. A module mock, so these cases live in their own file.
 */
import { describe, expect, it, vi } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { WORLD } from "./corpus.js";

// Hoisted above the imports by vitest, as `vi.mock` is.
const stub = vi.hoisted(() => ({ mode: "real" as "real" | "short" | "none" }));

vi.mock("@chanmeng666/archlang", async (importOriginal) => {
  const real = await importOriginal<typeof import("@chanmeng666/archlang")>();
  return {
    ...real,
    winderTreads: (...args: Parameters<typeof real.winderTreads>) => {
      const lines = real.winderTreads(...args);
      return stub.mode === "real" ? lines : stub.mode === "short" ? lines.slice(1) : [];
    },
  };
});

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

function build(mode: typeof stub.mode) {
  stub.mode = mode;
  const r = adaptPlan(plan, { world: WORLD });
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  const mesh = buildMesh(r.scene);
  const stair = mesh.nodes.find((n) => n.kind === "stair" && n.part === undefined);
  return { scene: r.scene, mesh, stair };
}

describe("a winder landing whose lines are not read (card RM1.2g)", () => {
  it("reads the core's lines when they are n - 1 from one corner: 5 treads, no fallback row", () => {
    const { scene, mesh, stair } = build("real");
    expect(scene.levels[0]?.stairs[0]?.landings?.[0]?.winders).toHaveLength(5);
    expect(stair?.extras.risers).toBe(4 + 1 + 3 + 1 + 4);
    expect(mesh.assumptions.filter((a) => a.rule === "stair-winders-not-read")).toEqual([]);
  });

  it.each(["short", "none"] as const)("builds the landing level and ledgers it (`%s`)", (mode) => {
    const { scene, mesh, stair } = build(mode);
    const landing = scene.levels[0]?.stairs[0]?.landings?.[0];
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
    // In the Scene3D's ledger, and carried into the mesh's.
    expect(scene.meta.assumptions.filter((a) => a.rule === row.rule)).toEqual([row]);
    expect(mesh.assumptions.filter((a) => a.rule === row.rule)).toEqual([row]);
    // A level landing: one step, the 9 risers of 4 + 3 treads and two head risers, and no winder rows.
    expect(stair?.extras.risers).toBe(9);
    expect(stair?.shells).toHaveLength(4 + 1 + 3);
    expect(mesh.assumptions.filter((a) => a.rule === "stair-winders-from-drawing")).toEqual([]);
  });
});
