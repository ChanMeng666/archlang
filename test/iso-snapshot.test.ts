/**
 * **Snapshots of the axonometric**, in both presets, over four plans chosen for what each
 * one reaches:
 *
 *  - `studio` — the lint-clean, import-free flagship: one storey, straight walls, doors
 *    and windows. The base case, and the one a reader can check against the picture.
 *  - `two-storey` — two `level` blocks and a `void`. It is the only case that proves the
 *    storeys STACK: they land in one Scene at their own elevations, and `pages` is absent.
 *  - `aquarium` — the curved-geometry flagship. Every arc is flattened through the
 *    compiler's ONE tessellator before it is projected, so a moved snapshot here means the
 *    arc rule moved and not the camera.
 *  - `hillside-villa` — the showpiece: two storeys, a garage, a polygon nook, an `arc`
 *    bay, all five door kinds, a `roof overhang` and ground. Most of what the view
 *    deliberately does NOT draw is in this plan, so its snapshot is also a record of the
 *    omissions.
 *
 * **A moved snapshot is a finding before it is a diff to bless.** `vitest -u` is the last
 * step, never the first: the byte-identity law next door covers the plan drawings, so
 * nothing here can move for an unrelated reason. If one of these changes, the camera, the
 * extrusion or the painter's order changed, and the commit should say which.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { World } from "../src/world.js";

const EXAMPLES = resolvePath("examples");
const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};

const PLANS = ["studio", "two-storey", "aquarium", "hillside-villa"] as const;

suite("iso snapshots", () => {
  for (const name of PLANS) {
    for (const view of ["iso", "axon"] as const) {
      it(`${name} — ${view}`, () => {
        const src = readFileSync(resolvePath(EXAMPLES, `${name}.arch`), "utf8");
        const out = compile(src, { view, world, noCache: true });
        expect(out.errors).toEqual([]);
        expect(out.svg).toMatchSnapshot();
      });
    }
  }

  it("every one of them actually drew something — a snapshot of nothing is a snapshot", () => {
    for (const name of PLANS) {
      const src = readFileSync(resolvePath(EXAMPLES, `${name}.arch`), "utf8");
      const out = compile(src, { view: "iso", world, noCache: true });
      expect(out.scene?.nodes.length ?? 0, name).toBeGreaterThan(20);
    }
  });

  it("two-storey stacks: the upper storey's geometry sits ABOVE the ground floor's", () => {
    const src = readFileSync(resolvePath(EXAMPLES, "two-storey.arch"), "utf8");
    const flat = compile(src, { world, noCache: true });
    const iso = compile(src, { view: "iso", world, noCache: true });
    // The plan view issues a sheet per storey; the view issues one drawing of the whole
    // building. Its projected extent must therefore be TALLER than a single storey's,
    // which is the cheapest observable consequence of the stacking.
    expect(flat.pages?.length).toBe(2);
    expect(iso.pages).toBeUndefined();
    const b = iso.scene!.bounds;
    expect(b.maxY - b.minY).toBeGreaterThan(0);
    expect(iso.scene!.nodes.length).toBeGreaterThan(flat.pages![0]!.scene.nodes.length / 4);
  });

  it("draws no text at all — a projection carries no label, dimension or schedule row", () => {
    for (const name of PLANS) {
      const src = readFileSync(resolvePath(EXAMPLES, `${name}.arch`), "utf8");
      const out = compile(src, { view: "iso", world, noCache: true });
      expect(
        out.scene!.nodes.filter((n) => n.prim.t === "text"),
        name,
      ).toEqual([]);
      expect(out.svg, name).not.toContain("<text");
    }
  });

  it("draws no hatch — poché is a cut-plane convention and there is no cut plane here", () => {
    for (const name of PLANS) {
      const src = readFileSync(resolvePath(EXAMPLES, `${name}.arch`), "utf8");
      const out = compile(src, { view: "iso", world, noCache: true });
      expect(out.scene!.hatches, name).toEqual([]);
      expect(
        out.scene!.nodes.filter((n) => n.prim.t === "hatch"),
        name,
      ).toEqual([]);
    }
  });
});
