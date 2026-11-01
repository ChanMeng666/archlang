/**
 * `door|window|opening … on <room>.<edge>` on an edge that carries several walls (issue #401;
 * ADR 0028 §5 as amended 2026-11-02).
 *
 * The position is measured along the whole room edge, as on an edge with one wall, so it names
 * one point before any wall is read. Where the span lands then settles the wall: the whole span
 * on one exterior body and no other wall stands there, and any other landing refuses. A hand-placed
 * twin is the oracle for the drawing, and every quoted hint is pasted back into its plan.
 */

import { describe as suite, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { link } from "../src/import.js";
import { compile, describe, makeVirtualWorld, type RWindow } from "../src/index.js";
import { evaluationSteps, resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { D4_ELEMENTS, witnessCase } from "./d4-oracle.js";

const plan = (body: string, head = ""): string => `plan "t" {\n  units mm\n${head}${body}}\n`;
const W = "  walls from rooms exterior 300 partition 100\n";
const ENTRY = "  door id=e on liv.left at center width 1000 swing into liv\n";
/** The top edge of `liv` is exterior on x 0–3000 and the partition with `bed` on x 3000–6000. */
const MIXED = `  room id=liv at (0,0) size 6000x4000 uses living\n  room id=bed at (3000,-3000) size 3000x3000 uses bedroom\n${W}`;
/** The same edge the other way round: the partition first, on x 0–3000. */
const FLIPPED = `  room id=liv at (0,0) size 6000x4000 uses living\n  room id=bed at (0,-3000) size 3000x3000 uses bedroom\n${W}`;
/** Exterior either side of a narrower neighbour: x 0–3000 and x 6000–9000. */
const NARROW = `  room id=w at (0,3000) size 9000x3000\n  room id=n at (3000,0) size 3000x3000\n${W}`;
const mixed = (s: string): string => plan(`${MIXED}${s}\n${ENTRY}`);

const errors = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
const codes = (src: string): string[] => errors(src).map((d) => d.code!);
const placedAt = (src: string, id: string) => {
  const { ir } = resolvePlan(src, {});
  return (ir!.elements.find((e) => (e as RWindow).id === id) as RWindow).at;
};
/** The relational clause a hint opens with: `on liv.top at 2100 from start`. */
const quoted = (hint: string): string | undefined => /^`(on \S+ at [^`]+)`/.exec(hint)?.[1];

suite("the position settles the wall on an edge with several", () => {
  it("issue #401: a window wholly on the exterior part resolves, where a hand-placed twin stands", () => {
    const src = mixed("  window id=w on liv.top at 1500 from start width 1200");
    expect(errors(src)).toEqual([]);
    const twin = mixed("  window id=w at (1500,0) width 1200 wall exterior");
    expect(compile(src, { noCache: true }).svg).toBe(compile(twin, { noCache: true }).svg);
    const row = describe(src).windows.find((w) => w.id === "w")!;
    expect([row.room, row.facing, row.relation]).toEqual(["liv", "N", "on liv.top at 1500 from start"]);
  });

  it.each([
    [
      "door",
      "door id=x on liv.top at 1500 from start width 900 swing into liv",
      "door id=x at (1500,0) width 900 swing into liv",
    ],
    ["opening", "opening id=x on liv.top at 1500 from start width 900", "opening id=x at (1500,0) width 900"],
  ])("a %s shares the path, and stands where its twin does", (_kind, relational, absolute) => {
    expect(errors(mixed(`  ${relational}`))).toEqual([]);
    expect(compile(mixed(`  ${relational}`), { noCache: true }).svg).toBe(
      compile(mixed(`  ${absolute}`), { noCache: true }).svg,
    );
  });

  it("start and end stay the room edge's ends, wherever its exterior part runs", () => {
    const flipped = (at: string): string =>
      plan(
        `${FLIPPED}  window id=w on liv.top at ${at} width 1200\n  door id=e on liv.left at center width 1000 swing into liv\n`,
      );
    // 4500 from the room's corner, not 4500 past the exterior part's start at x 3000.
    expect(placedAt(flipped("4500 from start"), "w")).toEqual({ x: 4500, y: 0 });
    expect(placedAt(flipped("1500 from end"), "w")).toEqual({ x: 4500, y: 0 });
    expect(placedAt(mixed("  window id=w on liv.top at 4500 from end width 1200"), "w")).toEqual({ x: 1500, y: 0 });
  });

  it("`center` and no position are the middle of the room edge, never of the exterior part", () => {
    const wide = (pos: string): string =>
      plan(
        `  room id=liv at (0,0) size 8000x4000 uses living\n  room id=bed at (6000,-3000) size 2000x3000 uses bedroom\n${W}  window id=w on liv.top${pos} width 1200\n${ENTRY}`,
      );
    expect(placedAt(wide(" at center"), "w")).toEqual({ x: 4000, y: 0 });
    expect(placedAt(wide(""), "w")).toEqual({ x: 4000, y: 0 });
  });

  it("an axis reads the same point, and either exterior run of one edge can be reached", () => {
    const axes = "  axes {\n    x at 1500\n  }\n";
    expect(placedAt(plan(`${MIXED}  window id=w on liv.top at axis 1 width 1200\n${ENTRY}`, axes), "w")).toEqual({
      x: 1500,
      y: 0,
    });
    const on = (at: string): string => plan(`${NARROW}  window id=x on w.top at ${at} width 900\n`);
    expect(placedAt(on("1500 from start"), "x")).toEqual({ x: 1500, y: 3000 });
    expect(placedAt(on("1500 from end"), "x")).toEqual({ x: 7500, y: 3000 });
  });

  it("a vertical edge reads the same way", () => {
    const src = plan(
      `  room id=liv at (0,0) size 4000x6000 uses living\n  room id=bed at (4000,3000) size 3000x3000 uses bedroom\n${W}  window id=w on liv.right at 1500 from start width 1200\n  door id=e on liv.left at center width 1000 swing into liv\n`,
    );
    expect(placedAt(src, "w")).toEqual({ x: 4000, y: 1500 });
    expect(describe(src).windows[0]!.facing).toBe("E");
  });

  it("the span is judged where the grid lands it", () => {
    const src = plan(`${MIXED}  window id=w on liv.top at 2750 from start width 400\n${ENTRY}`, "  grid 500\n");
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain("x 2750–3250"); // the 500 mm window on x 3000, not its written 2750
    expect(
      errors(src.replace("at 2750 from start", `at ${/`on liv.top at ([^`]+)`/.exec(d!.hints![0]!)![1]}`)),
    ).toEqual([]);
  });
});

suite("the refusals stay, and say what to write", () => {
  const paste = (src: string, written: string, hint: string): string => {
    const clause = quoted(hint);
    expect(clause, hint).toBeDefined();
    return src.replace(written, clause!);
  };

  it.each([
    ["no position", "on liv.top"],
    ["`at center`", "on liv.top at center"],
    ["from start", "on liv.top at 2500 from start"],
    ["from end", "on liv.top at 3000 from end"],
  ])("a span that crosses from one wall to the next is refused: %s", (_name, written) => {
    const src = mixed(`  window id=w ${written} width 1200`);
    const [d, ...rest] = errors(src);
    expect(rest).toEqual([]);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain("lies on 2 of them");
    expect(d!.hints).toHaveLength(1);
    const fixed = paste(src, written, d!.hints![0]!);
    expect(errors(fixed)).toEqual([]);
    expect(placedAt(fixed, "w")).toEqual({ x: 2100, y: 0 });
  });

  it("the hint keeps the end the author measured from", () => {
    const [d] = errors(mixed("  window id=w on liv.top at 3000 from end width 1200"));
    expect(d!.hints).toEqual(["`on liv.top at 3900 from end` stands in the exterior wall on x 0–3000."]);
  });

  it("a span on the partition part is refused, and only a door or an opening is told `between`", () => {
    const window = mixed("  window id=w on liv.top at 4500 from start width 1200");
    const [w] = errors(window);
    expect(w!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(w!.message).toContain('stands on the partition between "liv" and "bed", not on an exterior wall');
    expect(w!.hints!.join(" ")).not.toContain("between <room>");
    expect(errors(paste(window, "on liv.top at 4500 from start", w!.hints![0]!))).toEqual([]);
    const [d] = errors(mixed("  door id=d on liv.top at 4500 from start width 900 swing into liv"));
    expect(d!.hints!.at(-1)).toContain("`between <room> and <room>`");
  });

  it("two exterior runs: one hint for each, in order along the edge, each pasted", () => {
    const src = plan(`${NARROW}  window id=x on w.top width 900\n`);
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.hints!.map(quoted)).toEqual(["on w.top at 2250 from start", "on w.top at 6750 from start"]);
    const [left, right] = d!.hints!.map((h) => placedAt(paste(src, "on w.top", h), "x"));
    expect(left).toEqual({ x: 2250, y: 3000 });
    expect(right).toEqual({ x: 6750, y: 3000 });
  });

  it("with no exterior wall on the edge it is the refusal one partition gets, with no position to quote", () => {
    const rooms = (above: string): string =>
      plan(`  room id=a at (0,3000) size 6000x3000\n${above}${W}  window id=x on a.top at 1000 from start width 900\n`);
    const [two] = errors(rooms("  room id=b at (0,0) size 3000x3000\n  room id=c at (3000,0) size 3000x3000\n"));
    const [one] = errors(rooms("  room id=b at (0,0) size 6000x3000\n"));
    expect([two!.code, one!.code]).toEqual(["E_OPENING_NO_SHARED_WALL", "E_OPENING_NO_SHARED_WALL"]);
    expect(two!.message).toContain("needs an exterior wall on `on a.top`, but none stands there");
    expect(two!.message).not.toContain("cannot tell");
    expect(two!.hints).toEqual(["Use an edge of the room that faces outside."]);
  });

  /** The top of `liv` is an authored wall on x 0–3000, then the partition with `bed`. */
  const demolished = (status: string, written: string): string =>
    plan(
      `  room id=liv at (0,0) size 6000x4000 uses living\n  room id=bed at (3000,-3000) size 3000x3000 uses bedroom\n  wall id=old exterior thickness 300${status} { (0,0) (3000,0) }\n${W}  ${written}\n${ENTRY}`,
    );

  it("a demolished wall is no target: it is named, and no hint leads to it", () => {
    const [d] = errors(demolished(" status demolish", "window id=w on liv.top at center width 1200"));
    expect(d!.code).toBe("E_OPENING_NO_SHARED_WALL");
    expect(d!.message).toContain('wall "old" (`status demolish`)');
    expect(d!.hints).toEqual(["Use an edge of the room that faces outside."]);
    // The control: the same wall standing takes the window at the position it was offered.
    expect(errors(demolished("", "window id=w on liv.top at 2100 from start width 1200"))).toEqual([]);
  });

  it("the exterior wall that stands is still offered, beside a demolished one on the same edge", () => {
    const src = plan(
      `  room id=w at (0,3000) size 9000x3000\n  room id=n at (3000,0) size 3000x3000\n  wall id=old exterior thickness 300 status demolish { (0,3000) (3000,3000) }\n${W}  window id=x on w.top width 900\n`,
    );
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain('wall "old" (`status demolish`)');
    expect(d!.hints!.map(quoted)).toEqual(["on w.top at 6750 from start"]);
    expect(errors(paste(src, "on w.top", d!.hints![0]!))).toEqual([]);
  });

  it("a span on a demolished wall alone keeps its own refusal, and an overrun quotes no position", () => {
    const alone = demolished(" status demolish", "window id=w on liv.top at 1500 from start width 1200");
    expect(codes(alone)).toEqual(["E_OPENING_ON_DEMOLISHED_WALL"]);
    const [d] = errors(demolished(" status demolish", "window id=w on liv.top at 300 from start width 1200"));
    expect(d!.code).toBe("E_OPENING_NIB");
    expect(d!.hints).toEqual([
      "That wall is marked `status demolish` and hosts nothing: host the opening on a wall that stays, or keep the wall.",
    ]);
  });

  it("a demolished wall on the same stretch as a standing one is still a second wall there", () => {
    const src = plan(
      `  room id=liv at (0,0) size 6000x4000 uses living\n  room id=bed at (3000,-3000) size 3000x3000 uses bedroom\n  wall id=oldp partition thickness 100 status demolish { (3000,0) (6000,0) }\n  wall id=newx exterior thickness 300 { (3000,0) (6000,0) }\n${W}  window id=w on liv.top at 4500 from start width 1200\n${ENTRY}`,
    );
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain("lies on 2 of them");
    expect(d!.message).toContain('wall "oldp" (`status demolish`)');
    expect(errors(paste(src, "on liv.top at 4500 from start", d!.hints![0]!))).toEqual([]);
  });

  const OPEN = `  room id=liv at (0,0) size 6000x4000 uses living\n  room id=bed at (3000,-3000) size 3000x3000 uses bedroom\n  walls from rooms exterior 300 partition 100 { open between liv and bed }\n`;

  it("an `open between` boundary is named as one, and nothing sends an opening `between` that pair", () => {
    const door = plan(`${OPEN}  door id=d on liv.top at 4500 from start width 900 swing into liv\n${ENTRY}`);
    const [d] = errors(door);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain('stands on the open boundary between "liv" and "bed", not on an exterior wall');
    expect(d!.message).not.toContain("the partition between");
    expect(d!.hints!.join(" ")).not.toContain("between <room>");
    expect(d!.hints).toHaveLength(1);
    expect(errors(paste(door, "on liv.top at 4500 from start", d!.hints![0]!))).toEqual([]);
    // What the dropped hint would have written.
    expect(codes(door.replace("on liv.top at 4500 from start", "between liv and bed at 1500 from start"))).toEqual([
      "E_WALL_BETWEEN_OPEN",
    ]);
    const window = plan(`${OPEN}  window id=w on liv.top at 4500 from start width 900\n${ENTRY}`);
    const [w] = errors(window);
    expect(w!.hints!.map(quoted)).toEqual(["on liv.top at 2250 from start"]);
    expect(errors(paste(window, "on liv.top at 4500 from start", w!.hints![0]!))).toEqual([]);
  });

  it("an opening left narrower than the span keeps a partition, and `between` still refuses that pair", () => {
    const partial = plan(
      `${OPEN.replace("open between liv and bed", "open between liv and bed width 900")}  door id=d on liv.top at 3600 from start width 500 swing into liv\n${ENTRY}`,
    );
    const [d] = errors(partial);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain('the partition between "liv" and "bed"');
    expect(d!.hints!.join(" ")).not.toContain("between <room>");
  });

  const HALVES = `  room id=r at (0,0) size 6000x3000\n  wall id=a exterior thickness 200 { (0,0) (2000,0) }\n  wall id=b exterior thickness 200 { (4000,0) (6000,0) }\n`;

  it("a span in the gap between two walls stands on none of them, and quotes both", () => {
    const src = plan(`${HALVES}  window id=x on r.top at 3000 from start width 900\n`);
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain("stands on none of them");
    expect(d!.hints!.map(quoted)).toEqual(["on r.top at 1550 from start", "on r.top at 4450 from start"]);
    for (const h of d!.hints!) expect(errors(paste(src, "on r.top at 3000 from start", h))).toEqual([]);
  });

  it("a span on one wall that runs past its end is the nib refusal, with the same nearest position", () => {
    const src = plan(`${HALVES}  window id=x on r.top at 1800 from start width 900\n`);
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_NIB");
    expect(d!.hints).toEqual(["The nearest legal position is `on r.top at 1550 from start` (centre at x 1550)."]);
    expect(errors(src.replace("at 1800 from start", "at 1550 from start"))).toEqual([]);
  });

  it("two walls on one stretch are never told apart: the exterior one alone does not win", () => {
    const stacked = plan(
      `  room id=r at (0,0) size 6000x3000\n  wall id=a exterior thickness 200 { (0,0) (6000,0) }\n  wall id=b partition thickness 100 { (2000,0) (4000,0) }\n  window id=x on r.top at 3000 from start width 900\n`,
    );
    const [d] = errors(stacked);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).toContain("lies on 2 of them");
    // The same wall with the partition away from the span: position, not rank, decides.
    expect(errors(stacked.replace("at 3000 from start", "at 1000 from start"))).toEqual([]);
  });

  it("no hint quotes a span that lands on two walls, on either refusal", () => {
    const over = (window: string): string =>
      plan(
        `  room id=r at (0,0) size 6000x3000\n  wall id=a exterior thickness 200 { (0,0) (4000,0) }\n  wall id=b exterior thickness 200 { (2000,0) (6000,0) }\n  wall id=t partition thickness 100 { (1000,0) (1000,3000) }\n  ${window}\n`,
      );
    const [crossing] = errors(over("window id=x on r.top at 3000 from start width 900"));
    expect(crossing!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(crossing!.hints![0]).toContain("Make it one wall");
    // Nib-short of the partition at x 1000: the nearest clear span would reach wall b at x 2000.
    const [nib] = errors(over("window id=x on r.top at 1500 from start width 900"));
    expect(nib!.code).toBe("E_OPENING_NIB");
    expect(nib!.hints![0]).toContain("Make it one wall");
  });

  it("a `between` run keeps its one-wall rule, whatever the position says", () => {
    const src = plan(
      `  room id=a at (0,0) size 4000x5000\n  room id=b at (4000,0) size 3000x5000\n  wall id=half partition thickness 100 { (4000,0) (4000,2500) }\n${W}  door id=d between a and b at 1000 from start width 800\n`,
    );
    const [d] = errors(src);
    expect(d!.code).toBe("E_OPENING_HOST_AMBIGUOUS");
    expect(d!.message).not.toContain("span");
    expect(d!.hints![0]).toContain("Make it one wall");
  });
});

suite("polygon rooms", () => {
  const ELL = "polygon (3000,-3000) (9000,-3000) (9000,4000) (6000,4000) (6000,0) (3000,0) uses bedroom";

  it("a rectangle's edge shared with an L resolves on its exterior part, and refuses the same way", () => {
    const src = (at: string): string =>
      plan(
        `  room id=liv at (0,0) size 6000x4000 uses living\n  room id=ell ${ELL}\n${W}  window id=w on liv.top ${at} width 1200\n${ENTRY}`,
      );
    expect(placedAt(src("at 1500 from start"), "w")).toEqual({ x: 1500, y: 0 });
    expect(codes(src("at center"))).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    expect(errors(src("at center"))[0]!.hints).toEqual([
      "`on liv.top at 2100 from start` stands in the exterior wall on x 0–3000.",
    ]);
  });

  it("an L's side is its run; a slanted polygon's edge has no word, and stays E_ROOM_NOT_RECTANGLE", () => {
    const ell = plan(
      `  room id=ell polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) uses living\n${W}  window id=w on ell.top at 1500 from start width 1200\n`,
    );
    expect(codes(ell)).toEqual([]);
    const slanted = plan(
      `  room id=tri polygon (0,0) (6000,0) (3000,5000) uses living\n  wall id=w exterior thickness 200 { (0,0) (6000,0) (3000,5000) close }\n  window id=x on tri.top at 1500 from start width 1200\n`,
    );
    expect(codes(slanted)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
  });
});

suite("`place` frames", () => {
  const BODY = `    room id=liv at (0,0) size 6000x4000 uses living\n    room id=bed at (3000,-3000) size 3000x3000 uses bedroom\n    walls from rooms exterior 300 partition 100\n    window id=w on liv.top at 1500 from start width 1200\n    door id=x on liv.top at 900 from start width 800 swing into liv\n    opening id=o on liv.bottom at 4500 from end width 900\n    door id=d between liv and bed at 800 from bed.right width 800 swing into bed\n    door id=e on liv.left at center width 1000 swing into liv`;

  for (const g of D4_ELEMENTS) {
    it(`${g.name}: an instance resolves in its own frame and is carried`, () => {
      const { vs, ctx } = witnessCase(BODY, g);
      expect(
        vs.map((v) => v.key),
        g.name,
      ).toEqual([]);
      expect(ctx.obsG.summary.windows.map((w) => w.relation)).toEqual(["on liv.top at 1500 from start"]);
    });
  }
});

suite("the step budget", () => {
  /** A long room whose top edge alternates exterior and partition, `bays` of each. */
  const comb = (bays: number, window: (k: number) => string): string => {
    const rooms = Array.from(
      { length: bays },
      (_, k) => `  room id=r${k} at (${6000 * k + 3000},-3000) size 3000x3000 uses bedroom\n`,
    ).join("");
    const windows = Array.from({ length: bays }, (_, k) => `  ${window(k)}\n`).join("");
    return plan(
      `  room id=liv at (0,0) size ${6000 * bays}x4000 uses living\n${rooms}${W}${windows}  door id=e on liv.left at center width 1000 swing into liv\n`,
    );
  };

  it("an honest long edge places a window in every exterior bay within budget", () => {
    const src = comb(60, (k) => `window id=w${k} on liv.top at ${6000 * k + 1500} from start width 1200`);
    expect(codes(src)).toEqual([]);
    expect(placedAt(src, "w59")).toEqual({ x: 355500, y: 0 });
  });

  it("each exterior wall a refusal quotes pays for its scan of the group's walls", () => {
    const steps = (src: string): number => {
      const world = makeVirtualWorld({});
      const linked = link(parse(src, BUILTIN_REGISTRY).plan!, world, BUILTIN_REGISTRY);
      return evaluationSteps(resolveAll(linked.plan, BUILTIN_REGISTRY, world));
    };
    const refusalCost = (walls: number): number => {
      const far = Array.from(
        { length: walls },
        (_, k) => `  wall id=f${k} exterior thickness 200 { (0,${20000 + 1000 * k}) (3000,${20000 + 1000 * k}) }\n`,
      ).join("");
      const on = (at: string): string => plan(`${NARROW}${far}  window id=x on w.top at ${at} width 900\n`);
      return steps(on("center")) - steps(on("1500 from start"));
    };
    // Each far wall costs 3 steps for reading the 3 bodies' status, and 1 because a refusal scans
    // the two exterior runs where a placement scans its one host.
    expect(refusalCost(800) - refusalCost(400)).toBe(4 * 400);
  });

  it("a hostile edge of refusals returns a diagnostic, each hint paid for", () => {
    const refused = (k: number): string => `window id=w${k} on liv.top at ${6000 * k + 3000} from start width 1200`;
    expect(new Set(codes(comb(40, refused)))).toEqual(new Set(["E_OPENING_HOST_AMBIGUOUS"]));
    expect(codes(comb(200, refused))).toContain("E_STEP_LIMIT");
    // The control: the same edge with every window placed stays within budget, so the hints spent it.
    const placed = (k: number): string => `window id=w${k} on liv.top at ${6000 * k + 1500} from start width 1200`;
    expect(codes(comb(200, placed))).toEqual([]);
  });
});
