/**
 * Openings by relation (ADR 0028 §5; card PS3.4):
 *
 *  - `door|opening … between <A> and <B> [at <pos>]` and `door|window|opening … on
 *    <room>.<edge> [at <pos>]`, with `<pos>` one of `center`, `<mm> from start|end`,
 *    `<mm> from <room>.<edge>`, `axis <label>` (offsets to the opening's centre);
 *  - the same datum positions on the existing `on <wall> at …` form;
 *  - the twins (swap-back law): a relational opening draws byte for byte as the same opening
 *    hand-placed on the same host, lints byte for byte as it whenever no hint moves it (a move
 *    hint quotes the relation, by design), and describes the same but for its `relation`, its
 *    `relational` placement and a `between` opening's `centreline_at`, which restates where it
 *    stands; a hosted datum offset equals its absolute twin in all three;
 *  - every refusal on its clause: E_OPENING_DATUM, E_OPENING_NO_SHARED_WALL,
 *    E_OPENING_HOST_AMBIGUOUS, E_OPENING_NIB (refused, never slid, naming the nearest legal
 *    position), E_WALL_BETWEEN_NOT_ADJACENT, E_WALL_BETWEEN_OPEN;
 *  - `place`d instances under rotate/mirror, and the widening drill.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import type { RDoor, ResolvedPlan, RRoom } from "../src/ir.js";
import { withStepMeter } from "../src/expr.js";
import { placeBetween } from "../src/opening-relation.js";
import { buildDatumTable } from "../src/room-datums.js";

const plan = (body: string, grid = 50) => `plan "p" {\n  units mm\n  grid ${grid}\n${body}\n}\n`;
const ROOMS = "  room id=a at (0,0) size 4000x5000 uses living\n  room id=b at (4000,0) size 4000x5000 uses bedroom\n";
const WALLS = "  walls from rooms exterior 200 partition 100\n";
const FRONT = "  door id=front at (1000,5000) width 900 wall exterior\n";
const P = (openings: string, extra = "") => plan(`${extra}${ROOMS}${WALLS}${FRONT}${openings}`);

const irOf = (src: string): ResolvedPlan => {
  const r = resolvePlan(src);
  if (!r.ir) throw new Error(r.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
  return r.ir;
};
const errors = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "error");
const strip = (src: string) => lint(src).map(({ span: _s, fixes: _f, ...d }) => d);
/** describe() with the relational marks taken out: what must equal the hand-placed twin. */
const plain = (src: string): unknown => {
  const d = JSON.parse(JSON.stringify(describe(src))) as Record<string, unknown> & {
    freedom: { openings: Record<string, number>; elements: Array<{ placement: string }> };
  };
  for (const k of ["doors", "windows", "openings"]) {
    for (const row of (d[k] as Array<Record<string, unknown>>) ?? []) {
      delete row.relation;
      delete row.centreline_at;
    }
  }
  const f = d.freedom;
  for (const e of f.elements) if (e.placement === "relational") e.placement = "TWIN";
  delete f.openings.relational;
  return d;
};
const twinPlain = (src: string, ids: string[]): unknown => {
  const d = JSON.parse(JSON.stringify(describe(src))) as {
    freedom: { openings: Record<string, number>; elements: Array<{ id: string; kind: string; placement: string }> };
  };
  for (const e of d.freedom.elements) if (ids.includes(e.id)) e.placement = "TWIN";
  d.freedom.openings.absolute! -= ids.filter((id) =>
    d.freedom.elements.some((e) => e.id === id && e.kind !== "room"),
  ).length;
  return d;
};

// ------------------------------------------------------------------------------------------

suite("parse and print", () => {
  it("round-trips every position form through `arch fmt`'s printer", async () => {
    const { format: formatSource } = await import("../src/format.js");
    const forms = [
      "door id=d between a and b at 800 from end width 800",
      "door id=d hinged between a and b at 1200 from a.top width 800 hinge left swing in",
      "opening id=o between a and b at center width 900",
      "door id=d between a and b at axis A width 800",
      "window id=w on b.top width 1500",
      "window id=w on b.right at 1200 from b.top width 1200 sill 600",
      "door id=d on a.left at 1500 from end width 900",
      "door id=d between a and b width 800",
    ];
    for (const f of forms) {
      const src = P(`  ${f}\n`);
      const once = formatSource(src);
      expect(once, f).toContain(f);
      expect(formatSource(once)).toBe(once);
    }
  });

  it("refuses `window … between` at parse, and keeps `at axis width` reading a binding", () => {
    expect(compile(P("  window between a and b at center width 900\n")).diagnostics[0]!.message).toContain(
      "not `between` two rooms",
    );
    // `axis` followed by `width` is a binding named axis, as before
    const src = plan(
      `  let axis = 4200\n${ROOMS}  wall id=w1 partition thickness 100 { (4000,0) (4000,5000) }\n  door id=d on w1 at axis width 800`,
    );
    expect(errors(src)).toEqual([]);
    expect((irOf(src).elements.find((e) => e.id === "d") as RDoor).at).toEqual({ x: 4000, y: 4200 });
  });
});

// ------------------------------------------------------------------------------------------

suite("twins (the swap-back law)", () => {
  const cases: Array<[string, string, string, string[]]> = [
    [
      "door between … from end",
      "  door id=d between a and b at 800 from end width 800 hinge left swing in\n",
      "  door id=d at (4000,4200) width 800 wall partition hinge left swing in\n",
      ["d"],
    ],
    [
      "door between … from a room edge",
      "  door id=d between b and a at 1200 from a.top width 800 swing into b\n",
      "  door id=d at (4000,1200) width 800 wall partition swing into b\n",
      ["d"],
    ],
    [
      "opening between … center",
      "  opening id=o between a and b at center width 1200\n",
      "  opening id=o at (4000,2500) width 1200 wall partition\n",
      ["o"],
    ],
    [
      "window on <room>.<edge> (default centre) and at center",
      "  window id=w1 on b.top width 1500\n  window id=w2 on a.top at center width 1500\n",
      "  window id=w1 at (6000,0) width 1500 wall exterior\n  window id=w2 at (2000,0) width 1500 wall exterior\n",
      ["w1", "w2"],
    ],
    [
      "window on … from a perpendicular edge",
      "  window id=w on b.right at 1200 from b.top width 1200\n",
      "  window id=w at (8000,1200) width 1200 wall exterior\n",
      ["w"],
    ],
    [
      "door on <room>.<edge> … from end",
      "  door id=d2 on a.left at 1500 from end width 900 swing into a\n",
      "  door id=d2 at (0,3500) width 900 wall exterior swing into a\n",
      ["d2"],
    ],
  ];
  it.each(cases)(
    "%s == the hand-placed opening on the same host: SVG, lint(); describe() but the relation",
    (_n, rel, abs, ids) => {
      const a = P(rel);
      const b = P(abs);
      expect(errors(a)).toEqual([]);
      expect(compile(a).svg).toBe(compile(b).svg);
      expect(strip(a)).toEqual(strip(b));
      expect(plain(a)).toEqual(twinPlain(b, ids));
    },
  );

  it("describe() states the relation as written and counts the opening `relational`", () => {
    const d = describe(P(cases[0]![1] + cases[4]![1]));
    expect(d.doors.find((x) => x.id === "d")!.relation).toBe("between a and b at 800 from end");
    expect(d.windows.find((x) => x.id === "w")!.relation).toBe("on b.right at 1200 from b.top");
    expect(d.freedom.openings).toEqual({ total: 3, attached: 0, absolute: 1, relational: 2 });
    // a plan with no relational opening has no `relational` key and no `relation`
    const none = describe(P(cases[0]![2]));
    expect("relational" in none.freedom.openings).toBe(false);
    expect(JSON.stringify(none)).not.toContain('"relation"');
  });

  it("a position measured along the run, not along the host: an authored partition drawn bottom-to-top", () => {
    // the run starts at its smaller-y end whatever way the authored host runs
    const host = "  wall id=w1 partition thickness 100 { (4000,5000) (4000,0) }\n";
    const a = plan(
      `${ROOMS}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n${host}  door id=d between a and b at 800 from start width 800\n`,
    );
    expect(errors(a)).toEqual([]);
    expect((irOf(a).elements.find((e) => e.id === "d") as RDoor).at).toEqual({ x: 4000, y: 800 });
    expect((irOf(a).elements.find((e) => e.id === "d") as RDoor).host!.wallId).toBe("w1");
  });
});

suite("hosted datum offsets on `on <wall> at …` (byte-identical to the absolute twin)", () => {
  const HOSTED = (pos: string, extra = "") =>
    plan(
      `${extra}${ROOMS}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n  wall id=w1 partition thickness 100 { (4000,0) (4000,5000) }\n  door id=d on w1 at ${pos} width 800\n`,
    );
  const AXES = "  axes {\n    x at 4000\n    y at 1000\n    y at 4000\n  }\n";
  it.each([
    ["800 from end", "4200", ""],
    ["800 from start", "800", ""],
    ["1200 from a.top", "1200", ""],
    ["300 from b.cy", null, ""],
    ["axis A", "4000", AXES],
    ["300 from end", "4700", AXES],
  ] as const)("`on w1 at %s`", (pos, twin, extra) => {
    const a = HOSTED(pos, extra);
    if (twin === null) {
      const e = errors(a);
      expect(e.map((d) => d.code)).toEqual(["E_OPENING_DATUM"]);
      expect(e[0]!.message).toContain("centre line");
      return;
    }
    const b = HOSTED(twin, extra);
    expect(errors(a)).toEqual([]);
    expect(compile(a).svg).toBe(compile(b).svg);
    expect(describe(a)).toEqual(describe(b));
    expect(strip(a)).toEqual(strip(b));
  });

  it("refuses a datum that does not cross the wall at exactly one point", () => {
    const ring = plan(
      `${ROOMS}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n  door id=d on shell at 600 from b.left width 800\n`,
    );
    expect(errors(ring)[0]!.message).toContain("at 2 points");
    const along = plan(
      `${ROOMS}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n  wall id=w1 partition thickness 100 { (4000,0) (4000,5000) }\n  door id=d on w1 at 600 from b.left width 800\n`,
    );
    expect(errors(along)[0]!.message).toContain("runs along");
    const noAt = plan(
      `${ROOMS}  wall id=w1 partition thickness 100 { (4000,0) (4000,5000) }\n  door id=d on w1 width 800\n`,
    );
    expect(errors(noAt).length).toBeGreaterThan(0); // `at` is still required on a wall
  });

  it("is not nib-refused: it warns, as its absolute twin does", () => {
    const a = HOSTED("100 from start");
    expect(errors(a)).toEqual([]);
    expect(lint(a).map((d) => d.code)).toContain("W_OPENING_AT_JUNCTION");
    expect(strip(a)).toEqual(strip(HOSTED("100")));
  });
});

// ------------------------------------------------------------------------------------------

suite("refusals, each spanned on its clause", () => {
  const one = (src: string, code: string, spanText: string) => {
    const e = errors(src);
    expect(
      e.map((d) => d.code),
      JSON.stringify(e.map((d) => d.message)),
    ).toEqual([code]);
    expect(src.slice(e[0]!.span!.start, e[0]!.span!.end)).toBe(spanText);
    return e[0]!;
  };

  it("E_OPENING_NIB: refused, never slid, naming the nearest legal position", () => {
    const d = one(
      P("  door id=d between a and b at 400 from start width 800\n"),
      "E_OPENING_NIB",
      "between a and b at 400 from start",
    );
    expect(d.message).toContain("refused, not moved");
    expect(d.hints![0]).toContain("`between a and b at 600 from start`");
    // the named position is legal
    expect(errors(P("  door id=d between a and b at 600 from start width 800\n"))).toEqual([]);
    expect(errors(P("  door id=d between a and b at 550 from start width 800\n")).map((x) => x.code)).toEqual([
      "E_OPENING_NIB",
    ]);
    // measured from the end the author wrote
    const end = one(
      P("  door id=d between a and b at 300 from end width 800\n"),
      "E_OPENING_NIB",
      "between a and b at 300 from end",
    );
    expect(end.hints![0]).toContain("at 600 from end`");
    // no IR element is moved: the refused door stands nowhere
    expect(resolvePlan(P("  door id=d between a and b at 400 from start width 800\n")).ir).toBeFalsy();
  });

  it("E_OPENING_NIB at a tee: a partition meeting the run inside the span", () => {
    const tee = plan(
      `  room id=a at (0,0) size 4000x5000\n  room id=b at (4000,0) size 4000x2500\n  room id=c at (4000,2500) size 4000x2500\n${WALLS}  door id=d between a and b at center width 800\n  door id=e between a and c at 2000 from start width 800\n`,
    );
    // a|b runs y 0..2500 (centre 1250 fine); a|c y 2500..5000, 2000 from start → y 4500, span 4100–4900 vs the ring's face 4900
    const e = errors(tee);
    expect(e.map((d) => d.code)).toEqual(["E_OPENING_NIB"]);
    expect(e[0]!.hints![0]).toContain("from start");
  });

  it("a cased opening may stand flush with a meeting wall's face (the lint's exemption); a door may not", () => {
    // run y 0..5000; ring face at 100 and 4900: a 4800 opening fills the clear span
    expect(errors(P("  opening id=o between a and b at center width 4800\n"))).toEqual([]);
    expect(errors(P("  door id=d between a and b at center width 4800\n")).map((d) => d.code)).toEqual([
      "E_OPENING_NIB",
    ]);
  });

  it("E_OPENING_DATUM: no position, a bare number, a parallel edge, an edge off the run's ends, an axis", () => {
    one(P("  door id=d between a and b width 800\n"), "E_OPENING_DATUM", "between a and b");
    one(P("  opening id=o between a and b width 800\n"), "E_OPENING_DATUM", "between a and b");
    one(P("  door id=d between a and b at 1200 width 800\n"), "E_OPENING_DATUM", "between a and b at 1200");
    one(P("  door id=d between a and b at 40% width 800\n"), "E_OPENING_DATUM", "between a and b at 40%");
    one(P("  door id=d between a and b at 300 from a.left width 800\n"), "E_OPENING_DATUM", "a.left");
    one(P("  door id=d between a and b at 300 from a.cy width 800\n"), "E_OPENING_DATUM", "a.cy");
    one(P("  door id=d on a.left width 900\n"), "E_OPENING_DATUM", "on a.left");
    const AX = "  axes {\n    x at 2000\n    y at 1000\n  }\n";
    one(P("  door id=d between a and b at axis 1 width 800\n", AX), "E_OPENING_DATUM", "1");
    one(P("  door id=d between a and b at axis C width 800\n", AX), "E_OPENING_DATUM", "C");
    expect(errors(P("  door id=d between a and b at axis A width 800\n", AX))).toEqual([]);
    // an edge meeting the run away from its ends
    const tee = plan(
      `  room id=a at (0,0) size 4000x5000\n  room id=b at (4000,0) size 4000x2500\n  room id=c at (4000,2500) size 4000x2500\n${WALLS}  door id=d between a and b at 600 from c.bottom width 800\n`,
    );
    one(tee, "E_OPENING_DATUM", "c.bottom");
  });

  it("the datum refusals of a room name (E_UNKNOWN_REF, E_ROOM_NOT_RECTANGLE), on the name", () => {
    one(P("  door id=d between a and zz at center width 800\n"), "E_UNKNOWN_REF", "zz");
    const poly = plan(
      `${ROOMS}  room id=p polygon (8000,0) (9000,0) (9000,1000)\n  door id=d between b and p at center width 800\n`,
    );
    one(poly, "E_ROOM_NOT_RECTANGLE", "p");
  });

  it("a room `between` cannot read is said in the words of the line, never as a datum it did not write", () => {
    const unknown = one(P("  door id=d between a and nosuch at center width 800\n"), "E_UNKNOWN_REF", "nosuch");
    expect(unknown.message).toBe('Door "d" names "nosuch", which is not a room this plan or component can see');
    expect(unknown.hints).toBeUndefined();
    // A near miss still gets its suggestion, as the room, and the suggestion resolves.
    const typo = one(P("  opening id=o between a and bb at center width 800\n"), "E_UNKNOWN_REF", "bb");
    expect(typo.message).toBe('Opening "o" names "bb", which is not a room this plan or component can see');
    expect(typo.hints).toEqual(['did you mean "b"?']);
    expect(errors(P("  opening id=o between a and b at center width 800\n"))).toEqual([]);
    const unplaced = plan(
      `  room id=a at (0,0) size 4000x5000\n  room id=b right-of ghost size 4000x5000\n${WALLS}  door id=d between a and b at center width 800\n`,
    );
    const [d] = errors(unplaced).filter((x) => x.code === "E_DATUM_UNPLACED");
    expect(d!.message).toBe('Door "d" names "b", a room that could not be placed (its own error says why)');
    const flat = plan(`${ROOMS}  room id=z at (8000,0) size 0x5000\n  door id=d between b and z at center width 800\n`);
    const [f] = errors(flat).filter((x) => x.code === "E_DATUM_UNPLACED");
    expect(f!.message).toBe('Door "d" names "z", a room with no positive size');
    for (const x of [unknown, typo, d!, f!]) expect(`${x.message} ${x.hints ?? ""}`).not.toMatch(/\.top/);
  });

  it("a datum the author did write keeps its own words", () => {
    const d = one(P("  door id=d between a and b at 600 from nosuch.top width 800\n"), "E_UNKNOWN_REF", "nosuch.top");
    expect(d.message).toContain("`nosuch.top`");
  });

  it("E_WALL_BETWEEN_NOT_ADJACENT: no shared run, or one room twice", () => {
    const three = plan(
      `${ROOMS}  room id=c at (8000,0) size 2000x5000\n${WALLS}  door id=d between a and c at center width 800\n`,
    );
    one(three, "E_WALL_BETWEEN_NOT_ADJACENT", "between a and c at center");
    one(
      P("  door id=d between a and a at center width 800\n"),
      "E_WALL_BETWEEN_NOT_ADJACENT",
      "between a and a at center",
    );
  });

  it("E_OPENING_NO_SHARED_WALL: no wall on the run; a partition on a window's edge", () => {
    const bare = plan(
      `${ROOMS}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n  door id=d between a and b at center width 800\n`,
    );
    one(bare, "E_OPENING_NO_SHARED_WALL", "between a and b at center");
    one(P("  window id=w on a.right width 1200\n"), "E_OPENING_NO_SHARED_WALL", "on a.right");
  });

  it("E_OPENING_HOST_AMBIGUOUS: an authored span beside a derived remainder; two exterior runs on one edge", () => {
    const half = P("  door id=d between a and b at 600 from end width 800\n", "");
    const withHalf = half.replace(WALLS, `  wall id=half partition thickness 100 { (4000,0) (4000,2500) }\n${WALLS}`);
    one(withHalf, "E_OPENING_HOST_AMBIGUOUS", "between a and b at 600 from end");
    // a narrow room centred above a wide one: the wide room's top edge has two exterior runs
    const narrow = plan(
      `  room id=w at (0,3000) size 9000x3000\n  room id=n at (3000,0) size 3000x3000\n${WALLS}  window id=x on w.top width 900\n`,
    );
    one(narrow, "E_OPENING_HOST_AMBIGUOUS", "on w.top");
  });

  it("E_WALL_BETWEEN_OPEN: a door between a pair the statement declares open, with the clause related", () => {
    const src = plan(
      `${ROOMS}  walls from rooms exterior 200 partition 100 { open between a and b width 900 }\n  door id=d between a and b at 800 from end width 800\n`,
    );
    const d = one(src, "E_WALL_BETWEEN_OPEN", "between a and b at 800 from end");
    expect(src.slice(d.relatedSpans![0]!.span.start, d.relatedSpans![0]!.span.end)).toBe(
      "open between a and b width 900",
    );
  });

  it("every code is catalogued", async () => {
    const { ERROR_CATALOG } = await import("../src/error-catalog.js");
    for (const c of ["E_OPENING_DATUM", "E_OPENING_NO_SHARED_WALL", "E_OPENING_HOST_AMBIGUOUS", "E_OPENING_NIB"]) {
      expect(ERROR_CATALOG[c as keyof typeof ERROR_CATALOG], c).toBeDefined();
    }
  });
});

// ------------------------------------------------------------------------------------------

suite("instances and the widening drill", () => {
  const comp = (door: string) =>
    `plan "p" {\n  units mm\n  grid 50\n  component unit() {\n    room id=a at (0,0) size 4000x5000 uses living\n    room id=b at (4000,0) size 4000x5000 uses bedroom\n    walls from rooms exterior 200 partition 100\n    ${door}\n  }\n` +
    [0, 90, 180, 270]
      .flatMap((r, i) => [
        `  place unit() as r${r} at (${i * 20000},0) rotate ${r}\n`,
        `  place unit() as m${r} at (${i * 20000},20000) rotate ${r} mirror x\n`,
      ])
      .join("") +
    "}\n";
  it("a relational door and window inside a placed component, under all eight frames, equal the hand-placed twins", () => {
    const a = comp(
      "door id=d between a and b at 800 from end width 800 hinge left swing into b\n    window id=w on b.top at 1000 from b.left width 1200",
    );
    const b = comp(
      "door id=d at (4000,4200) width 800 wall partition hinge left swing into b\n    window id=w at (5000,0) width 1200 wall exterior",
    );
    expect(errors(a)).toEqual([]);
    expect(compile(a).svg).toBe(compile(b).svg);
    expect(strip(a)).toEqual(strip(b));
    const rows = describe(a).doors.map((d) => [d.id, d.relation]);
    expect(rows).toContainEqual(["r90.d", "between a and b at 800 from end"]);
    expect(rows).toHaveLength(8);
  });

  const widen = (aw: number, door: string) =>
    plan(
      `  room id=a at (0,0) size ${aw}x5000 label "Living"\n  room id=b right-of a align top gap 0 size 4000x5000 label "Bed"\n${WALLS}  door id=front at (1000, 5000) width 900 wall exterior\n  ${door}\n  window id=w on b.top width 1500\n`,
    );
  it("widening a room by 500 mm moves the door with its wall and keeps its offset from the named end", () => {
    const door = "door id=d between a and b at 800 from end width 800 hinge left swing into b";
    const before = irOf(widen(4000, door));
    const after = irOf(widen(4500, door));
    const at = (ir: ResolvedPlan, id: string) => (ir.elements.find((e) => e.id === id) as RDoor).at;
    expect(at(before, "d")).toEqual({ x: 4000, y: 4200 });
    expect(at(after, "d")).toEqual({ x: 4500, y: 4200 });
    expect(at(before, "w")).toEqual({ x: 6000, y: 0 });
    expect(at(after, "w")).toEqual({ x: 6500, y: 0 });
    // the widened relational plan draws as the widened plan with every moved literal edited by hand
    const hand = widen(4500, "door id=d at (4500,4200) width 800 wall partition hinge left swing into b").replace(
      "window id=w on b.top width 1500",
      "window id=w at (6500,0) width 1500 wall exterior",
    );
    expect(compile(widen(4500, door)).svg).toBe(compile(hand).svg);
    for (const src of [widen(4000, door), widen(4500, door)]) expect(errors(src)).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------

suite("bounded: the run scan is charged to the step meter before it runs", () => {
  it("charges at least one step per wall and per wall point read", () => {
    const ir = irOf(P(""));
    const table = buildDatumTable(
      ir.elements.filter((e): e is RRoom => e.kind === "room"),
      undefined,
    );
    const between = {
      a: { id: "a", span: { start: 0, end: 1 } },
      b: { id: "b", span: { start: 0, end: 1 } },
      pos: { kind: "center" as const },
      span: { start: 0, end: 1 },
    };
    const used = (extra: number): number => {
      const stubs = Array.from({ length: extra }, (_, k) => ({
        ...ir.walls[0]!,
        id: `s${k}`,
        points: [
          { x: 20000 + k * 10, y: 0 },
          { x: 20000 + k * 10, y: 5 },
        ],
        closed: false,
      }));
      const run = withStepMeter(0, () =>
        placeBetween(
          between,
          "door",
          800,
          {
            grid: 50,
            walls: [...ir.walls, ...stubs],
            snapPt: (p) => p,
            diag: () => {},
            eval: () => 0,
            datums: { table, read: () => 0 },
          },
          'Door "d"',
        ),
      );
      if ("signal" in run) throw new Error("step budget");
      expect(run.value).not.toBeNull();
      return run.used;
    };
    // 100 more two-point walls: the body scan (a wall and its 2 points each) and the junction
    // scan (one segment each) are both paid for
    expect(used(100) - used(0)).toBeGreaterThanOrEqual(100 * 4);
  });
});

// ------------------------------------------------------------------------------------------

suite("addressing: a hint about a relational opening quotes the relation, never an internal id", () => {
  const texts = (src: string): string =>
    [...lint(src), ...compile(src).diagnostics]
      .flatMap((d) => [
        d.message,
        ...(d.hints ?? []),
        ...(d.fixes ?? []).flatMap((f) => [f.title, ...f.edits.map((e) => e.newText)]),
      ])
      .join("\n");

  it("W_OPENING_OVERLAP's move hints quote `between a and b at … from start` (non-vacuous)", () => {
    const src = P(
      "  door id=d between a and b at 1000 from start width 800 hinge left swing in\n  door id=e between a and b at 1500 from start width 800 hinge right swing out\n",
    );
    const codes = lint(src).map((d) => d.code);
    expect(codes).toContain("W_OPENING_OVERLAP");
    const t = texts(src);
    expect(t).toMatch(/`between a and b at \d+ from start`/);
    expect(t).not.toMatch(/a\|b|on a\|b|exterior#/);
  });

  it("a move hint keeps the anchor the author wrote (`from end`, `from <room>.<edge>`)", () => {
    for (const [at, re] of [
      ["3500 from end", /`between a and b at \d+ from end`/],
      ["1500 from a.top", /`between a and b at \d+ from a\.top`/],
      ["3500 from a.bottom", /`between a and b at \d+ from a\.bottom`/],
    ] as const) {
      const src = P(
        `  door id=d between a and b at 1000 from start width 800 hinge left swing in\n  door id=e between a and b at ${at} width 800 hinge right swing out\n`,
      );
      expect(
        lint(src).map((d) => d.code),
        at,
      ).toContain("W_OPENING_OVERLAP");
      expect(texts(src), at).toMatch(re);
    }
  });

  it("a relational door's hinge-flip fix re-emits the relational statement", () => {
    const src = P("  door id=d between a and b at 1000 from start width 800 hinge left swing in\n");
    const ir = irOf(src);
    const d = ir.elements.find((e) => e.id === "d") as RDoor;
    expect(d._flipHingeText).toBe("door id=d between a and b at 1000 from start width 800 hinge right swing in");
  });
});
