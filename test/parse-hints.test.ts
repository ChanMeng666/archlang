/**
 * Parse hints (issue #370): three inputs that gave a bare `E_PARSE` now carry a `= help:` line.
 * Each hint fires only on the exact token it describes; the code, message and byte span are
 * unchanged, and no form is newly accepted.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const plan = (body: string) => `plan "t" {\n${body}\n}\n`;
const parseErrors = (src: string) => compile(src).diagnostics.filter((d) => d.code === "E_PARSE");

describe("parse hints", () => {
  it("hyphen in an id", () => {
    const src = plan("  room id=my-room at (0,0) size 3000x3000");
    const [d] = parseErrors(src);
    expect(d!.message).toBe(`Expected "at" or a relational direction (right-of|left-of|below|above) but found "-"`);
    expect(d!.hints).toEqual(["ids are letters, digits and `_` (not `-`); write `my_room`, not `my-room`"]);
    expect(src.slice(d!.span!.start, d!.span!.end)).toBe("-");
  });

  it("comma between uses", () => {
    const src = plan("  room id=a at (0,0) size 3000x3000 uses living, dining");
    const [d] = parseErrors(src);
    expect(d!.message).toBe(`Expected a statement but found ","`);
    expect(d!.hints).toEqual(["separate uses with spaces: `uses living dining`"]);
    expect(src.slice(d!.span!.start, d!.span!.end)).toBe(",");
  });

  it("semicolon at a line end", () => {
    const src = plan("  units mm;\n  room id=a at (0,0) size 3000x3000");
    const [d] = parseErrors(src);
    expect(d!.message).toBe(`Unexpected character ";"`);
    expect(d!.hints).toEqual(["statements end at the line break; delete the `;`"]);
    expect(src.slice(d!.span!.start, d!.span!.end)).toBe(";");
  });

  it("semicolon before a trailing comment still hints", () => {
    const [d] = parseErrors(plan("  units mm; # note\n  room id=a at (0,0) size 3000x3000"));
    expect(d!.hints).toHaveLength(1);
  });

  it("fires nowhere else", () => {
    const cases = [
      "  room id=a at (0,0), size 3000x3000", // comma elsewhere
      "  room id=a at (0,0) size 3000x3000 uses living\n  room id=b right-of a, gap 0", // comma after a non-use
      "  room id=a at (0,0) size 3000x3000; room id=b at (5000,0) size 3000x3000", // mid-line semicolon
      "  room id=e at (0,0) size 3000-x3000", // minus not glued to an id
    ];
    for (const body of cases) {
      const errs = parseErrors(plan(body));
      expect(errs.length, body).toBeGreaterThan(0);
      for (const d of errs) expect(d.hints, body).toBeUndefined();
    }
  });

  it("accepts none of the forms", () => {
    expect(parseErrors(plan("  room id=my_room at (0,0) size 3000x3000 uses living dining"))).toEqual([]);
    for (const body of [
      "  room id=my-room at (0,0) size 3000x3000",
      "  room id=a at (0,0) size 3000x3000 uses living, dining",
      "  units mm;",
    ]) {
      expect(parseErrors(plan(body)).length, body).toBeGreaterThan(0);
    }
  });
});
