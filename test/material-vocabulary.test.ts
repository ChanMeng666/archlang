/**
 * The material vocabulary is written twice — the core's `FIXTURE_MATERIALS` (what the `rendered`
 * theme tints by, `src/elements/fixtures-glyphs.ts`) and archlang-3d's `MATERIAL_SLOTS` (what the
 * GLB writer and the viewer shade by, `packages/archlang-3d/src/materials.ts`) — because the 3D
 * package's slot list also carries `body`, its untagged default, and the core cannot depend on the
 * 3D package. So this test holds them equal, in order: a material added on one side and not the
 * other would let a family's 2D tint and 3D material name different things (visual-assets V-D2).
 */

import { describe, expect, it } from "vitest";
import { FIXTURE_FAMILY_MATERIALS, FIXTURE_MATERIALS } from "../src/elements/fixtures-glyphs.js";
import { MATERIAL_SLOTS, PALETTE } from "../packages/archlang-3d/src/materials.js";

describe("material vocabulary — core and archlang-3d agree", () => {
  it("MATERIAL_SLOTS is `body` followed by FIXTURE_MATERIALS, in order", () => {
    expect([...MATERIAL_SLOTS]).toEqual(["body", ...FIXTURE_MATERIALS]);
  });

  it("every material a family names has a 3D palette entry", () => {
    for (const [family, m] of Object.entries(FIXTURE_FAMILY_MATERIALS)) {
      expect(Object.hasOwn(PALETTE, m.primary), `${family}.primary ${m.primary}`).toBe(true);
      if (m.secondary !== undefined) {
        expect(Object.hasOwn(PALETTE, m.secondary), `${family}.secondary ${m.secondary}`).toBe(true);
      }
    }
  });
});
