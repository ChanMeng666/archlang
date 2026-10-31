/**
 * The pair clauses of `walls from rooms` (ADR 0028 §3; card PS3.0 part C):
 * `open [id=] between A and B [width]` and `between A and B thickness t`.
 *
 *  - the pure derivation (`src/room-tiling.ts`): the clear span, the per-pair thickness, the
 *    refusals with the clause they name, the element-budget count and the step charge;
 *  - the statement through `compile()`/`describe()`/`lint()`: every refusal code on its clause,
 *    the derived opening as an ordinary opening (elements, access graph, `openings[]`), its id
 *    and `_derived` marker, `place`d instances, determinism;
 *  - the twins: an `open between` plan draws, describes and lints as the same plan with a
 *    hand-placed leaf-less opening across the clear span, and `between … thickness` draws as
 *    an authored partition of that thickness taking the run over (coexistence);
 *  - addressing: no lint message, hint or fix quotes a derived opening's id or edits the clause.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { withStepMeter } from "../src/expr.js";
import { drawUnits } from "../src/draw-budget.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { ResolvedPlan, ROpening } from "../src/ir.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { deriveWallsFromRooms, type TileRoom, type TileOptions } from "../src/room-tiling.js";

const plan = (body: string, grid = 1) => `plan "p" {\n  units mm\n  grid ${grid}\n${body}\n}\n`;
const R = (id: string, x: number, y: number, w: number, h: number): TileRoom => ({
  id,
  rect: { x0: x, y0: y, x1: x + w, y1: y + h },
});
const irOf = (src: string): ResolvedPlan => {
  const r = resolvePlan(src);
  if (!r.ir) throw new Error(r.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
  return r.ir;
};
const errors = (src: string) => compile(src).diagnostics.filter((d) => d.severity === "error");
const derive = (rooms: TileRoom[], opts: TileOptions, walls: Parameters<typeof deriveWallsFromRooms>[2] = []) => {
  const run = withStepMeter(0, () => deriveWallsFromRooms(rooms, [], walls, 100, undefined, { tExt: 200, ...opts }));
  if ("signal" in run) throw new Error("step budget");
  return { result: run.value, used: run.used };
};

/** a | b over c: a 4000x3000 and b 3000x3000 on top, c 7000x2000 below. */
const THREE = [R("a", 0, 0, 4000, 3000), R("b", 4000, 0, 3000, 3000), R("c", 0, 3000, 7000, 2000)];
const ROOMS =
  "  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 3000x3000 uses kitchen\n  room id=c at (0,3000) size 7000x2000 uses hall\n";
const DOORS =
  "  door id=d1 at (5500,5000) width 900 wall exterior hinge left swing in\n  door id=d2 at (2000,3000) width 800 wall partition hinge left swing in";
const stmt = (body: string) => `  walls from rooms exterior 200 partition 100 { ${body} }\n`;

// ------------------------------------------------------------------------------------------

suite("the derivation (src/room-tiling.ts)", () => {
  it("an `open` pair keeps its partition and spans the clear span: half the thickest meeting wall off each end", () => {
    const { result } = derive(THREE, { pairs: [{ kind: "open", a: "a", b: "b" }] });
    if (!result.ok) throw new Error("refused");
    const ab = result.walls.find((w) => w.name === "a|b")!;
    // the run x=4000, y 0..3000: the exterior ring (200) meets the top, a|c and b|c (100) the bottom
    expect(ab.pieces).toEqual([
      {
        name: "a|b",
        points: [
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
        ],
        closed: false,
      },
    ]);
    expect(ab.open).toEqual({ clause: 0, at: { x: 4000, y: 1525 }, width: 2850, whole: true });
    // with a width: centred on that clear span
    const w = derive(THREE, { pairs: [{ kind: "open", a: "b", b: "a", width: 900 }] }).result;
    expect(w.ok && w.walls.find((x) => x.name === "a|b")!.open).toEqual({
      clause: 0,
      at: { x: 4000, y: 1525 },
      width: 900,
    });
  });

  it("where walls of different thickness meet an end, the face is the thickest one's", () => {
    // a cross at (4000,3000): a|c meets it at 300 (overridden), b|c at 100
    const { result } = derive(THREE, {
      pairs: [
        { kind: "thickness", a: "a", b: "c", thickness: 300 },
        { kind: "open", a: "a", b: "b" },
      ],
    });
    expect(result.ok && result.walls.find((x) => x.name === "a|b")!.open).toEqual({
      clause: 1,
      at: { x: 4000, y: 1475 },
      width: 2750,
      whole: true,
    });
    // an authored wall meeting the end counts too
    const authored = derive(THREE, { pairs: [{ kind: "open", a: "a", b: "b" }] }, [
      { a: { x: 4000, y: 0 }, b: { x: 4000, y: -1000 }, wallId: "fin", thickness: 0 },
      { a: { x: 3000, y: 0 }, b: { x: 5000, y: 0 }, wallId: "beam", thickness: 600 },
    ]).result;
    expect(authored.ok && authored.walls.find((x) => x.name === "a|b")!.open!.width).toBe(3000 - 300 - 50);
  });

  it("`between … thickness` sets one partition's thickness, and the too-short test reads it", () => {
    const { result } = derive(THREE, { pairs: [{ kind: "thickness", a: "c", b: "b", thickness: 150 }] });
    expect(result.ok && result.walls.map((w) => [w.name, w.thickness])).toEqual([
      ["exterior", undefined],
      ["a|b", undefined],
      ["a|c", undefined],
      ["b|c", 150],
    ]);
    const short = derive([R("a", 0, 0, 1000, 1000), R("b", 1000, 0, 1000, 120)], {
      pairs: [{ kind: "thickness", a: "a", b: "b", thickness: 150 }],
    }).result;
    expect(!short.ok && short.refusals.map((r) => r.code)).toEqual(["E_PARTITION_TOO_SHORT"]);
  });

  it("refuses with the clause named: no shared run, an authored wall on an open run, a width past the clear span", () => {
    const apart = derive([...THREE, R("d", 7000, 0, 2000, 5000)], {
      pairs: [
        { kind: "thickness", a: "a", b: "b", thickness: 120 },
        { kind: "open", a: "a", b: "d" },
      ],
    }).result;
    expect(!apart.ok && apart.refusals).toEqual([
      expect.objectContaining({ code: "E_WALL_BETWEEN_NOT_ADJACENT", rooms: ["a", "d"], clause: 1 }),
    ]);
    const walled = derive(THREE, { pairs: [{ kind: "open", a: "a", b: "b" }] }, [
      { a: { x: 4000, y: 1000 }, b: { x: 4000, y: 2000 }, wallId: "p", thickness: 100 },
    ]).result;
    expect(!walled.ok && walled.refusals).toEqual([
      expect.objectContaining({ code: "E_WALL_BETWEEN_OPEN", rooms: ["a", "b"], clause: 0 }),
    ]);
    // 1 mm off the line is beside the run, not on it
    const beside = derive(THREE, { pairs: [{ kind: "open", a: "a", b: "b" }] }, [
      { a: { x: 4001, y: 1000 }, b: { x: 4001, y: 2000 }, wallId: "p", thickness: 100 },
    ]).result;
    expect(beside.ok).toBe(true);
    const wide = derive(THREE, { pairs: [{ kind: "open", a: "a", b: "b", width: 2851 }] }).result;
    expect(!wide.ok && wide.refusals).toEqual([
      expect.objectContaining({ code: "E_WALL_BETWEEN_WIDTH", rooms: ["a", "b"], clause: 0 }),
    ]);
    // a clear span of nothing: the meeting walls are thicker than the run is long
    const none = derive([R("a", 0, 0, 1000, 1000), R("b", 1000, 0, 1000, 200)], {
      tExt: 400,
      pairs: [{ kind: "open", a: "a", b: "b" }],
    }).result;
    expect(!none.ok && none.refusals.map((r) => r.code)).toEqual(["E_WALL_BETWEEN_WIDTH"]);
  });

  it("counts each derived opening toward the element budget, before anything is allocated", () => {
    const seen: number[] = [];
    const count = (pairs: TileOptions["pairs"]) => {
      withStepMeter(0, () =>
        deriveWallsFromRooms(
          THREE,
          [],
          [],
          100,
          (n) => {
            seen.push(n);
            return true;
          },
          { tExt: 200, pairs },
        ),
      );
      return seen.pop();
    };
    const plain = count([])!;
    expect(count([{ kind: "open", a: "a", b: "b" }])).toBe(plain + 1);
    expect(
      count([
        { kind: "open", a: "a", b: "b" },
        { kind: "open", a: "a", b: "c", width: 900 },
        { kind: "thickness", a: "b", b: "c", thickness: 150 },
      ]),
    ).toBe(plain + 2);
  });

  it("charges the clear-span work to the step meter: one step per wall segment indexed, one per end read", () => {
    const plain = derive(THREE, {}).used;
    const open = derive(THREE, { pairs: [{ kind: "open", a: "a", b: "b" }] }).used;
    // the face index holds the ring's 6 segments and 3 partitions; two ends are read
    expect(open - plain).toBeGreaterThanOrEqual(9 + 2);
  });
});

// ------------------------------------------------------------------------------------------

suite("the statement", () => {
  it("every refusal is a catalogued error on its clause (on the room name for E_WALL_BETWEEN_ROOM)", () => {
    const cases: Array<[string, string, string]> = [
      ["open between a and q", "E_WALL_BETWEEN_ROOM", "q"],
      ["between a and c thickness 150  open between c and a", "E_WALL_BETWEEN_DUP", "open between c and a"],
      ["open between a and b  open between b and a width 900", "E_WALL_BETWEEN_DUP", "open between b and a width 900"],
      [
        "between a and b thickness 120  between a and b thickness 150",
        "E_WALL_BETWEEN_DUP",
        "between a and b thickness 150",
      ],
      ["open between b and b", "E_WALL_BETWEEN_NOT_ADJACENT", "open between b and b"],
      ["open between a and b width 3000", "E_WALL_BETWEEN_WIDTH", "open between a and b width 3000"],
      ["between a and b thickness 0", "E_WALL_THICKNESS", "between a and b thickness 0"],
      ["open between a and b width -5", "E_OPENING_WIDTH", "open between a and b width -5"],
    ];
    for (const [body, code, at] of cases) {
      const src = plan(`${ROOMS}${stmt(body)}`);
      const d = errors(src);
      expect(
        d.map((x) => x.code),
        body,
      ).toEqual([code]);
      expect(src.slice(d[0]!.span!.start, d[0]!.span!.end), body).toBe(at);
    }
    for (const code of [
      "E_WALL_BETWEEN_ROOM",
      "E_WALL_BETWEEN_DUP",
      "E_WALL_BETWEEN_NOT_ADJACENT",
      "E_WALL_BETWEEN_OPEN",
      "E_WALL_BETWEEN_WIDTH",
    ])
      expect(ERROR_CATALOG[code], code).toBeDefined();
  });

  it("not adjacent: rooms apart, or touching only at a corner", () => {
    const src = plan(`${ROOMS}  room id=d at (7000,5000) size 1000x1000\n${stmt("open between b and d")}`);
    // d touches c only at a corner, so the tiling refuses too; the clause is judged on its own
    expect(errors(src).map((d) => d.code)).toContain("E_ROOMS_NOT_TILING");
    const sep = plan(`${ROOMS}  room id=d at (7000,0) size 2000x5000\n${stmt("open between a and d")}`);
    const d = errors(sep);
    expect(d.map((x) => x.code)).toEqual(["E_WALL_BETWEEN_NOT_ADJACENT"]);
    expect(d[0]!.message).toContain('"a" and "d" share no edge');
  });

  it("E_WALL_BETWEEN_ROOM: a polygon or circle room, an excepted room, a room of another group", () => {
    const poly = plan(
      `${ROOMS}  room id=p polygon (7000,0) (9000,0) (9000,5000) (8000,5000)\n  walls from rooms exterior 200 partition 100 { except p  open between b and p }\n`,
    );
    const d = errors(poly);
    expect(d.map((x) => x.code)).toEqual(["E_WALL_BETWEEN_ROOM"]);
    expect(poly.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("p");
    expect(d[0]!.message).toMatch(/polygon room/);
    const exc = plan(
      `${ROOMS}  room id=t at (7000,0) size 1000x1000\n${stmt("except t  between a and t thickness 150")}`,
    );
    expect(errors(exc).map((x) => x.code)).toEqual(["E_WALL_BETWEEN_ROOM"]);
    expect(errors(exc)[0]!.message).toMatch(/left out by `except`/);
    const inst =
      `plan "p" {\n  units mm\n  component unit() {\n    room id=a at (0,0) size 4000x3000\n    room id=b at (4000,0) size 3000x3000\n  }\n` +
      `  place unit() as west at (0,0)\n  room id=r at (0,3000) size 7000x2000\n  walls from rooms exterior 200 partition 100 { open between r and west.a }\n}\n`;
    // a root statement sees only the root's rooms (ADR 0016), so `west.a` is not one of them
    expect(errors(inst).map((x) => x.code)).toContain("E_WALL_BETWEEN_ROOM");
  });

  it("E_WALL_BETWEEN_OPEN: an authored wall on the open run, or a door, window or opening hosted on it", () => {
    const open = stmt("open between a and b");
    const cases = [
      "  wall partition thickness 100 { (4000,500) (4000,2500) }",
      "  door at (4000,1500) width 800 wall partition",
      "  window at (4000,1500) width 800 wall partition",
      "  opening at (4000,1500) width 800",
    ];
    for (const extra of cases) {
      const src = plan(`${ROOMS}${open}${extra}`);
      const d = errors(src).filter((x) => x.code === "E_WALL_BETWEEN_OPEN");
      expect(d.length, extra).toBe(1);
      expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("open between a and b");
    }
    // the same authored opening on another edge, and a wall 1 mm off the run, are fine
    expect(errors(plan(`${ROOMS}${open}  opening at (2000,3000) width 800`))).toEqual([]);
    expect(errors(plan(`${ROOMS}${open}  wall partition thickness 100 { (4001,500) (4001,2500) }`))).toEqual([]);
  });

  it("the derived opening is an ordinary opening: after the statement in elements, hosted on the voided partition", () => {
    const src = plan(`${ROOMS}${stmt("open between a and b")}${DOORS}`);
    const ir = irOf(src);
    expect(ir.elements.map((e) => e.id)).toEqual(["a", "b", "c", "walls_1", "a|b:open", "d1", "d2"]);
    const o = ir.elements.find((e) => e.id === "a|b:open") as ROpening;
    expect(o).toMatchObject({ kind: "opening", at: { x: 4000, y: 1525 }, width: 2850, head: 3000 });
    expect(o._derived).toEqual({ from: "rooms", between: ["a", "b"], idAuthored: false, written: ["a", "b"] });
    expect(o.host!.wallId).toBe("a|b");
    expect(src.slice(o.span!.start, o.span!.end)).toBe("open between a and b");
    // the partition is still derived, and the opening voids it
    expect(ir.walls.find((w) => w.id === "a|b")!.openings.map((x) => x.ownerId)).toEqual(["a|b:open"]);
    expect(describe(src).derived_walls!.map((r) => r.name)).toEqual(["exterior", "a|b", "a|c", "b|c"]);
    // it counts in the drawing budget as an opening does
    expect(drawUnits(o, BUILTIN_REGISTRY)).toBe(1);
    // an authored id is an ordinary author id
    const named = irOf(plan(`${ROOMS}${stmt("open id=ab between a and b")}`));
    expect((named.elements.find((e) => e.id === "ab") as ROpening)._derived!.idAuthored).toBe(true);
    // which no other element may take
    const dup = plan(`${ROOMS}${stmt("open id=d1 between a and b")}${DOORS}`);
    const d = errors(dup).filter((x) => x.code === "E_DUP_ID");
    expect(d.length).toBe(1);
    expect(dup.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("d1");
  });

  it("the open pair is a stated connection: an access edge, an `openings[]` row, no W_BOUNDARY_NO_WALL", () => {
    const src = plan(
      `${ROOMS}${stmt("open between a and b")}${DOORS.split("\n")[0]}\n  door id=d2 at (5500,3000) width 800 wall partition hinge left swing in`,
    );
    const facts = describe(src);
    expect(facts.openings).toEqual([{ id: "a|b:open", between: ["a", "b"], width: 2850 }]);
    const edge = facts.access.edges.find((e) => (e as { doorId: string }).doorId === "a|b:open")!;
    expect(edge).toMatchObject({ kind: "opening", between: ["a", "b"], hostWallId: "a|b" });
    // a reaches the entrance only through b: the opening is what connects it
    expect(facts.access.rooms.find((r) => r.id === "a")).toMatchObject({ reachable: true, depthFromEntrance: 3 });
    expect(lint(src).map((d) => d.code)).not.toContain("W_BOUNDARY_NO_WALL");
    expect(lint(src).map((d) => d.code)).not.toContain("W_OPENING_AT_JUNCTION");
    expect(lint(src).map((d) => d.code)).not.toContain("W_ROOM_UNREACHABLE");
  });

  it("`between … thickness` derives that partition at its own thickness", () => {
    const ir = irOf(plan(`${ROOMS}${stmt("between c and a thickness 150")}`));
    expect(ir.walls.map((w) => [w.id, w.thickness])).toEqual([
      ["exterior", 200],
      ["a|b", 100],
      ["a|c", 150],
      ["b|c", 100],
    ]);
  });

  it("a `place`d component derives its opening in its own frame, namespaced and carried with its host", () => {
    const src =
      `plan "p" {\n  units mm\n  component unit() {\n    room id=a at (0,0) size 4000x3000\n    room id=b at (4000,0) size 3000x3000\n` +
      `    walls from rooms exterior 200 partition 100 { open between a and b width 1000 }\n  }\n` +
      `  place unit() as west at (0,0)\n  place unit() as east at (20000,0) rotate 90 mirror x\n}\n`;
    const ir = irOf(src);
    const opens = ir.elements.filter((e): e is ROpening => e.kind === "opening");
    expect(opens.map((o) => [o.id, o.host!.wallId, o._derived!.between, o._instance])).toEqual([
      ["west.a|b:open", "west.a|b", ["west.a", "west.b"], "west"],
      ["east.a|b:open", "east.a|b", ["east.a", "east.b"], "east"],
    ]);
    // the west one sits mid-run on x = 4000; the east one rode the frame onto its turned host
    expect(opens[0]!.at).toEqual({ x: 4000, y: 1500 });
    const host = ir.walls.find((w) => w.id === "east.a|b")!;
    expect(host.points[0]!.y).toBe(host.points[1]!.y);
    expect(opens[1]!.at.y).toBe(host.points[0]!.y);
    expect(host.openings.map((x) => x.ownerId)).toEqual(["east.a|b:open"]);
  });

  it("is deterministic: the same source compiles, describes and lints to the same bytes", () => {
    const src = plan(`${ROOMS}${stmt("open between a and b  between a and c thickness 150")}${DOORS}`);
    expect(compile(src).svg).toBe(compile(src).svg);
    expect(JSON.stringify(describe(src))).toBe(JSON.stringify(describe(src)));
    expect(JSON.stringify(lint(src))).toBe(JSON.stringify(lint(src)));
  });
});

// ------------------------------------------------------------------------------------------

suite("twins (the swap-back law)", () => {
  const strip = (src: string) => lint(src).map(({ span: _s, fixes: _f, ...d }) => d);
  const twins: Array<[string, string, string]> = [
    [
      "open between (whole clear span)",
      plan(`  schedule openings\n${ROOMS}${stmt("open id=o between a and b")}${DOORS}`),
      plan(
        `  schedule openings\n${ROOMS}  walls from rooms exterior 200 partition 100\n  opening id=o at (4000,1525) width 2850 wall partition\n${DOORS}`,
      ),
    ],
    [
      "open between … width",
      plan(`  schedule openings\n${ROOMS}${stmt("open id=o between a and b width 900")}${DOORS}`),
      plan(
        `  schedule openings\n${ROOMS}  walls from rooms exterior 200 partition 100\n  opening id=o at (4000,1525) width 900 wall partition\n${DOORS}`,
      ),
    ],
  ];
  it.each(twins)("%s == a hand-placed leaf-less opening on the clear span: SVG, describe(), lint()", (_n, a, b) => {
    expect(compile(a).svg).toBe(compile(b).svg);
    expect(describe(a)).toEqual(describe(b));
    expect(strip(a)).toEqual(strip(b));
  });

  it("between … thickness == an authored partition of that thickness taking the run over: the drawing", () => {
    const a = plan(`${ROOMS}${stmt("between a and c thickness 150")}${DOORS}`);
    const b = plan(
      `${ROOMS}  wall id=p partition thickness 150 { (0,3000) (4000,3000) }\n  walls from rooms exterior 200 partition 100\n${DOORS}`,
    );
    expect(compile(a).svg).toBe(compile(b).svg);
    expect(strip(a)).toEqual(strip(b));
  });
});

// ------------------------------------------------------------------------------------------

suite("addressing: no lint text quotes a derived opening's id or edits its clause", () => {
  const BAD = plan(
    `  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 3000x3000 uses bedroom\n  room id=c at (0,3000) size 4000x2000 uses bath\n  room id=d at (4000,3000) size 3000x2000 uses kitchen\n` +
      `  room id=e at (7000,0) size 600x600 uses wc\n  room id=f at (7000,600) size 600x4400 uses storage\n` +
      `  dims auto all\n  walls from rooms exterior 200 partition 100 { open between a and b  open between a and c  open between b and d width 900  open between e and f width 400 }\n` +
      `  furniture bed at (4400,1200) size 1600x2000\n  furniture wc in c anchor bottom flush size 400x700`,
    50,
  );
  const clause = { start: BAD.indexOf("walls from rooms"), end: BAD.indexOf("furniture bed") };
  const quotes = (text: string) => /[a-f]\|[a-f]/.test(text);
  const textsOf = (d: ReturnType<typeof lint>[number]): string =>
    [
      d.message,
      ...(d.hints ?? []),
      ...(d.fixes ?? []).flatMap((f) => [f.title, ...f.edits.map((e) => e.newText)]),
      ...(d.relatedSpans ?? []).map((r) => r.message ?? ""),
    ].join("\n");

  it("the rules that name an opening reach the derived ones (non-vacuous), and name the clause", () => {
    const all = lint(BAD);
    const codes = new Set(all.map((d) => d.code));
    for (const c of ["W_WET_ROOM_DOOR", "W_OPENING_AT_JUNCTION"]) expect(codes).toContain(c);
    const texts = all.map(textsOf).join("\n");
    expect(texts).toContain("the `open between a and c` clause");
    expect(texts).toContain("the `open between e and f` clause");
  });

  it("no message, hint or fix of lint() or compile() quotes a derived opening's id or edits the statement", () => {
    for (const d of [...lint(BAD), ...compile(BAD).diagnostics]) {
      const text = textsOf(d);
      expect(quotes(text), `${d.code}: ${text}`).toBe(false);
      for (const f of d.fixes ?? [])
        for (const e of f.edits)
          expect(e.span.end <= clause.start || e.span.start >= clause.end, `${d.code} edits the statement`).toBe(true);
    }
    expect(quotes("write `door` in place of `opening` for a|c:open")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------
// Red team round 1 (PR #224)

suite("red team round 1", () => {
  const KWH =
    "  room id=k at (0,0) size 4000x3000 uses living\n  room id=w at (4000,0) size 3000x3000 uses kitchen\n  room id=h at (0,3000) size 7000x1200 uses hall\n  door at (5500,4200) width 900 wall exterior hinge left swing in\n";
  const junction = (src: string) => lint(src).filter((d) => d.code === "W_OPENING_AT_JUNCTION");

  it("S1: a derived jamb on the thickest meeting wall's face is that wall's pier, not a nib", () => {
    for (const cl of [
      "open between k and w  between w and h thickness 150",
      "open between k and w",
      "open between k and w  between k and h thickness 150",
    ]) {
      const src = plan(`${KWH}${stmt(cl)}`);
      expect(errors(src), cl).toEqual([]);
      expect(junction(src), cl).toEqual([]);
    }
    // non-vacuous: the same span placed by hand still leaves a 25 mm sliver beside the thinner
    // wall, and a hand-placed opening is held to the nib as before
    const src = plan(`${KWH}${stmt("open between k and w  between w and h thickness 150")}`);
    const o = irOf(src).elements.find((e) => e.id === "k|w:open") as ROpening;
    expect([o.at, o.width]).toEqual([{ x: 4000, y: 1512.5 }, 2825]);
    const hand = plan(
      `${KWH}${stmt("between w and h thickness 150")}  opening at (4000,1512.5) width 2825 wall partition`,
    );
    expect(junction(hand).length).toBe(1);
    expect(junction(hand)[0]!.message).toMatch(/25 mm from the face/);
  });

  it("S2: a hosted door is refused only where it overlaps the voided span; touching it is allowed", () => {
    const base = `${ROOMS}${stmt("open between a and b width 900")}`;
    // the opening spans y 1075..1975 on x = 4000
    const open = (extra: string) => errors(plan(`${base}${extra}`)).filter((d) => d.code === "E_WALL_BETWEEN_OPEN");
    expect(open("  door at (4000,600) width 800 wall partition")).toEqual([]);
    expect(open("  door at (4000,675) width 800 wall partition")).toEqual([]); // jamb touches at 1075
    expect(open("  door at (4000,676) width 800 wall partition").length).toBe(1);
    expect(open("  door at (4000,1100) width 800 wall partition").length).toBe(1);
    // a hand opening 1 mm off the run, hosted onto it by position
    expect(open("  opening at (4001,600) width 400").length).toBe(0);
    expect(open("  opening at (4001,1525) width 400").length).toBe(1);
  });

  it("N1: inside a component the hint quotes the clause as written, and names the component", () => {
    const src =
      `plan "p" {\n  units mm\n  grid 50\n  component m() {\n    room id=a at (0,0) size 4000x3000 uses living\n    room id=c at (0,3000) size 4000x2000 uses bath\n` +
      `    walls from rooms exterior 200 partition 100 { open between a and c }\n    door at (2000,0) width 900 wall exterior hinge left swing in\n  }\n` +
      `  place m() as m at (0,0)\n}\n`;
    const d = lint(src).find((x) => x.code === "W_WET_ROOM_DOOR")!;
    const text = (d.hints ?? []).join("\n");
    expect(text).toContain("the `open between a and c` clause in component `m`");
    expect(text).not.toContain("m.a and m.c");
  });
});
