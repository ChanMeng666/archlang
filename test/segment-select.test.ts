/**
 * Segment selectors (plan card PS3.5): `segment north|south|east|west` and `segment containing
 * <room>.<edge>` alias `segment <n>`.
 *
 *  - the twins (swap-back law): every selector draws, describes and lints byte for byte as the
 *    number it aliases, on an authored closed ring, an open polyline (`containing` only), a
 *    derived ring and partition, and inside a component under all eight frames. The numeric
 *    twin is padded to the selector's length so every later byte span is the same;
 *  - the refusals: no match and several matches (`E_SEGMENT_SELECT`, listing the candidates),
 *    a compass word on an open wall, under `north right` and inside a placed component
 *    (`E_DATUM_COMPASS`), the datum refusals through `containing`, and `dim radius`;
 *  - the parse: a bare compass word is the selector, a variable of that name is reached by
 *    parenthesising it, and `containing` is a selector only before a dotted name;
 *  - the round trips: `format` and Plan JSON keep the selector as written.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, format, lint, planJsonToArch, planToJson } from "../src/index.js";
import type { RWall } from "../src/ir.js";
import { buildDatumTable } from "../src/room-datums.js";
import { MAX_EVAL_STEPS, withStepMeter } from "../src/expr.js";
import { selectSegment } from "../src/segment-select.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./helpers/byte-identity-digest.js";
import {
  DERIVED_PIECES,
  DERIVED_ROOMS,
  FRAMED_PIECE,
  framed,
  L_RING,
  OPEN_PIECES,
  OPEN_WALL,
  RING_PIECES,
  SEGMENT_SELECT_PLANS,
} from "./tables/segment-select-plans.js";

const API: CompilerApi = { compile, describe, lint };
const plan = (body: string, head = ""): string => `plan "p" {\n  units mm\n  grid 50\n${head}${body}\n}\n`;
// TODO(EH3.4): differs from test/helpers/diag.ts in that it reads compile(), leaves the memo cache on.
const codes = (src: string): string[] => compile(src).diagnostics.map((d) => d.code ?? "");

/** The numeric twin of a selector line: `segment <n>` padded to the selector's length, so the
 *  statement and everything after it keep their byte spans. */
function twin(line: string, n: number): string {
  const m = /segment (north|south|east|west|containing \S+)/.exec(line)!;
  const num = `segment ${n}`;
  return line.replace(m[0], num + " ".repeat(m[0].length - num.length));
}

/** Both forms equal in SVG, describe(), lint() and diagnostics (every storey). */
function expectTwins(selector: string, numeric: string): void {
  expect(codes(selector)).toEqual([]);
  expect(compile(selector).svg).toBe(compile(numeric).svg);
  expect(JSON.stringify(describe(selector))).toBe(JSON.stringify(describe(numeric)));
  expect(JSON.stringify(lint(selector))).toBe(JSON.stringify(lint(numeric)));
  expect(allStoreysDigestWithDiagnostics(API, selector)).toBe(allStoreysDigestWithDiagnostics(API, numeric));
}

suite("twins (the swap-back law)", () => {
  const cases: [string, string, [string, number][]][] = [
    ["an authored closed ring", L_RING, RING_PIECES],
    ["an open polyline (containing only)", OPEN_WALL, OPEN_PIECES],
    ["a derived ring and partition", DERIVED_ROOMS, DERIVED_PIECES],
  ];
  for (const [what, base, pieces] of cases) {
    for (const [line, n] of pieces) {
      it(`${what}: \`${/segment (\S+(?: \S+)?)/.exec(line)![0]}\` is \`segment ${n}\``, () => {
        expectTwins(plan(`${base}  ${line}`), plan(`${base}  ${twin(line, n)}`));
      });
    }
    it(`${what}: all its selectors at once equal all their numbers`, () => {
      const sel = plan(base + pieces.map(([l]) => `  ${l}`).join("\n"));
      const num = plan(base + pieces.map(([l, n]) => `  ${twin(l, n)}`).join("\n"));
      expectTwins(sel, num);
    });
  }

  it("inside a component under all eight frames, `containing` reads local words and equals the number", () => {
    const [line, n] = FRAMED_PIECE;
    expectTwins(framed(line), framed(twin(line, n)));
  });

  it("the compass selectors of the ring cover north, south, east and west by outward face", () => {
    // south and east each face two segments of the L; on a plain box each names one.
    const box =
      "  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n  room id=r at (0,0) size 4000x3000 uses living\n";
    for (const [dir, n] of [
      ["north", 0],
      ["east", 1],
      ["south", 2],
      ["west", 3],
    ] as const) {
      const line = `furniture id=p wardrobe against wall w segment ${dir} size 1200x600 in r`;
      expectTwins(plan(`${box}  ${line}`), plan(`${box}  ${twin(line, n)}`));
    }
  });

  it("a ring drawn the other way round reads the same faces (orientation is decided, not assumed)", () => {
    const ccw =
      "  wall id=w exterior thickness 200 { (0,0) (0,3000) (4000,3000) (4000,0) close }\n  room id=r at (0,0) size 4000x3000 uses living\n";
    // counter-clockwise on the page: 0 = west, 1 = south, 2 = east, 3 = north
    for (const [dir, n] of [
      ["west", 0],
      ["south", 1],
      ["east", 2],
      ["north", 3],
    ] as const) {
      const line = `furniture id=p wardrobe against wall w segment ${dir} size 1200x600 in r`;
      expectTwins(plan(`${ccw}  ${line}`), plan(`${ccw}  ${twin(line, n)}`));
    }
  });

  it("a derived courtyard ring has its floor outside, so the outward faces point into the court", () => {
    // `against wall exterior` cannot reach an inner ring (it makes `exterior` ambiguous), so
    // the rule is held on the selector itself: the same square, as an outer ring and as a
    // courtyard ring (counter-clockwise, ADR 0028 §3), reads opposite faces.
    const ring = (inner: boolean): RWall =>
      ({
        kind: "wall",
        id: inner ? "exterior#2" : "exterior",
        category: "exterior",
        thickness: 200,
        closed: true,
        points: inner
          ? [
              { x: 0, y: 0 },
              { x: 0, y: 3000 },
              { x: 3000, y: 3000 },
              { x: 3000, y: 0 },
            ]
          : [
              { x: 0, y: 0 },
              { x: 3000, y: 0 },
              { x: 3000, y: 3000 },
              { x: 0, y: 3000 },
            ],
        ...(inner ? { _derived: { from: "rooms", ring: "inner" } } : { _derived: { from: "rooms", ring: "outer" } }),
      }) as unknown as RWall;
    const ctx = {
      diag: (d: unknown) => {
        throw new Error(JSON.stringify(d));
      },
      datums: { table: buildDatumTable([], undefined), read: () => undefined, compass: { aliases: true, why: "" } },
    };
    const pick = (w: RWall, dir: "north" | "south" | "east" | "west") =>
      selectSegment({ kind: "compass", dir, span: { start: 0, end: 0 } }, w, "exterior", ctx);
    // outer, clockwise: 0 top faces north. inner, counter-clockwise: 0 is the court's west
    // side, whose floor is to the west, so it faces east (into the court).
    expect(["north", "east", "south", "west"].map((d) => pick(ring(false), d as "north"))).toEqual([0, 1, 2, 3]);
    expect(["east", "north", "west", "south"].map((d) => pick(ring(true), d as "north"))).toEqual([0, 1, 2, 3]);

    // budget: the compass scan charges one step per vertex, one per segment and one more, and
    // `containing` one for its read plus one per segment and one more, BEFORE either runs.
    const box = ring(false);
    const lines = { top: 0, bottom: 3000, left: 0, right: 3000, cx: 1500, cy: 1500 };
    const withRoom = {
      ...ctx,
      datums: {
        ...ctx.datums,
        table: { ...ctx.datums.table, rooms: new Map([["r", lines]]) },
        read: (name: string) => (name === "r.left" ? 0 : undefined),
      },
    };
    const north = withStepMeter(0, () => pick(box, "north"));
    expect(north).toEqual({ value: 0, used: 4 + 4 + 1 });
    const cont = withStepMeter(0, () =>
      selectSegment({ kind: "containing", edge: "r.left", span: { start: 0, end: 0 } }, box, "exterior", withRoom),
    );
    expect(cont).toEqual({ value: 3, used: 1 + 4 + 1 });
    expect("signal" in withStepMeter(MAX_EVAL_STEPS - 8, () => pick(box, "north"))).toBe(true);
  });

  it("control: a selector and a DIFFERENT number are told apart", () => {
    const line = "furniture id=a wardrobe against wall w segment north offset 1500 size 1200x600 in r1";
    const wrong = plan(`${L_RING}  ${twin(line, 2).replace("offset 1500", "offset 1000")}`);
    expect(compile(plan(`${L_RING}  ${line}`)).svg).not.toBe(compile(wrong).svg);
  });
});

suite("refusals", () => {
  const refused = SEGMENT_SELECT_PLANS.find((p) => p[0] === "refused")![1];
  const diags = compile(refused).diagnostics;
  const byPiece = (needle: string) => diags.filter((d) => refused.slice(d.span!.start, d.span!.end).includes(needle));

  it("several matches: E_SEGMENT_SELECT on the selector, listing the candidates", () => {
    const d = diags.find((x) => x.message.startsWith("`segment east`"))!;
    expect(d.code).toBe("E_SEGMENT_SELECT");
    expect(d.message).toContain("matches 2 segments");
    expect(d.message).toContain("`segment 1`, `segment 3`");
    expect(refused.slice(d.span!.start, d.span!.end)).toBe("east");
  });

  it("no match: E_SEGMENT_SELECT, listing the straight segments", () => {
    const d = diags.find((x) => x.message.startsWith("`segment containing r3.top`"))!;
    expect(d.code).toBe("E_SEGMENT_SELECT");
    expect(d.message).toContain("matches no segment");
    expect(d.message).toContain("`segment 0`, `segment 1`, `segment 2`, `segment 3`, `segment 4`, `segment 5`");
    expect(refused.slice(d.span!.start, d.span!.end)).toBe("containing r3.top");
  });

  it("an open wall has no outward face", () => {
    const d = diags.find((x) => x.message.startsWith('`segment north`: wall "q" is open'))!;
    expect(d.code).toBe("E_SEGMENT_SELECT");
  });

  it("a centre line, a non-room and a polygon room are refused through the datum reader", () => {
    expect(byPiece("r1.cx").map((d) => d.code)).toEqual(["E_SEGMENT_SELECT"]);
    expect(byPiece("nope.top").map((d) => d.code)).toEqual(["E_UNKNOWN_REF"]);
    expect(byPiece("poly.top").map((d) => d.code)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
  });

  it("`dim radius` measures an arc, which no selector picks", () => {
    const d = diags.find((x) => x.message.startsWith("`dim radius arcw segment north`"))!;
    expect(d.code).toBe("E_SEGMENT_SELECT");
  });

  it("each refused piece raises exactly its one error, no follow-on E_FURN_AGAINST", () => {
    expect(diags.filter((d) => d.severity === "error").map((d) => d.code)).toEqual([
      "E_SEGMENT_SELECT",
      "E_SEGMENT_SELECT",
      "E_SEGMENT_SELECT",
      "E_SEGMENT_SELECT",
      "E_UNKNOWN_REF",
      "E_ROOM_NOT_RECTANGLE",
      "E_SEGMENT_SELECT",
    ]);
  });

  it("a compass word under `north right` or a bearing is E_DATUM_COMPASS", () => {
    for (const north of ["north right", "north 30"]) {
      const src = plan(
        `${L_RING}  furniture id=a wardrobe against wall w segment north size 1200x600 in r1`,
        `  ${north}\n`,
      );
      const ds = compile(src).diagnostics.filter((d) => d.severity === "error");
      expect(ds.map((d) => d.code)).toEqual(["E_DATUM_COMPASS"]);
      expect(src.slice(ds[0]!.span!.start, ds[0]!.span!.end)).toBe("north");
    }
  });

  it("a compass word inside a placed component is E_DATUM_COMPASS under every frame, `containing` is not", () => {
    const src = framed("furniture id=robe wardrobe against wall w segment west size 1200x600 in r");
    const ds = compile(src).diagnostics.filter((d) => d.severity === "error");
    expect(ds.map((d) => d.code)).toEqual(Array(8).fill("E_DATUM_COMPASS"));
    expect(ds[0]!.message).toContain('inside the placed component "unit"');
  });

  it("a compass word in `containing` keeps the datum rule: legal at the north-up root, refused in a component", () => {
    const root = plan(
      `${L_RING}  furniture id=a wardrobe against wall w segment containing r1.north size 1200x600 in r1`,
    );
    expect(codes(root)).toEqual([]);
    const inst = framed("furniture id=robe wardrobe against wall w segment containing r.west size 1200x600 in r");
    expect(new Set(codes(inst))).toEqual(new Set(["E_DATUM_COMPASS"]));
  });
});

suite("parse", () => {
  it("a variable named like a compass word is reached by parenthesising it", () => {
    const head = "  let east = 1\n";
    const v = plan(`${L_RING}  furniture id=a wardrobe against wall w segment (east) size 1200x600 in r1`, head);
    const n = plan(`${L_RING}  furniture id=a wardrobe against wall w segment 1      size 1200x600 in r1`, head);
    expectTwins(v, n);
    // bare, the word is the selector: east faces two segments of the L
    const bare = plan(`${L_RING}  furniture id=a wardrobe against wall w segment east size 1200x600 in r1`, head);
    expect(codes(bare)).toContain("E_SEGMENT_SELECT");
  });

  it("`containing` is a selector only before a dotted name, so a variable of that name still reads", () => {
    const head = "  let containing = 1\n";
    const v = plan(
      `${L_RING}  furniture id=a wardrobe against wall w segment containing offset 1500 size 1200x600 in r1`,
      head,
    );
    const n = plan(
      `${L_RING}  furniture id=a wardrobe against wall w segment 1          offset 1500 size 1200x600 in r1`,
      head,
    );
    expectTwins(v, n);
  });

  it("format keeps every selector, and parenthesises a compass-named variable", () => {
    const [, src] = SEGMENT_SELECT_PLANS.find((p) => p[0] === "ring")!;
    const out = format(src);
    for (const s of ["segment north", "segment west", "segment containing r1.right", "segment containing r1.left"])
      expect(out).toContain(s);
    expect(format(out)).toBe(out);
    const v = plan(
      `${L_RING}  furniture id=a wardrobe against wall w segment (east) size 1200x600 in r1`,
      "  let east = 1\n",
    );
    expect(format(v)).toContain("segment (east)");
    const dim = plan(
      "  wall id=arcw exterior thickness 200 { (0,0) arc (3000,0) radius 1500 }\n  dim radius arcw segment containing r.top",
    );
    expect(format(dim)).toContain("dim radius arcw segment containing r.top");
  });

  it("Plan JSON carries the selector as written and round-trips to the same drawing", () => {
    const [, src] = SEGMENT_SELECT_PLANS.find((p) => p[0] === "ring")!;
    const { json } = planToJson(src);
    const f = (json!.furniture ?? []).find((x) => x.id === "a")!;
    expect(f.segment).toBe(0);
    expect(f.segment_select).toBe("north");
    const back = planJsonToArch(json);
    expect(back.diagnostics).toEqual([]);
    expect(back.source).toContain("segment north");
    expect(back.source).toContain("segment containing r1.right");
    expect(compile(back.source!).svg).toBe(compile(src).svg);
  });

  it("Plan JSON refuses a `segment_select` that is not a selector", () => {
    const [, src] = SEGMENT_SELECT_PLANS.find((p) => p[0] === "ring")!;
    const { json } = planToJson(src);
    const bad = JSON.parse(JSON.stringify(json)) as { furniture: { segment_select?: string }[] };
    bad.furniture[0]!.segment_select = "north } wall";
    expect(planJsonToArch(bad).diagnostics.map((d) => d.code)).toContain("E_JSON_SCHEMA");
  });
});
