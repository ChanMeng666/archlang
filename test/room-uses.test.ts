import { describe, expect, it } from "vitest";
import { describe as describePlan, lint, compile } from "../src/index.js";
import { format } from "../src/format.js";

/**
 * Room `uses` tags — the keystone that makes room classification *authored intent*
 * instead of a label-regex guess. Explicit `uses` win; untagged rooms keep the old
 * regex behaviour (so existing plans are byte-identical and lint is unchanged).
 */

const wrap = (room: string) =>
  `plan "P" {\n  units mm\n  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n  ${room}\n}`;

describe("room uses", () => {
  it("surfaces explicit uses (a multi-use studio room) in describe()", () => {
    const s = describePlan(wrap(`room id=r at (0,0) size 4000x3000 label "Open Plan" uses living kitchen`));
    expect(s.ok).toBe(true);
    expect(s.rooms[0].uses).toEqual(["living", "kitchen"]);
  });

  it("infers uses from the label when untagged (unchanged behaviour)", () => {
    const s = describePlan(wrap(`room id=r at (0,0) size 4000x3000 label "Bedroom 1"`));
    expect(s.rooms[0].uses).toEqual(["bedroom"]);
  });

  it("lets an explicit use OVERRIDE the label-regex guess", () => {
    // Labelled "Den" (no regex hit) but declared a bedroom → must get the bedroom
    // rule (W_BEDROOM_NO_WINDOW), which a label-only classifier would miss.
    const warnings = lint(wrap(`room id=r at (0,0) size 4000x3000 label "Den" uses bedroom`));
    expect(warnings.some((w) => w.code === "W_BEDROOM_NO_WINDOW")).toBe(true);
    // Without the tag, "Den" is not a bedroom → no such warning.
    const untagged = lint(wrap(`room id=r at (0,0) size 4000x3000 label "Den"`));
    expect(untagged.some((w) => w.code === "W_BEDROOM_NO_WINDOW")).toBe(false);
  });

  it("round-trips `uses` through the formatter", () => {
    const src = wrap(`room id=r at (0,0) size 4000x3000 label "Open" uses living kitchen`);
    expect(format(src)).toContain("uses living kitchen");
    // Formatting is idempotent.
    expect(format(format(src))).toBe(format(src));
  });

  it("reports a clear error for an unknown use value (no crash)", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses lounge`), { noCache: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/room uses/i);
  });
});
