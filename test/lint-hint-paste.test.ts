/**
 * A quoted fixture hint never warns when pasted (plan-soundness PS2.17, PR #216 review rounds
 * 2 and 3).
 *
 * `W_ROOM_NO_FIXTURE`'s and `W_ROOM_MISSING_DEFINING`'s hints quote statements that place a
 * room's defining pieces together (`pasteSet`, `src/lint/defining.ts`). Each piece is checked
 * against the placement rules, and the set is re-linted with its pieces standing against the
 * rules flagged `readsFurniture`. This file pins:
 *   - that flag set is exactly the rules whose output a pasted set was measured to move
 *     (`test/fixtures/hint-paste-gained-codes.json`, with how it was measured);
 *   - over a fixed-seed sample of PS2.9's fuzz plans, every quoted statement, appended to its
 *     plan and compiled, lands exactly on the footprint the check placed (so a text that
 *     disagrees with its checked piece, such as a dropped `rotate`, is caught), and pasting a
 *     whole quoted set gains no finding;
 *   - the same over multi-room fuzz (rooms on a corridor, openings between them), where a set
 *     can send the walk the long way round.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { orientationMatters } from "../src/fixtures-catalog.js";
import { lint, lintWithCoverage } from "../src/index.js";
import type { RFurniture, RRoom } from "../src/ir.js";
import { buildLintContext } from "../src/lint/context.js";
import { pasteSet, roomDefiningItems } from "../src/lint/defining.js";
import { NOT_GATED_DRAFTING } from "../src/furnish.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";
import { LINT_RULES } from "../src/lint/rules/index.js";

const MEASURED = JSON.parse(readFileSync(resolvePath(__dirname, "fixtures/hint-paste-gained-codes.json"), "utf8")) as {
  codes: Record<string, string>;
};

describe("the rules a quoted set is re-linted against", () => {
  it("are exactly the rules whose output a pasted set was measured to move", () => {
    const flagged = LINT_RULES.filter((r) => r.readsFurniture !== undefined)
      .map((r) => r.name)
      .sort();
    expect(flagged).toEqual([...new Set(Object.values(MEASURED.codes))].sort());
  });
});

/** PS2.9's fuzz corpus A (`test/lint-room-contents.test.ts`'s probes come from it), seeded. */
function* corpus(seed0: number, n: number): Generator<string> {
  let seed = seed0;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  for (let k = 0; k < n; k++) {
    const use = pick(["kitchen", "bath", "wc", "bedroom", "dining", "living kitchen", "kitchen dining"]);
    const W = 50 * Math.round((1600 + rnd() * 3400) / 50);
    const H = 50 * Math.round((1400 + rnd() * 3000) / 50);
    const dx = 50 * Math.round((300 + rnd() * (W - 1200)) / 50);
    const wx = 50 * Math.round((400 + rnd() * (W - 1400)) / 50);
    const swing = pick(["in", "out"]);
    const win = rnd() < 0.7 ? `  window at (${wx},0) width ${pick([600, 900, 1200])} wall shell\n` : "";
    yield `plan "F" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (${W},0) (${W},${H + 3000}) (0,${H + 3000}) close }
  wall id=w_mid partition thickness 100 { (0,${H}) (${W},${H}) }
  room id=r_x at (0,0) size ${W}x${H} label "X" uses ${use}
  room id=r_h at (0,${H}) size ${W}x3000 label "Hall" uses hall
  door id=d_in at (${W / 2},${H + 3000}) width 900 wall shell
  door id=d_x at (${dx + 450},${H}) width 800 wall w_mid swing ${swing === "in" ? "out" : "in"}
${win}}
`;
  }
}

/** PS2.9's fuzz corpus B (kitchens and wet rooms, a side door and a second window), seeded. */
function* corpusB(seed0: number, n: number): Generator<string> {
  let seed = seed0;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const g = (v: number) => 50 * Math.round(v / 50);
  for (let k = 0; k < n; k++) {
    const use = pick(["kitchen", "bath", "living kitchen", "wc"]);
    const W = g(1600 + rnd() * 3400);
    const H = g(1400 + rnd() * 3000);
    const dx = g(300 + rnd() * (W - 1200));
    let extra = "";
    if (rnd() < 0.7)
      extra += `  window at (${g(400 + rnd() * (W - 1400))},0) width ${pick([600, 900, 1200])} wall shell\n`;
    if (rnd() < 0.5) extra += `  window at (0,${g(600 + rnd() * (H - 1200))}) width 600 wall shell\n`;
    if (rnd() < 0.4) extra += `  door id=d_y at (${W},${g(600 + rnd() * (H - 1200))}) width 800 wall shell swing in\n`;
    yield `plan "F" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (0,0) (${W},0) (${W},${H + 3000}) (0,${H + 3000}) close }
  wall id=w_mid partition thickness 100 { (0,${H}) (${W},${H}) }
  room id=r_x at (0,0) size ${W}x${H} label "X" uses ${use}
  room id=r_h at (0,${H}) size ${W}x3000 label "Hall" uses hall
  door id=d_in at (${W / 2},${H + 3000}) width 900 wall shell
  door id=d_x at (${dx + 450},${H}) width 800 wall w_mid swing ${pick(["in", "out"])}
${extra}}
`;
  }
}

/**
 * Multi-room fuzz (PR #216 review round 4): four rooms on a corridor, kitchens beside baths and
 * WCs, with a door or an opening between neighbours. A quoted set can close the way THROUGH a
 * room here, sending the walk round (`W_CIRCUITOUS_PATH`), which one room off a hall cannot.
 */
function* corpusMulti(seed0: number, n: number): Generator<string> {
  let seed = seed0;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const g = (v: number) => 50 * Math.round(v / 50);
  for (let k = 0; k < n; k++) {
    const kinds = [
      "kitchen",
      pick(["bath", "wc", "bath"]),
      pick(["bedroom", "living", "kitchen dining", "living kitchen"]),
      pick(["bath", "bedroom", "living"]),
    ];
    if (rnd() < 0.5) [kinds[0], kinds[1]] = [kinds[1]!, kinds[0]!];
    const ws = kinds.map(() => g(1500 + rnd() * 2600));
    const H = g(1600 + rnd() * 2600);
    const C = g(900 + rnd() * 700);
    const W = ws.reduce((a, b) => a + b, 0);
    let s = `plan "M" {
  units mm
  grid 50
`;
    s += `  wall id=shell exterior thickness 200 { (0,0) (${W},0) (${W},${H + C}) (0,${H + C}) close }
`;
    s += `  wall id=w_c partition thickness 100 { (0,${H}) (${W},${H}) }
`;
    s += `  room id=r_c at (0,${H}) size ${W}x${C} label "Corridor" uses circulation
`;
    s += `  door id=d_main at (0,${H + C / 2}) width 900 wall shell
`;
    let x = 0;
    kinds.forEach((u, i) => {
      const w = ws[i]!;
      if (i > 0)
        s += `  wall id=w_${i} partition thickness 100 { (${x},0) (${x},${H}) }
`;
      s += `  room id=r_${i} at (${x},0) size ${w}x${H} label "Room ${i}" uses ${u}
`;
      if (rnd() < 0.85 || i === 0)
        s += `  door id=d_${i} at (${x + g(450 + rnd() * (w - 900))},${H}) width 800 wall w_c swing ${pick(["in", "out"])}
`;
      if (i > 0 && rnd() < 0.45) {
        const kind = pick(["door", "opening"]);
        const y = g(500 + rnd() * (H - 1000));
        const swing = rnd() < 0.5 && kind === "door" ? " swing in" : "";
        s += `  ${kind} id=d_x${i} at (${x},${y}) width 800 wall w_${i}${swing}
`;
      }
      if (rnd() < 0.8)
        s += `  window at (${x + g(300 + rnd() * (w - 900))},0) width 600 wall shell
`;
      x += w;
    });
    yield `${s}}
`;
  }
}

const append = (src: string, stmts: readonly string[]): string =>
  src.replace(/\n}\s*$/, `\n${stmts.map((s) => `  ${s}`).join("\n")}\n}\n`);
/** Not compared: the two contents codes the hint itself answers, and the drafting-layer codes
 *  (ADR 0032), such as the collision a pasted piece raises by standing under the room's label —
 *  where the label is drawn is the label's to move, and `finish`'s never-worse law exempts them
 *  the same way (`NOT_GATED_DRAFTING`, `src/furnish.ts`). */
const CONTENTS = new Set(["W_ROOM_NO_FIXTURE", "W_ROOM_MISSING_DEFINING", ...NOT_GATED_DRAFTING]);
/** A finding as compared: a door attribution's text depends on a counted budget, not on the plan. */
const finding = (d: { code?: string; message: string }): string =>
  `${d.code}|${d.message.replace(/ — the bottleneck.*$/s, "").replace(/\.$/, "")}`;

describe("a quoted set, pasted, is what was checked and raises nothing (fixed-seed fuzz)", () => {
  it("lands on its checked footprints and gains no finding", () => {
    let quoted = 0;
    for (const src of [...corpus(20261020, 120), ...corpusB(987, 240)]) {
      const res = resolvePlan(src);
      const ir = res.ir!;
      const ctx = buildLintContext(ir, DEFAULT_RULESET, LINT_RULES);
      const room = ir.elements.find((e): e is RRoom => e.kind === "room" && e.id === "r_x")!;
      const paste = pasteSet(ctx, room, roomDefiningItems(room));
      if (!("stmts" in paste) || paste.stmts.length === 0) continue;
      quoted++;
      const pasted = append(src, paste.stmts);
      const after = resolvePlan(pasted).ir!;
      const placed = after.elements
        .filter((e): e is RFurniture => e.kind === "furniture")
        .map((f) => ({ x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h, rotate: f.rotate ?? 0, category: f.category }));
      // The turn is compared where it means something: a piece with a front (`orientationMatters`).
      const seen = placed.map(({ category, rotate, ...r }) => ({
        ...r,
        ...(orientationMatters(category) ? { rotate } : {}),
      }));
      const checked = paste.rects.map(({ rotate, ...r }, i) => ({
        ...r,
        ...(orientationMatters(placed[i]?.category ?? "") ? { rotate } : {}),
      }));
      expect(seen, pasted).toEqual(checked);
      const before = new Set(lint(src).map(finding));
      const gained = lint(pasted)
        .filter((d) => !CONTENTS.has(d.code!))
        .map(finding)
        .filter((m) => !before.has(m));
      expect(gained, pasted).toEqual([]);
    }
    // Not vacuous: most sampled rooms have a defining set the hint quotes.
    expect(quoted).toBeGreaterThan(200);
  }, 120_000);
});

describe("a quoted set, pasted, raises nothing on multi-room fuzz (rooms on a corridor)", () => {
  it("lands on its checked footprints and gains no finding, the walk round included", () => {
    let quoted = 0;
    for (const src of [...corpusMulti(99, 130), ...corpusMulti(515, 30)]) {
      const before = new Set(lint(src).map(finding));
      const ir = resolvePlan(src).ir!;
      for (const room of ir.elements.filter((e): e is RRoom => e.kind === "room" && e.id !== "r_c")) {
        // A context per room: each verification is the hint's own, never past the run's budget.
        const ctx = buildLintContext(ir, DEFAULT_RULESET, LINT_RULES);
        const paste = pasteSet(ctx, room, roomDefiningItems(room));
        if (!("stmts" in paste) || paste.stmts.length === 0) continue;
        quoted++;
        const pasted = append(src, paste.stmts);
        const placed = resolvePlan(pasted)
          .ir!.elements.filter((e): e is RFurniture => e.kind === "furniture")
          .map((f) => ({
            x: f.at.x,
            y: f.at.y,
            w: f.size.w,
            h: f.size.h,
            rotate: f.rotate ?? 0,
            category: f.category,
          }));
        const seen = placed.map(({ category, rotate, ...r }) => ({
          ...r,
          ...(orientationMatters(category) ? { rotate } : {}),
        }));
        const checked = paste.rects.map(({ rotate, ...r }, i) => ({
          ...r,
          ...(orientationMatters(placed[i]?.category ?? "") ? { rotate } : {}),
        }));
        expect(seen, pasted).toEqual(checked);
        const gained = lint(pasted)
          .filter((d) => !CONTENTS.has(d.code!))
          .map(finding)
          .filter((m) => !before.has(m));
        expect(gained, pasted).toEqual([]);
      }
    }
    expect(quoted).toBeGreaterThan(150);
  }, 180_000);
});

describe("an obstacle standing in the room runs the walk (review rounds 4 and 5)", () => {
  /** A kitchen beside a study it opens into, `obstacle` standing in the kitchen (the review's
   *  `stub-repro.arch`): before the walk read interior obstacles, the quoted counter, flush left
   *  beside the obstacle, was quoted unwalked and, pasted, closed the way to the study. Round 5:
   *  an authored piece whose edge lines up with the counter's (a gap of 0 on one axis, or a
   *  corner touch) read as no gap at all, and the walk was skipped the same way. */
  const plan = (obstacle: string, door = 2000, blockers = true): string => `plan "S" {
  units mm
  grid 50
  wall id=shell exterior thickness 200 { (-3000,0) (3000,0) (3000,5500) (-3000,5500) close }
  wall id=w_mid partition thickness 100 { (0,0) (0,4000) }
  wall id=w_c partition thickness 100 { (-3000,4000) (3000,4000) }
  room id=r_k at (0,0) size 3000x4000 label "Kitchen" uses kitchen
  room id=r_b at (-3000,0) size 3000x4000 label "Study" uses office
  room id=r_c at (-3000,4000) size 6000x1500 label "Hall" uses hall
  door id=d_main at (-3000,4750) width 900 wall shell
  door id=d_k at (${door},4000) width 800 wall w_c swing in
  opening id=o_b at (0,3500) width 800 wall w_mid
  window at (1500,0) width 900 wall shell
  furniture kitchen_sink in r_k anchor top flush size 800x600
  furniture stove in r_k anchor top-left flush size 600x600
  furniture fridge in r_k anchor top-right flush size 600x600
  ${obstacle}
${blockers ? "  furniture wardrobe in r_k anchor right flush size 600x1800\n  furniture bookshelf in r_k anchor bottom-right flush size 600x400\n" : ""}}
`;
  it.each([
    ["a wall stub", "wall id=w_s partition thickness 100 { (700,2250) (700,4000) }"],
    ["a stair", "stair id=st at (500,2650) size 1200x900 dir up"],
    ["a piece touching the counter's corner", "furniture bookshelf at (650,2300) size 100x1650 in r_k", 1700],
    ["a piece exactly the minimum from the counter", "furniture bookshelf at (1350,2250) size 100x1700 in r_k", 1700],
    ["a piece in line with the counter's edge", "furniture bookshelf at (1150,2300) size 100x1650 in r_k", 2500, false],
    [
      "a piece closing a corner pocket the study opens into",
      "furniture bookshelf at (1150,2350) size 100x1600 in r_k",
      2500,
      false,
    ],
  ])("%s: the kitchen's hint quotes no set that blocks the walk", (_, obstacle, door?: number, blockers?: boolean) => {
    const src = plan(obstacle, door, blockers);
    const ds = lint(src);
    // The walk is clear before: whatever the paste would add is the set's.
    expect(ds.filter((d) => d.code === "W_PATH_TOO_NARROW")).toEqual([]);
    const hint = ds.find((d) => CONTENTS.has(d.code!) && d.message.includes('"Kitchen"'))!.hints![0]!;
    const stmts = [...hint.matchAll(/`(furniture [^`]+)`/g)].map((m) => m[1]!).filter((q) => !q.endsWith("…"));
    const before = new Set(ds.map(finding));
    const gained = lint(append(src, stmts))
      .filter((d) => !CONTENTS.has(d.code!))
      .map(finding)
      .filter((m) => !before.has(m));
    expect(gained, hint).toEqual([]);
  });
});

describe("the verification is counted", () => {
  /** `n` empty kitchens off corridors, ten to a row (the review's cost probe, `gridgen.mjs`). */
  const kitchens = (n: number): string => {
    const cols = 10;
    const W = 3000;
    const H = 3000;
    const rows = Math.ceil(n / cols);
    let s = `plan "G" {\n  units mm\n  grid 50\n`;
    s += `  wall id=shell exterior thickness 200 { (0,0) (${cols * W},0) (${cols * W},${rows * (H + 1500)}) (0,${rows * (H + 1500)}) close }\n`;
    for (let r = 0; r < rows; r++) {
      const y = r * (H + 1500);
      s += `  wall id=w_r${r} partition thickness 100 { (0,${y + H}) (${cols * W},${y + H}) }\n`;
      s += `  room id=r_c${r} at (0,${y + H}) size ${cols * W}x1500 label "Corridor ${r}" uses circulation\n`;
      if (r > 0)
        s += `  wall id=w_t${r} partition thickness 100 { (0,${y}) (${cols * W},${y}) }\n  opening at (${W / 2},${y}) width 1000 wall w_t${r}\n`;
      for (let c = 0; c < cols && r * cols + c < n; c++) {
        const i = r * cols + c;
        const x = c * W;
        if (c > 0) s += `  wall id=w_v${i} partition thickness 100 { (${x},${y}) (${x},${y + H}) }\n`;
        s += `  room id=r_${i} at (${x},${y}) size ${W}x${H} label "Room ${i}" uses kitchen\n`;
        s += `  door id=d_${i} at (${x + W / 2},${y + H}) width 800 wall w_r${r} swing in\n`;
        s += `  window at (${x + W / 2},${y}) width 900 wall ${r === 0 ? "shell" : `w_t${r}`}\n`;
      }
    }
    return `${s}  door id=d_main at (0,${H + 750}) width 900 wall shell\n}\n`;
  };

  it("past its budget a hint quotes nothing, says why, and the run files one hint-budget skip", () => {
    const { diagnostics, coverage } = lintWithCoverage(kitchens(80));
    const hints = diagnostics.filter((d) => d.code === "W_ROOM_NO_FIXTURE").map((d) => d.hints![0]!);
    expect(hints.some((h) => h.includes("`hint-budget` in the coverage report"))).toBe(true);
    expect(hints.some((h) => h.includes("`furniture kitchen_sink"))).toBe(true);
    const skips = coverage!.families.flatMap((f) => f.skipped ?? []).filter((s) => s.reason === "hint-budget");
    expect(skips).toHaveLength(1);
  });

  it("a plan the budget never reaches reports no hint-budget skip", () => {
    const { coverage } = lintWithCoverage(kitchens(10));
    expect(coverage!.families.flatMap((f) => f.skipped ?? []).map((s) => s.reason)).not.toContain("hint-budget");
  });
});
