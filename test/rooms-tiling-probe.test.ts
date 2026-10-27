/**
 * The `walls from rooms` tiling-precondition probe (ADR 0028 Acceptance, plan card PS3.0 part A).
 *
 * Two halves. The planted cases prove each of the four checks can fire, and that the legal
 * near-misses (a 1 mm jog, a courtyard covered exactly, a void, a corner of two `place`d
 * instances) do not: a probe that never refuses would otherwise pass the corpus pins below.
 * The corpus pins hold the two headline shares and the per-directory counts, so a corpus
 * change that moves the D5 reading is visible in review rather than silently re-measured.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { makeNodeWorld } from "../src/cli/io.js";
import {
  CODES,
  corpusFiles,
  ROOT,
  isRefused,
  loadExcepts,
  probeCorpus,
  hasRooms,
  noUseExcepts,
  probeSource,
  storeyCodes,
  summarise,
  type Code,
  type StoreyResult,
} from "../scripts/probe-rooms-tiling.js";

const plan = (body: string) => `plan "p" {\n  units mm\n  grid 1\n${body}\n}\n`;

function codesOf(src: string): Code[] {
  const out = probeSource(src);
  if ("reason" in out) throw new Error(out.reason);
  const set = new Set<Code>();
  for (const s of out) for (const c of storeyCodes(s)) set.add(c);
  return CODES.filter((c) => set.has(c));
}

function storeys(src: string): StoreyResult[] {
  const out = probeSource(src);
  if ("reason" in out) throw new Error(out.reason);
  return out;
}

describe("planted cases: each precondition can refuse, each near-miss passes", () => {
  const cases: Array<[string, string, Code[]]> = [
    ["two rooms tiling a rectangle", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000`, []],
    [
      "overlap with positive area",
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (3999,0) size 3000x3000`,
      ["E_ROOMS_OVERLAP"],
    ],
    [
      "a 1 mm gap is a second component",
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (4001,0) size 3000x3000`,
      ["E_ROOMS_NOT_TILING"],
    ],
    ["a 1 mm jog is a legal tiling", `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,1) size 3000x3000`, []],
    [
      "corner touch does not connect",
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,3000) size 3000x3000`,
      ["E_ROOMS_NOT_TILING"],
    ],
    [
      "an uncovered hole",
      `  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000`,
      ["E_ROOMS_NOT_TILING"],
    ],
    [
      "a hole covered exactly by an outdoor surface (a courtyard)",
      `  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000\n  outdoor patio at (3000,3000) size 3000x3000`,
      [],
    ],
    [
      "a hole only partly covered by an outdoor surface",
      `  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000\n  outdoor patio at (3000,3000) size 2999x3000`,
      ["E_ROOMS_NOT_TILING"],
    ],
    [
      "an outdoor surface spilling past the hole",
      `  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000\n  outdoor patio at (3000,3000) size 3000x6000`,
      ["E_ROOMS_NOT_TILING"],
    ],
    [
      "a pinch: a U whose tips touch at one vertex",
      `  room id=w at (0,0) size 3000x9000\n  room id=s at (3000,6000) size 6000x3000\n  room id=e at (6000,3000) size 3000x3000\n  room id=t at (3000,0) size 3000x3000`,
      ["E_ROOMS_NOT_TILING"],
    ],
    [
      "a shared run shorter than the partition",
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,2950) size 3000x3000`,
      ["E_PARTITION_TOO_SHORT"],
    ],
    [
      "a shared run exactly the partition thickness",
      `  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,2900) size 3000x3000`,
      [],
    ],
    [
      "the plan's own partition thickness sets the threshold",
      `  wall id=p partition thickness 150 { (4000,2900) (4000,3000) }\n  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,2900) size 3000x3000`,
      ["E_PARTITION_TOO_SHORT"],
    ],
    [
      "a polygon room",
      `  room id=a polygon (0,0) (4000,0) (4000,3000) (0,3000)\n  room id=b at (4000,0) size 3000x3000`,
      ["E_ROOM_NOT_RECTANGLE"],
    ],
    ["a circle room", `  room id=a circle at (2000,2000) radius 2000`, ["E_ROOM_NOT_RECTANGLE"]],
  ];
  it.each(cases)("%s", (_name, body, want) => {
    expect(codesOf(plan(body))).toEqual(want);
  });

  it("a hole covered exactly by a void passes, and no ring is drawn round it", () => {
    const src = `plan "p" {\n  units mm\n  grid 1\n  level 0 {\n  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000\n  }\n  level 1 {\n  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000\n  void id=v at (3000,3000) size 3000x3000\n  }\n}\n`;
    const [l0, l1] = storeys(src);
    expect(isRefused(l0!)).toBe(true);
    expect(isRefused(l1!)).toBe(false);
    // 4 outer corners, no inner ring (a courtyard would add 4)
    expect(l1!.groups[0]!.derived!.ringVertices).toBe(4);
  });

  it("a non-rectilinear outdoor polygon is dropped from the covers and reported, never silently", () => {
    const g = storeys(
      plan(
        `  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000\n  outdoor patio polygon (3000,3000) (6000,3000) (6000,6000) (3500,6000) (3000,5500)`,
      ),
    )[0]!.groups[0]!;
    expect(g.droppedCovers).toBe(1);
    expect(g.refusals.map((r) => r.code)).toEqual(["E_ROOMS_NOT_TILING"]);
  });

  it("a courtyard derives an inner ring", () => {
    const src = plan(
      `  room id=n at (0,0) size 9000x3000\n  room id=s at (0,6000) size 9000x3000\n  room id=w at (0,3000) size 3000x3000\n  room id=e at (6000,3000) size 3000x3000\n  outdoor patio at (3000,3000) size 3000x3000`,
    );
    const g = storeys(src)[0]!.groups[0]!;
    expect(g.derived).toEqual({ partitionRuns: 4, ringVertices: 8, coexisting: 0 });
  });

  it("names the rooms each refusal is about", () => {
    const s = storeys(
      plan(
        `  room id=a at (0,0) size 4000x3000\n  room id=b at (3999,0) size 3000x3000\n  room id=c at (9000,0) size 1000x1000`,
      ),
    )[0]!;
    const byCode = Object.fromEntries(s.groups[0]!.refusals.map((r) => [r.code, r.rooms]));
    expect(byCode).toEqual({ E_ROOMS_OVERLAP: ["a", "b"], E_ROOMS_NOT_TILING: ["a", "c"] });
  });

  it("an authored wall on a derived line is counted as coexisting", () => {
    const g = storeys(
      plan(
        `  wall id=p partition thickness 100 { (4000,0) (4000,3000) }\n  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000`,
      ),
    )[0]!.groups[0]!;
    expect(g.derived).toEqual({ partitionRuns: 1, ringVertices: 4, coexisting: 1 });
  });

  it("is bounded: a group too large to decide crosses the step budget and is reported, not decided", () => {
    // 1,600 staggered rooms give a ~3,200 × 3,200 cell grid: the sweep is charged before it allocates.
    const t0 = performance.now();
    const s = storeys(plan(`  for i in 0..1600 {\n    room at (i * 1001, i * 1003) size 1000x1000\n  }`))[0]!;
    expect(s.groups[0]!.budget).toBe(true);
    expect(isRefused(s)).toBe(true);
    expect(performance.now() - t0).toBeLessThan(5000);
  });

  it("each `place`d instance is its own group: abutting instances do not tile each other", () => {
    const src = plan(
      `  component box() {\n    room id=r at (0,0) size 3000x3000\n  }\n  place box() as w at (0,0)\n  place box() as e at (3000,3000)`,
    );
    const s = storeys(src)[0]!;
    expect(s.groups.map((g) => g.group)).toEqual(["e", "w"]);
    expect(isRefused(s)).toBe(false); // a corner touch across instances is no refusal of either
  });
});

describe("the corpus (ADR 0028 Acceptance): both figures, pinned", () => {
  const a = probeCorpus(null);
  const b = probeCorpus(loadExcepts());
  const sum = summarise(a, b);

  it("skips only the resolve-order plans that diagnose on purpose, and lists them", () => {
    expect(a.failures.map((f) => `${f.file}: ${f.reason}`)).toEqual([
      "test/resolve-order/axes-and-elements.arch: does not resolve (E_OUT_OF_RANGE)",
      "test/resolve-order/instance-relational.arch: does not resolve (E_WALL_THICKNESS)",
      "test/resolve-order/relational-errors.arch: does not resolve (E_WALL_THICKNESS)",
      "test/resolve-order/rooms-and-walls-diagnose.arch: does not resolve (E_WALL_THICKNESS)",
    ]);
  });

  it("pins the literal reading (every no-use room excepted) and the undecided count", () => {
    const lit = probeCorpus(noUseExcepts());
    const refused = lit.storeys.filter(isRefused);
    const tiling = refused.filter((s) => storeyCodes(s).has("E_ROOMS_NOT_TILING")).map((s) => s.file);
    expect([refused.length, lit.storeys.filter(hasRooms).length]).toEqual(PINNED_SHARE_LITERAL);
    // `hillside-villa` since fix/examples-sound (2026-10-27): its upper floor's two ensuites are
    // component instances standing inside the floor, so the root group has a hole there.
    expect(tiling).toEqual(["examples/hillside-villa.arch", "test/fixtures/zones-wings.arch"]);
    // Of the (b) refusals, how many could not decide tiling (a non-rectilinear room in the set).
    const undecided = b.storeys.filter((s) => isRefused(s) && s.groups.some((g) => g.note && !g.budget)).length;
    // 13 until PS2.12's four `circle` pavilions (the defect corpus's radius pairs) joined them.
    expect(undecided).toBe(17);
  });

  it("pins the per-directory counts", () => {
    const rows = Object.fromEntries(
      [...sum.rows, sum.total].map((r) => [
        r.dir,
        [r.storeys, r.refusedA, r.refusedB, CODES.map((c) => r.byCodeB[c]).join("/")],
      ]),
    );
    expect(rows).toEqual(PINNED_ROWS);
  });

  it("pins the headline shares; (b) is the figure D5 reads", () => {
    expect([sum.shareA.refused, sum.shareA.storeys]).toEqual(PINNED_SHARE_A);
    expect([sum.shareB.refused, sum.shareB.storeys]).toEqual(PINNED_SHARE_B);
  });

  it("a differently-shaped cross-check: pairwise interval arithmetic agrees on overlap and area", () => {
    // Independent of the probe's cell grid: plain interval arithmetic on the resolved
    // rectangles of each group. A group whose rooms overlap nowhere must have a union area
    // equal to its area sum, and the probe's overlap verdict must match the pairwise one.
    let disagreements = 0;
    let groups = 0;
    for (const { file } of corpusFiles()) {
      const abs = join(ROOT, file);
      const res = resolvePlan(readFileSync(abs, "utf8"), { world: makeNodeWorld(dirname(abs)) });
      if (!res.ir) continue; // the listed resolve-order failures
      const levels = res.levels.length
        ? res.levels.map((l) => ({ level: l.level as number | null, ir: l.ir }))
        : [{ level: null, ir: res.ir }];
      for (const { level, ir } of levels) {
        const byGroup = new Map<string, Array<{ x0: number; y0: number; x1: number; y1: number }>>();
        for (const e of ir.elements) {
          if (e.kind !== "room" || e.poly || e._unplaced) continue;
          const g = e._instance ?? "";
          if (!byGroup.has(g)) byGroup.set(g, []);
          byGroup.get(g)!.push({ x0: e.at.x, y0: e.at.y, x1: e.at.x + e.size.w, y1: e.at.y + e.size.h });
        }
        const probed = a.storeys.find((s) => s.file === file && s.level === level)!;
        for (const [g, rs] of byGroup) {
          groups++;
          let overlap = false;
          for (let p = 0; p < rs.length; p++) {
            for (let q = p + 1; q < rs.length; q++) {
              const A = rs[p]!;
              const B = rs[q]!;
              if (Math.min(A.x1, B.x1) > Math.max(A.x0, B.x0) && Math.min(A.y1, B.y1) > Math.max(A.y0, B.y0))
                overlap = true;
            }
          }
          const said = probed.groups.find((x) => x.group === g)!.refusals.some((r) => r.code === "E_ROOMS_OVERLAP");
          if (said !== overlap) disagreements++;
        }
      }
    }
    expect(groups).toBeGreaterThan(200);
    expect(disagreements).toBe(0);
  });
});

/** `[storeys, refused (a), refused (b), overlap/not-tiling/short/not-rect under (b)]`. */
const PINNED_ROWS: Record<string, [number, number, number, string]> = {
  // `hillside-villa`'s upper floor: a hole where two ensuite instances stand (fix/examples-sound), no polygon room left.
  examples: [39, 7, 7, "0/1/0/6"],
  "test/defect-corpus": [172, 9, 9, "0/0/0/9"], // PS2.70 (PR #307), PS2.74: +2 corpus files each (garage-too-shallow, accessible-wc-pan-far pairs), all tile
  "test/recovery-corpus": [9, 0, 0, "0/0/0/0"],
  "test/fixtures": [15, 0, 0, "0/0/0/0"], // PS2.77: +1 fixture (storeys-eaves-overflow, two storeys), both tile
  "docs/plans/plan-soundness/repro": [6, 0, 0, "0/0/0/0"],
  "eval/goldens": [25, 0, 0, "0/0/0/0"],
  "eval/fidelity-plans": [9, 0, 0, "0/0/0/0"],
  "eval/faults": [6, 0, 0, "0/0/0/0"],
  "test/main-entrance-fixtures": [29, 3, 3, "0/0/0/3"],
  "test/callout-fixtures": [1, 0, 0, "0/0/0/0"],
  "test/finish-fixtures": [1, 0, 0, "0/0/0/0"],
  "test/resolve-order": [1, 0, 0, "0/0/0/0"],
  total: [313, 19, 19, "0/1/0/18"], // PS2.66 (PR #301) +2, PS2.70 (PR #307) +2, PS2.74 +2 corpus files (garage-too-shallow, accessible-wc-pan-far pairs, all tile); fix/examples-sound: hillside-villa's hole; PS2.77: +2 fixture storeys
};
/** Measured 2026-10-21 on `main@9fb7949`: 15 of 279 storeys refused, both figures (5.4 %). 2026-10-24: 15 of 283
 * (5.3 %) after four defect-corpus plans (seat-facing-away, fire-door-inward and their twins), none refused. 19 of 287
 * (6.6 %) after four more (PS2.12: radius-over-label, radius-over-piece and their twins), each refused as not a
 * rectangle: a `circle` pavilion is the only room that carries a `dims auto` R call-out. 19 of 289 (6.6 %) after
 * two more (PS2.11c: sofa-l-transposed and its twin), neither refused: two plans added, the shares unchanged. 19 of
 * 301 (6.3 %) after PS2.11e's eight stair-safety plans (twelve storeys: two pairs of two `level`s, two
 * single-storey pairs), none refused; 305 (6.2 %) with PR #283's four (hob-under-window,
 * bed-before-door-face and their twins), none refused; 309 (6.1 %) with PS2.70's garage-too-shallow pair, neither
 * refused; 311 (6.1 %) with PS2.77's two-storey fixture, neither refused; 313 (6.1 %) with PS2.74's accessible-wc-pan-far
 * pair, neither refused. */
const PINNED_SHARE_A: [number, number] = [19, 313]; // PS2.70 (PR #307), PS2.74 +2 corpus files each, PS2.77 +2 fixture storeys, all tile
const PINNED_SHARE_B: [number, number] = [19, 313]; // PS2.70 (PR #307), PS2.74 +2 corpus files each, PS2.77 +2 fixture storeys, all tile
/** The literal reading of "no use kind means outdoor": 16 of 279 (5.7 %); 16 of 283 (5.7 %) since 2026-10-24; 20 of 287 with PS2.12's four pavilions; 20 of 289 with PS2.11c's pair; 20 of 301 with PS2.11e's eight stair plans; 20 of 305 with PR #283's four; 20 of 309 with PS2.70's pair; 20 of 311 with PS2.77's two-storey fixture; 20 of 313 with PS2.74's pair. */
const PINNED_SHARE_LITERAL: [number, number] = [20, 313]; // PS2.70 (PR #307), PS2.74 +2 corpus files each, PS2.77 +2 fixture storeys, all tile
