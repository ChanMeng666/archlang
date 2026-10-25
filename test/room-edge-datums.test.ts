/**
 * Room-edge datums (ADR 0028 §2, card PS3.2 part B): a rectangular room `r` exposes
 * `r.top`, `r.bottom`, `r.left`, `r.right`, `r.cx`, `r.cy`, read from the group's frozen
 * datum table (`src/room-datums.ts`) by every statement that resolves after the rooms.
 *
 * The laws pinned here:
 *
 * - **Swap-back.** A plan written with datums and its twin written with the equivalent
 *   literal numbers produce byte-identical SVG, `describe()`, `lint()` and
 *   `compile().diagnostics` (every storey), and spend the same evaluation steps: a datum is
 *   one name read, as a number literal is one node.
 * - **Frames.** Inside a `place`d component a datum is a local-frame word; from the root,
 *   `west.main.top` is the placed room's edge in world words (under `rotate 90` and
 *   `mirror x`).
 * - **Refusals.** Every refusal carries its catalogued code and a span on the datum.
 * - **Digest table.** The datum plans' digests, pinned once the form worked.
 *
 * The other half of the byte-identity law, that a plan reading no datum is unchanged, is
 * every existing digest suite run unchanged against this branch.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint, makeVirtualWorld } from "../src/index.js";
import { link } from "../src/import.js";
import { clearResolveCache, datumTablesOf, evaluationSteps, resolve, resolveAll, type RFurniture } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { NULL_WORLD } from "../src/world.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { allStoreysDiagnosticsPayload } from "./byte-identity-payload.js";

const API: CompilerApi = { compile, describe: describePlan, lint };

const wrap = (body: string, head = ""): string => `plan "D" {\n  units mm\n  grid 50\n${head}${body}\n}\n`;

// ---- the twins -------------------------------------------------------------------------

/** One storey: rooms, then a shell, a partition, a door and a bed read off the rooms. */
const PLAIN = wrap(`  room id=hall at (0,0) size 4000x3000 label "Hall"
  room id=bed right-of hall size 3000x3000 label "Bed"
  wall exterior thickness 200 { (hall.left, hall.top) (bed.right, bed.top) (bed.right, bed.bottom) (hall.left, hall.bottom) close }
  wall interior thickness 100 { (hall.right, hall.top) (hall.right, hall.bottom) }
  door at (hall.right, hall.cy) width 800
  furniture bed at (bed.cx - 800, bed.top + 200) size 1600x2000`);
const PLAIN_LIT = wrap(`  room id=hall at (0,0) size 4000x3000 label "Hall"
  room id=bed right-of hall size 3000x3000 label "Bed"
  wall exterior thickness 200 { (0, 0) (7000, 0) (7000, 3000) (0, 3000) close }
  wall interior thickness 100 { (4000, 0) (4000, 3000) }
  door at (4000, 1500) width 800
  furniture bed at (5500 - 800, 0 + 200) size 1600x2000`);

/** Two instances of one component, turned and mirrored. The component reads LOCAL words;
 *  the root reads the placed rooms in WORLD words. */
const frames = (comp: [string, string, string], root: [string, string, string, string]): string =>
  wrap(`  component wing() {
    room id=main at (0,0) size 4000x3000 label "Main"
    room id=side right-of main size 2000x3000 label "Side"
    wall exterior thickness 200 { ${comp[0]} close }
    wall interior thickness 100 { ${comp[1]} }
    door at ${comp[2]} width 800
  }
  place wing() as west at (0,0) rotate 90
  place wing() as east at (10000,0) mirror x
  furniture table at ${root[0]} size 1200x800
  furniture desk at ${root[1]} size 1200x600
  dim ${root[2]}->${root[3]} offset -800`);
const FRAMES = frames(
  [
    "(main.left, main.top) (side.right, side.top) (side.right, side.bottom) (main.left, main.bottom)",
    "(main.right, main.top) (main.right, main.bottom)",
    "(main.right, main.cy)",
  ],
  [
    "(west.main.left + 300, west.main.top + 300)",
    "(east.main.left + 300, east.main.bottom - 900)",
    "(east.main.left, east.main.top)",
    "(east.main.right, east.main.top)",
  ],
);
// Read off the placed rooms' shapes (describe().rooms[].bbox): west.main is x -3000..0,
// y 0..4000 after the quarter turn; east.main is x 6000..10000, y 0..3000 after the mirror.
const FRAMES_LIT = frames(
  ["(0, 0) (6000, 0) (6000, 3000) (0, 3000)", "(4000, 0) (4000, 3000)", "(4000, 1500)"],
  ["(-3000 + 300, 0 + 300)", "(6000 + 300, 3000 - 900)", "(6000, 0)", "(10000, 0)"],
);

/** The compass aliases, in the root of a plan whose north is up by default. */
const COMPASS = wrap(`  room id=hall at (0,0) size 4000x3000 label "Hall"
  wall exterior thickness 200 { (hall.west, hall.north) (hall.east, hall.north) (hall.east, hall.south) (hall.west, hall.south) close }`);
const COMPASS_LIT = wrap(`  room id=hall at (0,0) size 4000x3000 label "Hall"
  wall exterior thickness 200 { (0, 0) (4000, 0) (4000, 3000) (0, 3000) close }`);

/** A centre on a half grid: `cx` is 2050 on a 100 mm grid and snaps as a literal 2050 does. */
const HALF = `plan "H" {\n  units mm\n  grid 100\n  room id=hall at (0,0) size 4100x3000 label "Hall"\n  wall interior thickness 100 { (hall.cx, hall.top) (hall.cx, hall.bottom) }\n}\n`;
const HALF_LIT = `plan "H" {\n  units mm\n  grid 100\n  room id=hall at (0,0) size 4100x3000 label "Hall"\n  wall interior thickness 100 { (2050, 0) (2050, 3000) }\n}\n`;

const TWINS: [string, string, string][] = [
  ["plain", PLAIN, PLAIN_LIT],
  ["frames", FRAMES, FRAMES_LIT],
  ["compass", COMPASS, COMPASS_LIT],
  ["half-grid", HALF, HALF_LIT],
];

function steps(src: string): number {
  clearResolveCache();
  const { plan } = parse(src, BUILTIN_REGISTRY);
  if (!plan) throw new Error("the test plan did not parse");
  return evaluationSteps(resolveAll(link(plan, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD));
}

function irWith(src: string, files: Record<string, string>) {
  const world = makeVirtualWorld(files);
  const { plan } = parse(src, BUILTIN_REGISTRY);
  if (!plan) throw new Error("the test plan did not parse");
  return resolve(link(plan, world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, world).ir;
}

function irOf(src: string) {
  const { plan } = parse(src, BUILTIN_REGISTRY);
  if (!plan) throw new Error("the test plan did not parse");
  return resolve(link(plan, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD).ir;
}

suite("swap-back: a datum plan and its literal twin are byte-identical", () => {
  for (const [name, withDatums, literal] of TWINS) {
    it(`${name}: SVG, describe(), lint() and diagnostics of every storey`, () => {
      const a = allStoreysDiagnosticsPayload(API, withDatums);
      const b = allStoreysDiagnosticsPayload(API, literal);
      expect(compile(withDatums, { noCache: true }).diagnostics).toEqual([]);
      expect(a).toBe(b);
    });
  }

  it("a datum read costs what the literal it replaces costs (one evaluated node)", () => {
    // The plain twin: every datum stands where one number literal stands.
    expect(steps(PLAIN)).toBe(steps(PLAIN_LIT));
    // Under `place`, the first datum read of a group also builds that group's set of
    // instance element ids (`E_DATUM_NAME`), one step per element, charged before it is built.
    expect(steps(FRAMES)).toBeGreaterThan(steps(FRAMES_LIT));
  });
});

suite("frames: local words inside a component, world words from the root", () => {
  const ir = irOf(FRAMES);
  const tables = datumTablesOf(ir);
  const furn = (id: string) => ir.elements.find((e): e is RFurniture => e.kind === "furniture" && e.category === id)!;

  it("the root reads the turned and mirrored rooms in world words", () => {
    expect(tables.get("")!.rooms.get("west.main")).toEqual({
      top: 0,
      bottom: 4000,
      left: -3000,
      right: 0,
      cx: -1500,
      cy: 2000,
    });
    // `mirror x` swaps left and right: the local left edge (x 0) is the world RIGHT edge.
    expect(tables.get("")!.rooms.get("east.main")).toEqual({
      top: 0,
      bottom: 3000,
      left: 6000,
      right: 10000,
      cx: 8000,
      cy: 1500,
    });
    expect(furn("table").at).toEqual({ x: -2700, y: 300 });
    expect(furn("desk").at).toEqual({ x: 6300, y: 2100 });
  });

  it("each instance reads its own rooms in its own frame", () => {
    for (const p of ["west", "east"]) {
      expect(tables.get(p)!.rooms.get("main")).toEqual({
        top: 0,
        bottom: 3000,
        left: 0,
        right: 4000,
        cx: 2000,
        cy: 1500,
      });
    }
  });
});

// ---- refusals ----------------------------------------------------------------------------

/** The diagnostics of `src` with `code`, as the source text each span covers. */
function refused(src: string, code: string): string[] {
  return compile(src, { noCache: true })
    .diagnostics.filter((d) => d.code === code)
    .map((d) => (d.span ? src.slice(d.span.start, d.span.end) : "<no span>"));
}

const HALL = `  room id=hall at (0,0) size 4000x3000 label "Hall"\n`;

suite("E_DATUM_BEFORE_ROOMS: a datum read before the table exists", () => {
  it.each([
    ["a let", `${HALL}  let x = hall.right`],
    ["a let through a function", `${HALL}  let f(k) = hall.right + k\n  let x = f(1)`],
    ["a loop bound", `${HALL}  for i in 0..hall.cx { }`],
    ["a condition", `${HALL}  if hall.top > 0 { }`],
    ["a room's own at", `${HALL}  room id=b at (hall.right, 0) size 1000x1000`],
    ["a room's own size", `${HALL}  room id=b at (5000, 0) size hall.right x 1000`],
    ["a relational gap", `${HALL}  room id=b right-of hall gap hall.cx size 1000x1000`],
    ["a place", `${HALL}  component c() { room at (0,0) size 1000x1000 }\n  place c() as k at (hall.right, 0)`],
    ["a set", `${HALL}  set door(width: hall.right / 3)`],
  ])("%s", (_, body) => {
    const src = wrap(body);
    expect(refused(src, "E_DATUM_BEFORE_ROOMS")).toEqual([
      src.match(/hall\.\w+/g)![src.match(/hall\.\w+/g)!.length - 1],
    ]);
  });

  it("a plan setting (the storey height)", () => {
    const src = wrap(HALL, "  height hall.bottom\n");
    expect(refused(src, "E_DATUM_BEFORE_ROOMS")).toEqual(["hall.bottom"]);
  });

  it("the room pass and the expansion say which they are", () => {
    const pass = compile(wrap(`${HALL}  room id=b at (hall.right, 0) size 1000x1000`), { noCache: true });
    const expand = compile(wrap(`${HALL}  let x = hall.right`), { noCache: true });
    expect(pass.diagnostics.find((d) => d.code === "E_DATUM_BEFORE_ROOMS")!.message).toMatch(/rooms are being placed/);
    expect(expand.diagnostics.find((d) => d.code === "E_DATUM_BEFORE_ROOMS")!.message).toMatch(/when the plan expands/);
  });
});

suite("E_DATUM_COMPASS: a compass word only where it means one thing", () => {
  const read = `${HALL}  wall interior thickness 100 { (0, hall.north) (4000, hall.north) }`;

  it("aliases in the root with `north up`, explicit or by default", () => {
    const lit = `${HALL}  wall interior thickness 100 { (0, 0) (4000, 0) }`;
    for (const head of ["", "  north up\n"]) {
      const src = wrap(read, head);
      expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
      expect(compile(src, { noCache: true }).svg).toBe(compile(wrap(lit, head), { noCache: true }).svg);
    }
  });

  it.each([
    ["north right", "  north right\n"],
    ["north down", "  north down\n"],
    ["a bearing, even 0", "  north 0\n"],
  ])("refuses with %s", (_, head) => {
    const src = wrap(read, head);
    expect(refused(src, "E_DATUM_COMPASS")).toEqual(["hall.north", "hall.north"]);
  });

  it("refuses inside a placed component, where the word is the component's frame", () => {
    const src = wrap(`  component c() {
    room id=r at (0,0) size 3000x3000
    wall interior thickness 100 { (0, r.south) (3000, r.south) }
  }
  place c() as k at (0,0)`);
    expect(refused(src, "E_DATUM_COMPASS")).toEqual(["r.south", "r.south"]);
  });

  it("aliases in a legacy bare component call, which is the root frame", () => {
    const src = wrap(`  component c() {
    room id=r at (0,0) size 3000x3000
    wall interior thickness 100 { (0, r.south) (3000, r.south) }
  }
  c()`);
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
  });
});

suite("E_DATUM_NAME: a dotted path that is also an element inside an instance", () => {
  it("refuses `west.top` when the instance `west` holds an element `top`", () => {
    const src = wrap(`  component wing() { room id=top at (0,0) size 3000x3000 }
  place wing() as west at (0,0)
  wall interior thickness 100 { (0, west.top) (3000, west.top) }`);
    expect(refused(src, "E_DATUM_NAME")).toEqual(["west.top", "west.top"]);
  });

  it("control: the same reading with no such element is the room's edge", () => {
    const src = wrap(`  component wing() { room id=main at (0,0) size 3000x3000 }
  place wing() as west at (0,0)
  wall interior thickness 100 { (0, west.main.top) (3000, west.main.top) }`);
    expect(compile(src, { noCache: true }).diagnostics).toEqual([]);
  });
});

suite("rooms that expose no datum", () => {
  it("E_ROOM_NOT_RECTANGLE for a polygon and a circle room", () => {
    const src = wrap(`  room id=L polygon (0,0) (6000,0) (6000,4000) (0,4000)
  room id=C circle at (9000,2000) radius 1000
  wall interior thickness 100 { (L.left, 0) (C.cx, 4000) }`);
    expect(refused(src, "E_ROOM_NOT_RECTANGLE")).toEqual(["L.left", "C.cx"]);
  });

  it("E_DATUM_UNPLACED for a room that could not be placed, and for one of no size", () => {
    const src = wrap(`  room id=a right-of ghost size 3000x3000
  room id=z at (0,0) size 0x3000
  wall interior thickness 100 { (a.left, 0) (z.right, 3000) }`);
    expect(refused(src, "E_DATUM_UNPLACED")).toEqual(["a.left", "z.right"]);
  });

  it("E_UNKNOWN_REF for a room the group cannot see, with the closest id as a hint", () => {
    const src = wrap(`${HALL}  wall interior thickness 100 { (hal.left, 0) (hall.left, 3000) }`);
    const d = compile(src, { noCache: true }).diagnostics.filter((x) => x.code === "E_UNKNOWN_REF");
    expect(d.map((x) => src.slice(x.span!.start, x.span!.end))).toEqual(["hal.left"]);
    expect(d[0]!.hints).toEqual(['did you mean "hall.left"?']);
  });

  it("an instance cannot read the root's rooms (ADR 0016: it sees nothing outside itself)", () => {
    const src = wrap(`${HALL}  component c() { wall interior thickness 100 { (0, hall.top) (1000, hall.top) } }
  place c() as k at (0,0)`);
    expect(refused(src, "E_UNKNOWN_REF")).toEqual(["hall.top", "hall.top"]);
  });

  it("a dotted name whose last segment is no datum word stays the old unknown name", () => {
    const src = wrap(`${HALL}  wall interior thickness 100 { (hall.width, 0) (0, 3000) }`);
    const d = compile(src, { noCache: true }).diagnostics.filter((x) => x.code === "E_UNKNOWN_REF");
    expect(d.map((x) => x.message)).toEqual(['Unknown name "hall.width"']);
  });
});

// ---- scopes a datum must not leak through ------------------------------------------------

suite("an imported module's `let` is expansion, whoever looks it up first", () => {
  // The module's `let`s are expanded lazily, on the first fallback lookup, and cached for
  // every component of the module. Red-team probe: the first lookup came from an instance's
  // wall pass, read THAT instance's table, and the other component reused the value, so
  // swapping the two `place` lines moved the drawing with no diagnostic.
  const mod = (e: string): string => `plan "m" {
  units mm
  let E = ${e}
  component a() {
    room id=main at (0,0) size 3000x2000
    wall interior thickness 100 { (0, E) (3000, E) }
  }
  component b() {
    room id=main at (0,0) size 5000x5000
    wall interior thickness 100 { (0, E) (5000, E) }
  }
}
`;
  const DATUM = mod("main.bottom");
  const LITERAL = mod("0");
  const root = (first: string, second: string): string =>
    wrap(
      `  import "m.arch": a, b\n  place ${first}() as p${first} at (0,0)\n  place ${second}() as p${second} at (10000,0)`,
    );

  for (const [first, second] of [
    ["a", "b"],
    ["b", "a"],
  ] as const) {
    it(`refuses in m.arch, at the datum, with \`${first}\` placed first`, () => {
      const src = root(first, second);
      const out = compile(src, { world: makeVirtualWorld({ "m.arch": DATUM }), noCache: true });
      const d = out.diagnostics.filter((x) => x.code === "E_DATUM_BEFORE_ROOMS");
      expect(d.map((x) => [x.file, DATUM.slice(x.span!.start, x.span!.end)])).toEqual([["m.arch", "main.bottom"]]);
      // An error draws nothing, so the rest is read off the resolved walls: in either order
      // both components' walls sit where the module with the refused value's 0 puts them.
      const walls = (m: string) =>
        irWith(src, { "m.arch": m })
          .walls.map((w) => [w.id, w.points])
          .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
      expect(walls(DATUM)).toEqual(walls(LITERAL));
      // Neither component read the other's (or its own) room: every wall is at E = 0.
      const ys = walls(DATUM).flatMap((w) => (w[1] as { y: number }[]).map((p) => p.y));
      expect(ys).toEqual([0, 0, 0, 0]);
    });
  }
});

suite("a function body has no room of its own", () => {
  it("refuses a datum in the body of a root function called from an instance's wall", () => {
    const src = wrap(`  let f() = main.bottom
  component c(h) {
    room id=main at (0,0) size 3000x h
    wall interior thickness 100 { (0, f()) (3000, f()) }
  }
  place c(2000) as k at (0,0)`);
    const d = compile(src, { noCache: true }).diagnostics.filter((x) => x.code === "E_DATUM_BEFORE_ROOMS");
    expect(d.map((x) => src.slice(x.span!.start, x.span!.end))).toEqual(["main.bottom", "main.bottom"]);
    expect(d[0]!.message).toMatch(/inside the body of `f`.*pass the edge as an argument: `f\(main\.bottom\)`/);
  });

  it("refuses a function written inside a component body reading that component's room", () => {
    const src = wrap(`  component c() {
    room id=main at (0,0) size 3000x2000
    let g() = main.bottom
    wall interior thickness 100 { (0, g()) (3000, g()) }
  }
  place c() as k at (0,0)`);
    expect(refused(src, "E_DATUM_BEFORE_ROOMS")).toEqual(["main.bottom", "main.bottom"]);
  });

  it("an edge passed as an argument from a wall works, and draws as the literal twin", () => {
    const fn = (arg: string): string =>
      wrap(`  let f(y) = y - 500
  component c() {
    room id=main at (0,0) size 3000x2000
    wall interior thickness 100 { (0, f(${arg})) (3000, f(${arg})) }
  }
  place c() as k at (0,0) rotate 90`);
    const datum = fn("main.bottom");
    expect(compile(datum, { noCache: true }).diagnostics).toEqual([]);
    expect(allStoreysDiagnosticsPayload(API, datum)).toBe(allStoreysDiagnosticsPayload(API, fn("2000")));
  });

  it("the same argument from a `let` still refuses, as an expansion read", () => {
    const src = wrap(`${HALL}  let f(y) = y - 500\n  let x = f(hall.bottom)`);
    const d = compile(src, { noCache: true }).diagnostics.filter((x) => x.code === "E_DATUM_BEFORE_ROOMS");
    expect(d.map((x) => src.slice(x.span!.start, x.span!.end))).toEqual(["hall.bottom"]);
    expect(d[0]!.message).toMatch(/when the plan expands/);
  });
});

// ---- the digest table --------------------------------------------------------------------

/**
 * `allStoreysDigestWithDiagnostics` of each datum plan, pinned once the form worked and the
 * swap-back law above held for every row (so each digest is ALSO its literal twin's). A moved
 * row is a finding to explain (`docs/testing.md` §3), never a re-pin.
 */
const DIGESTS: [string, string][] = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["plain", "d715b3b0c20822545b511049a4edc5f59a57d883f1f73246491df4c9874e9cfd"],
  ["frames", "8f91d2eae69c96262dd74c35f8fca1e2dd1786290a71c765661918993e032ffb"],
  ["compass", "b1fc05ae2b823375fdeaba01ec043a2927b666d5fe0ae07ee2f72c78579fc640"],
  ["half-grid", "496a205d32b5691ffaa7ea6f439a04a189df9c215bb86cb3619b4be1d80c6a91"],
];

suite("datum plans: digest table", () => {
  it("pins every twin", () => {
    expect(DIGESTS.map((d) => d[0])).toEqual(TWINS.map((t) => t[0]));
  });
  for (const [name, digest] of DIGESTS) {
    it(name, () => {
      const twin = TWINS.find((t) => t[0] === name)!;
      expect(allStoreysDigestWithDiagnostics(API, twin[1])).toBe(digest);
      expect(allStoreysDigestWithDiagnostics(API, twin[2])).toBe(digest);
    });
  }
});
