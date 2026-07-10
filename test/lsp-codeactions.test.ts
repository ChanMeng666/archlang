import { describe, expect, it } from "vitest";
import { codeActions } from "../src/lsp.js";

/**
 * LSP quickfix core (T2e). `codeActions(source, range)` surfaces the diagnostic
 * fix producers as editor code actions: one per suggestion on a diagnostic that
 * overlaps the range, with `isPreferred` set only for a lone machine-applicable
 * fix. Pure — no editor types.
 */

const shell = (opening: string): string => `plan "P" {
  units mm
  grid 50
  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Room"
  ${opening}
}`;

describe("codeActions", () => {
  it("offers the off-wall attachment fix as a preferred quickfix at the diagnostic", () => {
    const src = shell("door id=d at (2500,9000) width 900");
    const at = src.indexOf("door id=d");
    const actions = codeActions(src, { start: at, end: at });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe("quickfix");
    expect(actions[0]!.isPreferred).toBe(true); // sole machine-applicable fix
    expect(actions[0]!.edits[0]!.newText).toContain("on w1 at");
    expect(actions[0]!.diagnostic.code).toBe("W_DOOR_OFF_WALL");
  });

  it("returns nothing when the range does not overlap a diagnostic", () => {
    const src = shell("door id=d at (2500,9000) width 900");
    // Offset 0 is the `plan` keyword — far from the door's span.
    expect(codeActions(src, { start: 0, end: 1 })).toHaveLength(0);
  });

  it("surfaces a has-placeholders fix but does not mark it preferred", () => {
    const src = shell("door id=d at (2500,0) width 0 wall exterior");
    const at = src.indexOf("door id=d");
    const actions = codeActions(src, { start: at, end: at });
    const widthFix = actions.find((a) => a.diagnostic.code === "E_DOOR_WIDTH")!;
    expect(widthFix).toBeDefined();
    expect(widthFix.isPreferred).toBe(false);
  });
});
