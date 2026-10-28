/**
 * `--doors plan` (card A7; plan Q11): each swinging leaf stands at the pose the plan draws instead
 * of closed. On the whole corpus: every vertex of every swung leaf lies inside the quarter-disc the
 * core's `doorLeaves` gives that leaf (a probe on each corpus door), at the door's own heights; every
 * shell stays closed; a kind that sweeps no leaf keeps its closed panel and is ledgered; only door
 * nodes move; the replay's event table (its timing) is the closed build's; and the default build is
 * the closed one, byte for byte (the laneway pins in `mesh.test.ts`, `glb.test.ts` and
 * `replay.test.ts` hold it to the bytes). glTF-Validator on the swung GLBs is in `e2e/glb.e2e.ts`.
 */
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, type Mesh3D, type Pt, type Scene3D, timeline } from "../src/index.js";
import { checkShells } from "../src/node.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";

const plans: Array<readonly [string, string]> = [...EXAMPLES_LIST, ...Object.entries(STRESS_PLANS)];

const corpus = plans.map(([n, s]) => {
  const r = adaptPlan(s, { world: WORLD });
  if (!r.ok) throw new Error(`${n} refused: ${r.refusal.code}`);
  return { n, scene: r.scene, closed: buildMesh(r.scene), plan: buildMesh(r.scene, { doors: "plan" }) };
});

/** One micrometre: what rounding a corner to whole micrometres can move it. */
const SLACK = 1;

/** Is plan point `p` inside the closed quarter-disc swept about `h` from `f` (closed) to `e` (open)? */
function inSector(p: Pt, h: Pt, f: Pt, e: Pt): boolean {
  const v = [p[0] - h[0], p[1] - h[1]] as const;
  const c = [f[0] - h[0], f[1] - h[1]] as const;
  const o = [e[0] - h[0], e[1] - h[1]] as const;
  const r = Math.hypot(o[0], o[1]);
  if (Math.hypot(v[0], v[1]) > r + SLACK) return false;
  const cross = (a: readonly number[], b: readonly number[]): number =>
    (a[0] as number) * (b[1] as number) - (a[1] as number) * (b[0] as number);
  // On the open radius's side of the closed one and on the closed radius's side of the open one,
  // within a micrometre of either bounding radius.
  const sideC = Math.sign(cross(c, o));
  const sideO = Math.sign(cross(o, c));
  const offC = cross(c, v) / Math.hypot(c[0], c[1]);
  const offO = cross(o, v) / r;
  return (
    (Math.sign(offC) === sideC || Math.abs(offC) <= SLACK) && (Math.sign(offO) === sideO || Math.abs(offO) <= SLACK)
  );
}

const doorsOf = (scene: Scene3D) =>
  scene.levels.flatMap((lv) => lv.openings.filter((o) => o.kind === "door").map((o) => ({ lv, o })));
const nodeOf = (mesh: Mesh3D, level: number, id: string) =>
  mesh.nodes.find((x) => x.kind === "door" && x.level === level && x.id === id);

describe("--doors plan on the corpus", () => {
  it("Scene3D carries each leaf's open tip: as long as the leaf, square to it", () => {
    let leaves = 0;
    for (const { n, scene } of corpus) {
      for (const { o } of doorsOf(scene)) {
        for (const leaf of o.leaves ?? []) {
          // The writer always gives the open tip.
          expect(leaf, `${n} ${o.id}`).toHaveLength(3);
          const [h, f, e] = leaf as [Pt, Pt, Pt];
          leaves++;
          const c = [f[0] - h[0], f[1] - h[1]];
          const v = [e[0] - h[0], e[1] - h[1]];
          const lc = Math.hypot(c[0] as number, c[1] as number);
          expect(Math.abs(Math.hypot(v[0] as number, v[1] as number) - lc), `${n} ${o.id}`).toBeLessThanOrEqual(2);
          expect(
            Math.abs((c[0] as number) * (v[0] as number) + (c[1] as number) * (v[1] as number)) / lc,
          ).toBeLessThanOrEqual(2);
        }
      }
    }
    expect(leaves).toBeGreaterThan(100);
  });

  it("every swung leaf lies inside its swing sector, at its door's heights (a probe on each door)", () => {
    const outside: string[] = [];
    let probes = 0;
    for (const { n, scene, plan } of corpus) {
      for (const { lv, o } of doorsOf(scene)) {
        const leaves = o.leaves;
        if (!leaves) continue;
        const node = nodeOf(plan, lv.level, o.id);
        expect(node?.extras.pose, `${n} ${o.id}`).toBe("plan");
        expect(node?.shells.length, `${n} ${o.id}`).toBe(leaves.length);
        const head = Math.min(o.head, lv.walls.find((w) => w.id === o.host)?.height ?? o.head);
        node?.shells.forEach((s, i) => {
          const [h, f, e] = leaves[i] as [Pt, Pt, Pt];
          probes++;
          let reachesTip = false;
          for (let k = 0; k < s.positions.length; k += 3) {
            const p: Pt = [s.positions[k] as number, s.positions[k + 2] as number];
            const y = s.positions[k + 1] as number;
            if (!inSector(p, h, f, e)) outside.push(`${n} ${o.id} leaf ${i} (${p})`);
            if (y < lv.elevation + o.sill || y > lv.elevation + head) outside.push(`${n} ${o.id} leaf ${i} y ${y}`);
            if (p[0] === e[0] && p[1] === e[1]) reachesTip = true;
          }
          // Swung, not closed: the leaf reaches its open tip.
          if (!reachesTip) outside.push(`${n} ${o.id} leaf ${i} never reaches its open tip`);
        });
      }
    }
    expect(outside).toEqual([]);
    expect(probes).toBeGreaterThan(100);
  });

  it("every shell stays closed, with positive volume (V-GEO-02)", () => {
    for (const { n, plan } of corpus) expect(checkShells(plan).failures, n).toEqual([]);
  });

  it("a kind that sweeps no leaf keeps its closed panel, ledgered; the pose is a user parameter", () => {
    const kinds = new Map<string, number>();
    for (const { n, scene, closed, plan } of corpus) {
      for (const { lv, o } of doorsOf(scene)) {
        const kind = o.doorKind ?? "hinged";
        kinds.set(
          `${kind}:${o.leaves ? "swung" : "closed"}`,
          (kinds.get(`${kind}:${o.leaves ? "swung" : "closed"}`) ?? 0) + 1,
        );
        if (o.leaves) continue;
        expect(nodeOf(plan, lv.level, o.id), `${n} ${o.id}`).toEqual(nodeOf(closed, lv.level, o.id));
        expect(
          plan.assumptions.some((a) => a.rule === "door-pose-plan-no-swing" && a.id === o.id),
          `${n} ${o.id}`,
        ).toBe(true);
      }
      expect(plan.assumptions.find((a) => a.kind === "door" && a.field === "pose" && a.id === undefined)).toEqual({
        kind: "door",
        field: "pose",
        value: "plan",
        provenance: "user-param",
        rule: "door-pose-plan",
      });
    }
    // Only hinged and double doors swing; sliding, barn, bifold, pocket and garage stay closed.
    for (const k of kinds.keys()) {
      const [kind, pose] = k.split(":");
      expect(pose, k).toBe(kind === "hinged" || kind === "double" ? "swung" : "closed");
    }
    expect([...kinds.keys()].filter((k) => k.endsWith(":closed")).length).toBeGreaterThan(0);
    expect(kinds.get("double:swung") ?? 0).toBeGreaterThan(0);
  });

  it("moves door nodes only, and leaves the replay's timing as it is", () => {
    for (const { n, closed, plan } of corpus) {
      expect(
        plan.nodes.map((x) => x.key),
        n,
      ).toEqual(closed.nodes.map((x) => x.key));
      plan.nodes.forEach((x, i) => {
        if (x.kind !== "door") expect(x, `${n} ${x.key}`).toEqual(closed.nodes[i]);
      });
      expect(timeline(plan), n).toEqual(timeline(closed));
    }
  });

  it("a pre-A7 Scene3D (leaves without their open tip) builds its doors closed under plan, ledgered", () => {
    const lane = corpus.find((c) => c.n === "laneway-house.arch");
    const old = structuredClone(lane?.scene) as Scene3D;
    for (const lv of old.levels)
      for (const o of lv.openings) if (o.leaves) o.leaves = o.leaves.map((l) => [l[0], l[1]]);
    const m = buildMesh(old, { doors: "plan" });
    expect(m.nodes.filter((x) => x.kind === "door")).toEqual(lane?.closed.nodes.filter((x) => x.kind === "door"));
    const ledgered = m.assumptions.filter((a) => a.rule === "door-pose-plan-no-swing").map((a) => a.id);
    expect(ledgered.sort()).toEqual(["d_bath", "d_bed", "d_front", "d_garden"]);
  });

  it("the default is the closed build, byte for byte", () => {
    for (const { n, scene, closed } of corpus) {
      expect(JSON.stringify(buildMesh(scene, { doors: "closed" })), n).toBe(JSON.stringify(closed));
      expect(closed.assumptions.some((a) => a.rule === "door-pose-closed")).toBe(true);
      expect(
        closed.nodes.filter((x) => x.kind === "door").every((x) => x.extras.pose === "closed"),
        n,
      ).toBe(true);
    }
  });
});
