import { readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, ERROR_CATALOG, lint } from "../src/index.js";
import { buildingContexts, DEFAULT_RULESET, LINT_PROFILES } from "../src/lint.js";
import { KITCHEN_FIX, WET_FIX } from "../src/lint/rules/per-room.js";
import type { World } from "../src/world.js";
import { resolvePlan } from "../src/analyze.js";
import { computeCirculation } from "../src/analyze/circulation.js";
import { buildLintContext } from "../src/lint/context.js";

/**
 * Four lint diagnostics whose text an agent must be able to act on WITHOUT a second guess.
 *
 * Each case is a minimal plan the fresh-agent audit (or its red team) hit, and each test is the
 * same proof of "self-correctable": the diagnostic fires; the edit its own hint text names is
 * read out of that text (never retyped here) and applied to the source; the diagnostic is gone
 * AND nothing new appears — a hint that trades one warning for another is not a fix. Every
 * case runs under the default ruleset and the `accessibility-advisory` profile, whose wider
 * clearances are where a remedy is most likely to collide with something.
 */

const A11Y = "accessibility-advisory";
const PROFILES = [undefined, A11Y] as const;
type Profile = (typeof PROFILES)[number];
const opts = (p: Profile) => (p ? { profile: p } : {});
const minOf = (p: Profile) =>
  (p ? LINT_PROFILES[p]?.minPathClearWidthMm : undefined) ?? DEFAULT_RULESET.minPathClearWidthMm;

const of = (src: string, code: string, p?: Profile) => lint(src, opts(p)).filter((d) => d.code === code);

/** Every code the plan raises, compile and lint, as a multiset. */
function codes(src: string, p: Profile): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of [...compile(src, { noCache: true }).diagnostics, ...lint(src, opts(p))])
    m.set(d.code ?? "", (m.get(d.code ?? "") ?? 0) + 1);
  return m;
}

/** The codes `after` raises more often than `before` did — what an edit introduced. */
function gained(before: string, after: string, p?: Profile): string[] {
  const a = codes(before, p);
  return [...codes(after, p)].filter(([c, n]) => n > (a.get(c) ?? 0)).map(([c]) => c);
}

/** Every backticked span of `text` that matches `re`. */
const allQuoted = (text: string, re: RegExp): string[] =>
  [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]!).filter((q) => re.test(q));

/** The first backticked span of `text` that matches `re`, or a test failure. */
function quoted(text: string, re: RegExp): string {
  const [q] = allQuoted(text, re);
  if (q === undefined) throw new Error(`no backticked match for ${re} in: ${text}`);
  return q;
}

/** Replace exactly one occurrence of `from` in `src` (a test failure if there is not exactly one). */
function replaceOnce(src: string, from: string, to: string): string {
  const parts = src.split(from);
  if (parts.length !== 2) throw new Error(`expected one "${from}", found ${parts.length - 1}`);
  return parts.join(to);
}

/** Insert a statement before the plan's closing brace. */
const insert = (src: string, stmt: string): string => src.replace(/\}\s*$/, `  ${stmt}\n}\n`);

const errorsOf = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");

const worldFor = (dir: string): World => ({
  read: (p) => {
    try {
      return readFileSync(resolvePath(dir, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
});

/** Every `.arch` file in the given repo directories, with the World its own directory needs. */
const corpus = (dirs: readonly string[]) =>
  dirs.flatMap((dir) => {
    const abs = resolvePath(dir);
    return readdirSync(abs)
      .filter((f) => f.endsWith(".arch"))
      .map((f) => ({ name: `${dir}/${f}`, src: readFileSync(join(abs, f), "utf8"), world: worldFor(abs) }));
  });

describe("W_ROOM_NO_FIXTURE — the hint's statement compiles, clears it, and raises nothing new", () => {
  const BATH = `plan "Empty bath" {
  units mm
  wall id=w_out exterior thickness 200 { (0,0) (3000,0) (3000,2500) (0,2500) close }
  room id=r_bath at (0,0) size 3000x2500 label "Bath" uses bath
  door id=d on w_out at 9500 width 900
}
`;
  const KITCHEN = BATH.replace('label "Bath" uses bath', 'label "Kitchen" uses kitchen').replace(/r_bath/g, "r_kit");
  // The door on the TOP wall, swinging in: `anchor top` would land the WC in its swing.
  const DOOR_ON_TOP = replaceOnce(
    BATH,
    "door id=d on w_out at 9500 width 900",
    "door id=d on w_out at 1500 width 900 swing in",
  );
  const POLY = replaceOnce(
    BATH,
    "room id=r_bath at (0,0) size 3000x2500",
    "room id=r_bath polygon (0,0) (3000,0) (3000,2500) (0,2500)",
  );
  const L_SHAPE = `plan "L bath" {
  units mm
  wall id=w_out exterior thickness 200 { (0,0) (3000,0) (3000,1500) (1500,1500) (1500,3000) (0,3000) close }
  room id=r_bath polygon (0,0) (3000,0) (3000,1500) (1500,1500) (1500,3000) (0,3000) label "Bath" uses bath
  door id=d on w_out at 2000 width 900
}
`;
  // A relational room cannot take `anchor` (E_PLACE_REF), so it gets the `at (x,y)` form.
  const RELATIONAL = `plan "Relational bath" {
  units mm
  wall id=w_out exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall id=w_mid partition thickness 100 { (3000,0) (3000,3000) }
  room id=r_hall at (0,0) size 3000x3000 label "Hall" uses hall entry
  room id=r_bath right-of r_hall size 3000x3000 label "Bath" uses bath
  door id=d on w_out at 17000 width 900
  door id=d2 on w_mid at 1500 width 900
}
`;
  // The red team's half-walled bath: the top partition stops at x 1600, a door swings in on
  // the left and a cabinet sits top-left, so every candidate but a wall-backed one is wrong.
  const HALF_WALLED = `plan "Half-walled bath" {
  units mm
  wall id=w_l exterior thickness 200 { (0,0) (0,2500) }
  wall id=w_b exterior thickness 200 { (0,2500) (3000,2500) }
  wall id=w_r exterior thickness 200 { (3000,0) (3000,2500) }
  wall id=w_t partition thickness 100 { (0,0) (1600,0) }
  room id=r_bath at (0,0) size 3000x2500 label "Bath" uses bath
  door id=d on w_l at 1300 width 900 swing in
  furniture cabinet at (100,100) size 600x600
}
`;
  const GRID_600 = POLY.replace("units mm", "units mm\n  grid 600");

  const CASES = [
    ["bathroom", BATH],
    ["kitchen", KITCHEN],
    ["bathroom with its door on the top wall", DOOR_ON_TOP],
    ["polygon bathroom (`at (x,y)` form)", POLY],
    ["L-shaped bathroom", L_SHAPE],
    ["relational bathroom (`in <room> anchor` form: placed before its furniture, PS0.5)", RELATIONAL],
    ["half-walled bathroom (the back must be on a wall)", HALF_WALLED],
    ["polygon bathroom on grid 600 (snapping must not float it)", GRID_600],
  ] as const;
  for (const p of PROFILES) {
    for (const [name, src] of CASES) {
      it(`${p ?? "default"} · ${name}: whatever statement it quotes clears the warning and raises nothing new`, () => {
        const [d] = of(src, "W_ROOM_NO_FIXTURE", p);
        expect(d).toBeDefined();
        const hint = d!.hints!.join(" ");
        expect(hint).not.toMatch(/`import|lib\/fixtures/);
        // The hint quotes the room's defining pieces, placed together (a bath's bathtub or
        // shower, a kitchen's sink, hob AND worktop): one fixture alone would leave the room furnished
        // and still lacking its defining piece, which W_ROOM_MISSING_DEFINING reports.
        const stmts = allQuoted(hint, /^furniture /);
        const [stmt] = stmts;
        if (stmt === undefined) {
          // Only a room where nothing fits may decline, and it must say why. PS2.69: these rooms'
          // only door is an exit, so a set standing in its clear floor would raise
          // `W_EXIT_APPROACH_BLOCKED` and is not quoted (the half-walled bath's bathtub on the
          // bottom wall, in front of its door; the kitchen's counter under the a11y profile's
          // 1220 / 1525 mm), and the hint says that instead.
          const raises = hint.includes("the placement found would raise another finding");
          if (!(raises && p === A11Y && src === KITCHEN)) expect(name).toMatch(/grid 600|half-walled/);
          // The reason must be the true one: on grid 600 the grid, not crowded walls.
          if (src === GRID_600) {
            expect(hint).toContain("`grid 600` snaps an `at (x,y)` placement off the wall face");
            expect(hint).not.toContain("make room first");
          } else if (!raises) expect(hint).toContain("make room first");
          return;
        }
        // A relational room is placed before any furniture resolves (ADR 0028 §1), so the
        // closed-form anchor works on it as on an absolute room (backlog PS0.5).
        if (src === RELATIONAL) expect(stmt).toMatch(/^furniture (bathtub|shower) in r_bath anchor /);
        if (src === POLY || src === L_SHAPE)
          expect(stmt).toMatch(/^furniture (bathtub|shower) at \(\d+,\d+\) size \d+x\d+( rotate \d+)? in r_bath$/);
        const fixed = stmts.reduce((s, q) => insert(s, q), src);
        expect(errorsOf(fixed)).toEqual([]);
        expect(of(fixed, "W_ROOM_NO_FIXTURE", p)).toEqual([]);
        expect(gained(src, fixed, p)).toEqual([]);
      });
    }
  }

  it("the message of a LABELLED room reads exactly as it always did (PS2.29 changed only unlabelled rooms)", () => {
    expect(of(BATH, "W_ROOM_NO_FIXTURE")[0]!.message).toBe('Bathroom "Bath" has no fixtures (WC, basin, shower…).');
    expect(of(KITCHEN, "W_ROOM_NO_FIXTURE")[0]!.message).toBe(
      'Kitchen "Kitchen" has no fixtures (sink, counter, stove…).',
    );
  });

  it("the default cases each DO quote a statement (the clean-paste tests above are not vacuous)", () => {
    for (const src of [BATH, DOOR_ON_TOP, POLY, L_SHAPE, RELATIONAL])
      expect(allQuoted(of(src, "W_ROOM_NO_FIXTURE")[0]!.hints!.join(" "), /^furniture /)).toHaveLength(1);
    // A kitchen is defined by three pieces, its sink, its hob and its worktop: all are quoted.
    expect(allQuoted(of(KITCHEN, "W_ROOM_NO_FIXTURE")[0]!.hints!.join(" "), /^furniture /)).toHaveLength(3);
  });

  it("a room with no clear wall run gets the footprint, not a statement that would collide", () => {
    // A 900 mm square closet whose only door swings across it.
    const tiny = `plan "Closet WC" {
  units mm
  wall id=w_out exterior thickness 200 { (0,0) (900,0) (900,900) (0,900) close }
  room id=r_wc at (0,0) size 900x900 label "WC" uses wc
  door id=d on w_out at 450 width 800 swing in
}
`;
    const hint = of(tiny, "W_ROOM_NO_FIXTURE")[0]!.hints!.join(" ");
    expect(allQuoted(hint, /^furniture /)).toEqual([]);
    expect(hint).toContain("make room first");
  });

  it("a grid that snaps the footprint away quotes no `size 0x…`: it says to use a finer grid", () => {
    // A WC: its defining piece is the 400 mm `wc`, which a 1000 mm grid snaps to nothing (a
    // bath's bathtub, 1700 x 700, would survive the snap).
    const coarse = BATH.replace("units mm", "units mm\n  grid 1000").replace(
      'label "Bath" uses bath',
      'label "WC" uses wc',
    );
    const hint = of(coarse, "W_ROOM_NO_FIXTURE")[0]!.hints!.join(" ");
    expect(allQuoted(hint, /^furniture /)).toEqual([]);
    expect(hint).toContain("`grid 1000`");
  });

  it("a room with no straight, square wall says that, not that its walls are crowded", () => {
    const diamond = `plan "Diamond bath" {
  units mm
  wall id=w_out exterior thickness 200 { (2000,0) (4000,2000) (2000,4000) (0,2000) close }
  room id=r_bath polygon (2000,0) (4000,2000) (2000,4000) (0,2000) label "Bath" uses bath
  door id=d on w_out at 1000 width 900
}
`;
    const hint = of(diamond, "W_ROOM_NO_FIXTURE")[0]!.hints!.join(" ");
    expect(allQuoted(hint, /^furniture /)).toEqual([]);
    expect(hint).toContain("no straight wall running square to the page");
    expect(hint).not.toContain("make room first");
  });

  it("the catalog fix names only built-in categories, each in the right room kind", () => {
    const fix = ERROR_CATALOG.W_ROOM_NO_FIXTURE!.fix;
    expect(fix).not.toMatch(/`import|lib\/fixtures/);
    const [wet, kitchen] = fix.split("; a kitchen");
    const cats = (s: string) => [...s.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!);
    const wetCats = cats(wet!.split("(e.g.")[0]!);
    const kitCats = cats(kitchen!.split("(e.g.")[0]!);
    expect(wetCats.length).toBeGreaterThan(0);
    expect(kitCats.length).toBeGreaterThan(0);
    for (const c of wetCats) expect(WET_FIX.has(c), `${c} is not a wet-room fixture`).toBe(true);
    for (const c of kitCats) expect(KITCHEN_FIX.has(c), `${c} is not a kitchen fixture`).toBe(true);
    // The two worked statements in the fix compile and satisfy the rule in rooms of those ids.
    for (const stmt of [...fix.matchAll(/`(furniture [^`]+)`/g)].map((m) => m[1]!)) {
      const room = /in (\w+) anchor/.exec(stmt)![1]!;
      const src = BATH.replace(/r_bath/g, room).replace("uses bath", room === "kitchen" ? "uses kitchen" : "uses bath");
      const placed = insert(src, stmt);
      expect(errorsOf(placed)).toEqual([]);
      expect(of(placed, "W_ROOM_NO_FIXTURE")).toEqual([]);
    }
  });
});

describe("W_FIXTURE_BACK_TO_ROOM — the size's aspect decides the wall; the hint swaps it", () => {
  // The audit's case: a WC anchored on the EAST wall at 400x700 (depth running along the wall).
  const SRC = `plan "Side-wall WC" {
  units mm
  wall id=w_out exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r_bath at (0,0) size 4000x3000 label "Bath" uses bath
  door id=d on w_out at 12000 width 900
  furniture wc in r_bath anchor right flush size 400x700
}
`;

  for (const p of PROFILES) {
    it(`${p ?? "default"} · anchored: no machine fix; the swapped size alone clears it, and no \`rotate\` is asked for`, () => {
      const [d] = of(SRC, "W_FIXTURE_BACK_TO_ROOM", p);
      expect(d).toBeDefined();
      expect(d!.fixes ?? []).toEqual([]);
      const hint = d!.hints!.join(" ");
      expect(hint).not.toMatch(/let the rotation be derived\.$/); // the old, contradictory advice
      expect(allQuoted(hint, /^rotate /)).toEqual([]); // the anchor derives it
      const size = quoted(hint, /^size \d+x\d+$/);
      expect(size).toBe("size 700x400");
      const fixed = replaceOnce(SRC, "size 400x700", size);
      expect(of(fixed, "W_FIXTURE_BACK_TO_ROOM", p)).toEqual([]);
      expect(gained(SRC, fixed, p)).toEqual([]);
    });
  }

  it("at `at (x,y)`: the swapped size plus the hint's rotate clears it", () => {
    // Same WC hard against the east wall's inner face (x 3900), placed by coordinates.
    const at = replaceOnce(SRC, "in r_bath anchor right flush size 400x700", "at (3500,1150) size 400x700");
    const [d] = of(at, "W_FIXTURE_BACK_TO_ROOM");
    expect(d).toBeDefined();
    const hint = d!.hints!.join(" ");
    const size = quoted(hint, /^size \d+x\d+$/);
    const rotate = quoted(hint, /^rotate \d+$/);
    expect([size, rotate]).toEqual(["size 700x400", "rotate 90"]);
    // The box keeps its east edge on the wall face: 3900 − 700 = 3200.
    const fixed = replaceOnce(at, "at (3500,1150) size 400x700", `at (3200,1300) ${size} ${rotate}`);
    expect(errorsOf(fixed)).toEqual([]);
    expect(of(fixed, "W_FIXTURE_BACK_TO_ROOM")).toEqual([]);
    expect(gained(at, fixed)).toEqual([]);
  });

  it("the catalog fix states the aspect rule with the WC example, and the example is true", () => {
    const fix = ERROR_CATALOG.W_FIXTURE_BACK_TO_ROOM!.fix;
    expect(fix).toContain("`size 400x700` against a north or south wall");
    expect(fix).toContain("`size 700x400` against an east or west one");
    // North wall at 400x700 and east wall at 700x400 are both clean when anchored.
    const north = replaceOnce(SRC, "anchor right flush size 400x700", "anchor top flush size 400x700");
    const east = replaceOnce(SRC, "anchor right flush size 400x700", "anchor right flush size 700x400");
    expect(of(north, "W_FIXTURE_BACK_TO_ROOM")).toEqual([]);
    expect(of(east, "W_FIXTURE_BACK_TO_ROOM")).toEqual([]);
  });
});

describe("W_FURNITURE_WALL_COLLISION — names the wall; `offset` is the CENTRE; a quoted offset is checked", () => {
  // The audit's case: a fridge `against wall w_north` whose `offset` was read as its left edge.
  const SRC = `plan "Fridge through a partition" {
  units mm
  wall id=w_north exterior thickness 200 { (0,0) (8000,0) }
  wall id=w_south exterior thickness 200 { (0,4000) (8000,4000) }
  wall id=w_west exterior thickness 200 { (0,0) (0,4000) }
  wall id=w_east exterior thickness 200 { (8000,0) (8000,4000) }
  wall id=w_part partition thickness 100 { (4000,0) (4000,4000) }
  room id=r_store at (0,0) size 4000x4000 label "Store"
  room id=r_kit at (4000,0) size 4000x4000 label "Kitchen" uses kitchen
  door on w_south at 6000 width 900
  door on w_part at 2000 width 900
  furniture fridge against wall w_north offset 4100 in r_kit
  furniture stove against wall w_north offset 5300 in r_kit
}
`;
  // The stove at 5300 (5200 until PS2.11e): at 5200 the quoted fridge position, 4350, stood 250 mm
  // from the hob, inside the 300 mm `W_HOB_FRIDGE_GAP` keeps, so the placement check moved on.
  const FRIDGE = "furniture fridge against wall w_north offset 4100 in r_kit";
  /** Fires; if it quotes an `offset`, pasting it clears the warning and adds nothing. */
  function pasteClears(src: string, from: string, p: Profile): string | null {
    const [d] = of(src, "W_FURNITURE_WALL_COLLISION", p);
    expect(d).toBeDefined();
    const [offset] = allQuoted(d!.hints!.join(" "), /^offset \d+$/);
    if (offset === undefined) {
      expect(d!.hints!.join(" ")).toContain("move it to another wall or shorten it");
      return null;
    }
    const fixed = replaceOnce(
      src,
      from,
      from.replace(/offset \d+|in r_kit$/, (m) => (m === "in r_kit" ? `${offset} in r_kit` : offset)),
    );
    expect(errorsOf(fixed)).toEqual([]);
    expect(of(fixed, "W_FURNITURE_WALL_COLLISION", p)).toEqual([]);
    expect(gained(src, fixed, p)).toEqual([]);
    return offset;
  }

  it("fires naming the crossed wall: by kind and line in the message, by id in the hint", () => {
    const [d] = of(SRC, "W_FURNITURE_WALL_COLLISION");
    expect(d!.message).toBe(
      'Furniture "fridge" penetrates the partition wall at x 4000 — 100 mm into its 100 mm thickness.',
    );
    expect(d!.hints!.join(" ")).toContain('wall "w_part"');
    expect(d!.hints!.join(" ")).toContain("CENTRE");
  });

  const CASES: [string, string, string, string | null][] = [
    ["the audit's case", SRC, FRIDGE, "offset 4350"],
    [
      "red-team repro A: a stub partition near the segment end (no ping-pong)",
      replaceOnce(
        insert(SRC, "wall id=w_p2 partition thickness 100 { (7300,0) (7300,1000) }"),
        "offset 4100 in r_kit",
        "offset 7400 in r_kit",
      ),
      "furniture fridge against wall w_north offset 7400 in r_kit",
      "offset 6950",
    ],
    [
      "red-team repro B: no `offset` written (the midpoint), the offset keeps it in its room",
      replaceOnce(SRC, FRIDGE, "furniture fridge against wall w_north in r_kit"),
      "furniture fridge against wall w_north in r_kit",
      "offset 4350",
    ],
    [
      "round-2 C1: another piece where the nearest clear-of-walls offset lands",
      insert(SRC, "furniture stove against wall w_north offset 4700 in r_kit"),
      FRIDGE,
      null,
    ],
    [
      "round-2 C5: a door's swing and landing where the nearest clear-of-walls offset lands",
      insert(SRC, "door on w_north at 5000 width 900 swing in"),
      FRIDGE,
      null,
    ],
  ];
  for (const p of PROFILES) {
    for (const [name, src, from, expected] of CASES) {
      it(`${p ?? "default"} · ${name}: a quoted offset clears it and raises nothing new`, () => {
        const offset = pasteClears(src, from, p);
        if (p === undefined && expected !== null) expect(offset).toBe(expected);
        // C1/C5: 4350 would gain an overlap / a swing and doorway warning, so it is not quoted.
        if (expected === null) expect(offset).not.toBe("offset 4350");
      });
    }
  }

  it("no clear position on the wall: the hint says so instead of quoting a number", () => {
    const stubs = [4500, 5100, 5700, 6300, 6900, 7500]
      .map((x) => `wall partition thickness 100 { (${x},0) (${x},1000) }`)
      .reduce(insert, replaceOnce(SRC, "offset 4100 in r_kit", "offset 4800 in r_kit"));
    const hint = of(stubs, "W_FURNITURE_WALL_COLLISION")[0]!.hints!.join(" ");
    expect(allQuoted(hint, /^offset \d+$/)).toEqual([]);
    expect(hint).toContain("move it to another wall or shorten it");
  });

  it("an `at (x,y)` piece is not told about `offset` it never wrote, and still learns the wall", () => {
    const at = replaceOnce(SRC, FRIDGE, "furniture fridge at (3800,100) size 600x650");
    const [d] = of(at, "W_FURNITURE_WALL_COLLISION");
    expect(d!.message).not.toContain("w_part");
    expect(d!.hints!.join(" ")).toContain('wall "w_part"');
    expect(d!.hints!.join(" ")).not.toMatch(/`offset \d+`/);
  });
});

/** Apply every `Widen door "x" to \`width N\`` hint to the door `x`'s own statement. Returns
 *  null when a named door is not written with that id at the top level (a component's). */
function widenAll(src: string, hints: readonly string[], level?: number): string | null {
  // Ids are unique only within a storey: on a multi-storey plan, edit inside its `level` block.
  let lo = 0;
  let hi = src.length;
  if (level !== undefined) {
    const starts = [...src.matchAll(/^\s*level (-?\d+)\b/gm)];
    const i = starts.findIndex((m) => Number(m[1]) === level);
    if (i < 0) return null;
    lo = starts[i]!.index!;
    hi = starts[i + 1]?.index ?? src.length;
  }
  const done = widenIn(src.slice(lo, hi), hints);
  return done === null ? null : src.slice(0, lo) + done + src.slice(hi);
}

function widenIn(src: string, hints: readonly string[]): string | null {
  let out = src;
  for (const h of hints) {
    const m = /^Widen (?:door|opening) "([^"]+)" to `width (\d+)`/.exec(h);
    if (!m) continue;
    const re = new RegExp(`((?:door|opening) id=${m[1]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^\\n]*?)width \\d+`);
    if (!re.test(out)) return null;
    out = out.replace(re, `$1width ${m[2]}`);
  }
  return out;
}

/**
 * Each storey's `describe()` facts (rooms + circulation), with the circulation replaced by the
 * walk `W_PATH_TOO_NARROW` reads where the two differ: on a storey that names a main entrance
 * and keeps fewer ways in (plan-soundness PS0.10, `src/analyze/entrance.ts`), the rule judges
 * the walk from the main entrance, while `describe().circulation` measures each room from its
 * nearest entrance. Each storey is walked with the building context `lint()` gives it (its
 * arriving shafts, and whether a shaft arrives from below), exactly as the rule walks it.
 */
function ruleStoreys(src: string, world: World | undefined): unknown[] {
  type S = { circulation?: unknown };
  const facts = describePlan(src, world ? { world } : {}) as S & { levels?: S[] };
  const storeys = facts.levels ?? [facts];
  const { ir, levels } = resolvePlan(src, world ? { world } : {});
  const irs = levels.length > 0 ? levels.map((l) => l.ir) : ir ? [ir] : [];
  const building = levels.length > 0 ? buildingContexts(levels, DEFAULT_RULESET.tolMm) : null;
  return storeys.map((s, i) => {
    const st = irs[i];
    if (!st || !s.circulation) return s;
    const ctx = buildLintContext(st, DEFAULT_RULESET, building?.get(levels[i]!.level));
    if (ctx.walkAccess() === ctx.access()) return s;
    const walk = computeCirculation(
      ctx.rooms,
      ctx.ir.walls,
      ctx.doors,
      ctx.openings,
      ctx.furniture,
      ctx.walkAccess(),
      ctx.rules.tolMm,
      undefined,
      ctx.verticals,
      ctx.voids,
      ctx.building.arrivalShafts,
    );
    return { ...s, circulation: walk };
  });
}

/** How many rooms labelled `label` read under `min` (or are blocked), over every storey. */
function narrowRooms(src: string, world: World | undefined, label: string, min: number): number {
  type Storey = {
    rooms?: { id: string; label?: string }[];
    circulation?: {
      rooms: { roomId: string; bottleneckClearWidthMm: number }[];
      blocked?: { roomId: string }[];
    } | null;
  };
  let n = 0;
  for (const s of ruleStoreys(src, world) as Storey[]) {
    const c = s.circulation;
    if (!c) continue;
    for (const r of s.rooms ?? []) {
      if ((r.label ?? r.id) !== label) continue;
      const rc = c.rooms.find((x) => x.roomId === r.id);
      if (c.blocked?.some((b) => b.roomId === r.id) || (rc && rc.bottleneckClearWidthMm < min)) n++;
    }
  }
  return n;
}

describe("W_PATH_TOO_NARROW — names only doors whose widening clears the room, once per opening", () => {
  // Bedroom and bath off one hall; the bath door is 700 nominal = 640 clear.
  const SRC = `plan "Narrow bath door" {
  units mm
  wall id=w_out exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=w_hall partition thickness 100 { (0,2500) (8000,2500) }
  wall id=w_mid partition thickness 100 { (4000,0) (4000,2500) }
  room id=r_bed at (0,0) size 4000x2500 label "Bedroom" uses bedroom
  room id=r_bath at (4000,0) size 4000x2500 label "Bath" uses bath
  room id=r_hall at (0,2500) size 8000x2500 label "Hall" uses hall entry
  door id=d_front on w_out at 22000 width 900
  door id=d_bed on w_hall at 2000 width 900
  door id=d_bath on w_hall at 6000 width 700
  window on w_out at 2000 width 1200
  furniture wc in r_bath anchor top-right flush size 400x700
  furniture basin in r_bath anchor top flush size 600x450
}
`;
  // The red team's series repro: hall —700 d_c— corridor —700 d_b— bath, every room walled.
  const SERIES = `plan "Doors in series" {
  units mm
  wall id=w_out exterior thickness 200 { (0,0) (9000,0) (9000,4000) (0,4000) close }
  wall id=w_1 partition thickness 100 { (3000,0) (3000,4000) }
  wall id=w_2 partition thickness 100 { (6000,0) (6000,4000) }
  room id=r_hall at (0,0) size 3000x4000 label "Hall" uses hall entry
  room id=r_corr at (3000,0) size 3000x4000 label "Corridor" uses circulation
  room id=r_bath at (6000,0) size 3000x4000 label "Bath" uses bath
  door id=d_front on w_out at 23000 width 900
  door id=d_c on w_1 at 2000 width 700
  door id=d_b on w_2 at 2000 width 700
  furniture wc in r_bath anchor top flush size 400x700
}
`;

  it("one diagnostic for the one door (the bedroom → bath route through it is not repeated)", () => {
    expect(of(SRC, "W_PATH_TOO_NARROW").map((d) => d.message)).toEqual([
      'The walk from the entrance to "Bath" squeezes to 640 mm (60 mm below the 700 mm minimum) — the bottleneck is the door between "Hall" and "Bath", 640 mm clear.',
    ]);
    expect(of(SRC, "W_PATH_TOO_NARROW")[0]!.hints![0]).toMatch(/^Widen door "d_bath" to `width \d+`/);
  });

  /** The plan as each profile needs it: under `accessibility-advisory` every 900 mm door is
   *  itself a pinch (840 clear < 900), so the doors that are NOT the subject are made 1100. */
  const wide = (src: string, p: Profile) => (p ? src.replace(/width 900\b/g, "width 1100") : src);

  for (const p of PROFILES) {
    it(`${p ?? "default"} · the hint's \`width\` on that door clears it, and raises nothing new`, () => {
      const src = wide(SRC, p);
      const [d] = of(src, "W_PATH_TOO_NARROW", p).filter((x) => x.message.includes('"Bath"'));
      expect(d!.message).toContain('the door between "Hall" and "Bath"');
      const fixed = widenAll(src, d!.hints!)!;
      expect(fixed).not.toBe(src);
      expect(of(fixed, "W_PATH_TOO_NARROW", p)).toEqual([]);
      expect(gained(src, fixed, p)).toEqual([]);
    });

    it(`${p ?? "default"} · doors in series: the bath names BOTH doors, and widening every named door clears it`, () => {
      const src = wide(SERIES, p);
      const bath = of(src, "W_PATH_TOO_NARROW", p).find((d) => d.message.includes('"Bath"'));
      expect(bath!.message).toContain(
        'the bottlenecks are the door between "Hall" and "Corridor", and the door between "Corridor" and "Bath"',
      );
      const fixed = widenAll(src, bath!.hints!)!;
      expect(of(fixed, "W_PATH_TOO_NARROW", p)).toEqual([]);
      expect(gained(src, fixed, p)).toEqual([]);
    });

    it(`${p ?? "default"} · a door that cannot clear the walk on its own is named only with the one it needs`, () => {
      // Under the accessibility profile the 900 mm front door (840 clear) is a pinch too, so
      // widening the bath door alone leaves the bath at 840. The warning names both, each at
      // its own clear width, as a set — and widening the set clears it.
      if (!p) return;
      const [d] = of(SRC, "W_PATH_TOO_NARROW", p).filter((x) => x.message.includes('"Bath"'));
      expect(d!.message).toContain(
        'the bottlenecks are the door from outside into "Hall" (840 mm clear), and the door between "Hall" and "Bath" (640 mm clear): widen them together',
      );
      const fixed = widenAll(SRC, d!.hints!)!;
      expect(of(fixed, "W_PATH_TOO_NARROW", p).filter((x) => x.message.includes('"Bath"'))).toEqual([]);
    });
  }

  it("a pinch the doors do not explain names no door (furniture, not a 900 door)", () => {
    // Widen the door to 900 (840 clear) and pinch the hall between the front door and the bath
    // door with two cabinets instead, leaving a 550 mm gap.
    const furnished = insert(
      insert(
        replaceOnce(SRC, "door id=d_bath on w_hall at 6000 width 700", "door id=d_bath on w_hall at 6000 width 900"),
        "furniture cabinet at (3000,2550) size 600x1500",
      ),
      "furniture cabinet at (3000,4600) size 600x300",
    );
    const ds = of(furnished, "W_PATH_TOO_NARROW");
    expect(ds.length).toBeGreaterThan(0); // the control: the pinch is real and reported
    for (const d of ds) {
      expect(d.message).not.toContain("bottleneck");
      expect(d.hints!.join(" ")).not.toMatch(/`width \d+`/);
    }
  });

  for (const p of PROFILES) {
    it(`${p ?? "default"} · off-path bypass: a walk through ANOTHER doorway's band never proves this room's door`, () => {
      // test/fixtures/off-path-bypass.arch: the far room's walk can pass the cabinet by
      // stepping into d_d's doorway band, so widening d_d widens it although d_d is on no
      // door-graph path to the far room. Whatever the warning names, widening exactly that
      // must clear the far room; naming d_r alone where only d_d's band lifted it is the bug.
      const src = readFileSync(resolvePath("test/fixtures/off-path-bypass.arch"), "utf8");
      const far = of(src, "W_PATH_TOO_NARROW", p).find((d) => d.message.includes('"Far room"'));
      expect(far).toBeDefined();
      if (!/ — the bottlenecks? (is|are) /.test(far!.message)) return; // naming nothing is honest
      const fixed = widenAll(src, far!.hints!)!;
      expect(of(fixed, "W_PATH_TOO_NARROW", p).filter((d) => d.message.includes('"Far room"'))).toEqual([]);
    });
  }

  it("round 2 M2b: a narrow shaft is not blamed on the door behind it", () => {
    // A storey reached only by a 600 mm stair; the box room's own door is 660 (600 clear).
    // Widening the door cannot lift the walk past the stair, so the door is not named.
    const src = `plan "Narrow stair" {
  units mm
  level 1 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    room id=hall at (0,0) size 8000x6000 label "Hall" uses hall entry
    door id=front on shell at 3000 width 1000
    stair id=st at (200,1000) size 600x3000 dir up
  }
  level 2 {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    wall id=hw partition thickness 100 { (3000,0) (3000,6000) }
    room id=landing at (0,0) size 3000x6000 label "Landing" uses hall circulation
    room id=box at (3000,0) size 5000x6000 label "Box room" uses storage
    door id=db on hw at 3000 width 660 swing into box
    stair id=st at (200,1000) size 600x3000 dir down
  }
}
`;
    const box = of(src, "W_PATH_TOO_NARROW").filter((d) => d.message.includes('"Box room"'));
    expect(box.length).toBeGreaterThan(0);
    for (const d of box) {
      expect(d.message).not.toContain("bottleneck");
      expect(d.hints!.join(" ")).not.toContain('door "db"');
    }
  });

  it("a withdrawn route still counts as warned: no later route from the same room is reported", () => {
    // "Studio" (kitchen + bedroom) has two routes under the accessibility minimum: to Living,
    // through d_l (named on Living's own walk, so withdrawn), and to Bath, pinched by two
    // cabinets (not a door). One route per origin, as before: the second must not appear.
    const src = `plan "Two routes from one room" {
  units mm
  wall id=w_n exterior thickness 200 { (0,0) (10000,0) }
  wall id=w_w exterior thickness 200 { (0,0) (0,3000) }
  wall id=w_e exterior thickness 200 { (10000,0) (10000,3000) }
  wall id=w_s1 exterior thickness 200 { (0,3000) (3000,3000) }
  wall id=w_s2 exterior thickness 200 { (5000,3000) (10000,3000) }
  wall id=w_bath exterior thickness 200 { (3000,3000) (3000,5000) (5000,5000) (5000,3000) }
  wall id=w_a partition thickness 100 { (3000,0) (3000,3000) }
  wall id=w_b partition thickness 100 { (7000,0) (7000,3000) }
  wall id=w_c partition thickness 100 { (3000,3000) (5000,3000) }
  room id=r_hall at (0,0) size 3000x3000 label "Hall" uses hall entry
  room id=r_f at (3000,0) size 4000x3000 label "Studio" uses kitchen bedroom
  room id=r_live at (7000,0) size 3000x3000 label "Living" uses living
  room id=r_bath at (3000,3000) size 2000x2000 label "Bath" uses bath
  door id=d_front on w_w at 1500 width 1100
  door id=d_f on w_a at 1500 width 1100
  door id=d_l on w_b at 1500 width 700
  door id=d_b on w_c at 1000 width 1100
  furniture cabinet at (3050,3050) size 500x600
  furniture cabinet at (4450,3050) size 500x600
}
`;
    // The control: both routes from Studio really are under the minimum.
    const routes = (
      describePlan(src) as { circulation: { routes: { fromRoomId: string; bottleneckClearWidthMm: number }[] } }
    ).circulation.routes;
    expect(routes.filter((r) => r.fromRoomId === "r_f" && r.bottleneckClearWidthMm < minOf(A11Y))).toHaveLength(2);
    const ds = of(src, "W_PATH_TOO_NARROW", A11Y);
    expect(
      ds.some(
        (d) =>
          d.message.includes('the door between "Studio" and "Living"') && d.hints!.join(" ").includes('door "d_l"'),
      ),
    ).toBe(true);
    expect(ds.filter((d) => d.message.startsWith("The route from"))).toEqual([]);
  });

  for (const p of PROFILES) {
    it(`${p ?? "default"} · corpus: widening every door a warning names lifts that room past the minimum`, () => {
      const min = minOf(p);
      let applied = 0;
      for (const { name, src, world } of corpus(["examples", "test/fixtures"])) {
        for (const d of lint(src, { world, ...opts(p) }).filter((x) => x.code === "W_PATH_TOO_NARROW")) {
          const walk = /^The walk from the entrance to "(.+?)" .* — the bottlenecks? (?:is|are) /.exec(d.message);
          if (!walk) continue;
          const fixed = widenAll(src, d.hints!, d.level);
          if (fixed === null) continue; // a component's door, not rewritable by id here
          const before = narrowRooms(src, world, walk[1]!, min);
          const after = narrowRooms(fixed, world, walk[1]!, min);
          expect(after, `${name} (${p ?? "default"}): ${d.message}`).toBeLessThan(before);
          applied++;
        }
      }
      expect(applied).toBeGreaterThan(0); // attributions exist in the corpus, so the check ran
    });

    it(`${p ?? "default"} · dedupe only DROPS: the warnings are a sub-multiset of one per room plus one route per unwarned origin`, () => {
      // The pre-dedupe selection, re-derived independently from `describe()`'s circulation
      // facts: every room under the minimum (measured or blocked), then each route under it
      // whose origin was not already warned, at most one per origin.
      const min = minOf(p);
      let checked = 0;
      for (const { name, src, world } of corpus(["examples", "test/fixtures"])) {
        type Storey = {
          rooms?: { id: string; label?: string }[];
          circulation?: {
            rooms: { roomId: string; bottleneckClearWidthMm: number }[];
            routes: { fromRoomId: string; bottleneckClearWidthMm: number }[];
            blocked?: { roomId: string }[];
          } | null;
        };
        const allowed = new Map<string, number>();
        const bump = (k: string) => allowed.set(k, (allowed.get(k) ?? 0) + 1);
        // A room is keyed by the words its message names it by (its quoted label, or the phrase an
        // unlabelled one gets: PS2.29), read off the same lint context the rule uses.
        const planned = resolvePlan(src, world ? { world } : {});
        const storeyIrs = planned.levels.length > 0 ? planned.levels.map((l) => l.ir) : planned.ir ? [planned.ir] : [];
        const building = planned.levels.length > 0 ? buildingContexts(planned.levels, DEFAULT_RULESET.tolMm) : null;
        const phrases = storeyIrs.map((st, i) => {
          const c = buildLintContext(st, DEFAULT_RULESET, building?.get(planned.levels[i]!.level));
          return new Map(c.rooms.map((r) => [r.id, c.nameOf(r)] as const));
        });
        for (const [i, s] of (ruleStoreys(src, world) as Storey[]).entries()) {
          const c = s.circulation;
          if (!c) continue;
          const label = (id: string) => phrases[i]?.get(id) ?? id;
          const warned = new Set<string>();
          for (const r of s.rooms ?? []) {
            const rc = c.rooms.find((x) => x.roomId === r.id);
            if (c.blocked?.some((b) => b.roomId === r.id) || (rc && rc.bottleneckClearWidthMm < min)) {
              warned.add(r.id);
              bump(`walk:${label(r.id)}`);
            }
          }
          for (const rt of c.routes) {
            if (rt.bottleneckClearWidthMm >= min || warned.has(rt.fromRoomId)) continue;
            warned.add(rt.fromRoomId);
            bump(`route:${label(rt.fromRoomId)}`);
          }
        }
        for (const d of lint(src, { world, ...opts(p) }).filter((x) => x.code === "W_PATH_TOO_NARROW")) {
          const walk = /^The walk from the entrance to (.+?) (?:squeezes|is blocked)/.exec(d.message);
          const route = /^The route from (.+?) to .+? squeezes/.exec(d.message);
          const k = walk ? `walk:${walk[1]}` : `route:${route![1]}`;
          const left = allowed.get(k) ?? 0;
          expect(left, `${name}: ${d.message}`).toBeGreaterThan(0);
          allowed.set(k, left - 1);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0); // the corpus does raise it, so the check ran
    });
  }
});

describe("diagnostic texts name the `archlang` command, never the coreutils-shadowed `arch`", () => {
  const ARCH_CMD = /(^|[`"' (])arch [a-z]/;
  it("no catalog entry tells the reader to run `arch <cmd>`", () => {
    for (const [code, e] of Object.entries(ERROR_CATALOG)) {
      for (const field of [e.message, e.cause, e.fix, e.example]) {
        expect(field ?? "", code).not.toMatch(ARCH_CMD);
      }
    }
  });

  it("no compile or lint message or hint over the shipped corpus does either (the door rules quote `repair`)", () => {
    let hints = 0;
    for (const { name, src, world } of corpus([
      "examples",
      "test/fixtures",
      "eval/faults",
      "eval/fidelity-plans",
      "eval/goldens",
    ])) {
      const ds = [
        ...compile(src, { noCache: true, world }).diagnostics,
        ...lint(src, { world }),
        ...lint(src, { world, profile: A11Y }),
      ];
      for (const d of ds) {
        for (const t of [d.message, ...(d.hints ?? [])]) {
          expect(t, `${name} ${d.code}`).not.toMatch(ARCH_CMD);
          if (t.includes("archlang repair")) hints++;
        }
      }
    }
    expect(hints).toBeGreaterThan(0); // the corpus does carry such a hint, so the check ran
  });
});

describe("the four reworded hints' messages name things as a reader would; ids stay in the hints", () => {
  // A consumer may show `message` to a person who never sees the source (an app built on the
  // compiler does). So these four messages quote only what the plan itself calls a room or a
  // piece of furniture; the element id an agent edits by is in the hints. Derived from
  // `describe()`, never retyped: a room is named by its label (an unlabelled room is never quoted by its id: PS2.29, `test/lint-messages-id-free.test.ts`), a
  // piece by its label or category. The three opening rules (PS2.1–PS2.3) are held to it too.
  // The three circulation-and-privacy codes (plan-soundness PS2.5–PS2.7) were written to this
  // rule from the start; `test/lint-circulation-privacy.test.ts` holds their option texts.
  const CODES = [
    "W_PATH_TOO_NARROW",
    "W_FURNITURE_WALL_COLLISION",
    "W_FIXTURE_BACK_TO_ROOM",
    "W_ROOM_NO_FIXTURE",
    "W_ROOM_VIA_PRIVATE",
    "W_WET_ROOM_DOOR",
    "W_ENTRANCE_INTO_PRIVATE",
    "W_OPENING_AT_JUNCTION",
    "W_OPENING_OVERLAP",
    "W_CONNECTOR_AMBIGUOUS",
    "W_HABITABLE_NO_WINDOW",
    "W_ROOM_MISSING_DEFINING",
    "W_BOUNDARY_NO_WALL",
    "W_FLOOR_UNASSIGNED",
    "W_ROOM_OUTSIDE_SHELL",
    "W_DIM_TEXT_MISMATCH",
    // The annotation collisions (PS2.12): rooms by label, pieces by category or label; a number
    // or a title value is never quoted as if it were a name, and the ids are in the hints.
    "W_ANNOTATION_OVERLAP",
    "W_TITLE_OVERFLOW",
    // The clearance family (PS2.11a/b): a WC and a tall unit by their label or category, the room
    // by its label (an unlabelled room is left out, never named by its id); ids in the hints.
    "W_WC_SIDE_CLEARANCE",
    "W_FURNITURE_OVER_WINDOW",
    // The clearance rules (PS2.11c, PS2.11d): a piece by its label or category and its room by
    // label; both doors by the rooms they open onto.
    "W_FOOTPRINT_TRANSPOSED",
    "W_LEAF_ACROSS_DOORWAY",
    // The clearance remainder (PS2.11e, PS2.46): a hob by its label or category and its room by
    // label; a door by the rooms it opens onto; a cased opening `W_DOORWAY_BLOCKED` names likewise.
    "W_HOB_UNDER_WINDOW",
    "W_HOB_FRIDGE_GAP",
    "W_LEAF_TOO_WIDE",
    "W_DOORWAY_BLOCKED",
    // The exit approach (PS2.69): a piece by its label or category, the exit by the room it
    // opens into; ids in the hints.
    "W_EXIT_APPROACH_BLOCKED",
  ];
  type Storey = {
    rooms?: { id: string; label?: string }[];
    furniture?: { category: string; label?: string }[];
  };
  function names(src: string, world: World): Set<string> {
    const facts = describePlan(src, { world }) as Storey & { levels?: Storey[] };
    const out = new Set<string>();
    for (const s of facts.levels ?? [facts]) {
      for (const r of s.rooms ?? []) out.add(r.label ?? r.id);
      for (const f of s.furniture ?? []) out.add(f.label ?? f.category);
    }
    return out;
  }
  // The shipped corpus plus the minimal plans above, read out of this file (never retyped):
  // the collision plan and the two door-path plans are where these messages are pinned exactly.
  const self = readFileSync(resolvePath("test/lint-fix-texts.test.ts"), "utf8");
  const inline = ["Fridge through a partition", "Doors in series", "Narrow bath door"].map((title) => {
    const from = self.indexOf(`plan "${title}" {`);
    return { name: `inline: ${title}`, src: self.slice(from, self.indexOf("\n}\n", from) + 3), world: worldFor(".") };
  });
  // The annotation-collision corpus is read too: after PS2.12 the shipped examples raise neither
  // of its codes, so without it the two would be unexercised here.
  // The clearance cases likewise: the shipped examples raise none of the four PS2.11a–d codes after
  // the fixes that landed with them.
  const cases = [
    ...corpus([
      "examples",
      "test/fixtures",
      "test/defect-corpus/annotation-collisions",
      "test/defect-corpus/clearances",
    ]),
    ...inline,
  ];

  for (const p of PROFILES) {
    it(`${p ?? "default"} · every quoted name in the message is a room's or a piece's own name`, () => {
      const seen = new Map<string, number>();
      for (const { name, src, world } of cases) {
        const ds = lint(src, { world, ...opts(p) }).filter((d) => CODES.includes(d.code ?? ""));
        if (ds.length === 0) continue;
        const allowed = names(src, world);
        for (const d of ds) {
          seen.set(d.code!, (seen.get(d.code!) ?? 0) + 1);
          for (const [, q] of d.message.matchAll(/"([^"]+)"/g))
            expect(allowed.has(q!), `${name} (${p ?? "default"}): ${d.message}`).toBe(true);
        }
      }
      // Not vacuous: the path and collision messages, the two that named ids, are exercised.
      expect(seen.get("W_PATH_TOO_NARROW") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_FURNITURE_WALL_COLLISION") ?? 0).toBeGreaterThan(0);
      // …and the privacy rules, which the corpus raises on `two-bed` and two fixtures.
      expect(seen.get("W_ROOM_VIA_PRIVATE") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_ENTRANCE_INTO_PRIVATE") ?? 0).toBeGreaterThan(0);
      // And the two room-contents codes, which quote a room's label (test/fixtures raise both).
      expect(seen.get("W_HABITABLE_NO_WINDOW") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_ROOM_MISSING_DEFINING") ?? 0).toBeGreaterThan(0);
      // And the space-enclosure codes (PS2.4): relational and the zones fixtures have rooms with no
      // wall between them, diff-a a strip of walled floor in no room.
      expect(seen.get("W_BOUNDARY_NO_WALL") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_FLOOR_UNASSIGNED") ?? 0).toBeGreaterThan(0);
      // And the annotation collisions (PS2.12), from their defect-corpus cases.
      expect(seen.get("W_ANNOTATION_OVERLAP") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_TITLE_OVERFLOW") ?? 0).toBeGreaterThan(0);
      // And the clearance family (PS2.11a/b), from its defect-corpus cases and the fixtures.
      expect(seen.get("W_WC_SIDE_CLEARANCE") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_FURNITURE_OVER_WINDOW") ?? 0).toBeGreaterThan(0);
      // And the clearance rules (PS2.11c, PS2.11d), from their defect-corpus cases.
      expect(seen.get("W_FOOTPRINT_TRANSPOSED") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_LEAF_ACROSS_DOORWAY") ?? 0).toBeGreaterThan(0);
      // And the PS2.11e/PS2.46 rules, from their defect-corpus cases.
      expect(seen.get("W_HOB_UNDER_WINDOW") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_HOB_FRIDGE_GAP") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_LEAF_TOO_WIDE") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_DOORWAY_BLOCKED") ?? 0).toBeGreaterThan(0);
      expect(seen.get("W_EXIT_APPROACH_BLOCKED") ?? 0).toBeGreaterThan(0);
    });
  }

  it("an annotation collision's hint quotes an element's id only when the author wrote it", () => {
    let authored = 0;
    let assigned = 0;
    for (const { name, src, world } of cases) {
      const { ir } = resolvePlan(src, { world });
      if (!ir) continue;
      for (const d of lint(src, { world }).filter((x) => x.code === "W_ANNOTATION_OVERLAP")) {
        // The element the warning sits on: its authored id is the handle an agent edits by; an
        // assigned auto-id (`furniture_3`, `room_2`) shifts with an insertion, so it is never quoted.
        const on = ir.elements.find((e) => e.span && d.span && e.span.start === d.span.start);
        expect(on, `${name}: ${d.message}`).toBeDefined();
        const hint = d.hints!.join(" ");
        if ((on as { _idAuthored?: boolean })._idAuthored === true) {
          expect(hint, `${name}: ${d.message}`).toContain(`\`${on!.id}\``);
          authored++;
        } else {
          expect(hint, `${name}: ${d.message}`).not.toContain(on!.id);
          assigned++;
        }
        expect(d.message).not.toContain(on!.id);
      }
    }
    // Both cases are exercised: `radius-over-label` sits on an authored room, `radius-over-piece`
    // on a table with an assigned id.
    expect(authored).toBeGreaterThan(0);
    expect(assigned).toBeGreaterThan(0);
  });

  it("a named door's id is in a hint whenever the message names its rooms", () => {
    let checked = 0;
    for (const { name, src, world } of cases) {
      for (const d of lint(src, { world }).filter((x) => x.code === "W_PATH_TOO_NARROW")) {
        const phrases = [
          ...d.message.matchAll(/the (door|opening) (?:between "[^"]+" and "[^"]+"|from outside into "[^"]+")/g),
        ];
        const widen = d.hints!.filter((h) => /^Widen (?:door|opening) "[^"]+" to `width \d+`/.test(h));
        expect(widen.length, `${name}: ${d.message}`).toBe(phrases.length);
        checked += phrases.length;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("the opening rules (PS2.1–PS2.3) — a quoted move clears the warning and raises nothing new", () => {
  // Every defect case of the three codes, read from the corpus (never retyped). Each hint that
  // quotes a source clause for the element the warning is ON (`Move …`, not `Or move` the
  // other opening) is applied to that statement: the warning on it is gone and nothing new
  // appears, under both profiles. The messages quote only rooms' own names.
  //
  // "Nothing new" has one measured exception, and it is the case's own clean twin: a door
  // straddling a tee can carry a phantom way into the room behind the tee, so moving it off the
  // tee (the twin's fix as much as the hint's) uncovers that room's real way in. In
  // `fa-door-across-tee` that is a 700 mm door (640 mm clear) into "Bathroom 1", which the twin
  // reports as `W_PATH_TOO_NARROW` too. A move may raise a code only if the twin raises it.
  const DIR = resolvePath("test/defect-corpus/openings-ignore-walls");
  const OPENING_CODES = ["W_OPENING_AT_JUNCTION", "W_OPENING_OVERLAP", "W_CONNECTOR_AMBIGUOUS"];
  const cases = readdirSync(DIR)
    .filter((f) => f.endsWith(".arch") && !f.endsWith(".clean.arch"))
    .map((f) => ({
      name: f,
      src: readFileSync(join(DIR, f), "utf8"),
      twin: readFileSync(join(DIR, f.replace(/\.arch$/, ".clean.arch")), "utf8"),
    }));
  for (const p of PROFILES) {
    it(`${p ?? "default"} · every quoted move clears its warning and raises nothing new`, () => {
      let applied = 0;
      for (const { name, src, twin } of cases) {
        const twinCodes = new Set(lint(twin, opts(p)).map((x) => x.code));
        for (const d of lint(src, opts(p)).filter((x) => OPENING_CODES.includes(x.code ?? ""))) {
          const stmt = src.slice(d.span!.start, d.span!.end);
          for (const h of d.hints!.filter((x) => x.startsWith("Move"))) {
            const clause = /— `((?:on \S+ at \S+)|(?:at \([^)]*\)))`\.$/.exec(h)?.[1];
            if (!clause) continue;
            const moved = clause.startsWith("on ")
              ? stmt.replace(/on \S+ at \S+/, clause)
              : stmt.replace(/at \([^)]*\)/, clause);
            expect(moved, `${name}: ${h}`).not.toBe(stmt);
            const after = src.slice(0, d.span!.start) + moved + src.slice(d.span!.end);
            expect(errorsOf(after), `${name}: ${h}`).toEqual([]);
            expect(of(after, d.code!, p).length, `${name}: ${h}`).toBeLessThan(of(src, d.code!, p).length);
            expect(
              gained(src, after, p).filter((c) => !twinCodes.has(c)),
              `${name}: ${h}`,
            ).toEqual([]);
            applied++;
          }
        }
      }
      expect(applied).toBeGreaterThan(10); // the corpus quotes moves, so the check ran
    });
  }

  it("every quoted name in their messages is a room's own name", () => {
    let seen = 0;
    for (const { name, src } of cases) {
      const rooms = (describePlan(src) as { rooms?: { id: string; label?: string }[] }).rooms ?? [];
      const allowed = new Set(rooms.map((r) => r.label ?? r.id));
      for (const d of lint(src).filter((x) => OPENING_CODES.includes(x.code ?? ""))) {
        seen++;
        for (const [, q] of d.message.matchAll(/"([^"]+)"/g))
          expect(allowed.has(q!), `${name}: ${d.message}`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });
});

describe("W_DIM_TEXT_MISMATCH (PS2.10) — the quoted text clears the warning and raises nothing new", () => {
  // Every defect case of the code in the corpus, read from it (never retyped). The `text "…"`
  // clause the hint quotes replaces the dimension's own clause: the warning on it is gone and
  // nothing new appears, under both profiles. The message quotes nothing at all (no id, no
  // name), so an app may show it as is; the dimension's id is in the hint.
  const DIR = resolvePath("test/defect-corpus/annotation-collisions");
  const cases = readdirSync(DIR)
    .filter((f) => f.endsWith(".arch") && !f.endsWith(".clean.arch"))
    .map((f) => ({ name: f, src: readFileSync(join(DIR, f), "utf8") }))
    .filter(({ src }) => /^# expect: W_DIM_TEXT_MISMATCH$/m.test(src));
  for (const p of PROFILES) {
    it(`${p ?? "default"} · the quoted text clears it and raises nothing new`, () => {
      let applied = 0;
      for (const { name, src } of cases) {
        for (const d of of(src, "W_DIM_TEXT_MISMATCH", p)) {
          expect(d.message, name).not.toMatch(/"/);
          const clause = quoted(d.hints![0]!, /^text "/);
          const stmt = src.slice(d.span!.start, d.span!.end);
          const after = src.slice(0, d.span!.start) + stmt.replace(/text "[^"]*"/, clause) + src.slice(d.span!.end);
          expect(after, name).not.toBe(src);
          expect(errorsOf(after), name).toEqual([]);
          expect(of(after, "W_DIM_TEXT_MISMATCH", p), name).toEqual([]);
          expect(gained(src, after, p), name).toEqual([]);
          applied++;
        }
      }
      expect(applied).toBeGreaterThan(0); // the corpus case fires, so the check ran
    });
  }
});
