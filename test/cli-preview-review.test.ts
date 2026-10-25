import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReviewSheet, type ReviewSheet } from "../src/cli/review.js";
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
    expect(sheet.marks.map((m) => [m.n, m.code, m.channel, m.element])).toEqual([
      [1, "W_ROOM_DISCONNECTED", "lint", { id: "r_store", kind: "room" }],
      [2, "W_LEAF_ACROSS_DOORWAY", "lint", { id: "d_front", kind: "door" }],
      [3, "W_OPENING_AT_JUNCTION", "lint", { id: "d_garden", kind: "door" }],
      [4, "W_WC_SIDE_CLEARANCE", "lint", { id: "wc_1", kind: "furniture" }],
      [5, "W_FURNITURE_OVERLAP", "lint", { id: "coffee_table_4", kind: "furniture" }],
    ]);
    // Exactly the default-ruleset lint set, message for message: nothing added, nothing lost.
    const linted = lint(source);
    expect(sheet.marks.map((m) => m.message).sort()).toEqual(linted.map((d) => d.message).sort());
    // The room is ringed by its own floor; a door by a circle about its centre.
    expect(sheet.marks[0]!.ring).toEqual({ x: 7000, y: 0, w: 3000, h: 3000 });
    expect(sheet.marks[1]!.ring).toEqual({ x: 3136.1, y: -563.9, w: 1127.8, h: 1127.8 });
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
    for (const m of sheet.marks) if (m.element) expect(legend).not.toContain(`"${m.element.id}"`);
  });

  it("the sheet's SVG is pinned (a drawing test: re-pin only with a stated reason)", () => {
    expect(sha(sheet.svg)).toBe("cdf7ab8c064d4b62ea36a396bedba5506c2245e1f398d30dfd3c816e7376fd69");
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
    const source = readFileSync("examples/hillside-villa.arch", "utf8");
    const upper = sheetOf(source, 2);
    expect(upper.level).toBe(2);
    const ringed = upper.marks.filter((m) => m.code === "W_PATH_TOO_NARROW").map((m) => m.element?.id);
    // Three placed ensuites raise one message from one component span; the hint's door places each.
    expect(ringed).toEqual(["en2.room", "en3.room", "en_m.room", "r_bed2", "r_bed3"]);
    expect(sheetOf(source, 1).marks.some((m) => m.code === "W_PATH_TOO_NARROW")).toBe(false);
    expect(buildReviewSheet(source, { level: 9 })).toEqual({ kind: "badLevel", levels: [1, 2] });
  });

  it("over the examples, every warning that names an element is ringed; the rest name the whole sheet", () => {
    const unringed = new Set<string>();
    let ringed = 0;
    for (const f of readdirSync("examples").filter((n) => n.endsWith(".arch") && n !== "imports.arch")) {
      const source = readFileSync(`examples/${f}`, "utf8");
      if (source.includes("import ")) continue;
      const levels = compile(source, { noCache: true }).pages?.map((p) => p.level) ?? [undefined];
      for (const level of levels) {
        for (const m of sheetOf(source, level).marks) {
          if (m.element) ringed++;
          else unringed.add(m.code);
        }
      }
    }
    expect(ringed).toBeGreaterThan(0);
    // Whole-plan and sheet-level warnings: no element statement contains their span.
    expect([...unringed].sort()).toEqual(["W_DRAWING_OVERFLOW", "W_NO_ENTRANCE", "W_SCALE_OVERFLOW"]);
  }, 120000);
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

  it("a broken plan fails like preview, exit 2", () => {
    const r = run(["preview", "-", "--review", "--json"], 'plan "B" { units mm room at (0,0) size 0x3000 }');
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe("E_ROOM_SIZE");
  }, 60000);
});
