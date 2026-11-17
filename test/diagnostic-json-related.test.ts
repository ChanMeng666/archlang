/**
 * Card AF1: a diagnostic's related spans, `instance` and `component` reach the JSON projection
 * (`diagnosticToJson`, which the CLI's `--json`, both MCP hosts and the playground share).
 *
 * The projection is append-only: the new keys appear only on a diagnostic that carries them,
 * after every existing key but `rule` (which stays last), so removing them gives back exactly the
 * bytes the projection printed before. Each related span follows the diagnostic's own rule: 1-based
 * `line`/`col` when it is measured in the source being projected, `file` (and no `line`/`col`)
 * when it lies in an imported module.
 */
import { describe, expect, it } from "vitest";
import { compile, diagnosticToJson, formatDiagnostic, lint, makeVirtualWorld } from "../src/index.js";
import type { Diagnostic } from "../src/diagnostics.js";
import { runArch } from "./helpers/cli.js";

const DUP = `plan "D" {
  room id=a at (0,0) size 3000x3000 label "A"
  room id=a at (3000,0) size 3000x3000 label "B"
}
`;

/** The projection as it was before AF1: the diagnostic with none of the three fields. */
function withoutAf1Fields(d: Diagnostic): Diagnostic {
  const { relatedSpans: _r, instance: _i, component: _c, ...rest } = d;
  return rest;
}

/** The projection's JSON text with AF1's keys removed. */
function stripAf1Keys(j: object): string {
  const { related: _r, instance: _i, component: _c, ...rest } = j as Record<string, unknown>;
  return JSON.stringify(rest);
}

function byCode(ds: Diagnostic[], code: string): Diagnostic {
  const d = ds.find((x) => x.code === code);
  expect(d, `expected ${code}, got ${ds.map((x) => x.code).join(", ")}`).toBeDefined();
  return d!;
}

describe("a duplicate id points at its first declaration", () => {
  it("E_DUP_ID carries a 'first declared here' related span on the first statement", () => {
    const d = byCode(compile(DUP, { noCache: true }).diagnostics, "E_DUP_ID");
    expect(d.relatedSpans).toHaveLength(1);
    const rel = d.relatedSpans![0]!;
    expect(rel.message).toBe("first declared here");
    expect(DUP.slice(rel.span.start, rel.span.end)).toBe('room id=a at (0,0) size 3000x3000 label "A"');
    expect(DUP.slice(d.span!.start, d.span!.end)).toBe('room id=a at (3000,0) size 3000x3000 label "B"');
    expect("file" in rel).toBe(false);
  });

  it("diagnosticToJson projects it as `related`, keyed as a diagnostic is, after the existing keys", () => {
    const d = byCode(compile(DUP, { noCache: true }).diagnostics, "E_DUP_ID");
    const j = diagnosticToJson(DUP, d);
    expect(j.related).toEqual([{ message: "first declared here", line: 2, col: 3, span: [13, 56] }]);
    expect(Object.keys(j.related![0]!)).toEqual(["message", "line", "col", "span"]);
    expect(Object.keys(j)).toEqual(["code", "severity", "message", "line", "col", "span", "fix", "related"]);
    // Append-only: strip the new key and the bytes are those of the diagnostic without it.
    expect(stripAf1Keys(j)).toBe(JSON.stringify(diagnosticToJson(DUP, withoutAf1Fields(d))));
  });

  it("`arch compile --json`, `arch lint --json` and `arch validate --json` carry it", async () => {
    for (const cmd of ["compile", "lint", "validate"]) {
      const r = await runArch([cmd, "-", "--json"], { input: DUP });
      const out = JSON.parse(r.stdout) as { diagnostics: Array<{ code?: string; related?: unknown }> };
      const dup = out.diagnostics.find((x) => x.code === "E_DUP_ID");
      expect(dup?.related, cmd).toEqual([{ message: "first declared here", line: 2, col: 3, span: [13, 56] }]);
    }
  });

  it("ids are checked in registry order, not source order: a later room's id is 'also declared here'", () => {
    // The `room` is checked before the `door` above it, so the error stays on the door (its span is
    // unchanged) and its related span points DOWN the file, worded as such.
    const src = `plan "O" {
  wall exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  door id=same at (1000,0) width 900
  room id=same at (0,0) size 3000x3000 label "A"
}`;
    const d = byCode(compile(src, { noCache: true }).diagnostics, "E_DUP_ID");
    expect(src.slice(d.span!.start, d.span!.end)).toBe("door id=same at (1000,0) width 900");
    const [rel] = d.relatedSpans!;
    expect(rel!.message).toBe("also declared here");
    expect(src.slice(rel!.span.start, rel!.span.end)).toBe('room id=same at (0,0) size 3000x3000 label "A"');
    expect(diagnosticToJson(src, d).related).toEqual([
      { message: "also declared here", line: 4, col: 3, span: [rel!.span.start, rel!.span.end] },
    ]);
  });

  it("with three declarations, each later one points at the earliest seen in the source", () => {
    const src = `plan "T" {
  door id=x at (1000,0) width 900
  room id=x at (0,0) size 3000x3000
  room id=y at (3000,0) size 3000x3000
  door id=x at (2000,0) width 900
}`;
    const dups = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "E_DUP_ID");
    const lineOf = (o: number) => src.slice(0, o).split("\n").length;
    expect(
      dups.map((d) => [lineOf(d.span!.start), d.relatedSpans?.map((r) => [r.message, lineOf(r.span.start)])]),
    ).toEqual([
      [2, [["also declared here", 3]]],
      [5, [["first declared here", 2]]],
    ]);
  });

  it("a room checked before a door above it still points at the door as 'first declared here'", () => {
    // Registry order checks both rooms before the door, so the second room is reported before the
    // door has been seen; its note still names the earliest declaration in the source (the door).
    const src = `plan "R" {
  door id=x at (1000,0) width 900
  room id=x at (0,0) size 3000x3000
  room id=x at (3000,0) size 3000x3000
}`;
    const dups = compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "E_DUP_ID");
    const lineOf = (o: number) => src.slice(0, o).split("\n").length;
    expect(
      dups.map((d) => [lineOf(d.span!.start), d.relatedSpans?.map((r) => [r.message, lineOf(r.span.start)])]),
    ).toEqual([
      [4, [["first declared here", 2]]],
      [2, [["also declared here", 3]]],
    ]);
  });

  it("a legacy component called twice declares the id at one span, so no related span repeats it", () => {
    const src = `plan "M" {
  component cell() { room id=c at (0,0) size 2000x2000 }
  cell()
  cell()
}`;
    const d = byCode(compile(src, { noCache: true }).diagnostics, "E_DUP_ID");
    expect(d.relatedSpans).toBeUndefined();
    expect(Object.keys(diagnosticToJson(src, d))).not.toContain("related");
  });
});

describe("a diagnostic without related spans projects to the same bytes as before", () => {
  it("no new key on an ordinary diagnostic", () => {
    const src = `plan "E" { room id=r at (0,0) size 0x1000 label "R" }`;
    for (const d of compile(src, { noCache: true }).diagnostics) {
      const j = diagnosticToJson(src, d);
      expect(Object.keys(j)).not.toContain("related");
      expect(Object.keys(j)).not.toContain("instance");
      expect(Object.keys(j)).not.toContain("component");
    }
  });
});

/** A door inside a component body that lies on no wall: `W_DOOR_OFF_WALL`, with a "nearest wall"
 *  related span in the body and, once placed, a "placed here" one at the `place`. */
const BODY = `  component nook() {
    wall id=w exterior thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close }
    room id=n at (0,0) size 2000x2000
    door id=d at (1000,1500) width 800
  }`;

describe("a placed instance's diagnostic names its instance and component", () => {
  const src = `plan "local" {
  grid 100
${BODY}
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  place nook() as n1 at (0,0)
}`;

  it("`instance`, `component` and both related spans, each with its line and column", () => {
    const d = byCode(compile(src, { noCache: true }).diagnostics, "W_DOOR_OFF_WALL");
    const j = diagnosticToJson(src, d);
    expect(j.instance).toBe("n1");
    expect(j.component).toBe("nook");
    expect(j.related?.map((r) => r.message)).toEqual(['nearest wall "w" is here', 'in instance "n1" placed here']);
    const placed = j.related![1]!;
    expect(src.slice(placed.span[0], placed.span[1])).toBe("place nook() as n1 at (0,0)");
    expect([placed.line, placed.col]).toEqual([9, 3]);
    expect(j.related!.every((r) => r.file === undefined)).toBe(true);
    const keys = Object.keys(j);
    expect(keys.slice(-3)).toEqual(["instance", "component", "related"]);
    expect(stripAf1Keys(j)).toBe(JSON.stringify(diagnosticToJson(src, withoutAf1Fields(d))));
  });
});

describe("a diagnostic from an imported body: each related span names the file it is measured in", () => {
  const lib = `plan "lib" {\n${BODY}\n}`;
  const main = `plan "main" {
  grid 100
  import "lib.arch": nook
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  place nook() as n1 at (0,0)
}`;
  const world = () => makeVirtualWorld({ "lib.arch": lib });

  it("the body's span carries `file`, the `place` statement's does not", () => {
    const d = byCode(compile(main, { world: world(), noCache: true }).diagnostics, "W_DOOR_OFF_WALL");
    expect(d.file).toBe("lib.arch");
    const [nearest, placed] = d.relatedSpans!;
    expect(nearest!.file).toBe("lib.arch");
    expect(lib.slice(nearest!.span.start, nearest!.span.end)).toContain("wall id=w");
    expect(placed!.file).toBeUndefined();
    expect(main.slice(placed!.span.start, placed!.span.end)).toBe("place nook() as n1 at (0,0)");
  });

  it("the JSON gives the module span `file` and no line/col, the place span line/col", () => {
    const d = byCode(compile(main, { world: world(), noCache: true }).diagnostics, "W_DOOR_OFF_WALL");
    const j = diagnosticToJson(main, d);
    expect(j.related![0]).toEqual({ message: 'nearest wall "w" is here', span: [38, 116], file: "lib.arch" });
    expect(j.related![1]).toEqual({ message: 'in instance "n1" placed here', line: 5, col: 3, span: [129, 156] });
  });

  it("the text rendering frames the `place` statement from the compiled source", () => {
    const d = byCode(compile(main, { world: world(), noCache: true }).diagnostics, "W_DOOR_OFF_WALL");
    const text = formatDiagnostic(main, d);
    expect(text).toContain(' --> lib.arch [38..116] note: nearest wall "w" is here');
    expect(text).toContain("5 |   place nook() as n1 at (0,0)");
  });

  it("a lint diagnostic on an imported element stamps its related spans with the file too", () => {
    const dimLib = `plan "lib" {
  component nook() {
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=n at (0,0) size 4000x4000
    dim (0,0)->(4000,0) offset -600
    dim (0,0)->(3000,0) offset -600
  }
}`;
    const dimMain = `plan "main" {
  grid 100
  import "lib.arch": nook
  wall exterior thickness 200 { (0,0) (9000,0) (9000,8000) (0,8000) close }
  room id=big at (5000,0) size 4000x4000
  place nook() as n1 at (0,0)
}`;
    const overlap = lint(dimMain, { world: makeVirtualWorld({ "lib.arch": dimLib }) }).filter(
      (d) => d.code === "W_DIM_OVERLAP",
    );
    expect(overlap.length).toBeGreaterThan(0);
    for (const d of overlap) {
      expect(d.file).toBe("lib.arch");
      for (const r of d.relatedSpans ?? []) expect(r.file).toBe("lib.arch");
    }
    expect(overlap.some((d) => d.relatedSpans?.length)).toBe(true);
  });
});

describe("a related span naming ANOTHER element is offered only from the same file", () => {
  it("a door written in the importer, nearest a wall carried in from an imported instance: no note", () => {
    const lib = `plan "lib" {
  component shell() {
    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000
  }
}`;
    const main = `plan "main" {
  import "lib.arch": shell
  place shell() as s1 at (0,0)
  door id=d at (2000,1500) width 900
}`;
    const world = makeVirtualWorld({ "lib.arch": lib });
    const d = byCode(compile(main, { world, noCache: true }).diagnostics, "W_DOOR_OFF_WALL");
    // Before: a "nearest wall" span of offsets into lib.arch, published against main.
    expect(d.file).toBeUndefined();
    expect(d.relatedSpans).toBeUndefined();
    expect("related" in diagnosticToJson(main, d)).toBe(false);
  });

  it("a door written in an imported body, nearest a wall written in the importer: no note", () => {
    const lib = `plan "lib" {
  component nook() {
    room id=n at (0,0) size 2000x2000
    door id=d at (1000,1000) width 800
  }
}`;
    const main = `plan "main" {
  import "lib.arch": nook
  wall id=big exterior thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close }
  nook()
}`;
    const world = makeVirtualWorld({ "lib.arch": lib });
    const d = byCode(compile(main, { world, noCache: true }).diagnostics, "W_DOOR_OFF_WALL");
    // Before: main's `wall id=big` offsets, stamped as lib.arch's.
    expect(d.file).toBe("lib.arch");
    expect(d.relatedSpans).toBeUndefined();
  });

  it("the same door and wall in one file keep the note", () => {
    const src = `plan "one" {
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000
  door id=d at (2000,1500) width 900
}`;
    const d = byCode(compile(src, { noCache: true }).diagnostics, "W_DOOR_OFF_WALL");
    expect(d.relatedSpans?.map((r) => src.slice(r.span.start, r.span.end))).toEqual([
      "wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }",
    ]);
  });
});
