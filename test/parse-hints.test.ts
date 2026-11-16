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

  // EV.4: clause words written where a statement starts (live runs) name the form they belong to.
  it("`offset` as a statement names the forms that take it", () => {
    for (const body of [
      "  room id=r at (0,0) size 4000x4000\n  door on r.bottom at center width 900 offset 200",
      "  room id=r at (0,0) size 4000x4000\n  furniture sofa in r anchor top offset 300",
      "  room id=r at (0,0) size 4000x4000\n  offset 400",
    ]) {
      const src = plan(body);
      const errs = parseErrors(src);
      expect(errs, body).toHaveLength(1);
      const [d] = errs;
      expect(d!.message, body).toBe(`Unknown statement "offset"`);
      expect(d!.hints, body).toHaveLength(1);
      expect(d!.hints![0], body).toContain("`furniture … against wall <id> offset <mm>`");
      expect(d!.hints![0], body).toContain("`furniture … against <room>.<edge> offset <mm>`");
      expect(d!.hints![0], body).toContain("`dim … offset <mm>`");
      expect(d!.hints![0], body).toContain("`keep offset <d|id> from <d> <mm>`");
      expect(d!.hints![0], body).toContain("`at <mm> from start|end`");
      expect(d!.hints![0], body).toContain("inset <mm>");
      expect(src.slice(d!.span!.start, d!.span!.end)).toBe("offset");
    }
  });

  it("`hinged` as a statement names the door kind", () => {
    for (const body of [
      "  room id=r at (0,0) size 4000x4000\n  door on r.bottom at center width 900 hinged",
      "  room id=r at (0,0) size 4000x4000\n  hinged door on r.bottom at center width 900",
    ]) {
      const src = plan(body);
      const errs = parseErrors(src);
      expect(errs, body).toHaveLength(1);
      const [d] = errs;
      expect(d!.message, body).toBe(`Unknown statement "hinged"`);
      expect(d!.hints, body).toEqual([
        "`hinged` is a door kind, not a statement: it comes straight after `door` " +
          "(`door hinged on <room>.<edge> at <pos> width <mm>`), and a door with no kind is already hinged; " +
          "the hinge side is the clause `hinge left|right`",
      ]);
      expect(src.slice(d!.span!.start, d!.span!.end)).toBe("hinged");
    }
  });

  it("the real forms the hints name compile with no error", () => {
    const src = plan(
      [
        "  room id=r at (0,0) size 4000x4000",
        "  walls from rooms exterior 200 partition 100",
        "  wall id=w partition thickness 100 { (1000,1000) (3000,1000) }",
        "  door hinged on r.bottom at 900 from start width 900 hinge left",
        "  furniture sofa against r.top offset 1500 size 1800x900",
        "  furniture desk against wall w offset 1000 side right size 1200x600",
        "  furniture bed in r anchor left inset 200",
        "  dim (0,0)->(4000,0) offset 600",
      ].join("\n"),
    );
    expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("valid programs that use the words as names, and a string, get no hint", () => {
    for (const body of [
      "  let offset = 300\n  room id=r at (0,0) size 4000x4000",
      "  let hinged = 1\n  hinged = hinged + 1\n  room id=r at (0,0) size 4000x4000",
      "  for offset in [0, 1] {\n    room at (offset*5000,0) size 4000x4000\n  }",
      "  component offset(hinged) {\n    room at (hinged,0) size 4000x4000\n  }\n  place offset(0) as o at (0,0)",
    ]) {
      const ds = compile(plan(body)).diagnostics;
      expect(
        ds.filter((d) => d.severity === "error"),
        body,
      ).toEqual([]);
      expect(
        ds.some((d) => d.hints?.some((h) => h.includes("is not a statement"))),
        body,
      ).toBe(false);
    }
    const [d] = parseErrors(plan('  room id=r at (0,0) size 4000x4000\n  "offset" 400'));
    expect(d?.hints ?? []).toEqual([]);
  });

  it("fires nowhere else", () => {
    const cases = [
      "  room id=a at (0,0), size 3000x3000", // comma elsewhere
      "  room id=a at (0,0) size 3000x3000 uses living\n  room id=b right-of a, gap 0", // comma after a non-use
      "  room id=a at (0,0) size 3000x3000; room id=b at (5000,0) size 3000x3000", // mid-line semicolon
      "  room id=e at (0,0) size 3000-x3000", // minus not glued to an id
      "  kitchen at (0,0)", // an unknown statement that is no stray clause word
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
