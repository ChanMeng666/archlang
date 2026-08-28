/**
 * The joinery, as it reaches a drawing — over every shipped example.
 *
 * `test/joinery-oracle.test.ts` proves the algorithm's laws over GENERATED wall sets, fed
 * straight into `joinWalls`. This suite asks a different question, and one that suite
 * structurally cannot: does the COMPILER put those loops on the page? Between `joinWalls`
 * and a `.svg` sit `wall-lowering.ts`'s band/cut construction, the hatch grouping, the
 * `emitLoops` narrowing to `region`-or-`path`, and every element that also draws on the
 * `wallFace` pass. A regression in any of them is invisible to a property over the
 * geometry module.
 *
 * Three laws, over all twenty-nine examples and every storey of the multi-level ones:
 *
 * 1. **One node.** The `wallFace` pass carries exactly one primitive — the joined
 *    boundary. Three lowering paths used to share that pass, so a plan mixing a curved
 *    facade with straight wings put a `region`, a scatter of `arc`s and a scatter of
 *    `line`s on it at once, and where they met they drew through each other.
 * 2. **The right primitive.** `region` while every edge is straight, `path` as soon as
 *    one curves — never a `polygon`, `line` or `arc` on that pass.
 * 3. **No interior crossing.** No two edges of the emitted boundary meet anywhere but at
 *    a vertex they share. This is the defect the whole layer exists to remove, stated
 *    over the drawings that ship rather than over generated input.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, makeVirtualWorld } from "../src/index.js";
import type { SceneNode } from "../src/scene.js";
import { crossesInterior, primToLoops } from "./joinery-laws.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(__dirname, "..", "examples");

/** A World over the whole examples/ tree, so the two importing plans resolve. */
const files: Record<string, string> = {};
const walk = (dir: string, prefix: string): void => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`);
    else if (e.name.endsWith(".arch")) files[`${prefix}${e.name}`] = readFileSync(join(dir, e.name), "utf8");
  }
};
walk(EXAMPLES, "");
const world = makeVirtualWorld(files);

const NAMES = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith(".arch"))
  .sort();

/** Every level's Scene: `pages[]` on a multi-storey plan, else the one Scene. */
function scenesOf(name: string): { level: string; nodes: SceneNode[] }[] {
  const src = files[name]!;
  const res = compile(src, { world, noCache: true });
  expect(res.errors, `${name} must compile clean`).toEqual([]);
  if (res.pages && res.pages.length > 1) {
    return res.pages.map((p) => ({ level: `L${p.level}`, nodes: p.scene!.nodes }));
  }
  return [{ level: "-", nodes: res.scene!.nodes }];
}

const wallFace = (nodes: SceneNode[]) => nodes.filter((n) => n.layer === "wallFace");

describe("the joinery on the compile path — every shipped example", () => {
  // Non-vacuity for the whole file: the corpus is not empty and does contain curves.
  it("reads a corpus that actually exercises both primitives", () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(29);
    const kinds = new Set(NAMES.flatMap((n) => scenesOf(n).flatMap((s) => wallFace(s.nodes).map((x) => x.prim.t))));
    expect(kinds, "no example emits a straight-edged region — the corpus stopped covering it").toContain("region");
    expect(kinds, "no example emits a curved path — the corpus stopped covering it").toContain("path");
    expect([...kinds].sort()).toEqual(["path", "region"]);
  });

  for (const name of NAMES) {
    it(`${name}: one outline node, of the right kind, with no interior crossing`, () => {
      for (const { level, nodes } of scenesOf(name)) {
        const where = level === "-" ? name : `${name} ${level}`;
        const face = wallFace(nodes);
        // A level may legitimately have no walls at all; anything else is exactly one.
        const walls = nodes.some((n) => n.layer === "wallFill");
        if (!walls && face.length === 0) continue;
        expect(face, `${where}: the wallFace pass must carry exactly one node`).toHaveLength(1);

        const prim = face[0]!.prim;
        expect(["region", "path"], `${where}: unexpected outline primitive \`${prim.t}\``).toContain(prim.t);

        const loops = primToLoops(prim);
        const anyArc = loops.some((l) => l.some((e) => e.t === "arc"));
        // `region` cannot carry a curve, and a straight-only set must not pay for a
        // `path` — that is what keeps every rectilinear plan on the bytes it had.
        expect(prim.t, `${where}: a curved boundary must be a path`).toBe(anyArc ? "path" : "region");

        const edges = loops.flat();
        expect(edges.length, `${where}: an empty boundary`).toBeGreaterThan(0);
        for (let i = 0; i < edges.length; i++) {
          for (let j = i + 1; j < edges.length; j++) {
            const hit = crossesInterior(edges[i]!, edges[j]!);
            expect(hit, `${where}: outline edges ${i} and ${j} cross at ${JSON.stringify(hit)}`).toBeNull();
          }
        }
      }
    });
  }

  it("emits SVG arc commands for every example whose walls carry a curve", () => {
    // The `path` primitive is only worth having if it reaches the file as a real `A`
    // command rather than a polyline. These are the shipped plans with an `arc` edge.
    const curved = NAMES.filter((n) => /(^|\n)\s*arc /.test(files[n]!) || / arc \(/.test(files[n]!));
    expect(curved.length, "no shipped example uses `arc` any more").toBeGreaterThan(0);
    for (const name of curved) {
      const res = compile(files[name]!, { world, noCache: true });
      const svgs = res.pages && res.pages.length > 1 ? res.pages.map((p) => p.svg) : [res.svg];
      expect(
        svgs.some((s) => s.includes("A ")),
        `${name}: no SVG arc command in the output`,
      ).toBe(true);
    }
  });
});
