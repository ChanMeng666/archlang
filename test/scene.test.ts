import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { renderSvg } from "../src/backends/svg.js";
import { compile } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

function sceneOf(src: string) {
  const { plan } = parse(src);
  return toScene(resolve(plan!).ir);
}

describe("Scene IR", () => {
  it("lowers studio.arch to a golden set of positioned primitives", () => {
    const scene = sceneOf(example("studio.arch"));
    // Snapshot the geometry (theme/sizes are derived + verbose, omitted).
    expect({
      width: scene.width,
      height: scene.height,
      bounds: scene.bounds,
      hatches: scene.hatches,
      nodes: scene.nodes,
    }).toMatchSnapshot();
  });

  it("is deterministic (toScene is byte-stable across calls)", () => {
    const a = JSON.stringify(sceneOf(example("studio.arch")).nodes);
    const b = JSON.stringify(sceneOf(example("studio.arch")).nodes);
    expect(a).toBe(b);
  });

  it("renderSvg(toScene(ir)) equals compile().svg for every shipped example", () => {
    for (const name of ["studio.arch", "two-bed.arch", "parametric.arch", "themed.arch"]) {
      const src = example(name);
      const { plan } = parse(src);
      const ir = resolve(plan!).ir;
      const viaScene = renderSvg(toScene(ir), {});
      expect(viaScene).toBe(compile(src, { noCache: true }).svg);
    }
  });

  it("emits every primitive kind across the example corpus", () => {
    const kinds = new Set<string>();
    for (const name of ["studio.arch", "two-bed.arch", "parametric.arch", "themed.arch"]) {
      for (const n of sceneOf(example(name)).nodes) kinds.add(n.prim.t);
    }
    // walls union → hatch fill + region face, openings → polygon/line, doors → arc, labels → text.
    expect(kinds).toContain("polygon");
    expect(kinds).toContain("line");
    expect(kinds).toContain("region");
    expect(kinds).toContain("hatch");
    expect(kinds).toContain("arc");
    expect(kinds).toContain("text");
  });
});
