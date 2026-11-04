/**
 * The shared grid (issue #345): `axis.3` and `axis.B` read a positioning axis as a coordinate, on
 * every storey; `keep on axis` holds a column as well as a wall; and `W_AXES_DIFFER` says when the
 * one block came out as two grids. The byte-identity law is `shared-grid-byte-identity.test.ts`.
 *
 * Each refusal is shown beside the same plan with the refusal's cause removed, so a test cannot
 * pass because the read never ran.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, type Diagnostic, format, impact, lint, planToJson } from "../src/index.js";
import { evaluationSteps, resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { renderGbnf } from "../scripts/gen-gbnf.js";

const FIXTURE = "test/fixtures/shared-grid/shared-grid.arch";
const AXES = `  axes { x at 0, 6000, 12000 y at 0, 5000 }`;
const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n${lines.join("\n")}\n}\n`;
const WALL = `  wall id=w partition thickness 200 { (axis.2, axis.A) (axis.2, axis.B) }`;

const diags = (src: string): Diagnostic[] => compile(src, { noCache: true }).diagnostics;
const codes = (src: string): string[] => diags(src).map((d) => d.code ?? "");
const errors = (src: string): Diagnostic[] => diags(src).filter((d) => d.severity === "error");
const quoted = (src: string, d: Diagnostic): string => src.slice(d.span!.start, d.span!.end);
const doorAt = (src: string): unknown => {
  const res = resolveAll(parse(src, BUILTIN_REGISTRY).plan!, BUILTIN_REGISTRY);
  return (res.ir.elements.find((e) => e.kind === "door") as { at: unknown } | undefined)?.at;
};
const wallPoints = (src: string): unknown => {
  const res = resolveAll(parse(src, BUILTIN_REGISTRY).plan!, BUILTIN_REGISTRY);
  return res.ir.walls[0]!.points;
};

suite("an axis read as a coordinate", () => {
  it("is the position the axis is drawn at, both ways, labelled as the drawing labels it", () => {
    // `A` is the LARGEST y: letters read bottom to top, and +y points down.
    expect(wallPoints(plan(AXES, WALL))).toEqual([
      { x: 6000, y: 5000 },
      { x: 6000, y: 0 },
    ]);
    const same = plan(AXES, `  wall id=w partition thickness 200 { (6000, 5000) (6000, 0) }`);
    expect(compile(plan(AXES, WALL), { noCache: true }).svg).toBe(compile(same, { noCache: true }).svg);
  });

  it("reads past nine and past the alphabet's end: `axis.12`, `axis.AA`", () => {
    const xs = Array.from({ length: 12 }, (_, i) => i * 1000).join(", ");
    const ys = Array.from({ length: 24 }, (_, i) => i * 1000).join(", ");
    const src = plan(`  axes { x at ${xs} y at ${ys} }`, `  column id=c at (axis.12, axis.AA) size 400x400`);
    expect(errors(src)).toEqual([]);
    const res = resolveAll(parse(src, BUILTIN_REGISTRY).plan!, BUILTIN_REGISTRY);
    expect(res.ir.elements.find((e) => e.kind === "column")).toMatchObject({ at: { x: 11000, y: 0 } });
  });

  it("holds the snapped position, as the drawn axis does", () => {
    const src = plan(`  grid 100`, `  axes { x at 0, 6049 y at 0, 5000 }`, WALL);
    expect(wallPoints(src)).toEqual([
      { x: 6000, y: 5000 },
      { x: 6000, y: 0 },
    ]);
  });

  it("reads where `hall.top` cannot: a room's own `at` and `size`", () => {
    const src = plan(AXES, `  room id=r at (axis.1, axis.B) size (axis.2)x(axis.A)`);
    expect(errors(src)).toEqual([]);
    expect(describe(src).rooms[0]!.bbox).toEqual({ x: 0, y: 0, w: 6000, h: 5000 });
  });

  it("reads on every storey from one block", () => {
    const src = readFileSync(FIXTURE, "utf8");
    expect(errors(src)).toEqual([]);
    const c = compile(src, { noCache: true });
    expect(c.pages!.length).toBe(2);
    for (const p of c.pages!) expect(p.svg).toContain("A-GRID");
    expect(codes(src).filter((x) => x === "W_KEEP_VIOLATED")).toEqual([]);
  });

  it("reads in a legacy bare call, which is a macro and stands in the plan", () => {
    const src = plan(AXES, `  component post() { column id=c at (axis.2, 0) size 400x400 }`, `  post()`);
    expect(errors(src)).toEqual([]);
  });

  it("`axis.top` stays the edge of a room named `axis`", () => {
    const src = plan(
      `  room id=axis at (500,500) size 3000x3000`,
      `  wall id=w partition thickness 100 { (0,axis.top) (4000,axis.top) }`,
    );
    expect(errors(src)).toEqual([]);
    expect(wallPoints(src)).toEqual([
      { x: 0, y: 500 },
      { x: 4000, y: 500 },
    ]);
  });

  it("a `let` named `axis` reads as it always did", () => {
    const src = plan(
      `  let axis = 3000`,
      `  room id=r at (0,0) size (axis)x(axis + 1)`,
      `  room id=q at (4000,0) size axis x 3000`,
    );
    expect(errors(src)).toEqual([]);
  });

  it("`axis .3` with a space is still two tokens, and no parse reads it as the datum", () => {
    expect(codes(plan(AXES, `  room id=r at (axis .3, 0) size 3000x3000`))).toContain("E_PARSE");
  });

  it("formats and reparses as written", () => {
    const src = plan(AXES, WALL, `  column id=c at (axis.3 - 200, axis.B - 200) size 400x400`);
    const printed = format(src);
    expect(printed).toContain("axis.2");
    expect(printed).toContain("axis.3 - 200");
    expect(compile(printed, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("the agent grammar admits `axis.3` where a reference stands", () => {
    expect(renderGbnf()).toContain('ref ::= "axis." digits | ident ( "." ident )*');
  });
});

suite("a read that cannot be answered is a diagnostic", () => {
  it("a label the plan does not declare, at the datum, with the nearest label", () => {
    const src = plan(AXES, `  wall id=w partition thickness 200 { (axis.4, 0) (axis.4, 5000) }`);
    const [d] = errors(src);
    expect(d).toMatchObject({ code: "E_UNKNOWN_REF" });
    expect(d!.message).toContain('labelled "4"');
    expect(quoted(src, d!)).toBe("axis.4");
    expect(d!.hints?.[0]).toMatch(/^did you mean `axis\.\d`\?$/);
  });

  it("a label in lower case, when the capital is one: the near miss, at the datum", () => {
    const wall = plan(AXES, `  wall id=w partition thickness 200 { (0, axis.b) (6000, axis.b) }`);
    const [d] = errors(wall);
    expect(d).toMatchObject({ code: "E_UNKNOWN_REF", hints: ["did you mean `axis.B`?"] });
    expect(d!.message).toContain("a label is in capitals");
    expect(quoted(wall, d!)).toBe("axis.b");
    // In the room pass too.
    const room = plan(AXES, `  room id=r at (0, axis.b) size 3000x3000`);
    expect(errors(room)[0]).toMatchObject({ code: "E_UNKNOWN_REF", hints: ["did you mean `axis.B`?"] });
  });

  it("no such capital is an ordinary unknown name, and a room's edge stays an edge", () => {
    const src = plan(AXES, `  column at (axis.q, 0) size 400x400`);
    expect(errors(src)[0]!.message).toBe('Unknown name "axis.q"');
    const room = plan(AXES, `  room id=axis at (500,0) size 3000x3000`, `  column at (axis.left, 0) size 400x400`);
    expect(errors(room)).toEqual([]);
  });

  it("a plan with no axes", () => {
    const [d] = errors(plan(WALL));
    expect(d).toMatchObject({ code: "E_UNKNOWN_REF" });
    expect(d!.message).toContain("this plan declares none");
  });

  it.each([
    ["a let", `  let x = axis.2`],
    ["a loop bound", `  for i in 0..axis.2 { let j = i }`],
    ["a condition", `  if axis.2 > 0 { let j = 1 }`],
    ["a place", `  component c() { column at (0,0) size 400x400 }\n  place c() as p at (axis.2, 0)`],
    ["a component argument", `  component c(x) { column at (x,0) size 400x400 }\n  c(axis.2)`],
  ])("in %s it is read before the axes exist: E_DATUM_BEFORE_ROOMS, naming the route", (_n, line) => {
    const src = plan(AXES, line);
    const d = errors(src).find((x) => x.code === "E_DATUM_BEFORE_ROOMS")!;
    expect(d.message).toContain("before the axes are evaluated");
    expect(d.message).toContain("share a `let` with the `axes` block");
    expect(quoted(src, d)).toBe("axis.2");
  });

  it("the shared `let` is the route it names", () => {
    const src = plan(
      `  let BAY = 6000`,
      `  axes { x at 0, BAY }`,
      `  component c() { column id=p at (-200,0) size 400x400 }`,
      `  place c() as p at (BAY, 0)`,
      `  keep on axis 2 p.p`,
    );
    expect(codes(src).filter((c) => c.startsWith("E_") || c === "W_KEEP_VIOLATED")).toEqual([]);
  });

  it("in the `axes` block itself, so it cannot define itself", () => {
    const src = plan(`  axes { x at 0, axis.1 }`);
    expect(codes(src)).toContain("E_DATUM_BEFORE_ROOMS");
  });

  it("in a user function's body, and the argument is the route", () => {
    const body = plan(AXES, `  let f(d) = axis.2 + d`, `  column at (f(0), 0) size 400x400`);
    expect(codes(body)).toContain("E_DATUM_BEFORE_ROOMS");
    const arg = plan(AXES, `  let f(d) = d + 100`, `  column at (f(axis.2), 0) size 400x400`);
    expect(errors(arg)).toEqual([]);
  });

  it("inside a placed component, which keeps its own coordinates, in any pass", () => {
    for (const line of [
      `column at (axis.2, 0) size 400x400`,
      `room id=q at (axis.2, 0) size 3000x3000`,
      `wall id=x partition thickness 100 { (axis.2, 0) (axis.2, 1000) }`,
    ]) {
      const src = plan(AXES, `  component c() { ${line} }`, `  place c() as p at (0, 0)`);
      const d = errors(src).find((x) => x.code === "E_UNKNOWN_REF")!;
      expect(d.message).toContain("inside a placed component");
      expect(quoted(src, d)).toBe("axis.2");
    }
  });

  it("the same component reads no differently however it is placed: it cannot read the axis at all", () => {
    const at = (x: number): string =>
      plan(AXES, `  component c() { column at (axis.2, 0) size 400x400 }`, `  place c() as p at (${x}, 0)`);
    expect(codes(at(0))).toEqual(codes(at(3000)));
  });
});

suite("`at axis.2` on an opening stands on the axis", () => {
  it("as `at axis 2` does, not 3000 mm along a wall that starts at x 1000", () => {
    const opening = (pos: string): string =>
      plan(
        `  axes { x at 0, 3000 }`,
        `  wall id=w exterior thickness 200 { (1000,0) (9000,0) }`,
        `  door id=d on w at ${pos} width 900`,
      );
    expect(doorAt(opening("axis.2"))).toEqual({ x: 3000, y: 0 });
    expect(describe(opening("axis.2"))).toEqual(describe(opening("axis 2")));
    expect(doorAt(opening("3000"))).toEqual({ x: 4000, y: 0 });
  });

  it("a label it does not have is the same refusal", () => {
    const src = plan(
      `  axes { x at 0, 3000 }`,
      `  wall id=w exterior thickness 200 { (1000,0) (9000,0) }`,
      `  door id=d on w at axis.7 width 900`,
    );
    expect(codes(src)).toContain("E_OPENING_DATUM");
  });

  it.each([
    ["from end", "axis.2 from end"],
    ["from start", "axis.2 from start"],
    ["from a room edge", "axis.2 from r.left"],
    ["a percentage", "axis.2%"],
    ["in brackets", "(axis.2) from end"],
  ])("%s can only be a distance along the wall, so it is refused, with the words `from axis` has", (_n, pos) => {
    const src = plan(
      `  axes { x at 0, 3000 }`,
      `  wall id=w exterior thickness 200 { (1000,0) (9000,0) }`,
      `  room id=r at (1000,0) size 8000x3000`,
      `  door id=d on w at ${pos} width 900`,
    );
    const [d] = errors(src);
    expect(d).toMatchObject({ code: "E_PARSE" });
    expect(d!.message).toBe(
      "An offset is measured `from start`, `from end` or `from <room>.<edge>`; to stand on an axis write `at axis <label>`",
    );
    expect(doorAt(src)).toBeUndefined();
  });

  it("the same refusal on `between`, and a number or a plain name `from end` still reads", () => {
    const rooms = `  room id=a at (0,0) size 3000x3000\n  room id=b right-of a size 3000x3000`;
    const walls = `  walls from rooms exterior 200 partition 100`;
    const at = (pos: string): string =>
      plan(`  axes { y at 0, 1500 }`, `  let p = 900`, rooms, walls, `  door id=d between a and b at ${pos} width 800`);
    expect(codes(at("axis.A from start"))).toContain("E_PARSE");
    expect(codes(at("900 from start"))).not.toContain("E_PARSE");
    expect(codes(at("p from start"))).not.toContain("E_PARSE");
  });

  /**
   * CR2 group C (decision CR-D5): `at axis.2 + 500` used to be a plain number, that many mm along
   * the wall from its start, so it landed on the axis only on a wall starting at 0 and an author
   * reading "500 mm past axis 2" got another position without a word. An axis is a plan
   * coordinate and a position along a wall is a distance, so arithmetic on an axis is refused
   * there, and the hint gives both spellings: `at axis 2`, and the distance that reaches the
   * plan coordinate the expression meant.
   */
  const AT_X = (wall: string, pos: string): string =>
    plan(
      `  axes { x at 0, 3000 }`,
      `  wall id=w exterior thickness 200 { ${wall} }`,
      `  door id=d on w at ${pos} width 900`,
    );

  it.each([
    // name, wall, position, the distance the hint quotes, the plan x the position meant
    ["a wall that starts at 1000", "(1000,0) (9000,0)", "axis.2 + 500", "2500", 3500],
    ["a wall that runs right to left", "(9000,0) (0,0)", "axis.2 + 500", "5500", 3500],
    ["a wall that starts at 0", "(0,0) (9000,0)", "axis.2 + 500", "3500", 3500],
    ["subtraction", "(1000,0) (9000,0)", "axis.2 - 500", "1500", 2500],
    ["a scaled read", "(1000,0) (9000,0)", "axis.2 * 2", "5000", 6000],
    ["two axes", "(1000,0) (9000,0)", "axis.2 - axis.1 + 1000", "3000", 4000],
  ] as const)(
    "arithmetic on it is refused on %s, and the distance the hint quotes lands where the expression meant",
    (_n, wall, pos, along, x) => {
      const src = AT_X(wall, pos);
      const [d, ...rest] = errors(src);
      expect(rest).toEqual([]);
      expect(d).toMatchObject({ code: "E_OPENING_DATUM" });
      expect(quoted(src, d!)).toContain(pos);
      expect(d!.hints!.join(" ")).toContain("`at axis 2`");
      expect(d!.hints!.join(" ")).toContain(`\`at ${along}\``);
      // Paste the hint: the door stands where the expression, read as a plan x, meant.
      expect(doorAt(AT_X(wall, along))).toEqual({ x, y: 0 });
      expect(errors(AT_X(wall, along))).toEqual([]);
    },
  );

  it("no distance is quoted when the plan coordinate is off the wall, and the refusal stands", () => {
    const src = AT_X("(1000,0) (9000,0)", "axis.2 + 7000");
    const [d] = errors(src);
    expect(d).toMatchObject({ code: "E_OPENING_DATUM" });
    expect(d!.hints!.join(" ")).toContain("`at axis 2`");
    expect(d!.hints!.join(" ")).not.toMatch(/`at \d/);
  });

  it("an undeclared axis in the arithmetic is the evaluator's one error, with no hint naming it", () => {
    for (const pos of ["axis.9 + 1", "axis.9 + 1 from end"]) {
      const src = AT_X("(1000,0) (9000,0)", pos);
      const es = errors(src);
      expect(
        es.map((d) => d.code),
        pos,
      ).toEqual(["E_UNKNOWN_REF"]);
      expect(es[0]!.message, pos).toContain('No positioning axis is labelled "9"');
      expect(JSON.stringify(es), pos).not.toContain("`at axis 9`");
    }
    // `between … from`, the relational route, the same way.
    const rooms = `  room id=a at (0,0) size 3000x3000\n  room id=b right-of a size 3000x3000`;
    const walls = `  walls from rooms exterior 200 partition 100`;
    const src = plan(
      `  axes { y at 0, 1500 }`,
      rooms,
      walls,
      `  door id=d between a and b at axis.Q - 1000 from start width 800`,
    );
    expect(errors(src).map((d) => d.code)).toEqual(["E_UNKNOWN_REF"]);
    // A declared axis beside an undeclared one: both errors stand, and the hint names the declared one.
    const mixed = errors(AT_X("(1000,0) (9000,0)", "axis.2 + axis.9"));
    expect(mixed.map((d) => d.code).sort()).toEqual(["E_OPENING_DATUM", "E_UNKNOWN_REF"]);
    const datum = mixed.find((d) => d.code === "E_OPENING_DATUM")!;
    expect(datum.hints!.join(" ")).toContain("`at axis 2`");
    expect(datum.hints!.join(" ")).not.toContain("axis 9");
  });

  it("refused under `from` and `%` too, which measure along the wall", () => {
    for (const pos of ["axis.2 + 500 from end", "axis.2 / 100%", "(axis.2 + 500) from start"]) {
      const src = AT_X("(1000,0) (9000,0)", pos);
      expect(
        errors(src).map((d) => d.code),
        pos,
      ).toEqual(["E_OPENING_DATUM"]);
    }
  });

  it("refused on `between` under `from` (a plain number there already names no datum)", () => {
    const rooms = `  room id=a at (0,0) size 3000x3000\n  room id=b right-of a size 3000x3000`;
    const walls = `  walls from rooms exterior 200 partition 100`;
    const at = (pos: string): string =>
      plan(`  axes { y at 0, 1500 }`, rooms, walls, `  door id=d between a and b at ${pos} width 800`);
    const src = at("axis.A - 1000 from start");
    expect(errors(src).map((d) => d.code)).toEqual(["E_OPENING_DATUM"]);
    expect(errors(src)[0]!.hints!.join(" ")).toContain("`at axis A`");
    expect(errors(at("1500 from start"))).toEqual([]);
  });

  it("the control: arithmetic on a `let` reads as it always did", () => {
    const src = plan(
      `  axes { x at 0, 3000 }`,
      `  let p = 2000`,
      `  wall id=w exterior thickness 200 { (1000,0) (9000,0) }`,
      `  door id=d on w at p + 500 width 900`,
    );
    expect(errors(src)).toEqual([]);
    expect(doorAt(src)).toEqual({ x: 3500, y: 0 });
  });
});

suite("`keep on axis` holds a column", () => {
  const kept = (column: string, keep: string): Diagnostic[] => diags(plan(AXES, `  ${column}`, `  ${keep}`));
  const COLUMN = `column id=c at (5800,4800) size 400x400`;

  it("read at its centre across the axis, both ways, and residuals are signed", () => {
    expect(kept(COLUMN, `keep on axis 2 c`)).toEqual([]);
    expect(kept(COLUMN, `keep on axis A c`)).toEqual([]);
    const right = kept(`column id=c at (5850,4800) size 400x400`, `keep on axis 2 c`);
    expect(right[0]).toMatchObject({ code: "W_KEEP_VIOLATED" });
    expect(right[0]!.message).toContain("that column is 50 mm right of the axis");
    const above = kept(`column id=c at (5800,4750) size 400x400`, `keep on axis A c`);
    expect(above[0]!.message).toContain("that column is 50 mm above the axis");
  });

  it("not by its corner: the same corner with another size is off", () => {
    expect(kept(`column id=c at (5800,4800) size 500x400`, `keep on axis 2 c`)[0]?.code).toBe("W_KEEP_VIOLATED");
    expect(kept(`column id=c at (6000,4800) size 400x400`, `keep on axis 2 c`)[0]?.code).toBe("W_KEEP_VIOLATED");
  });

  it("a half-millimetre off is not rounded onto the axis", () => {
    const off = kept(`column id=c at (5800,4800) size 401x400`, `keep on axis 2 c`);
    expect(off[0]!.message).toContain("0.5 mm right");
  });

  it("names no id in its message, and the id in its hint", () => {
    const [d] = kept(`column id=pillar_seven at (5850,4800) size 400x400`, `keep on axis 2 pillar_seven`);
    expect(d!.message).not.toContain("pillar_seven");
    expect(d!.hints?.join(" ")).toContain("pillar_seven");
  });

  it("an auto id is refused, as for any keep", () => {
    const src = plan(AXES, `  column at (5800,4800) size 400x400`, `  keep on axis 2 column_1`);
    expect(codes(src)).toContain("E_KEEP_TARGET");
  });

  it("what `on axis` cannot hold names both things it can", () => {
    const [d] = kept(`room id=r at (0,0) size 3000x3000`, `keep on axis 2 r.left`);
    expect(d).toMatchObject({ code: "E_KEEP_MEASURE" });
    expect(d!.message).toContain("a wall or a column");
    expect(d!.hints?.join(" ")).toContain("neither a wall nor a column");
  });

  it("`axis.2` in a keep says how a keep writes it", () => {
    const [d] = kept(COLUMN, `keep fixed axis.2 at 6000`);
    expect(d).toMatchObject({ code: "E_KEEP_TARGET" });
    expect(d!.hints?.join(" ")).toContain("a keep writes `axis 2`");
    const [e] = kept(COLUMN, `keep align axis.B axis 1`);
    expect(e!.hints?.join(" ")).toContain("a keep writes `axis B`");
  });

  it("no other form reads a column, and `segment` on one is refused", () => {
    expect(kept(COLUMN, `keep align axis 2 c`)[0]).toMatchObject({ code: "E_KEEP_MEASURE" });
    expect(kept(COLUMN, `keep on axis 2 c segment 0`)[0]).toMatchObject({ code: "E_KEEP_MEASURE" });
  });

  it("a wall still reads as it did, and what is neither is still refused", () => {
    const wall = `wall id=w partition thickness 200 { (6000,0) (6000,5000) }`;
    expect(kept(wall, `keep on axis 2 w`)).toEqual([]);
    expect(kept(`room id=r at (0,0) size 3000x3000`, `keep on axis 2 r`)[0]).toMatchObject({ code: "E_KEEP_MEASURE" });
  });

  it("through a turned and a mirrored `place`, read in plan coordinates from the storey", () => {
    const placed = (frame: string): string =>
      plan(
        `  let BAY = 6000`,
        `  axes { x at 0, BAY y at 0, 5000 }`,
        `  component c() { column id=p at (-200,-200) size 400x400 }`,
        `  place c() as q at (BAY, 5000)${frame}`,
        `  keep on axis 2 q.p`,
        `  keep on axis A q.p`,
      );
    for (const frame of [
      "",
      " rotate 90",
      " rotate 180",
      " rotate 270",
      " mirror x",
      " mirror y",
      " rotate 90 mirror x",
    ]) {
      expect(codes(placed(frame)).filter((c) => c.startsWith("E_") || c === "W_KEEP_VIOLATED")).toEqual([]);
    }
  });

  it("through a frame, an off-centre column is measured where it landed", () => {
    const src = plan(
      `  axes { x at 0, 6000 }`,
      `  component c() { column id=p at (0,0) size 400x400 }`,
      `  place c() as q at (6000, 0) rotate 90`,
      `  keep on axis 2 q.p`,
    );
    const d = diags(src).find((x) => x.code === "W_KEEP_VIOLATED")!;
    expect(d.message).toContain("200 mm left of the axis");
    expect(d.hints?.join(" ")).toContain("q.p");
  });

  it("`describe` reports it", () => {
    const src = plan(AXES, `  column id=c at (5800,4800) size 400x400`, `  keep on axis 2 c`);
    expect(describe(src).keeps?.[0]).toMatchObject({ keep: "on axis 2 c", holds: true });
  });
});

suite("one grid: W_AXES_DIFFER", () => {
  const twoStoreys = (a: string, b: string, axes = `  axes { x at 0, BAY }`): string =>
    plan(
      axes,
      `  level 1 { ${a} wall partition thickness 100 { (0,0) (1000,0) } }`,
      `  level 2 { ${b} wall partition thickness 100 { (0,0) (1000,0) } }`,
    );

  it("a `let` inside a level that moves the block says so, once, at the block", () => {
    const src = twoStoreys(`let BAY = 6000`, `let BAY = 7000`);
    const ds = diags(src).filter((d) => d.code === "W_AXES_DIFFER");
    expect(ds.length).toBe(1);
    expect(ds[0]!.level).toBeUndefined();
    expect(quoted(src, ds[0]!)).toContain("axes {");
    expect(ds[0]!.message).toContain("level 2");
  });

  it("the same value on both is one grid, and so is a plan-level `let`", () => {
    expect(codes(twoStoreys(`let BAY = 6000`, `let BAY = 6000`))).not.toContain("W_AXES_DIFFER");
    expect(
      codes(
        plan(
          `  let BAY = 6000`,
          `  axes { x at 0, BAY }`,
          `  level 1 { wall partition thickness 100 { (0,0) (1000,0) } }`,
          `  level 2 { wall partition thickness 100 { (0,0) (1000,0) } }`,
        ),
      ),
    ).not.toContain("W_AXES_DIFFER");
  });

  it("a storey whose block failed has said so, and is no second grid", () => {
    const src = plan(
      `  axes { x at 0, BAY }`,
      `  level 1 {\n    let BAY = 6000\n    wall partition thickness 100 { (0,0) (1000,0) }\n  }`,
      `  level 2 {\n    wall partition thickness 100 { (0,0) (1000,0) }\n  }`,
    );
    expect(codes(src)).toContain("E_UNKNOWN_REF");
    expect(codes(src)).not.toContain("W_AXES_DIFFER");
  });

  it("three grids are one warning", () => {
    const three = plan(
      `  axes { x at 0, BAY }`,
      ...[6000, 7000, 8000].map(
        (b, i) => `  level ${i + 1} {\n    let BAY = ${b}\n    wall partition thickness 100 { (0,0) (1000,0) }\n  }`,
      ),
    );
    expect(codes(three).filter((c) => c === "W_AXES_DIFFER").length).toBe(1);
  });

  it("a count that differs is two grids too", () => {
    expect(codes(twoStoreys(`let A = 1000`, `let A = 2000`, `  axes { x at 0, A, 1000 }`))).toContain("W_AXES_DIFFER");
  });

  it("no block and one storey say nothing", () => {
    expect(
      codes(plan(`  level 1 { room id=a at (0,0) size 3000x3000 }`, `  level 2 { room id=a at (0,0) size 3000x3000 }`)),
    ).not.toContain("W_AXES_DIFFER");
  });
});

suite("the facts follow the read", () => {
  it("`impact` follows a moved axis to what reads it, by the axis", () => {
    const at = (x: number): string =>
      plan(`  axes { x at 0, ${x} y at 0, 5000 }`, `  column id=c at (axis.2 - 200, 0) size 400x400`);
    const r = impact(at(6000), at(6500));
    const row = r.changed.find((c) => c.id === "c")!;
    expect(row.kind).toBe("column");
    expect(JSON.stringify(row.why)).toContain("axis");
  });

  it("Plan JSON carries the position, as it does for `at axis`", () => {
    expect(JSON.stringify(planToJson(plan(AXES, WALL)))).toContain("6000");
    expect(JSON.stringify(planToJson(plan(AXES, WALL)))).not.toContain("axis.2");
  });

  it("`depends` lists the label under `axes`, never as a name", () => {
    const src = plan(AXES, WALL);
    const row = describe(src, { facts: ["depends"] }).depends!.elements.find((e) => e.id === "w")!;
    expect(row.axes).toEqual(["2", "A", "B"]);
    expect(row.params).toEqual([]);
    expect(row.on).toEqual([]);
  });

  it("charges each read before it allocates, and a plan that reads none pays nothing", () => {
    const steps = (src: string): number =>
      evaluationSteps(resolveAll(parse(src, BUILTIN_REGISTRY).plan!, BUILTIN_REGISTRY));
    const axes = Array.from({ length: 400 }, (_, i) => i * 100).join(", ");
    const read = plan(`  axes { x at ${axes} }`, `  column at (axis.399, 0) size 400x400`);
    const plain = plan(`  axes { x at ${axes} }`, `  column at (39800, 0) size 400x400`);
    expect(steps(read) - steps(plain)).toBeGreaterThanOrEqual(400);
  });

  it("an honest grid read everywhere stays well inside the budget", () => {
    const axes = Array.from({ length: 60 }, (_, i) => i * 6000).join(", ");
    const cols = Array.from(
      { length: 60 },
      (_, i) => `  column at (axis.${i + 1} - 200, axis.${"ABCDEFGH"[i % 8]} - 200) size 400x400`,
    );
    const src = plan(`  axes { x at ${axes} y at 0, 5000, 10000, 15000, 20000, 25000, 30000, 35000 }`, ...cols);
    expect(errors(src)).toEqual([]);
  });

  it("`lint` runs on the form and quotes no id", () => {
    const src = readFileSync(FIXTURE, "utf8");
    for (const d of lint(src)) expect(d.message).not.toMatch(/\bg2\b/);
  });
});
