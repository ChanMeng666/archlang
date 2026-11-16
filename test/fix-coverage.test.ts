/**
 * How many catalogued codes can carry a machine fix (a span edit, `Diagnostic.fixes`), read from
 * the source by `scripts/fix-coverage.ts` (card U.17). The floor below is the count the script
 * printed when the card landed; a fix producer that is removed, or a raise site that stops
 * attaching its fix, turns this red. A new one raises the count: add its code here.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixCoverage, renderFixCoverage } from "../scripts/fix-coverage.js";

/** The codes with a span edit when U.17 measured them (26 of 270). */
const WITH_EDIT_FLOOR = [
  "E_ARC_RADIUS",
  "E_ATTACH_POS_RANGE",
  "E_DOOR_KIND_CLAUSE",
  "E_DOOR_OPEN_RANGE",
  "E_DOOR_WIDTH",
  "E_HEIGHT_RANGE",
  "E_OPENING_ABOVE_WALL",
  "E_OPENING_WIDTH",
  "E_ROOM_ALIGN",
  "E_ROOM_ALIGN_AXIS",
  "E_SILL_ABOVE_HEAD",
  "E_WINDOW_KIND_CLAUSE",
  "E_WINDOW_WIDTH",
  "W_ALIAS_MATCH",
  "W_DIM_INSIDE",
  "W_DIM_OVERLAP",
  "W_DIM_TEXT_MISMATCH",
  "W_DOOR_OFF_WALL",
  "W_FIXTURE_BACK_TO_ROOM",
  "W_FOOTPRINT_TRANSPOSED",
  "W_OPENING_OFF_WALL",
  "W_POCKET_RUN",
  "W_SWING_OBSTRUCTED",
  "W_UNKNOWN_FURNITURE",
  "W_WHILE_DEPRECATED",
  "W_WINDOW_OFF_WALL",
];

describe("fix coverage (U.17)", () => {
  const c = fixCoverage();

  it('prints "N of M codes have a span edit"', () => {
    expect(renderFixCoverage(c).split("\n")[0]).toBe(
      `${c.withEdit.length} of ${c.catalogued.length} codes have a span edit`,
    );
  });

  it("does not drop below the measured floor", () => {
    expect(c.withEdit.length).toBeGreaterThanOrEqual(WITH_EDIT_FLOOR.length);
    expect(WITH_EDIT_FLOOR.filter((code) => !c.withEdit.includes(code))).toEqual([]);
  });

  it("reads a code for every fix site, and only catalogued codes", () => {
    expect(c.unattributed).toEqual([]);
    expect(c.uncatalogued).toEqual([]);
  });

  it("sees each attach shape it documents, and misses a code with no fix", () => {
    const root = mkdtempSync(join(tmpdir(), "fix-coverage-"));
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(
        join(root, "src", "a.ts"),
        [
          'const a = { code: "E_ARC_RADIUS", ...fixesFrom(x) };',
          'const b = { code: ok ? "E_DOOR_WIDTH" : "E_WINDOW_WIDTH", fixes: [f] };',
          'const c = { code: "E_HEIGHT_RANGE", ...(ok ? { fixes: [f] } : {}) };',
          'const d = ds.map((d) => (d.code !== "W_POCKET_RUN" ? d : { ...d, fixes: [f] }));',
          "const e = { ...d, fixes: d.fixes.map((f) => f) };",
          'const g = { code: "W_DOOR_CLEARANCE", message: "no fix" };',
          "const h = { fixes: [f] };",
        ].join("\n"),
      );
      const t = fixCoverage(root);
      expect(t.withEdit).toEqual(["E_ARC_RADIUS", "E_DOOR_WIDTH", "E_HEIGHT_RANGE", "E_WINDOW_WIDTH", "W_POCKET_RUN"]);
      expect(t.unattributed.map((s) => s.text)).toEqual(["{ fixes: [f] }"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
