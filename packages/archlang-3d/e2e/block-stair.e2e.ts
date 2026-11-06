/**
 * A stair of flights and landings (issue #362, card S1): a new input to this package, and one its
 * corpus does not hold, so a green corpus run says nothing about it.
 *
 * Since card X3 the package builds stairs: a block stair is one `stair` node on the storey it climbs
 * from, its two flights as stepped solids and its landing as a box, read from the core's pieces
 * (`flights`, `landings`), never from the Scene3D `box`, which is its bounding box and holds floor
 * that is no stair. The `dir down` stop above is the same stair and builds nothing. The upper
 * storey's void stays where the plan puts it. Pinned here: the same S1–S4 checks the corpus takes,
 * glTF-Validator 0/0, and one SHA-256 over two builds.
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

  it("is built once, on the storey it climbs from: two flights and a landing, never its box", async () => {
    const { mesh } = await built();
    const stairs = mesh.nodes.filter((n) => n.kind === "stair");
    expect(stairs.map((n) => [n.key, n.shells.length])).toEqual([["L1/stair:s", 3]]);
    // Its plan extent is the pieces' (the flights are 1000 wide, as wide as the stair), and the
    // notch the box holds at (1100…2500, 2100…3100) is no stair: no vertex stands inside it.
    const xs: number[] = [];
    const zs: number[] = [];
    for (const s of stairs[0]?.shells ?? [])
      for (let i = 0; i < s.positions.length; i += 3) {
        xs.push(s.positions[i] as number);
        zs.push(s.positions[i + 2] as number);
      }
    expect([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]).toEqual([
      1100000, 1100000, 3500000, 3100000,
    ]);
    expect(xs.some((x, i) => x < 2500000 && (zs[i] as number) > 2100000)).toBe(false);
    expect(mesh.assumptions.some((a) => a.rule === "stair-risers-from-treads" && a.id === "s")).toBe(true);
    expect(mesh.assumptions.some((a) => a.rule === "m1-omits-stairs-outdoor-fences")).toBe(false);
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
