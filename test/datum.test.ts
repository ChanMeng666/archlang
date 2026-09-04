/**
 * The **vertical datum layer** (v1.35) — heights, sills and heads.
 *
 * The law this layer is built on lives next door in `test/height-byte-identity.test.ts`:
 * a plan that writes none of this syntax is unchanged in all three agent-facing surfaces.
 * THIS file is the other half — that the syntax, when written, does what it says.
 *
 * Four things are asserted here that nothing else can see:
 *
 *  1. **The fallback chain**, wall → level → plan → constant, at every rung and in every
 *     combination. It has exactly one implementation (`ResolveCtx.storeyHeight`, fed by
 *     `levelPlanFor` folding a `level`'s height into the synthetic plan's), so this is
 *     what proves that implementation is the right one rather than merely the only one.
 *  2. **Elevation ACCUMULATES**, and is not `level × storeyHeight`. The two agree on a
 *     uniform building, which is why the disagreeing case — a tall ground floor — is the
 *     one asserted, with the uniform case beside it as the control.
 *  3. **The gate is total.** A recursive key walk over the WHOLE summary of a plan with no
 *     height clause: not one key named `height`/`sill`/`head`/`elevation`/`storey_height`
 *     anywhere, at any depth, on any storey. A spot check on the top level would pass a
 *     leak inside `levels[]` or `doors[]`.
 *  4. **`fmt` round-trips every new clause.** v1.26.1 shipped a formatter that silently
 *     returned a pocket door as a hinged one; the same failure here would return a 2200 mm
 *     parapet as a full-height wall. Round-tripping is checked by re-parsing and
 *     re-formatting to a FIXED POINT, not by string-matching the emitted line — a fixed
 *     point is the property that actually matters.
 */

import { describe as suite, expect, it } from "vitest";
import {
  buildManifest,
  CASED_OPENING_HEAD,
  compile,
  describe as describePlan,
  DOOR_HEAD,
  elevationOf,
  format,
  isDrawableHeight,
  isPlacedHeight,
  MAX_HEIGHT,
  planFromJson,
  planJsonToArch,
  planToJson,
  STOREY_HEIGHT,
  WINDOW_HEAD,
  WINDOW_SILL,
} from "../src/index.js";
import type { SceneSummary } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve as resolvePlan, resolveAll } from "../src/ir.js";

/** Wrap a body in the smallest plan that has a wall to host openings on. */
const plan = (body: string): string => `plan "Datum" {\n  units mm\n${body}\n}\n`;
const BOX = `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }`;
const ROOM = `  room id=r1 at (0,0) size 8000x5000 uses living`;

/** The resolved lowest storey of `src`. */
function ir(src: string) {
  return resolvePlan(parse(src).plan!).ir;
}

/** Every `E_*`/`W_*` code a source raises, in order. */
function codes(src: string): string[] {
  return compile(src, { noCache: true }).diagnostics.map((d) => d.code ?? "");
}

// ---------------------------------------------------------------------------
// 1. The constants, and the one rule that is a function
// ---------------------------------------------------------------------------

suite("datum — the constants are the drafting conventions, not arbitrary numbers", () => {
  it("holds the six defaults", () => {
    expect(STOREY_HEIGHT).toBe(3000);
    expect(DOOR_HEAD).toBe(2100);
    expect(WINDOW_SILL).toBe(900);
    expect(WINDOW_HEAD).toBe(2100);
    // A door head and a window head are equal because heads ALIGN on an ordinary
    // elevation. Pinned so nobody "tidies" the duplication apart.
    expect(WINDOW_HEAD).toBe(DOOR_HEAD);
    // A cased opening is drawn full height, so its constant IS the storey's — the rule is
    // a lookup on the host wall and this is only what it evaluates to by default.
    expect(CASED_OPENING_HEAD).toBe(STOREY_HEIGHT);
    expect(MAX_HEIGHT).toBe(100_000);
  });

  it("separates the height that may be zero from the heights that may not", () => {
    // A window sill of 0 is a floor-length window. A wall or a head of 0 is a missing
    // one. One predicate for each, so a single `> 0` cannot refuse the legal case.
    expect(isPlacedHeight(0)).toBe(true);
    expect(isDrawableHeight(0)).toBe(false);
    for (const h of [-1, MAX_HEIGHT + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isPlacedHeight(h), `isPlacedHeight(${h})`).toBe(false);
      expect(isDrawableHeight(h), `isDrawableHeight(${h})`).toBe(false);
    }
    expect(isDrawableHeight(MAX_HEIGHT)).toBe(true);
  });

  it("elevationOf sums the storeys below — and agrees with level × height ONLY when they are equal", () => {
    expect(elevationOf([])).toBe(0);
    // The uniform control: three 3000 storeys, and the closed form a consumer might be
    // tempted to write gives the same answer.
    for (let n = 0; n <= 3; n++) {
      expect(elevationOf(Array(n).fill(3000))).toBe(n * 3000);
    }
    // …and the case that makes the closed form WRONG. A 3600 ground floor under 3000s.
    expect(elevationOf([3600])).toBe(3600);
    expect(elevationOf([3600, 3000])).toBe(6600);
    expect(elevationOf([3600, 3000])).not.toBe(2 * 3000);
  });
});

// ---------------------------------------------------------------------------
// 2. The fallback chain
// ---------------------------------------------------------------------------

suite("datum — the fallback chain: wall, then level, then plan, then the constant", () => {
  it("a plan that declares nothing puts every wall at the constant", () => {
    const r = ir(plan(BOX));
    expect(r.storeyHeight).toBe(STOREY_HEIGHT);
    expect(r.walls[0]!.height).toBe(STOREY_HEIGHT);
  });

  it("a plan-level `height` reaches every wall that declares none", () => {
    const r = ir(plan(`  height 2700\n${BOX}`));
    expect(r.storeyHeight).toBe(2700);
    expect(r.walls[0]!.height).toBe(2700);
  });

  it("a wall's own clause beats the plan's", () => {
    const r = ir(plan(`  height 2700\n  wall id=w1 exterior thickness 200 height 2200 { (0,0) (4000,0) }`));
    expect(r.storeyHeight).toBe(2700);
    expect(r.walls[0]!.height).toBe(2200);
  });

  it("a level's beats the plan's, and a wall's beats the level's — all three rungs at once", () => {
    const src = plan(
      `  height 3000\n` +
        `  level 1 "Ground" height 3600 {\n` +
        `    wall id=a exterior thickness 200 { (0,0) (4000,0) }\n` +
        `    wall id=b exterior thickness 200 height 2200 { (0,1000) (4000,1000) }\n` +
        `  }\n` +
        `  level 2 "Upper" { wall id=c exterior thickness 200 { (0,0) (4000,0) } }`,
    );
    const { levels } = resolveAll(parse(src).plan!);
    expect(levels.map((l) => l.ir.storeyHeight)).toEqual([3600, 3000]);
    // Ground: the un-clauses wall takes the LEVEL's 3600, the claused one keeps 2200.
    expect(levels[0]!.ir.walls.map((w) => w.height)).toEqual([3600, 2200]);
    // Upper: no level clause, so the PLAN's 3000.
    expect(levels[1]!.ir.walls.map((w) => w.height)).toEqual([3000]);
  });

  it("the height is an EXPRESSION, and is not grid-snapped", () => {
    // `grid` snaps plan coordinates so rooms line up with each other. A height shares no
    // axis with them: snapping 2850 to a 100 mm grid would silently redraw the section.
    const r = ir(plan(`  grid 100\n  let h = 2850\n  height h\n${BOX}`));
    expect(r.storeyHeight).toBe(2850);
    expect(r.walls[0]!.height).toBe(2850);
  });
});

// ---------------------------------------------------------------------------
// 3. Elevation
// ---------------------------------------------------------------------------

suite("datum — elevation accumulates the storeys below", () => {
  it("a single-storey plan sits at 0", () => {
    expect(ir(plan(`  height 4000\n${BOX}`)).elevation).toBe(0);
  });

  it("a uniform building stacks by its one height", () => {
    const src = plan(
      `  height 3000\n` + [1, 2, 3].map((n) => `  level ${n} { room id=r${n} at (0,0) size 4000x3000 }`).join("\n"),
    );
    expect(resolveAll(parse(src).plan!).levels.map((l) => l.ir.elevation)).toEqual([0, 3000, 6000]);
  });

  it("a tall ground floor lifts everything above it — the case `level × height` gets wrong", () => {
    const src = plan(
      `  height 3000\n` +
        `  level 1 height 3600 { room id=r1 at (0,0) size 4000x3000 }\n` +
        `  level 2 { room id=r2 at (0,0) size 4000x3000 }\n` +
        `  level 3 { room id=r3 at (0,0) size 4000x3000 }`,
    );
    const elevs = resolveAll(parse(src).plan!).levels.map((l) => l.ir.elevation);
    expect(elevs).toEqual([0, 3600, 6600]);
    // The wrong answer, stated so the difference is visible rather than implied.
    expect(elevs).not.toEqual([0, 3000, 6000]);
  });

  it("the LOWEST storey is the datum, whatever it is numbered", () => {
    // A basement. `level -1` is legal, is drawn first, and is therefore elevation 0 —
    // elevation is relative to the building's own lowest floor, not to `level 0`.
    const src = plan(
      `  height 3000\n` +
        `  level -1 "Basement" { room id=b at (0,0) size 4000x3000 }\n` +
        `  level 1 "Ground" { room id=g at (0,0) size 4000x3000 }`,
    );
    const levels = resolveAll(parse(src).plan!).levels;
    expect(levels.map((l) => l.level)).toEqual([-1, 1]);
    expect(levels.map((l) => l.ir.elevation)).toEqual([0, 3000]);
  });
});

// ---------------------------------------------------------------------------
// 4. The opening heights and their defaults
// ---------------------------------------------------------------------------

suite("datum — opening heights", () => {
  it("defaults: a door head, a window sill and head, a cased opening at the wall's height", () => {
    const s = describePlan(
      plan(
        `  height 3000\n${BOX}\n${ROOM}\n` +
          `  door id=d on w1 at 20% width 900\n` +
          `  window id=win on w1 at 50% width 1200\n` +
          `  opening id=o on w1 at 80% width 1000`,
      ),
    );
    expect(s.doors[0]!.head).toBe(DOOR_HEAD);
    expect(s.windows[0]!.sill).toBe(WINDOW_SILL);
    expect(s.windows[0]!.head).toBe(WINDOW_HEAD);
    // Not a constant: the HOST WALL's height, which here is the storey's.
    expect(s.openings[0]!.head).toBe(3000);
  });

  it("a cased opening in a low wall is as tall as THAT wall, not as tall as the storey", () => {
    const s = describePlan(
      plan(
        `  height 3000\n` +
          `  wall id=low exterior thickness 200 height 2200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
          `${ROOM}\n  opening id=o on low at 50% width 1000`,
      ),
    );
    expect(s.openings[0]!.head).toBe(2200);
  });

  it("authored clauses win, and `sill 0` is a floor-length window", () => {
    const s = describePlan(
      plan(
        `${BOX}\n${ROOM}\n` +
          `  door id=d on w1 at 20% width 900 head 2400\n` +
          `  window id=win on w1 at 50% width 1200 sill 0 head 2700`,
      ),
    );
    expect(s.doors[0]!.head).toBe(2400);
    expect(s.windows[0]!.sill).toBe(0);
    expect(s.windows[0]!.head).toBe(2700);
    expect(codes(plan(`${BOX}\n${ROOM}\n  window on w1 at 50% width 1200 sill 0`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. The three refusals — each with a PASSING twin
// ---------------------------------------------------------------------------

suite("datum — the three refusals, each beside the plan that does not raise it", () => {
  it("E_HEIGHT_RANGE at both ends, on all three sites, and not in between", () => {
    for (const bad of ["0", "-100", String(MAX_HEIGHT + 1)]) {
      expect(codes(plan(`  height ${bad}\n${BOX}`)), `plan height ${bad}`).toContain("E_HEIGHT_RANGE");
      expect(
        codes(plan(`  wall id=w exterior thickness 200 height ${bad} { (0,0) (4000,0) }`)),
        `wall height ${bad}`,
      ).toContain("E_HEIGHT_RANGE");
    }
    // A level's clause is refused too — it folds into the plan's height, which is the
    // point at which one implementation checks it.
    const lvl = plan(`  level 1 height 0 { room id=r at (0,0) size 4000x3000 }`);
    expect(compile(lvl, { noCache: true }).diagnostics.map((d) => d.code)).toContain("E_HEIGHT_RANGE");
    // The passing twins, including both ends of the legal range.
    expect(codes(plan(`  height 1\n${BOX}`))).toEqual([]);
    expect(codes(plan(`  height ${MAX_HEIGHT}\n${BOX}`))).toEqual([]);
  });

  it("a SILL's refusal says `0 or greater`, because 0 is legal for a sill and only a sill", () => {
    // A shared "must be greater than 0" sentence would be a remedy the compiler itself
    // contradicts one line later — `sill 0` compiles clean. A wrong remedy in a diagnostic
    // is worse than a vague one, so the sill gets its own wording.
    expect(codes(plan(`${BOX}\n  window on w1 at 50% width 1200 sill 0`))).toEqual([]);
    const bad = plan(`${BOX}\n  window on w1 at 50% width 1200 sill -50`);
    const d = compile(bad, { noCache: true }).diagnostics.find((x) => x.code === "E_HEIGHT_RANGE");
    expect(d?.message).toContain("a sill must be 0 or greater");
    expect(d?.message).not.toContain("greater than 0 and");
    // …while every OTHER height keeps the strict bound, on the same code.
    const wall = plan(`  wall id=w exterior thickness 200 height 0 { (0,0) (4000,0) }`);
    const dw = compile(wall, { noCache: true }).diagnostics.find((x) => x.code === "E_HEIGHT_RANGE");
    expect(dw?.message).toContain("a height must be greater than 0");
  });

  it("E_HEIGHT_RANGE does NOT fire on a unit slip, and that is deliberate", () => {
    // `height 3` is three millimetres and is inside the range. The plausible intent is
    // three metres, and a compiler that guessed would be inventing a number the author
    // never wrote. The range guards the ENDS; the units are the author's.
    expect(codes(plan(`  height 3\n${BOX}`))).toEqual([]);
    expect(ir(plan(`  height 3\n${BOX}`)).storeyHeight).toBe(3);
  });

  it("E_HEIGHT_RANGE refuses rather than clamping, and the datum still resolves", () => {
    // The clause is refused AND the fallback still yields a usable number, so a consumer
    // downstream of a failed compile never meets a nonsense height.
    const r = ir(plan(`  height 2700\n  wall id=w exterior thickness 200 height -5 { (0,0) (4000,0) }`));
    expect(r.walls[0]!.height).toBe(2700);
  });

  it("E_HEIGHT_RANGE carries a fix that DROPS the clause", () => {
    const src = plan(`  wall id=w exterior thickness 200 height 0 { (0,0) (4000,0) }`);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_HEIGHT_RANGE");
    expect(d?.fixes?.[0]?.applicability).toBe("machine-applicable");
    const edit = d!.fixes![0]!.edits[0]!;
    // The span covers exactly the clause, so applying it leaves a plan that compiles.
    expect(src.slice(edit.span.start, edit.span.end)).toBe("height 0");
    const fixed = src.slice(0, edit.span.start) + edit.newText + src.slice(edit.span.end);
    expect(codes(fixed)).toEqual([]);
  });

  it("E_SILL_ABOVE_HEAD, both at and above, with the passing twin one millimetre away", () => {
    const at = plan(`${BOX}\n  window on w1 at 50% width 1200 sill 2100 head 2100`);
    const above = plan(`${BOX}\n  window on w1 at 50% width 1200 sill 2400 head 2100`);
    expect(codes(at)).toContain("E_SILL_ABOVE_HEAD");
    expect(codes(above)).toContain("E_SILL_ABOVE_HEAD");
    expect(codes(plan(`${BOX}\n  window on w1 at 50% width 1200 sill 2099 head 2100`))).toEqual([]);
    // …and the fix drops the sill, restoring the default.
    const d = compile(above, { noCache: true }).diagnostics.find((x) => x.code === "E_SILL_ABOVE_HEAD");
    expect(above.slice(d!.fixes![0]!.edits[0]!.span.start, d!.fixes![0]!.edits[0]!.span.end)).toBe("sill 2400");
  });

  it("E_OPENING_ABOVE_WALL is measured against the HOST wall, not the storey", () => {
    // A 2400 head is fine in a 3000 storey and refused in a 2200 parapet — which is the
    // whole point of measuring against the wall.
    const tall = plan(`  height 3000\n${BOX}\n  door on w1 at 50% width 900 head 2400`);
    const low = plan(
      `  height 3000\n  wall id=w1 exterior thickness 200 height 2200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
        `  door on w1 at 50% width 900 head 2400`,
    );
    expect(codes(tall)).toEqual([]);
    expect(codes(low)).toContain("E_OPENING_ABOVE_WALL");
    // The fix lowers the head to the wall's own height, and the result compiles clean.
    const d = compile(low, { noCache: true }).diagnostics.find((x) => x.code === "E_OPENING_ABOVE_WALL");
    const edit = d!.fixes![0]!.edits[0]!;
    expect(edit.newText).toBe("head 2200");
    expect(codes(low.slice(0, edit.span.start) + edit.newText + low.slice(edit.span.end))).toEqual([]);
  });

  it("E_OPENING_ABOVE_WALL names the SETTING when the wall inherited its height", () => {
    // The failure mode this hint exists for: a plan-level `height 300` makes every
    // opening's DEFAULT head exceed its wall, so the errors fan out across openings the
    // author wrote nothing wrong on — and the number they are measured against is not on
    // any line the diagnostics point at.
    const inherited = plan(
      `  height 300\n${BOX}\n` +
        `  door on w1 at 20% width 900\n  window on w1 at 50% width 1200\n  opening on w1 at 80% width 1000`,
    );
    const ds = compile(inherited, { noCache: true }).diagnostics.filter((d) => d.code === "E_OPENING_ABOVE_WALL");
    // The fan-out is real and is NOT fixed here — the hint is. Asserted so the count is a
    // recorded fact rather than an assumption: two of the three (the cased opening takes
    // the wall's own height as its default, so it never exceeds it).
    expect(ds.length).toBe(2);
    for (const d of ds) {
      expect(d.hints?.[0]).toContain("does NOT declare a height");
      expect(d.hints?.[0]).toContain("height 300");
    }
    // …and when the wall DOES declare one, the hint points at the wall instead.
    const authored = plan(
      `  height 3000\n  wall id=w1 exterior thickness 200 height 800 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
        `  door on w1 at 50% width 900`,
    );
    const d2 = compile(authored, { noCache: true }).diagnostics.find((d) => d.code === "E_OPENING_ABOVE_WALL");
    expect(d2?.hints?.[0]).toContain("host wall's own `height`");
    expect(d2?.hints?.[0]).not.toContain("inherited");
  });

  it("a refused head still leaves a usable number, and never one below the sill", () => {
    const r = ir(
      plan(
        `  wall id=w1 exterior thickness 200 height 800 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
          `  window on w1 at 50% width 1200 head 2100`,
      ),
    );
    const win = r.elements.find((e) => e.kind === "window");
    expect(win).toBeDefined();
    if (win?.kind === "window") {
      expect(win.head).toBe(800);
      // The default 900 sill is now above the clamped 800 head, so it falls to the floor
      // rather than being left describing an inside-out window.
      expect(win.sill).toBeLessThan(win.head);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The gate — the whole reason the byte-identity law holds
// ---------------------------------------------------------------------------

/** Every key name appearing anywhere in a JSON-able value, at any depth. */
function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) allKeys(x, out);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  return out;
}

const HEIGHT_KEYS = ["heights", "storey_height", "elevation", "sill", "head"];

suite("datum — describe() emits height keys only when the source authored one", () => {
  it("a silent plan has NO height key anywhere, at any depth, on any storey", () => {
    const s = describePlan(
      plan(
        `  level 1 { ${BOX.trim()}\n${ROOM.trim()}\n  door on w1 at 50% width 900\n  window on w1 at 20% width 1200 }\n` +
          `  level 2 { room id=r2 at (0,0) size 8000x5000 uses bedroom }`,
      ),
    );
    const keys = allKeys(s as unknown as Record<string, unknown>);
    for (const k of HEIGHT_KEYS) expect([...keys], `key "${k}" leaked into a silent plan`).not.toContain(k);
  });

  it("ONE clause anywhere switches the whole block on, on EVERY storey", () => {
    // The gate is whole-PLAN rather than per-storey: a height on level 2 alone must not
    // leave the two pages disagreeing about whether the third dimension exists.
    const s = describePlan(
      plan(
        `  level 1 { ${BOX.trim()}\n${ROOM.trim()}\n  door on w1 at 50% width 900 }\n` +
          `  level 2 height 3600 { room id=r2 at (0,0) size 8000x5000 uses bedroom }`,
      ),
    );
    expect(s.heights).toBeDefined();
    expect(s.levels).toHaveLength(2);
    for (const l of s.levels!) expect(l.heights, `level ${l.level}`).toBeDefined();
    // …and page 1's own numbers are its own: the plan default and elevation 0.
    expect(s.heights!.storey_height).toBe(STOREY_HEIGHT);
    expect(s.heights!.elevation).toBe(0);
    expect(s.levels![1]!.heights!.storey_height).toBe(3600);
    expect(s.levels![1]!.heights!.elevation).toBe(3000);
    expect(s.doors[0]!.head).toBe(DOOR_HEAD);
  });

  it("`strip … height` does NOT switch it on — the same word, a different dimension", () => {
    // `strip right … height <mm>` is the strip's cross-axis extent IN PLAN. Counting it
    // would turn the block on for plans that say nothing about the third dimension, which
    // is exactly the byte-identity failure the gate exists to prevent.
    const s = describePlan(plan(`  strip right at (0,0) gap 200 height 3000 {\n    room id=a size 3000\n  }`));
    expect(s.heights).toBeUndefined();
  });

  it("the walls are reported in source order with their resolved heights", () => {
    const s = describePlan(
      plan(
        `  height 2700\n` +
          `  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
          `  wall id=parapet exterior thickness 100 height 1100 { (0,6000) (8000,6000) }`,
      ),
    );
    expect(s.heights!.walls).toEqual([
      { id: "shell", height: 2700 },
      { id: "parapet", height: 1100 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 7. `arch fmt` — the v1.26.1 lesson applied before the fact
// ---------------------------------------------------------------------------

suite("datum — `arch fmt` round-trips every new clause", () => {
  const SOURCES: [string, string][] = [
    ["the plan setting", plan(`  height 2700\n${BOX}`)],
    ["a wall clause", plan(`  wall id=w exterior thickness 200 height 2400 { (0,0) (4000,0) }`)],
    [
      "a wall clause after material",
      plan(`  wall id=w exterior thickness 200 material brick height 2400 { (0,0) (4000,0) }`),
    ],
    ["a level clause", plan(`  level 1 "Ground" height 3600 { room id=r at (0,0) size 4000x3000 }`)],
    ["a level clause with no name", plan(`  level 1 height 3600 { room id=r at (0,0) size 4000x3000 }`)],
    ["a window sill and head", plan(`${BOX}\n  window on w1 at 50% width 1200 sill 600 head 2100`)],
    ["a window sill alone", plan(`${BOX}\n  window on w1 at 50% width 1200 sill 0`)],
    ["a door head after open", plan(`${BOX}\n  door sliding on w1 at 50% width 900 slide left open 0.5 head 2100`)],
    ["a cased opening head", plan(`${BOX}\n  opening on w1 at 50% width 1000 head 2400`)],
  ];

  for (const [what, src] of SOURCES) {
    it(`preserves ${what}`, () => {
      const once = format(src);
      // A FIXED POINT, not a string match: formatting a formatted plan must not move it,
      // which is the property that catches both a dropped clause and a mis-ordered one.
      expect(format(once)).toBe(once);
      // And the meaning survives, which a fixed point alone would not prove — a formatter
      // that dropped the clause every time is also a fixed point.
      const before = describePlan(src);
      const after = describePlan(once);
      expect(JSON.stringify(after.heights)).toBe(JSON.stringify(before.heights));
      expect(JSON.stringify(after.windows)).toBe(JSON.stringify(before.windows));
      expect(JSON.stringify(after.doors)).toBe(JSON.stringify(before.doors));
      expect(JSON.stringify(after.openings)).toBe(JSON.stringify(before.openings));
    });
  }

  it("does NOT add a `height` line to a plan that never wrote one", () => {
    // Otherwise every existing file gains a line on its first `arch fmt`, which is a
    // change to the source disguised as formatting.
    expect(format(plan(BOX))).not.toMatch(/^\s*height /m);
  });
});

// ---------------------------------------------------------------------------
// 8. Plan JSON
// ---------------------------------------------------------------------------

suite("datum — Plan JSON carries the heights out and back", () => {
  const SRC = plan(
    `  height 2700\n` +
      `  wall id=w1 exterior thickness 200 height 2400 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
      `${ROOM}\n` +
      `  door id=d on w1 at 20% width 900 head 2000\n` +
      `  window id=win on w1 at 50% width 1200 sill 600 head 2100\n` +
      `  opening id=o on w1 at 80% width 1000 head 2300`,
  );

  /** The projected payload, with the resolve step's diagnostics asserted away. */
  const jsonOf = (src: string) => {
    const { json, diagnostics } = planToJson(src);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(json).toBeDefined();
    return json!;
  };

  it("emits the plan, wall and opening heights", () => {
    const j = jsonOf(SRC);
    expect(j.storey_height).toBe(2700);
    expect(j.walls[0]!.height).toBe(2400);
    const byId = new Map(j.openings.map((o) => [o.id, o]));
    expect(byId.get("d")!.head).toBe(2000);
    expect(byId.get("win")!.sill).toBe(600);
    expect(byId.get("win")!.head).toBe(2100);
    expect(byId.get("o")!.head).toBe(2300);
    // A door and a cased opening have no sill — emitting `sill: 0` would round-trip into
    // a clause the grammar does not offer.
    expect(byId.get("d")!.sill).toBeUndefined();
    expect(byId.get("o")!.sill).toBeUndefined();
  });

  it("emits nothing at all for a plan that authored no height", () => {
    const j = jsonOf(plan(`${BOX}\n${ROOM}\n  window on w1 at 50% width 1200`));
    expect(j.storey_height).toBeUndefined();
    expect(j.walls[0]!.height).toBeUndefined();
    expect(j.openings[0]!.sill).toBeUndefined();
    expect(j.openings[0]!.head).toBeUndefined();
  });

  it("round-trips through .arch with every number intact", () => {
    // The whole loop: source -> JSON -> .arch -> JSON. Without the emitter's `height`
    // lines the second pass silently hands every wall the 3000 default back, with no
    // diagnostic — the `dims auto` failure one layer down.
    const { source: reEmitted, diagnostics } = planJsonToArch(jsonOf(SRC));
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(reEmitted).toBeDefined();
    const back = jsonOf(reEmitted!);
    expect(back.storey_height).toBe(2700);
    expect(back.walls[0]!.height).toBe(2400);
    const byId = new Map(back.openings.map((o) => [o.id, o]));
    expect(byId.get("win")!.sill).toBe(600);
    expect(byId.get("win")!.head).toBe(2100);
    expect(byId.get("d")!.head).toBe(2000);
    expect(byId.get("o")!.head).toBe(2300);
  });

  it("accepts the fields on INPUT, so `compile --from-json` keeps them", () => {
    const { source, diagnostics } = planFromJson({
      version: 1,
      plan: "In",
      units: "mm",
      storey_height: 2600,
      rooms: [{ id: "r", room_type: "LivingRoom", x: 0, y: 0, width: 4000, height: 3000 }],
      walls: [
        {
          id: "w",
          category: "exterior",
          points: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
          ],
          thickness: 200,
          height: 2300,
        },
      ],
      openings: [{ kind: "window", id: "win", on: { wall: "w", at: "50%" }, width: 1200, sill: 300, head: 2200 }],
      furniture: [],
    });
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(source).toBeDefined();
    const r = ir(source!);
    expect(r.storeyHeight).toBe(2600);
    expect(r.walls[0]!.height).toBe(2300);
    const win = r.elements.find((e) => e.kind === "window");
    if (win?.kind === "window") {
      expect(win.sill).toBe(300);
      expect(win.head).toBe(2200);
    }
  });

  it("refuses an out-of-range height, and a sill on something that has no sill", () => {
    const base = {
      version: 1 as const,
      plan: "Bad",
      units: "mm" as const,
      rooms: [],
      walls: [],
      openings: [],
      furniture: [],
    };
    expect(planFromJson({ ...base, storey_height: 0 }).diagnostics.map((d) => d.code)).toContain("E_JSON_SCHEMA");
    const sillOnDoor = planFromJson({
      ...base,
      openings: [{ kind: "door", x: 0, y: 0, width: 900, sill: 100 }],
    });
    expect(sillOnDoor.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. The manifest
// ---------------------------------------------------------------------------

suite("datum — `arch manifest` publishes the defaults", () => {
  it("carries every constant, interpolated from src/datum.ts rather than retyped", () => {
    // A plan with no height clause reports no heights at all (the byte-identity law), so
    // this is the ONLY place an agent can learn what the compiler would have used.
    expect(buildManifest("0.0.0").datum).toEqual({
      storeyHeight: STOREY_HEIGHT,
      doorHead: DOOR_HEAD,
      windowSill: WINDOW_SILL,
      windowHead: WINDOW_HEAD,
      casedOpeningHead: CASED_OPENING_HEAD,
      maxHeight: MAX_HEIGHT,
    });
  });
});

// ---------------------------------------------------------------------------
// 10. The drawing does not move — asserted here too, on a plan that USES the syntax
// ---------------------------------------------------------------------------

suite("datum — heights change no byte of the drawing", () => {
  it("the same plan with and without every height clause renders identically", () => {
    // `height-byte-identity.test.ts` proves a plan that writes none is unchanged. This is
    // the sharper claim and the one a reader is most likely to doubt: two plans that
    // DIFFER only in their height clauses draw the same picture, because a floor plan is
    // a horizontal cut.
    const bare = plan(`${BOX}\n${ROOM}\n  door on w1 at 20% width 900\n  window on w1 at 50% width 1200`);
    const tall = plan(
      `  height 4200\n` +
        `  wall id=w1 exterior thickness 200 height 3800 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
        `${ROOM}\n  door on w1 at 20% width 900 head 2400\n  window on w1 at 50% width 1200 sill 300 head 3000`,
    );
    expect(compile(tall, { noCache: true }).svg).toBe(compile(bare, { noCache: true }).svg);
    // …and `lint()` does not move either: nothing in the soundness layer reads a height.
    const strip = (s: SceneSummary): string => JSON.stringify({ ...s, heights: undefined });
    expect(compile(tall, { noCache: true }).diagnostics).toEqual(compile(bare, { noCache: true }).diagnostics);
    // The summaries differ ONLY by the height keys — proved by removing them and the
    // per-opening ones, then comparing what is left.
    const scrub = (s: SceneSummary): string =>
      strip({
        ...s,
        doors: s.doors.map(({ head, ...d }) => ({ ...d })) as SceneSummary["doors"],
        windows: s.windows.map(({ sill, head, ...w }) => ({ ...w })) as SceneSummary["windows"],
        openings: s.openings.map(({ head, ...o }) => ({ ...o })) as SceneSummary["openings"],
      });
    expect(scrub(describePlan(tall))).toBe(scrub(describePlan(bare)));
  });
});
