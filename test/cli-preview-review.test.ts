import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReviewSheet, REVIEW_MAX_CROPS, type ReviewSheet } from "../src/cli/review.js";
import { compile, describe as describePlan, lint } from "../src/index.js";

/**
 * `arch preview --review` (plan-soundness PS5.4): the review sheet rings every element a
 * warning names, keys each to a legend and adds a fixed-scale close-up of every flagged
 * opening and furniture piece. It is drawing-only: it consumes `compile()` and `lint()`
 * and feeds neither (the digest suites hold the corpus; this file holds the sheet).
 */

const FIXTURE = "test/review-sheet/fixture.arch";

function run(args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/**
 * Since fix/examples-sound (2026-10-27) every shipped example is warning-free, so the warned
 * sheets are read off examples AS THEY WERE: the current source with the lines that fix
 * changed put back, each found exactly once.
 */
const AS_WAS: Record<string, [string, string][]> = {
  "courtyard-house.arch": [["  roof overhang 500", "  roof overhang 600"]],
  "materials.arch": [["  paper A2 landscape", "  paper A3 landscape"]],
  "themed.arch": [["  door   at (1500,H)    width 900  wall exterior swing in\n", ""]],
  "hillside-villa.arch": [
    ["d_linen  on w_linen_s at 1100 width 800", "d_linen  on w_linen_s at 1100 width 700"],
    ["d_en2_corr on en2.wall at 5300 width 800", "d_en2_corr on en2.wall at 5300 width 700"],
    ["d_enm      on en_m.wall at 7500 width 800", "d_enm      on en_m.wall at 7500 width 700"],
    ["d_enb2     pocket on en_b2.wall at 7500 width 800", "d_enb2     pocket on en_b2.wall at 7500 width 700"],
  ],
};
const asWas = (file: string): string => {
  let source = readFileSync(`examples/${file}`, "utf8");
  for (const [now, before] of AS_WAS[file]!) {
    if (source.split(now).length !== 2) throw new Error(`${file}: "${now}" is not found exactly once`);
    source = source.replace(now, before);
  }
  return source;
};

const sheetOf = (source: string, level?: number): ReviewSheet => {
  const s = buildReviewSheet(source, level !== undefined ? { level } : {});
  if ("kind" in s) throw new Error(`no sheet: ${s.kind}`);
  return s;
};

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

describe("preview --review: the fixture's five warnings", () => {
  const source = readFileSync(FIXTURE, "utf8");
  const sheet = sheetOf(source);

  it("numbers every warning in source order and rings the element each one names", () => {
    const ids = (m: ReviewSheet["marks"][number]): string[] => m.ringed.map((r) => `${r.kind}:${r.id}`);
    expect(sheet.marks.map((m) => [m.n, m.code, m.channel, ids(m), m.line])).toEqual([
      [1, "W_ROOM_DISCONNECTED", "lint", ["room:r_store"], 15],
      [2, "W_LEAF_ACROSS_DOORWAY", "lint", ["door:d_front"], 17],
      [3, "W_OPENING_AT_JUNCTION", "lint", ["door:d_garden"], 21],
      [4, "W_WC_SIDE_CLEARANCE", "lint", ["furniture:wc_1"], 24],
      [5, "W_FURNITURE_OVERLAP", "lint", ["furniture:coffee_table_4"], 27],
    ]);
    expect(sheet.marks.every((m) => m.unringed === undefined && m.span !== undefined)).toBe(true);
    // Exactly the default-ruleset lint set, message for message: nothing added, nothing lost.
    const linted = lint(source);
    expect(sheet.marks.map((m) => m.message).sort()).toEqual(linted.map((d) => d.message).sort());
    // The room is ringed by its own floor (the box is the band's outer edge); a door by a
    // circle about its centre.
    expect(sheet.marks[0]!.ringed[0]!.box).toEqual({ x: 6965.83, y: -34.17, w: 3068.34, h: 3068.34 });
    expect(sheet.marks[1]!.ringed[0]!.box).toEqual({ x: 3136.1, y: -563.9, w: 1127.8, h: 1127.8 });
    expect(sheet.cropsOmitted).toEqual([]);
  });

  it("crops every flagged opening and furniture piece at one scale (the --json crop list, pinned)", () => {
    expect(sheet.crops).toEqual([
      { n: [2], element: { id: "d_front", kind: "door" }, box: { x: 2500, y: -1200, w: 2400, h: 2400 } },
      { n: [3], element: { id: "d_garden", kind: "door" }, box: { x: 6350, y: 4800, w: 2400, h: 2400 } },
      { n: [4], element: { id: "wc_1", kind: "furniture" }, box: { x: -769.25, y: 4500, w: 2400, h: 2400 } },
      {
        n: [5],
        element: { id: "coffee_table_4", kind: "furniture" },
        box: { x: 7386.1, y: 3100, w: 2427.8, h: 2400 },
      },
    ]);
    // A room is ringed but never cropped.
    expect(sheet.crops.some((c) => c.element.kind === "room")).toBe(false);
  });

  it("embeds the default drawing byte for byte and quotes no id in the legend", () => {
    const plain = compile(source, { noCache: true }).svg;
    const inner = plain.slice(plain.indexOf(">") + 1, plain.lastIndexOf("</svg>"));
    expect(sheet.svg).toContain(inner);
    const legend = /<g id="rv-legend">([\s\S]*?)<\/g>/.exec(sheet.svg)![1]!;
    for (const m of sheet.marks) for (const r of m.ringed) expect(legend).not.toContain(`"${r.id}"`);
  });

  it("the sheet's SVG is pinned (a drawing test: re-pin only with a stated reason)", () => {
    expect(sha(sheet.svg)).toBe("151d5018c6f86f4996a10a754df3b07a3c9948c65e6a8b017bfb7202092c8bad");
    // Deterministic: a second build is the same bytes.
    expect(sheetOf(source).svg).toBe(sheet.svg);
  });

  it("building the sheet moves nothing it reads: compile, describe and lint are unchanged after it", () => {
    const fresh = readFileSync("examples/two-bed.arch", "utf8");
    const before = sha(
      compile(fresh, { noCache: true }).svg + JSON.stringify(describePlan(fresh)) + JSON.stringify(lint(fresh)),
    );
    sheetOf(fresh);
    sheetOf(source);
    const after = sha(
      compile(fresh, { noCache: true }).svg + JSON.stringify(describePlan(fresh)) + JSON.stringify(lint(fresh)),
    );
    expect(after).toBe(before);
  });
});

describe("preview --review: clean plans, storeys and the corpus", () => {
  it("a clean plan rings nothing and draws no close-up strip", () => {
    const sheet = sheetOf(readFileSync("examples/studio.arch", "utf8"));
    expect(sheet.marks).toEqual([]);
    expect(sheet.crops).toEqual([]);
    expect(sheet.svg).toContain("No warnings: nothing is ringed.");
    expect(sheet.svg).not.toContain("<use ");
  });

  it("draws one storey per sheet, with that storey's warnings (and each ensuite instance its own ring)", () => {
    const source = asWas("hillside-villa.arch");
    const upper = sheetOf(source, 2);
    expect(upper.level).toBe(2);
    const ringed = upper.marks.filter((m) => m.code === "W_PATH_TOO_NARROW").map((m) => m.ringed[0]?.id);
    // Three placed ensuites raise one message from one component span; the hint's door places each.
    // `r_linen` rings the walk to the linen cupboard (the 700 mm doors of the villa before
    // fix/examples-sound, which also gave each bedroom its own suite).
    expect(ringed).toEqual(["en2.room", "en_b2.room", "en_m.room", "r_linen"]);
    expect(sheetOf(source, 1).marks.some((m) => m.code === "W_PATH_TOO_NARROW")).toBe(false);
    expect(buildReviewSheet(source, { level: 9 })).toEqual({ kind: "badLevel", levels: [1, 2] });
  });

  it("over the examples, every warning that names an element is ringed; the rest name the whole sheet", () => {
    const unringed = new Set<string>();
    let ringed = 0;
    const files = readdirSync("examples").filter((n) => n.endsWith(".arch") && n !== "imports.arch");
    const sources = [...files.map((f) => readFileSync(`examples/${f}`, "utf8")), ...Object.keys(AS_WAS).map(asWas)];
    for (const source of sources) {
      if (source.includes("import ")) continue;
      const levels = compile(source, { noCache: true }).pages?.map((p) => p.level) ?? [undefined];
      for (const level of levels) {
        for (const m of sheetOf(source, level).marks) {
          if (m.ringed.length > 0) ringed++;
          else unringed.add(m.code);
        }
      }
    }
    expect(ringed).toBeGreaterThan(0);
    // Whole-plan and sheet-level warnings: no element statement contains their span.
    expect([...unringed].sort()).toEqual(["W_DRAWING_OVERFLOW", "W_NO_ENTRANCE", "W_SCALE_OVERFLOW"]);
  }, 120000);
});

describe("preview --review: one mark per warning, and no ring on a guess (red-team probes)", () => {
  const probe = (name: string): { source: string; sheet: ReviewSheet; warnings: number } => {
    const source = readFileSync(`test/review-sheet/${name}.arch`, "utf8");
    const compiled = compile(source, { noCache: true }).diagnostics.filter((d) => d.severity === "warning");
    return { source, sheet: sheetOf(source), warnings: compiled.length + lint(source).length };
  };
  const repeated = (m: ReviewSheet["marks"][number]): number | undefined =>
    m.unringed?.reason === "repeated" ? m.unringed.copies : undefined;

  it("a for loop: two identical warnings stay two marks, and neither rings the reachable room", () => {
    const { sheet, warnings, source } = probe("p2-for");
    expect(warnings).toBe(2);
    expect(sheet.marks).toHaveLength(2);
    expect(sheet.marks.map((m) => [m.code, m.ringed.length, repeated(m)])).toEqual([
      ["W_ROOM_DISCONNECTED", 0, 3],
      ["W_ROOM_DISCONNECTED", 0, 3],
    ]);
    // The room the door opens into is reachable: nothing rings it.
    const reachable = describePlan(source)
      .access.rooms.filter((r) => r.reachable)
      .map((r) => r.id);
    expect(reachable.length).toBeGreaterThan(0);
    for (const m of sheet.marks) for (const r of m.ringed) expect(reachable).not.toContain(r.id);
    expect(sheet.svg).toContain("(in a repeated statement, 3 copies; the warning does not say which)");
  });

  it("furniture in a loop: eight warnings, eight marks; a hint's id places a copy, else none is ringed", () => {
    const { sheet, warnings } = probe("p10-loopfurn");
    expect(warnings).toBe(8);
    expect(sheet.marks.map((m) => [m.code, m.ringed.map((r) => r.id), repeated(m)])).toEqual([
      ["W_FURNITURE_OVERLAP", [], 3],
      ["W_FURNITURE_OVERLAP", [], 3],
      ["W_FURNITURE_OVERLAP", [], 3],
      ["W_SEAT_FACING_AWAY", ["chair_2"], undefined],
      ["W_SEAT_FACING_AWAY", ["chair_4"], undefined],
      ["W_SEAT_FACING_AWAY", ["chair_6"], undefined],
      ["W_FURNITURE_OVERLAP", ["chair_7"], undefined],
      ["W_SEAT_FACING_AWAY", ["chair_7"], undefined],
    ]);
  });

  it("a component placed twice: each placement is ringed where a hint names it, neither where none does", () => {
    const { sheet, warnings } = probe("p3-place");
    expect(warnings).toBe(6);
    expect(sheet.marks.map((m) => [m.code, m.channel, m.ringed.map((r) => r.id), repeated(m)])).toEqual([
      ["W_ROOM_DISCONNECTED", "lint", [], 2],
      ["W_ROOM_DISCONNECTED", "lint", [], 2],
      ["W_ROOM_OVERLAP", "compile", ["hall"], 2],
      ["W_ROOM_OVERLAP", "compile", ["hall"], 2],
      ["W_WC_SIDE_CLEARANCE", "lint", ["p1.wc_1"], undefined],
      ["W_WC_SIDE_CLEARANCE", "lint", ["p2.wc_1"], undefined],
    ]);
    expect(sheet.crops.map((c) => c.element.id)).toEqual(["p1.wc_1", "p2.wc_1"]);
  });

  it("a room overlap rings both rooms, and the compile warning is carried as plain preview carries it", () => {
    const { sheet, warnings } = probe("p7-overlap");
    expect(warnings).toBe(4);
    const overlap = sheet.marks.find((m) => m.code === "W_ROOM_OVERLAP")!;
    expect(overlap.channel).toBe("compile");
    expect(overlap.ringed.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(sheet.diagnostics.map((d) => d.code)).toEqual(["W_ROOM_OVERLAP"]);
  });

  it("300 warnings: every one is a mark, the close-ups stop at 24 and the rest are listed", () => {
    const { sheet, warnings } = probe("p8-many");
    expect(sheet.marks).toHaveLength(warnings);
    expect(sheet.crops).toHaveLength(REVIEW_MAX_CROPS);
    const cropped = new Set(sheet.crops.flatMap((c) => c.n));
    const furniture = sheet.marks.filter((m) => m.ringed.some((r) => r.kind === "furniture")).map((m) => m.n);
    expect(sheet.cropsOmitted).toEqual(furniture.filter((n) => !cropped.has(n)));
    expect(sheet.cropsOmitted.length).toBeGreaterThan(0);
    const pieces = new Set(sheet.marks.flatMap((m) => m.ringed.filter((r) => r.kind === "furniture").map((r) => r.id)));
    expect(sheet.svg).toContain(`+${pieces.size - REVIEW_MAX_CROPS} close-ups not drawn`);
    // The crop strip is bounded: the sheet's height is the plan, the legend and at most 24 tiles.
    const h = Number(/viewBox="0 0 1600 ([\d.]+)"/.exec(sheet.svg)![1]);
    expect(h).toBeLessThan(40000);
  }, 60000);
});

describe("preview --review: the CLI", () => {
  it("writes the PNG and reports marks and crops, exit 0", () => {
    const out = join(mkdtempSync(join(tmpdir(), "arch-review-")), "fixture.review.png");
    const r = run(["preview", FIXTURE, "--review", "-o", out, "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j).toMatchObject({ ok: true, format: "png", review: true, rings: 5 });
    expect(j.marks.map((m: { code: string }) => m.code)).toHaveLength(5);
    expect(j.crops.map((c: { n: number[] }) => c.n)).toEqual([[2], [3], [4], [5]]);
    expect(j.cropsOmitted).toEqual([]);
    expect(j.marks[0]).toMatchObject({ n: 1, code: "W_ROOM_DISCONNECTED", line: 15, col: 3 });
    expect(existsSync(out)).toBe(true);
    expect(j.bytes).toBeGreaterThan(0);
  }, 60000);

  it("refuses --ascii, --view and --overlay beside it (exit 3), and a bad --level", () => {
    for (const extra of [["--ascii"], ["--view", "axon"], ["--overlay", "circulation"]]) {
      const r = run(["preview", FIXTURE, "--review", ...extra]);
      expect(r.status).toBe(3);
      expect(r.stderr).toContain("--review cannot be combined with");
    }
    expect(run(["preview", FIXTURE, "--review", "--level", "2"]).status).toBe(3);
  }, 60000);

  it("reports compile()'s warnings in diagnostics, as plain preview does", () => {
    const out = join(mkdtempSync(join(tmpdir(), "arch-review-")), "p7.review.png");
    const p7 = "test/review-sheet/p7-overlap.arch";
    const review = JSON.parse(run(["preview", p7, "--review", "-o", out, "--json"]).stdout);
    const plain = JSON.parse(run(["preview", p7, "-o", `${out}.plain.png`, "--json"]).stdout);
    expect(review.diagnostics).toEqual(plain.diagnostics);
    expect(review.diagnostics.map((d: { code: string }) => d.code)).toEqual(["W_ROOM_OVERLAP"]);
  }, 60000);

  it("a broken plan fails like preview, exit 2", () => {
    const r = run(["preview", "-", "--review", "--json"], 'plan "B" { units mm room at (0,0) size 0x3000 }');
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe("E_ROOM_SIZE");
  }, 60000);
});
