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

  it("hexagon-pavilion's drum: every line touching a face is RADIAL, never a cap", () => {
    // The 1200 mm drum is a closed curve written as the two semicircles it is — the only
    // spelling there is, since no `close`-an-arc form exists. Read `close` as the test for
    // "is this a ring" and the band caps it twice at its seam, each cap a straight tail of
    // length h ALONG THE END TANGENT: a 100 mm step, 1200 mm tall, at 3 o'clock only,
    // because nothing marks the seam at 9 o'clock. `test/band.test.ts` pins the cause; this
    // pins the consequence in the drawing the compiler actually emits.
    //
    // The discriminator is orientation, not position. A jamb where a doorway cuts a curved
    // wall is RADIAL by construction, and so is a spoke's face where it dies into the drum.
    // A square cap on a curved end is TANGENTIAL by construction. So: every straight edge
    // that touches a drum face must run along the radius at the point it touches.
    //
    // **That is a fact about THIS plan, not a law of the layer, and the difference matters
    // if you are tempted to reuse the rule.** It holds here because every wall meeting this
    // drum points at its centre. `examples/aquarium.arch` has a legitimately TANGENTIAL
    // edge on its own drum — the Filtration room's outer face runs along y = 5900, which
    // grazes that drum's outer circle at its topmost point — so the same assertion there
    // would fail on correct geometry. Its drum is checked instead by reach: no vertex is
    // further than r + h from the centre, and a cap would sit √((r+h)² + h²) out.
    const face = compile(files["hexagon-pavilion.arch"]!, { world, noCache: true }).scene!.nodes.filter(
      (n) => n.layer === "wallFace",
    );
    const loops = primToLoops(face[0]!.prim);
    const C = { x: 8500, y: 7000 }; // the drum's centre; faces at r ± h = 2400 and 3600
    const onFace = (p: { x: number; y: number }) => {
      const r = Math.hypot(p.x - C.x, p.y - C.y);
      return Math.abs(r - 3600) < 1 || Math.abs(r - 2400) < 1;
    };
    let touching = 0;
    for (const e of loops.flat()) {
      if (e.t !== "line") continue;
      const p = onFace(e.a) ? e.a : onFace(e.b) ? e.b : null;
      if (!p) continue;
      touching++;
      const rl = Math.hypot(p.x - C.x, p.y - C.y);
      const dl = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
      const cos = Math.abs(((p.x - C.x) * (e.b.x - e.a.x) + (p.y - C.y) * (e.b.y - e.a.y)) / (rl * dl));
      expect(cos, `a line touching the drum face at (${p.x}, ${p.y}) is not radial`).toBeGreaterThan(0.999);
    }
    // Non-vacuity: there ARE such edges — twelve doorway jambs plus eight spoke faces.
    expect(touching).toBe(20);
    // And the twelve jambs really do span the full thickness, r − h to r + h.
    const jambs = loops.flat().filter((e) => e.t === "line" && onFace(e.a) && onFace(e.b)) as Extract<
      (typeof loops)[number][number],
      { t: "line" }
    >[];
    expect(jambs).toHaveLength(12);
    for (const j of jambs) expect(Math.hypot(j.b.x - j.a.x, j.b.y - j.a.y)).toBeCloseTo(1200, 6);
  });

  it("aquarium's drum: nothing reaches past its outer face, so its seam is not capped", () => {
    // The same defect, in the plan where it was INVISIBLE. This drum's seam is at
    // (38000, 14000) — 3 o'clock — and its doorways are at 12 and 6, so the seam was not
    // hidden under one: the two caps were simply 100 mm on an 8 m radius, well under a
    // pixel in any render anyone would look at, and real in the bytes. `aquarium` and
    // `hexagon-pavilion` are the only two shipped examples whose SVG the closure fix moved.
    //
    // The orientation test used for the hexagon would be WRONG here (see above), so the
    // claim is made by reach instead: a cap is a tail of length h along the end tangent,
    // which lands √((r+h)² + h²) from the centre — outside the outer face, where nothing
    // legitimate goes.
    const face = compile(files["aquarium.arch"]!, { world, noCache: true }).scene!.nodes.filter(
      (n) => n.layer === "wallFace",
    );
    const C = { x: 30_000, y: 14_000 }; // the drum's centre; faces at r ± h = 7900 and 8100
    const radii = primToLoops(face[0]!.prim)
      .flat()
      .flatMap((e) => (e.t === "line" ? [e.a, e.b] : [e.arc.a, e.arc.b]))
      .map((p) => Math.hypot(p.x - C.x, p.y - C.y))
      .filter((r) => r < 9000); // the drum's own neighbourhood, not the whole building
    expect(radii.length).toBeGreaterThan(0);
    expect(Math.max(...radii)).toBeCloseTo(8100, 6);
    // Non-vacuity: a cap would have cleared that by ~0.6 mm, which `toBeCloseTo(…, 6)`
    // separates — and it is the only thing in reach that could.
    expect(Math.hypot(8100, 100)).toBeGreaterThan(8100);
  });

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
