/**
 * A stair of flights and landings (issue #362, card S1): a new input to this package, and one its
 * corpus does not hold, so a green corpus run says nothing about it.
 *
 * The package draws no stair (`m1-omits-stairs-outdoor-fences`), so a block stair is omitted as a
 * straight one is, and said to be in the same ledger row; the Scene3D `box` is its bounding box,
 * valid for the same reason a straight stair's is, and read by nothing that draws. The upper
 * storey's void is what a model shows of a stairwell, and it stands where the plan puts it. Pinned
 * here: the same S1–S4 checks the corpus takes, glTF-Validator 0/0, and one SHA-256 over two builds.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { checkGlb, checkScene, checkShells, writeGlb } from "../src/node.js";

const SHELL = `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }`;
const stair = (dir: string): string => `stair id=s dir ${dir} width 1000 {
      flight at (2500,2100) size 1000x1000
      landing at (2500,1100) size 1000x1000
      flight at (1100,1100) size 1400x1000
    }`;
const PLAN = `plan "Block stair" {
  units mm
  level 1 "Ground" {
    ${SHELL}
    room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
    door id=d at (3000,6000) width 900 wall shell swing in
    ${stair("up")}
  }
  level 2 "Upper" {
    ${SHELL}
    room id=up at (0,0) size 6000x6000 label "Landing" uses hall circulation
    void id=well at (1100,1100) size 2400x2000
    ${stair("down")}
  }
}
`;

async function built(doors: "closed" | "plan" = "closed") {
  const r = adaptPlan(PLAN);
  if (!r.ok) throw new Error(`refused: ${r.refusal.code}`);
  const mesh = buildMesh(r.scene, { doors });
  return { scene: r.scene, mesh, glb: await writeGlb(mesh) };
}

describe("a block stair through the package", () => {
  it("adapts as one stair on each storey, its box the union of its pieces", async () => {
    const { scene } = await built();
    for (const [i, dir] of ["up", "down"].entries()) {
      const stairs = scene.levels[i]!.stairs;
      expect(stairs.map((s) => [s.id, s.dir])).toEqual([["s", dir]]);
      expect(stairs[0]!.box.at).toEqual([1100000, 1100000]);
      expect(stairs[0]!.box.size).toEqual({ w: 2400000, h: 2000000 });
    }
  });

  it("is omitted as a straight stair is, and the ledger says so", async () => {
    const { mesh } = await built();
    expect(mesh.nodes.some((n) => (n.kind as string) === "stair")).toBe(false);
    expect(mesh.assumptions.some((a) => a.rule === "m1-omits-stairs-outdoor-fences")).toBe(true);
  });

  it.each(["closed", "plan"] as const)("doors %s: S1–S4 pass, glTF-Validator 0/0", async (doors) => {
    const a = await built(doors);
    const checks = [checkScene(a.scene), checkShells(a.mesh), ...(await checkGlb(a.glb, a.mesh))];
    expect(checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.failures.join("; ")}`)).toEqual([]);
    const v = checks.find((c) => c.id === "V-GLTF-01");
    expect([v?.facts?.errors, v?.facts?.warnings]).toEqual([0, 0]);
  });

  it("V-DET-01: two builds, one SHA-256", async () => {
    const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
    expect(sha((await built()).glb)).toBe(sha((await built()).glb));
  });
});
