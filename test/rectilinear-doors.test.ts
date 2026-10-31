/**
 * `door|opening between` on a rectilinear `room polygon` (issue #363, card L2; ADR 0028 §5 as
 * amended). The run search reads the two rooms' rings. One run: every position, as for two
 * rectangles. Several: the position must pick one, and only `<mm> from <room>.<edge>` can; every
 * other position refuses, and the diagnostic carries the fix.
 *
 * What is here: the positions, each compared with the same door on the two-rectangle plan; every
 * refusal, with each quoted fix compiled; the message that used to name `liv.top`; the lint hint;
 * the `open between` hint; what follows from a derived door (the access graph, `describe`, the
 * schedule, DXF, Plan JSON, `impact`, a reflex corner); the budgets. The byte-identity law for
 * every other plan is `test/rectilinear-rooms-byte-identity.test.ts`, the D4 and cell oracles
 * `test/rectilinear-rooms.test.ts`.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, lint, planJsonToArch, planToJson, resolvePlan, toDxf } from "../src/index.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { impact } from "../src/impact.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { link } from "../src/import.js";
import { relationalClause } from "../src/opening-relation.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { ringParts, runPicks, sharedRuns, type TileRoom } from "../src/room-tiling.js";
import { NULL_WORLD } from "../src/world.js";
import { BED, INTERLOCKED_PLAN, L_RING, RECTILINEAR_PLANS, STATEMENT, U_PLAN } from "./rectilinear-rooms-plans.js";

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;
const LIV = `  room id=liv polygon ${L_RING} label "Living" uses living`;
const BATH = '  room id=bath at (6000,0) size 2000x3000 label "Bath" uses bath';
const DIN = '  room id=din at (6000,0) size 3000x3000 label "Dining" uses dining';
const onL = (line: string, extra = ""): string => plan(`${LIV}\n${BED}\n${extra}${STATEMENT}\n  ${line}`);
const door = (at: string): string => onL(`door id=d between liv and bed ${at} width 800 swing into bed`);

const errors = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
const codes = (src: string): string[] => errors(src).map((d) => d.code!);
const irOf = (src: string) => {
  const ir = resolvePlan(src).ir;
  if (!ir) throw new Error(`the plan must resolve: ${JSON.stringify(errors(src).map((d) => d.message))}`);
  return ir;
};
const el = (src: string, id: string) => {
  const e = irOf(src).elements.find((x) => x.id === id);
  if (!e || (e.kind !== "door" && e.kind !== "opening")) throw new Error(`no opening "${id}"`);
  return e;
};
const placed = (src: string, id = "d") => {
  const d = el(src, id);
  return { at: d.at, width: d.width, host: d.host?.wallId };
};

/** The hints' quoted positions: each `` `between … at <pos>` `` as the `at <pos>` it would write. */
const quoted = (hints: readonly string[] | undefined): string[] =>
  (hints ?? []).flatMap((h) => [...h.matchAll(/`(?:between \S+ and \S+ )?(at [^`]+)`/g)].map((m) => m[1]!));

suite("a pair with one run: as two rectangles", () => {
  // The L and the room beside its top arm, against the same room beside a rectangle in its place.
  const asL = (line: string): string => plan(`${LIV}\n${BED}\n${DIN}\n${STATEMENT}\n  ${line}`);
  const asRects = (line: string): string =>
    plan(
      `  room id=a at (0,0) size 6000x3000\n  room id=b at (0,3000) size 3000x3000\n${BED}\n${DIN}\n${STATEMENT}\n  ${line.replaceAll("liv", "a")}`,
    );

  it.each([["center"], ["700 from start"], ["700 from end"], ["700 from din.top"], ["700 from din.bottom"]])(
    "`at %s` lands where it lands on a rectangle",
    (at) => {
      const line = `door id=d between liv and din at ${at} width 800 swing into din`;
      expect(codes(asL(line))).toEqual([]);
      const a = el(asL(line), "d");
      const b = el(asRects(line), "d");
      expect([a.at, a.width, a.kind === "door" && a.hinge, a.kind === "door" && a.swing]).toEqual([
        b.at,
        b.width,
        b.kind === "door" && b.hinge,
        b.kind === "door" && b.swing,
      ]);
      expect(a.host?.wallId).toBe("liv|din");
    },
  );

  it("`at axis` reads the axis across the run", () => {
    const axes = "  axes {\n    y at 1000\n  }\n";
    const src = plan(
      `${axes}${LIV}\n${BED}\n${DIN}\n${STATEMENT}\n  door id=d between liv and din at axis A width 800`,
    );
    expect(placed(src).at).toEqual({ x: 6000, y: 1000 });
  });

  it("the rooms may be written in either order, and the relation stays as written", () => {
    const src = asL("door id=d between din and liv at 700 from start width 800");
    expect(placed(src).host).toBe("liv|din");
    expect(describe(src).doors[0]!.relation).toBe("between din and liv at 700 from start");
  });

  it("a four-cornered polygon is a run of its own, and a rectangle is not asked for its ring", () => {
    const src = plan(
      `  room id=a polygon (0,0) (4000,0) (4000,3000) (0,3000)\n  room id=b at (4000,0) size 3000x3000\n${STATEMENT}\n  door id=d between a and b at center width 800`,
    );
    expect(placed(src)).toEqual({ at: { x: 4000, y: 1500 }, width: 800, host: "a|b" });
  });
});

suite("a pair with several runs: the position picks one", () => {
  it.each([
    ["1500 from bed.top", { x: 3000, y: 4500 }, "liv|bed"],
    ["1000 from bed.bottom", { x: 3000, y: 5000 }, "liv|bed"],
    ["1500 from bed.left", { x: 4500, y: 3000 }, "liv|bed#2"],
    ["1000 from bed.right", { x: 5000, y: 3000 }, "liv|bed#2"],
  ])("`at %s`", (at, want, host) => {
    expect(codes(door(`at ${at}`))).toEqual([]);
    expect(placed(door(`at ${at}`))).toEqual({ at: want, width: 800, host });
  });

  it("each lands where the same door lands on the rectangle that holds that run", () => {
    // The L as two rectangles: `b` holds the run on x 3000, `a` the run on y 3000.
    const rects = (line: string): string =>
      plan(
        `  room id=a at (0,0) size 6000x3000\n  room id=b at (0,3000) size 3000x3000\n${BED}\n${STATEMENT}\n  ${line}`,
      );
    for (const [other, at] of [
      ["b", "1200 from bed.top"],
      ["a", "1200 from bed.left"],
    ] as const) {
      const a = el(door(`at ${at}`), "d");
      const b = el(rects(`door id=d between ${other} and bed at ${at} width 800 swing into bed`), "d");
      if (a.kind !== "door" || b.kind !== "door") throw new Error("doors");
      expect([a.at, a.hinge, a.swing, a.host?.a, a.host?.b]).toEqual([b.at, b.hinge, b.swing, b.host?.a, b.host?.b]);
    }
  });

  it("an edge of a third room picks a run by the same rule", () => {
    // The bath's bottom edge is on y 3000, not meeting the run on x 3000; a room below does.
    const src = plan(
      `  room id=c polygon (0,0) (6000,0) (6000,6000) (4000,6000) (4000,3000) (2000,3000) (2000,6000) (0,6000) uses living\n  room id=d at (2000,3000) size 2000x3000 uses bedroom\n  room id=e at (0,6000) size 6000x2000 uses hall\n${STATEMENT}\n  door id=x between c and d at 1500 from e.top width 800`,
    );
    // `e.top` is the bottom end of both side runs at once: two runs, so it says neither.
    expect(codes(src)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    const other = plan(
      `  room id=c polygon (0,0) (6000,0) (6000,3000) (2000,3000) (2000,6000) (0,6000) uses living\n  room id=d at (2000,3000) size 2000x3000 uses bedroom\n  room id=e at (4000,3000) size 2000x3000 uses hall\n${STATEMENT}\n  door id=x between c and d at 1000 from e.left width 800`,
    );
    expect(placed(other, "x")).toEqual({ at: { x: 3000, y: 3000 }, width: 800, host: "c|d#2" });
  });

  it("an opening picks the same way", () => {
    const src = onL("opening id=o between liv and bed at 1500 from bed.left width 900");
    expect(placed(src, "o")).toEqual({ at: { x: 4500, y: 3000 }, width: 900, host: "liv|bed#2" });
  });

  it("the runs are read in the order the walls number them", () => {
    const ring = ringParts(
      L_RING.match(/\(\d+,\d+\)/g)!.map((p) => ({ x: +p.split(/[(,)]/)[1]!, y: +p.split(/[(,)]/)[2]! })),
    )!;
    const got = sharedRuns({ id: "liv", parts: ring }, { id: "bed", rect: { x0: 3000, y0: 3000, x1: 6000, y1: 6000 } });
    if (!got.ok) throw new Error("refused");
    expect(got.runs).toEqual([
      { vertical: true, c: 3000, r0: 3000, r1: 6000 },
      { vertical: false, c: 3000, r0: 3000, r1: 6000 },
    ]);
  });
});

suite("a position that picks no run is refused, and the diagnostic carries the fix", () => {
  const WORDS: [string, string][] = [
    ["at center", "`at center` does not say which"],
    ["at 600 from start", "`at 600 from start` does not say which"],
    ["at 600 from end", "`at 600 from end` does not say which"],
    ["at 800", "`at 800` does not say which"],
    ["at 30%", "`at 30%` does not say which"],
    ["", "no position says which"],
  ];

  it.each(WORDS)("`%s` names both runs and what picks each", (at, says) => {
    const d = errors(door(at));
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    expect(d[0]!.message).toContain('"liv" and "bed" share 2 edges');
    expect(d[0]!.message).toContain("on x 3000, y 3000–6000");
    expect(d[0]!.message).toContain("on y 3000, x 3000–6000");
    expect(d[0]!.message).toContain(says);
    expect(d[0]!.hints).toEqual([
      "`between liv and bed at 1500 from bed.top` stands on the edge on x 3000, y 3000–6000.",
      "`between liv and bed at 1500 from bed.left` stands on the edge on y 3000, x 3000–6000.",
    ]);
  });

  it("`at axis` is a refusal too, though an axis crosses one run: it is not a word that picks", () => {
    const axes = "  axes {\n    x at 4000\n  }\n";
    const d = errors(onL("door id=d between liv and bed at axis 1 width 800", axes));
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
  });

  it("the position each hint quotes compiles, and lands on the run the hint names", () => {
    const hints = errors(door("at center"))[0]!.hints;
    const fixes = quoted(hints);
    expect(fixes).toEqual(["at 1500 from bed.top", "at 1500 from bed.left"]);
    expect(placed(door(fixes[0]!)).host).toBe("liv|bed");
    expect(placed(door(fixes[1]!)).host).toBe("liv|bed#2");
  });

  it("a U: the neighbour's sides pick the middle run, and its top meets both side runs", () => {
    const u = (at: string): string =>
      U_PLAN.replace(/\n\}\n$/, `\n  door id=d between u and core ${at} width 800\n}\n`);
    expect(placed(u("at 1500 from core.left")).host).toBe("u|core#2");
    expect(placed(u("at 1500 from core.right")).host).toBe("u|core#2");
    const d = errors(u("at 1500 from core.top"));
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    expect(d[0]!.message).toContain("`core.top` meets 2 of them at an end");
    const all = errors(u("at center"))[0]!;
    expect(all.hints).toEqual([
      "No edge of these rooms picks the edge on x 3000, y 3000–6000 alone: write the point, `at (3000,4500)`.",
      "`between u and core at 1500 from core.left` stands on the edge on y 3000, x 3000–6000.",
      "No edge of these rooms picks the edge on x 6000, y 3000–6000 alone: write the point, `at (6000,4500)`.",
    ]);
    // Every quoted way out compiles, onto the run it names.
    const out = (fix: string): string =>
      fix.includes("(") ? U_PLAN.replace(/\n\}\n$/, `\n  door id=d ${fix} width 800 wall partition\n}\n`) : u(fix);
    expect(quoted(all.hints).map((f) => placed(out(f)).host)).toEqual(["u|core", "u|core#2", "u|core#3"]);
  });

  it("two polygons leave no edge word: the hint quotes the points, and they compile", () => {
    const line = "  door id=d between a and b at center width 800";
    const src = INTERLOCKED_PLAN.replace(/\n\}\n$/, `\n${line}\n}\n`);
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    const fixes = quoted(d[0]!.hints);
    expect(fixes).toEqual(["at (6000,1500)", "at (3000,4500)", "at (4500,3000)"]);
    expect(
      fixes.map(
        (f) => placed(INTERLOCKED_PLAN.replace(/\n\}\n$/, `\n  door id=d ${f} width 800 wall partition\n}\n`)).host,
      ),
    ).toEqual(["a|b", "a|b#2", "a|b#3"]);
  });

  it("an edge that meets no run at an end is E_OPENING_DATUM, on the datum, with the same fix", () => {
    const src = onL("door id=d between liv and bed at 500 from din.bottom width 800", `${DIN}\n`);
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_DATUM"]);
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("din.bottom");
    expect(d[0]!.message).toContain("meets none of the 2 edges");
    expect(quoted(d[0]!.hints)).toEqual(["at 1500 from bed.top", "at 1500 from bed.left"]);
  });

  it("an edge of the polygon itself: no datum, and the fix is still there", () => {
    const d = errors(door("at 1500 from liv.top"));
    expect(d.map((x) => x.code)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
    expect(d[0]!.message).toContain("`liv.top`");
    expect(quoted(d[0]!.hints)).toEqual(["at 1500 from bed.top", "at 1500 from bed.left"]);
  });

  it("a centre line is refused as on any run", () => {
    expect(codes(door("at 1500 from bed.cx"))).toEqual(["E_OPENING_DATUM"]);
  });

  it("the catalogue's advice is true of both cases: E_OPENING_DATUM's fix does not end on a refusal", () => {
    const { fix, cause } = ERROR_CATALOG.E_OPENING_DATUM!;
    // Its first list holds for one run. On several, each of those words is the other code.
    for (const at of ["at 600 from start", "at 600 from end", "at center"]) {
      expect(fix).toContain(at);
      expect(codes(door(at))).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    }
    expect(fix).toContain("On a pair that shares several edges only the edge will do");
    expect(cause).toContain("any other position is `E_OPENING_HOST_AMBIGUOUS`");
  });
});

suite("on a grid, every quoted position is the one that resolves", () => {
  // Runs of an odd length, so the raw middle is off the grid: 3050 on grid 50 has its middle at 4525.
  const L_ODD = (grid: number): string =>
    `  grid ${grid}\n  room id=liv polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6050) (0,6050) uses living\n  room id=bed at (3000,3000) size 3000x3050 uses bedroom\n`;
  const TWO_ODD = (grid: number): string =>
    `  grid ${grid}\n  room id=liv polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6050) (0,6050) uses living\n  room id=bed polygon (6000,0) (9000,0) (9000,6050) (3000,6050) (3000,3000) (6000,3000) uses bedroom\n`;
  // `bed.top` meets two runs here, so the left run is picked by `bed.bottom`, from its far end.
  const FAR_END = (grid: number): string =>
    `  grid ${grid}\n  room id=liv polygon (0,0) (9000,0) (9000,4050) (6000,4050) (6000,3000) (3000,3000) (3000,6050) (0,6050) uses living\n  room id=bed at (3000,3000) size 3000x3050 uses bedroom\n  room id=x at (6000,4050) size 3000x2000 uses hall\n`;

  /** The point a pasted position says: a written `(x,y)`, or the offset along the host's line. */
  const said = (src: string, id: string, pos: string): { x: number; y: number } => {
    const at = pos.replace(/^at /, "");
    const point = /^\((\d+),(\d+)\)$/.exec(at);
    if (point) return { x: +point[1]!, y: +point[2]! };
    const [, off, room, word] = /^(\d+) from (\w+)\.(\w+)$/.exec(at)!;
    const r = irOf(src).elements.find((e) => e.id === room);
    if (r?.kind !== "room") throw new Error(`no room ${room}`);
    const line = { top: r.at.y, bottom: r.at.y + r.size.h, left: r.at.x, right: r.at.x + r.size.w }[word!]!;
    const { a, b } = el(src, id).host!;
    const vertical = a.x === b.x;
    const [r0, r1] = vertical ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const t = line === r0 ? r0 + +off! : r1 - +off!;
    expect(line === r0 || line === r1, `${at} is measured from an end of its run`).toBe(true);
    return vertical ? { x: a.x, y: t } : { x: t, y: a.y };
  };

  const paste = (rooms: string, line: string): string => plan(`${rooms}${STATEMENT}\n  ${line}`);
  const asDoor = (at: string): string =>
    at.startsWith("at (")
      ? `door id=d ${at} width 800 wall partition`
      : `door id=d between liv and bed ${at} width 800`;

  it.each([
    ["an L", L_ODD, 2],
    ["two polygons", TWO_ODD, 3],
    ["an edge at the run's far end", FAR_END, 3],
  ])("door hints on %s", (_, rooms, runs) => {
    for (const grid of [50, 25]) {
      const d = errors(paste(rooms(grid), "door id=d between liv and bed at center width 800"));
      expect(d.map((x) => x.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
      const fixes = quoted(d[0]!.hints);
      expect(fixes).toHaveLength(runs);
      for (const at of fixes) {
        const src = paste(rooms(grid), asDoor(at));
        expect(codes(src), at).toEqual([]);
        const got = el(src, "d").at;
        expect(got, `grid ${grid}: ${at}`).toEqual(said(src, "d", at));
        // The quote is already on the grid, so nothing moved it.
        expect([got.x % grid, got.y % grid]).toEqual([0, 0]);
      }
    }
  });

  it("the case that was wrong: a run's middle off the grid is quoted where it lands", () => {
    const fixes = quoted(errors(paste(L_ODD(50), "door id=d between liv and bed at center width 800"))[0]!.hints);
    expect(fixes[0]).toBe("at 1550 from bed.top");
    expect(el(paste(L_ODD(50), asDoor(fixes[0]!)), "d").at).toEqual({ x: 3000, y: 4550 });
    const point = quoted(errors(paste(TWO_ODD(50), "door id=d between liv and bed at center width 800"))[0]!.hints);
    expect(point[1]).toBe("at (3000,4550)");
    // Measured from the end the edge meets, the same point has another offset.
    const far = quoted(errors(paste(FAR_END(50), "door id=d between liv and bed at center width 800"))[0]!.hints);
    expect(far[0]).toBe("at 1500 from bed.bottom");
    expect(el(paste(FAR_END(50), asDoor(far[0]!)), "d").at).toEqual({ x: 3000, y: 4550 });
  });

  it.each([
    ["an L", L_ODD, 2],
    ["two polygons", TWO_ODD, 3],
    ["an edge at the run's far end", FAR_END, 3],
  ])("the `open between` statements on %s compile, and stand where they say", (_, rooms, runs) => {
    for (const grid of [50, 25]) {
      const src = plan(`${rooms(grid)}  walls from rooms exterior 200 partition 100 { open between liv and bed }`);
      const statements = errors(src)[0]!.hints!.flatMap((h) => [...h.matchAll(/`(opening [^`]+)`/g)].map((m) => m[1]!));
      expect(statements).toHaveLength(runs);
      for (const s of statements) {
        const fixed = paste(rooms(grid), s);
        expect(codes(fixed), s).toEqual([]);
        const at = /\bat (.+) width /.exec(s)![1]!;
        expect(el(fixed, "o").at, `grid ${grid}: ${s}`).toEqual(said(fixed, "o", at));
      }
    }
  });
});

suite("the rest of the relational rules hold on a polygon's run", () => {
  it("the nib is enforced, never slid: the hint keeps the edge, and it compiles", () => {
    const d = errors(door("at 300 from bed.top"));
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_NIB"]);
    const fix = d[0]!.hints!.join(" ").match(/`between liv and bed (at \d+ from bed\.top)`/)![1]!;
    expect(fix).toBe("at 550 from bed.top");
    expect(placed(door(fix)).host).toBe("liv|bed");
  });

  it("two rooms that share no run, and a room with itself", () => {
    const apart = plan(
      `${LIV}\n  room id=x at (6000,3000) size 2000x2000 uses bath\n  door id=d between liv and x at center width 800`,
    );
    expect(codes(apart)).toEqual(["E_WALL_BETWEEN_NOT_ADJACENT"]); // a corner
    expect(codes(onL("door id=d between liv and liv at center width 800"))).toEqual(["E_WALL_BETWEEN_NOT_ADJACENT"]);
  });

  it("a polygon overlapping the room is E_ROOMS_OVERLAP, on the clause, as for a wall", () => {
    const src = plan(
      `${LIV}\n  room id=x at (2000,3000) size 4000x3000 uses bedroom\n  door id=d between liv and x at center width 800`,
    );
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_ROOMS_OVERLAP"]);
    expect(d[0]!.message).toContain("the two rooms overlap");
  });

  it("a wall the author typed is hosted on, with no `walls from rooms` needed", () => {
    const src = plan(
      `${LIV}\n${BED}\n  wall id=p1 partition thickness 100 { (3000,6000) (3000,3000) (6000,3000) }\n  door id=d between liv and bed at 1000 from bed.left width 800`,
    );
    expect(placed(src)).toEqual({ at: { x: 4000, y: 3000 }, width: 800, host: "p1" });
  });

  it("no wall on the run is E_OPENING_NO_SHARED_WALL, as on rectangles", () => {
    const src = plan(`${LIV}\n${BED}\n  door id=d between liv and bed at 1000 from bed.left width 800`);
    expect(codes(src)).toEqual(["E_OPENING_NO_SHARED_WALL"]);
  });

  it("a pair declared `open` on its one run keeps E_WALL_BETWEEN_OPEN", () => {
    const src = plan(
      `${LIV}\n${BED}\n${DIN}\n  walls from rooms exterior 200 partition 100 { open between liv and din }\n  door id=d between liv and din at center width 800`,
    );
    expect(codes(src)).toEqual(["E_WALL_BETWEEN_OPEN"]);
  });

  it("`swing into` picks the face on either run, from the ring", () => {
    const swing = (run: string, room: string): string => {
      const d = el(onL(`door id=d between liv and bed at 1500 from ${run} width 800 swing into ${room}`), "d");
      return d.kind === "door" ? d.swing : "";
    };
    expect(swing("bed.top", "bed")).not.toBe(swing("bed.top", "liv"));
    expect(swing("bed.left", "bed")).not.toBe(swing("bed.left", "liv"));
    for (const run of ["bed.top", "bed.left"]) {
      expect(
        lint(onL(`door id=d between liv and bed at 1500 from ${run} width 800 swing into liv`)).map((d) => d.code),
      ).not.toContain("W_SWING_ROOM_NOT_ADJACENT");
    }
  });

  it("written at the root, it reads a placed instance's ring in page words", () => {
    const wing = `  component wing() {\n  ${LIV}\n  ${BED}\n  ${STATEMENT}\n  }\n`;
    const here = (place: string, line: string): string => plan(`${wing}  ${place}\n  ${line}`);
    const line = (p: string): string => `door id=d between ${p}.liv and ${p}.bed at 1000 from ${p}.bed.top width 800`;
    expect(placed(here("place wing() as w at (0,0)", line("w")))).toEqual({
      at: { x: 3000, y: 4000 },
      width: 800,
      host: "w.liv|bed",
    });
    // Mirrored about x the L's arm runs the other way, and `top` is still the page's top.
    const mirrored = here("place wing() as n at (6000,7000) mirror x", line("n"));
    expect(placed(mirrored).host).toBe("n.liv|bed");
    expect(placed(mirrored).at).toEqual({ x: 3000, y: 11000 });
  });

  it("each storey reads its own rings", () => {
    const body = `${LIV}\n${BED}\n${STATEMENT}`;
    const src = plan(
      `  level 0 {\n${body}\n  door id=d between liv and bed at 1000 from bed.top width 800\n  }\n  level 1 {\n${body}\n  door id=e between liv and bed at 1000 from bed.left width 800\n  }`,
    );
    expect(codes(src)).toEqual([]);
    const doors = describe(src).doors.map((d) => d.relation);
    expect(doors).toEqual(["between liv and bed at 1000 from bed.top"]);
  });

  it("a ring the room itself refused reports once", () => {
    const FIGURE8 =
      "  room id=a polygon (0,0) (3000,0) (3000,3000) (6000,3000) (6000,6000) (3000,6000) (3000,3000) (0,3000)";
    const src = plan(
      `${FIGURE8}\n  room id=b at (-2000,0) size 2000x3000\n  door id=d between a and b at center width 800`,
    );
    expect(codes(src)).toEqual(["E_ROOM_POLY_SELF_INTERSECT"]);
  });
});

suite("a room `between` cannot read says so in the line's own words", () => {
  const SLANTED = "  room id=p polygon (0,0) (4000,0) (3000,3000) (0,3000)\n  room id=q at (4000,0) size 2000x3000";
  const CIRCLE = "  room id=p circle at (2000,2000) radius 2000\n  room id=q at (4000,0) size 2000x3000";

  it.each([
    ["a slanted polygon", SLANTED, "a polygon room with an edge that is neither horizontal nor vertical"],
    ["a circle", CIRCLE, "a circle room"],
  ])("%s: E_ROOM_NOT_RECTANGLE, on the name, with no `.top`", (_, rooms, shape) => {
    const src = plan(`${rooms}\n  door id=d between p and q at center width 800`);
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("p");
    expect(d[0]!.message).toBe(
      `Door "d" is placed \`between\` "p", ${shape}: only rectangular and rectilinear rooms share an edge run`,
    );
    expect(d[0]!.message).not.toContain(".top");
    expect(d[0]!.hints![0]).toContain("`at (x,y)`");
  });

  it("the datum form keeps its words: there the line does contain the name", () => {
    const src = plan(`${SLANTED}\n  wall id=w partition thickness 100 { (p.top, 0) (0, 1000) }`);
    expect(errors(src)[0]!.message).toContain("`p.top` names no edge");
  });
});

suite("a lint hint quotes the relational form on a polygon's run", () => {
  const texts = (src: string): string =>
    lint(src)
      .flatMap((d) => [d.message, ...(d.hints ?? [])])
      .join("\n");

  it("W_OPENING_OVERLAP's move hint keeps the edge that picks the run, and it compiles there", () => {
    const src = onL(
      "door id=d between liv and bed at 1200 from bed.left width 800 hinge left swing in\n  door id=e between liv and bed at 1700 from bed.left width 800 hinge right swing out",
    );
    expect(lint(src).map((d) => d.code)).toContain("W_OPENING_OVERLAP");
    const fix = texts(src).match(/`between liv and bed (at \d+ from bed\.left)`/);
    expect(fix).not.toBeNull();
    expect(texts(src)).not.toMatch(/liv\|bed/);
    expect(placed(door(fix![1]!)).host).toBe("liv|bed#2");
  });

  it("on the pair's other run, by its own edge", () => {
    const src = onL(
      "door id=d between liv and bed at 1200 from bed.top width 800 hinge left swing in\n  door id=e between liv and bed at 1700 from bed.top width 800 hinge right swing out",
    );
    expect(texts(src)).toMatch(/`between liv and bed at \d+ from bed\.top`/);
  });

  it("a pair of one run reads `from start`, as a rectangle does", () => {
    const rooms = [
      { id: "liv", at: { x: 0, y: 0 }, size: { w: 6000, h: 6000 }, poly: [...ringOf(L_RING)] },
      { id: "din", at: { x: 6000, y: 0 }, size: { w: 3000, h: 3000 } },
    ];
    expect(relationalClause({ between: ["liv", "din"], at: "center" }, rooms, { x: 6000, y: 1000 })).toBe(
      "between liv and din at 1000 from start",
    );
  });

  it("of several runs it reads the one the opening stands on, and gives none off every run", () => {
    const rooms = [
      { id: "liv", at: { x: 0, y: 0 }, size: { w: 6000, h: 6000 }, poly: [...ringOf(L_RING)] },
      { id: "bed", at: { x: 3000, y: 3000 }, size: { w: 3000, h: 3000 } },
    ];
    const rel = (at: string) => ({ between: ["liv", "bed"] as [string, string], at });
    expect(relationalClause(rel("1500 from bed.top"), rooms, { x: 3000, y: 4000 })).toBe(
      "between liv and bed at 1000 from bed.top",
    );
    expect(relationalClause(rel("1500 from bed.bottom"), rooms, { x: 3000, y: 4000 })).toBe(
      "between liv and bed at 2000 from bed.bottom",
    );
    expect(relationalClause(rel("1500 from bed.right"), rooms, { x: 4000, y: 3000 })).toBe(
      "between liv and bed at 2000 from bed.right",
    );
    expect(relationalClause(rel("1500 from bed.top"), rooms, { x: 100, y: 100 })).toBeUndefined();
  });

  it("a slanted ring or a circle gives none, as before", () => {
    const slanted = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 3000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const rooms = [
      { id: "p", at: { x: 0, y: 0 }, size: { w: 4000, h: 3000 }, poly: slanted },
      { id: "q", at: { x: 4000, y: 0 }, size: { w: 2000, h: 3000 } },
    ];
    expect(relationalClause({ between: ["p", "q"], at: "center" }, rooms, { x: 4000, y: 0 })).toBeUndefined();
  });
});

function ringOf(ring: string): { x: number; y: number }[] {
  return [...ring.matchAll(/\((\d+),(\d+)\)/g)].map((m) => ({ x: +m[1]!, y: +m[2]! }));
}

suite("the `open between` refusal quotes what opens one edge", () => {
  const clause = "open between liv and bed";
  const refused = (c: string, rooms = `${LIV}\n${BED}`): string =>
    plan(`${rooms}\n  walls from rooms exterior 200 partition 100 { ${c} }`);
  const open = (rooms: string, stmt: string): string => plan(`${rooms}\n${STATEMENT}\n  ${stmt}`);
  const statements = (src: string): string[] =>
    (errors(src)[0]!.hints ?? []).flatMap((h) => [...h.matchAll(/`(opening [^`]+)`/g)].map((m) => m[1]!));

  it("the written statement for each run compiles, in place of the clause, and stands on that run", () => {
    const got = statements(refused(clause));
    expect(got).toEqual([
      "opening id=o between liv and bed at 1500 from bed.top width 2600",
      "opening id=o between liv and bed at 1500 from bed.left width 2600",
    ]);
    const rooms = `${LIV}\n${BED}`;
    expect(codes(open(rooms, got[0]!))).toEqual([]);
    expect(placed(open(rooms, got[0]!), "o").host).toBe("liv|bed");
    expect(placed(open(rooms, got[1]!), "o").host).toBe("liv|bed#2");
  });

  it("the clause's own `id` and `width` carry over", () => {
    expect(statements(refused("open id=arch between liv and bed width 1200"))).toEqual([
      "opening id=arch between liv and bed at 1500 from bed.top width 1200",
      "opening id=arch between liv and bed at 1500 from bed.left width 1200",
    ]);
  });

  it("the width leaves a nib whichever wall meets the run: compiled with the thickest clause", () => {
    const rooms = `${LIV}\n${BED}\n${BATH}`;
    const c = `${clause}\n    between liv and bath thickness 300`;
    const [one] = statements(refused(c, rooms));
    expect(one).toBe("opening id=o between liv and bed at 1500 from bed.top width 2500");
    const src = plan(
      `${rooms}\n  walls from rooms exterior 200 partition 100 { between liv and bath thickness 300 }\n  ${one}`,
    );
    expect(codes(src)).toEqual([]);
  });

  it("on a coarse grid the width stays on it", () => {
    const src = plan(`  grid 300\n${LIV}\n${BED}\n  walls from rooms exterior 200 partition 100 { ${clause} }`);
    expect(statements(src)[0]).toContain("width 2400");
  });

  it("a run too short to quote a width says so rather than print a negative one", () => {
    const rooms = `  grid 1\n  room id=a polygon (0,0) (300,0) (300,300) (150,300) (150,600) (0,600)\n  room id=b at (150,300) size 150x300`;
    const src = plan(`${rooms}\n  walls from rooms exterior 100 partition 100 { open between a and b }`);
    expect(statements(src)[0]).toContain("width <mm>");
  });

  it("no edge word: a statement by position, which compiles too", () => {
    const src = INTERLOCKED_PLAN.replace(
      STATEMENT,
      "  walls from rooms exterior 200 partition 100 { open between a and b }",
    );
    const got = statements(src);
    expect(got[0]).toBe("opening id=o at (6000,1500) width 2600");
    const fixed = INTERLOCKED_PLAN.replace(/\n\}\n$/, `\n  ${got[0]}\n}\n`);
    expect(placed(fixed, "o").host).toBe("a|b");
  });

  it("a U: the middle run by an edge, the side runs by position", () => {
    const src = U_PLAN.replace(STATEMENT, "  walls from rooms exterior 200 partition 100 { open between u and core }");
    const hosts = statements(src).map((s) => placed(U_PLAN.replace(/\n\}\n$/, `\n  ${s}\n}\n`), "o").host);
    expect(hosts).toEqual(["u|core", "u|core#2", "u|core#3"]);
  });
});

suite("what a derived door gives everything downstream", () => {
  const src = RECTILINEAR_PLANS.find((p) => p[0] === "doors-both-runs")![1];

  it("the access graph joins the rooms by either run", () => {
    const d = describe(src);
    expect(d.doors.map((x) => [x.id, x.between, x.relation])).toEqual([
      ["d1", ["liv", "bed"], "between liv and bed at 1500 from bed.top"],
      ["d2", ["liv", "bed"], "between liv and bed at 1500 from bed.left"],
      ["d3", ["liv", "bath"], "between liv and bath at center"],
    ]);
    expect(lint(src).map((x) => x.code)).not.toContain("W_ROOM_DISCONNECTED");
    const one = src.replace(/ {2}door id=d1.*\n {2}door id=d2.*\n/, "");
    expect(lint(one).filter((x) => x.code === "W_ROOM_DISCONNECTED")).toHaveLength(1);
  });

  it("one room stays one room", () => {
    const d = describe(src);
    expect(d.rooms.filter((r) => r.id === "liv")).toHaveLength(1);
    expect(d.rooms[0]!.area_m2).toBe(27);
    expect(d.freedom.openings?.relational).toBe(3);
  });

  it("each wall carries the one door it hosts", () => {
    const ir = irOf(src);
    expect(
      ["liv|bed", "liv|bed#2", "liv|bath"].map((id) => ir.walls.find((w) => w.id === id)!.openings.length),
    ).toEqual([1, 1, 1]);
    expect(["d1", "d2", "d3"].map((id) => el(src, id).host?.wallId)).toEqual(["liv|bed", "liv|bed#2", "liv|bath"]);
  });

  it("lint raises no wall, enclosure or junction code on it", () => {
    const quiet = [
      "W_BOUNDARY_NO_WALL",
      "W_FLOOR_UNASSIGNED",
      "W_ROOM_OUTSIDE_SHELL",
      "W_EXTERIOR_RING_OPEN",
      "W_OPENING_AT_JUNCTION",
      "W_DOOR_NEAR_CORNER",
    ];
    expect(lint(src).filter((d) => quiet.includes(d.code!))).toEqual([]);
  });

  it("W_DOOR_NEAR_CORNER at the reflex corner measures as at any corner, on both runs", () => {
    // 550 from the reflex corner leaves the 100 mm nib compile() demands, on each run.
    const near = (run: string): string[] =>
      lint(onL(`door id=d between liv and bed at 550 from ${run} width 800 swing into bed`))
        .filter((d) => d.code === "W_DOOR_NEAR_CORNER" || d.code === "W_OPENING_AT_JUNCTION")
        .map((d) => d.code!);
    expect(near("bed.top")).toEqual(near("bed.left"));
    // The same door on the rectangle that holds that run.
    const rect = plan(
      `  room id=a at (0,0) size 6000x3000\n  room id=b at (0,3000) size 3000x3000\n${BED}\n${STATEMENT}\n  door id=d between b and bed at 550 from bed.top width 800 swing into bed`,
    );
    const onRect = lint(rect)
      .filter((d) => d.code === "W_DOOR_NEAR_CORNER" || d.code === "W_OPENING_AT_JUNCTION")
      .map((d) => d.code!);
    expect(near("bed.top")).toEqual(onRect);
  });

  it("W_DOOR_NEAR_CORNER fires at the reflex corner, on a door placed by position, as on rectangles", () => {
    // compile() keeps a relational door off the corner (the nib), so only a typed one gets there.
    const line = "door id=d at (3000,3440) width 800 wall partition swing in";
    const rect = plan(
      `  room id=a at (0,0) size 6000x3000\n  room id=b at (0,3000) size 3000x3000\n${BED}\n${STATEMENT}\n  ${line}`,
    );
    const corner = (s: string) => lint(s).filter((d) => d.code === "W_DOOR_NEAR_CORNER");
    expect(corner(onL(line)).map((d) => d.message)).toEqual(corner(rect).map((d) => d.message));
    expect(corner(onL(line))).toHaveLength(1);
  });

  it("Plan JSON keeps the door as written, and the drawing survives the round trip", () => {
    const { json } = planToJson(src);
    expect(JSON.stringify(json)).toContain("1500 from bed.left");
    expect(JSON.stringify(json)).not.toContain("liv|bed");
    const back = planJsonToArch(json);
    expect(back.source).toContain("between liv and bed at 1500 from bed.top");
    expect(compile(back.source!, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("DXF exports the doors on both runs", () => {
    const dxf = toDxf(compile(src, { noCache: true }).scene!);
    const without = toDxf(compile(src.replace(/ {2}door id=d\d.*\n/g, ""), { noCache: true }).scene!);
    expect(dxf.length).toBeGreaterThan(without.length);
    expect(dxf).not.toContain("NaN");
  });

  it("`impact` follows a door when the room it stands by moves, and names no internal id", () => {
    const after = src.replace("at 1500 from bed.left", "at 1000 from bed.left");
    const r = impact(src, after);
    expect(r.changed.filter((c) => c.kind === "door").map((c) => c.name)).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("liv|bed#");
  });
});

/** The steps a source's whole resolution spends. */
function stepsOf(src: string): number {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  return evaluationSteps(resolveAll(link(ast, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD));
}

/** A staircase ring of `n` treads, and a room along its long flat side. */
function staircase(n: number): string {
  const up: string[] = [];
  for (let i = 0; i < n; i++) up.push(`(${(i + 1) * 1000},${i * 1000})`, `(${(i + 1) * 1000},${(i + 1) * 1000})`);
  const ring = `(0,0) ${up.join(" ")} (0,${n * 1000})`;
  return `  room id=s polygon ${ring}\n  room id=w at (-2000,0) size 2000x${n * 1000}\n${STATEMENT}`;
}

suite("budgets", () => {
  const doors = (n: number, count: number): string => {
    const lines = Array.from({ length: count }, (_, k) => `  door id=d${k} between s and w at center width 800`);
    return plan(`${staircase(n)}\n${lines.join("\n")}`);
  };

  it("a door between a polygon and a room pays for the cut and the sweep, in the ring's size", () => {
    const steps = (n: number): number => stepsOf(doors(n, 1)) - stepsOf(plan(staircase(n)));
    expect(steps(40)).toBeGreaterThan(2 * steps(10));
  });

  it("too many of them is E_STEP_LIMIT, returned, not a hang and not a throw", () => {
    expect(codes(doors(400, 3000))).toContain("E_STEP_LIMIT");
  }, 60_000);

  it("what picks a run is charged too: a refusal costs more than the door it refuses", () => {
    expect(stepsOf(door("at center"))).toBeGreaterThan(stepsOf(door("at 1500 from bed.top")));
    const pair: TileRoom[] = [
      { id: "a", shape: "polygon" },
      { id: "b", rect: { x0: 0, y0: 0, x1: 1000, y1: 1000 } },
    ];
    expect(runPicks(pair, [{ vertical: true, c: 0, r0: 0, r1: 1000 }])[0]!.from).toBe("b.top");
  });
});
