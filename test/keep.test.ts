/**
 * `keep` (ADR 0033; plan-soundness PS4.3a; design
 * `docs/plans/plan-soundness/research/2026-10-26-ps43-keep-design.md`): the worked widening
 * drill of design §9 reproduced through the CLI, each form's holds ⇔ residual rule and sign on
 * hand-built cases (the lattice edge, grid snapping R5, lattice rounding R6, `min clear` spanning
 * R18), the parsing rules (R14), the printer round trip, Plan JSON's drop, the budget (R11, R13),
 * the never-worse law of every source-rewriting transform (R7), id-free messages (R17) and the D4
 * equivariance law through the source-level transformer (R10). The byte-identity laws K1–K3 are
 * `./keep-byte-identity.test.ts`.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { fromSpelling, type D4 } from "../src/algebra/d4.js";
import type { KeepNode, KeepRef } from "../src/ast.js";
import { cmdFix } from "../src/cli/commands-author.js";
import { parseArgs } from "../src/cli/io.js";
import { codesOf } from "../src/finish.js";
import { gainedCodes } from "../src/furnish.js";
import { link } from "../src/import.js";
import { compile, describe, format, lint, planToJson, repair } from "../src/index.js";
import { evaluationSteps, resolveAll } from "../src/ir.js";
import { MAX_EVAL_STEPS } from "../src/expr.js";
import { residualSign, transformKeep } from "./keep-d4.js";
import { fmtHalfLattice } from "../src/num-format.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { proves } from "../src/reroll.js";
import { keepFormText, statementText } from "../src/statement-print.js";
import { NULL_WORLD } from "../src/world.js";
import { blankKeeps, escapeRegExp, KEEP_CORPUS_DIR, keepCorpus, keepNodes } from "./keep-harness.js";
import { runValidate } from "./validate-json-run.js";

const plan = (body: string, head = ""): string => `plan "K" {\n  units mm\n${head}${body}\n}\n`;
const keepsOf = (src: string) => describe(src).keeps ?? [];
const codes = (src: string): string[] => compile(src, { noCache: true }).diagnostics.map((d) => d.code ?? "");
const stepsOf = (src: string): number => {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  return evaluationSteps(resolveAll(link(ast!, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD));
};
const SHELL = "  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }";

// ---- the widening drill (design §9) ------------------------------------------------------

suite("keep · the widening drill (design §9), through the CLI", () => {
  const before = `${KEEP_CORPUS_DIR}/widen-before.arch`;
  const after = `${KEEP_CORPUS_DIR}/widen-after.arch`;

  it("the before and after sources differ only in AW, so every span is the same", () => {
    const a = readFileSync(before, "utf8");
    const b = readFileSync(after, "utf8");
    expect(b).toBe(a.replace("let AW = 4000", "let AW = 4500"));
    expect(keepNodes(a).map((k) => [k.span!.start, k.span!.end])).toEqual([
      [585, 612],
      [617, 643],
      [1059, 1096],
    ]);
  });

  it("validate --json, before: every keep holds; the residuals are 0, +50, 0; next is the lint row", () => {
    const out = JSON.parse(runValidate([before, "--json"]).stdout);
    expect(out.ok).toBe(true);
    expect(out.keeps).toEqual([
      { keep: "align a.right b.left p", grade: "hard", level: 1, holds: true, residual_mm: 0, span: [585, 612] },
      {
        keep: "min clear b 3800",
        grade: "soft",
        level: 1,
        holds: true,
        residual_mm: 50,
        measured_mm: 3850,
        span: [617, 643],
      },
      { keep: "stacked b on levels 1 2", grade: "advisory", holds: true, residual_mm: 0, span: [1059, 1096] },
    ]);
    expect(Object.keys(out).slice(-2)).toEqual(["keeps", "next"]);
    expect(out.next).toMatchObject({ tier: "validity", code: "W_HABITABLE_NO_WINDOW", span: [218, 266], level: 1 });
  });

  it("validate --json, after (AW = 4500): residuals −500, −400, −500; next names the broken hard keep", () => {
    const run = runValidate([after, "--json"]);
    expect(run.exit).toBe(0);
    const out = JSON.parse(run.stdout);
    expect(out.ok).toBe(true);
    expect(out.diagnostics.map((d: { code: string }) => d.code)).toEqual([
      "W_KEEP_VIOLATED",
      "W_ROOM_DISCONNECTED",
      "W_HABITABLE_NO_WINDOW",
      "W_BOUNDARY_NO_WALL",
      "W_ROOM_OUTSIDE_SHELL",
      // PS2.11e: the drill's upper storey brings the flight's head 200 mm from the west wall,
      // in `before` as in `after` (a true defect of the fixture, which the widening does not touch).
      "W_STAIR_NO_LANDING",
    ]);
    const message =
      'This keep holds the right edge of "Living", the left edge of "Bed" and the partition in "Living" on one line; that partition is 500 mm left of the right edge of "Living". A keep moves nothing.';
    const hint =
      "The keep names `a.right`, `b.left` and `p`; residual -500 mm on x (+ is right): `p` at 4000, `a.right` at 4500.";
    expect(out.diagnostics[0]).toMatchObject({
      code: "W_KEEP_VIOLATED",
      severity: "warning",
      message,
      line: 15,
      col: 5,
      span: [585, 612],
      hints: [hint, "Nothing was moved: `p` stands where its own statement puts it."],
      level: 1,
    });
    expect(out.keeps).toEqual([
      {
        keep: "align a.right b.left p",
        grade: "hard",
        level: 1,
        holds: false,
        residual_mm: -500,
        at: { target: "p" },
        span: [585, 612],
      },
      {
        keep: "min clear b 3800",
        grade: "soft",
        level: 1,
        holds: false,
        residual_mm: -400,
        measured_mm: 3400,
        span: [617, 643],
      },
      {
        keep: "stacked b on levels 1 2",
        grade: "advisory",
        holds: false,
        residual_mm: -500,
        at: { target: "b", level: 2, edge: "left" },
        span: [1059, 1096],
      },
    ]);
    expect(out.next).toEqual({ tier: "warning", code: "W_KEEP_VIOLATED", message, span: [585, 612], level: 1, hint });
    // `--strict` fails on the broken hard keep (exit 2), as it already does on the lint rows (R2).
    expect(runValidate([after, "--json", "--strict"]).exit).toBe(2);
  });

  it("describe: the min clear row reads the shell's north and south runs as not spanning (R18)", () => {
    const rows = keepsOf(readFileSync(after, "utf8"));
    expect(rows[1]).toEqual({
      keep: "min clear b 3800",
      form: "min clear",
      grade: "soft",
      level: 1,
      targets: ["b"],
      holds: false,
      residual_mm: -400,
      measured_mm: 3400,
      skipped_walls: 2,
      skipped: { not_spanning: 2 },
    });
    expect(keepsOf(readFileSync(before, "utf8"))[1]!.skipped_walls).toBe(0);
  });

  it("with the hard keep fixed, next falls to validity; the soft keep is named only once lint is clean", () => {
    const fixed = readFileSync(after, "utf8").replace(
      "wall id=p partition thickness 100 { (4000,0) (4000,5000) }\n    room id=a",
      "wall id=p partition thickness 100 { (4500,0) (4500,5000) }\n    room id=a",
    );
    expect(codes(fixed)).not.toContain("W_KEEP_VIOLATED");
    const dir = mkdtempSync(join(tmpdir(), "arch-keep-next-"));
    try {
      const nextOf = (src: string) => {
        const file = join(dir, "plan.arch");
        writeFileSync(file, src);
        return JSON.parse(runValidate([file, "--json"]).stdout).next;
      };
      expect(nextOf(fixed)).toMatchObject({ tier: "validity" });
      // Lint-clean under the default ruleset (the plan `test/cli-validate-next.test.ts` uses).
      const clean = (k: string) =>
        `plan "Studio" {\n  units mm\n  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n  room id=r at (0,0) size 8000x5000 label "Studio" uses living\n  door at (4000,5000) width 800 wall shell\n  window at (4000,0) width 1500 wall shell\n${k}}\n`;
      expect(nextOf(clean(""))).toBeNull();
      // A broken soft keep is the intent tier's item; a broken advisory keep is never chosen.
      expect(nextOf(clean("  keep min clear r 9000 soft\n"))).toMatchObject({
        tier: "intent",
        code: "W_KEEP_VIOLATED",
        span: [expect.any(Number), expect.any(Number)],
      });
      expect(nextOf(clean("  keep min clear r 9000 advisory\n"))).toBeNull();
      expect(codes(clean("  keep min clear r 9000 soft\n"))).not.toContain("W_KEEP_VIOLATED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- the measures, form by form (design §7 K3) -------------------------------------------

suite("keep · each form's holds ⇔ residual rule and sign", () => {
  const two = `${SHELL}\n  wall id=p partition thickness 100 { (4000,0) (4000,5000) }\n  room id=a at (0,0) size 4000x5000\n  room id=b at (4000,0) size 4000x5000`;
  const one = (k: string) => keepsOf(plan(`${two}\n  ${k}`))[0]!;

  it("align: + is right of / below the first datum; the largest residual is reported, first on a tie", () => {
    expect(one("keep align a.right b.left p")).toMatchObject({ holds: true, residual_mm: 0 });
    expect(one("keep align a.left b.left")).toMatchObject({
      holds: false,
      residual_mm: 4000,
      at: { target: "b.left" },
    });
    expect(one("keep align b.left a.left")).toMatchObject({ holds: false, residual_mm: -4000 });
    expect(one("keep align a.top b.bottom")).toMatchObject({ residual_mm: 5000 });
    const tie = one("keep align a.cx a.left a.right");
    expect(tie).toMatchObject({ residual_mm: -2000, at: { target: "a.left" } });
    expect(tie.residuals).toEqual([
      { target: "a.left", residual_mm: -2000 },
      { target: "a.right", residual_mm: 2000 },
    ]);
  });

  it("the lattice edge: a 0.001 mm offset breaks align", () => {
    const k = keepsOf(
      plan(
        `  room id=a at (0,0) size 3000x3000\n  room id=b at (3000.001,0) size 3000x3000\n  keep align a.right b.left`,
      ),
    )[0]!;
    expect(k).toMatchObject({ holds: false, residual_mm: 0.001 });
  });

  it("a centre line is compared at twice its value, so a half-lattice centre is never rounded", () => {
    const k = keepsOf(plan(`  room id=a at (0,0) size 0.001x3000\n  keep fixed a.cx at 0`))[0]!;
    expect(k).toMatchObject({ holds: false, residual_mm: 0.0005 });
  });

  it("snapping (R5): grid 50, a room 4050 wide — its cx is read snapped, as an expression reads it", () => {
    const src = readFileSync(`${KEEP_CORPUS_DIR}/grid50-cx.arch`, "utf8");
    const rows = keepsOf(src);
    expect(rows[0]).toMatchObject({ keep: "fixed a.cx at 2025", holds: false, residual_mm: 25 });
    expect(rows[1]).toMatchObject({ keep: "fixed a.cx at 2050", holds: true, residual_mm: 0 });
  });

  it("lattice rounding (R6): fixed a.left at 0.1 + 0.2 on a room at x 0.3 holds; 0.301 is 0.001 off", () => {
    const rows = keepsOf(readFileSync(`${KEEP_CORPUS_DIR}/offset-fixed.arch`, "utf8"));
    expect(rows.find((r) => r.keep === "fixed s.left at 0.1 + 0.2")).toMatchObject({ holds: true, residual_mm: 0 });
    expect(rows.find((r) => r.keep === "fixed s.left at 0.301")).toMatchObject({ holds: false, residual_mm: -0.001 });
  });

  it("<mm> is never grid-snapped (R20)", () => {
    const k = keepsOf(plan(`  room id=a at (0,0) size 3000x3000\n  keep fixed a.left at 20`, "  grid 50\n"))[0]!;
    expect(k).toMatchObject({ holds: false, residual_mm: -20 });
  });

  it("equal: + is wider / deeper than the first", () => {
    const src = plan(`${two}\n  room id=c at (0,5000) size 3000x2000\n  keep equal width a c\n  keep equal depth a c`);
    expect(keepsOf(src).map((k) => [k.holds, k.residual_mm])).toEqual([
      [false, -1000],
      [false, -3000],
    ]);
    expect(one("keep equal width a b")).toMatchObject({ holds: true });
  });

  it("offset: (v(x) − v(d)) − mm, + further right / lower than stated; an opening at its centre", () => {
    expect(one("keep offset b.left from a.left 4000")).toMatchObject({ holds: true });
    expect(one("keep offset b.left from a.left 3900")).toMatchObject({ holds: false, residual_mm: 100 });
    expect(one("keep offset a.left from b.left -4000")).toMatchObject({ holds: true });
    const door = keepsOf(plan(`${two}\n  door id=d on p at 2500 width 800\n  keep offset d from a.top 2400`))[0]!;
    expect(door).toMatchObject({ holds: false, residual_mm: 100 });
  });

  it("min clear: + is margin; holds at a zero margin; a wall's height is never read (R18)", () => {
    const rows = keepsOf(readFileSync(`${KEEP_CORPUS_DIR}/min-clear.arch`, "utf8"));
    // The 1100 mm `low` partition cuts the hall's span like a full-height one.
    expect(rows[0]).toMatchObject({ keep: "min clear big 2300", holds: true, residual_mm: 100, measured_mm: 2400 });
    // The `nib` meets the shop and does not span it, and the curved `bow` meets it: both skipped.
    expect(rows[2]).toMatchObject({ keep: "min clear shop 3800", measured_mm: 3850, skipped_walls: 2 });
    expect(one("keep min clear b 3850")).toMatchObject({ holds: true, residual_mm: 0 });
  });

  it("on axis: v(wall) − v(axis), + right of / below the axis", () => {
    const rows = keepsOf(readFileSync(`${KEEP_CORPUS_DIR}/on-axis.arch`, "utf8"));
    expect(rows[0]).toMatchObject({ keep: "on axis 2 p", holds: true });
    expect(rows.find((r) => r.keep === "on axis B r")).toMatchObject({ holds: false, residual_mm: 2400 });
  });

  it("stacked: per level and edge, e(id@lᵢ) − e(id@l₁); first in level order then edge order", () => {
    const rows = keepsOf(readFileSync(`${KEEP_CORPUS_DIR}/paper.arch`, "utf8"));
    const hall = rows.find((r) => r.keep === "stacked hall on levels 1 2 3")!;
    expect(hall).toMatchObject({ holds: false, residual_mm: 100, at: { target: "hall", level: 3, edge: "right" } });
    expect(hall.residuals).toHaveLength(8);
    expect(rows.find((r) => r.keep === "stacked st on levels 1 2 3")).toMatchObject({ holds: true });
  });

  it("fixed: v(d) − mm, + right of / below the stated value", () => {
    expect(one("keep fixed b.left at 4000")).toMatchObject({ holds: true });
    expect(one("keep fixed b.top at -50")).toMatchObject({ holds: false, residual_mm: 50 });
    expect(one("keep fixed p at 4100")).toMatchObject({ holds: false, residual_mm: -100 });
  });

  it("residuals print through the exact digit helper", () => {
    expect([fmtHalfLattice(-1_000_000), fmtHalfLattice(1), fmtHalfLattice(0), fmtHalfLattice(3)]).toEqual([
      "-500",
      "0.0005",
      "0",
      "0.0015",
    ]);
  });
});

// ---- grades and where results land (R1, R2) -----------------------------------------------

suite("keep · grades", () => {
  const broken = (grade: string) =>
    plan(
      `  room id=a at (0,0) size 3000x3000 label "A" uses living\n  keep fixed a.left at 100${grade ? ` ${grade}` : ""}`,
    );
  it("hard (the default and spelled) raises W_KEEP_VIOLATED; soft and advisory raise nothing", () => {
    expect(codes(broken(""))).toContain("W_KEEP_VIOLATED");
    expect(codes(broken("hard"))).toContain("W_KEEP_VIOLATED");
    expect(codes(broken("soft"))).not.toContain("W_KEEP_VIOLATED");
    expect(codes(broken("advisory"))).not.toContain("W_KEEP_VIOLATED");
    for (const g of ["hard", "soft", "advisory"])
      expect(keepsOf(broken(g))[0]).toMatchObject({ grade: g, holds: false });
  });
  it("no grade reaches lint(): lint is identical with the keep blanked", () => {
    for (const g of ["", "soft", "advisory"]) {
      const src = broken(g);
      expect(JSON.stringify(lint(src))).toBe(JSON.stringify(lint(blankKeeps(src))));
    }
  });
  it("a plan with no keep has no keeps key in describe() or validate --json", () => {
    expect("keeps" in describe(plan("  room id=a at (0,0) size 3000x3000"))).toBe(false);
    expect(Object.keys(JSON.parse(runValidate(["examples/studio.arch", "--json"]).stdout))).not.toContain("keeps");
  });
});

// ---- parsing (R14) -------------------------------------------------------------------------

suite("keep · parsing", () => {
  it("only `keep` is reserved: form and grade words stay names everywhere else", () => {
    const src = plan(
      `  let soft = 3000\n  let fixed = 2000\n  let depth = 100\n  room id=hard at (0,0) size soft x fixed\n  keep fixed hard.left at depth - 100 soft`,
    );
    expect(codes(src)).toEqual([]);
    expect(keepsOf(src)[0]).toMatchObject({ grade: "soft", holds: true });
  });
  it("a trailing grade word is always the grade, never a target", () => {
    const src = plan(
      `  room id=a at (0,0) size 3000x3000\n  room id=b at (0,0) size 3000x3000\n  keep align a.left b.left advisory`,
    );
    expect(keepsOf(src)[0]).toMatchObject({ grade: "advisory", targets: ["a.left", "b.left"] });
  });
  it("a level list item is the longest complete expression: `1 -1` is one level, `1 (-1)` two", () => {
    const one = parse(plan(`  keep stacked a on levels 1 -1`));
    expect(one.diagnostics.map((d) => d.code)).toEqual(["E_PARSE"]);
    const two = parse(plan(`  keep stacked a on levels 1 (-1)`));
    expect(two.diagnostics).toEqual([]);
  });
  it("a target list ends at the next statement, an assignment or a call", () => {
    const src = plan(
      `  let x = 0\n  room id=a at (0,0) size 3000x3000\n  room id=b at (3000,0) size 3000x3000\n  keep align a.right b.left\n  x = 1\n  keep align a.top b.top\n  room id=c at (0,3000) size 3000x3000`,
    );
    expect(codes(src).filter((c) => c.startsWith("E_"))).toEqual([]);
    expect(keepsOf(src)).toHaveLength(2);
  });
  it("arch fmt prints every corpus keep and re-parses to the same keep (ADR 0020 §5)", () => {
    for (const [name, src] of keepCorpus()) {
      const out = format(src);
      const strip = (ks: KeepNode[]) =>
        ks.map((k) => JSON.stringify(k, (key, v) => (key === "span" || key === "line" ? undefined : v)));
      expect(strip(keepNodes(out)), name).toEqual(strip(keepNodes(src)));
      expect(format(out), name).toBe(out);
    }
  });
});

// ---- Plan JSON drops keeps (design §7; PS4.10, PS4.11) -------------------------------------

suite("keep · Plan JSON drops keeps", () => {
  it("an export of a plan with keeps carries none, and re-reads to the plan without them", () => {
    const src = readFileSync(`${KEEP_CORPUS_DIR}/offset-fixed.arch`, "utf8");
    const withKeeps = planToJson(src);
    const without = planToJson(blankKeeps(src));
    expect(JSON.stringify(withKeeps.json)).toBe(JSON.stringify(without.json));
    expect(JSON.stringify(withKeeps.json)).not.toMatch(/"keeps?"/);
  });
});

// ---- the budget (R11, R13) ------------------------------------------------------------------

suite("keep · purity and the step meter", () => {
  const base = plan(`${SHELL}\n  room id=a at (0,0) size 4000x5000\n  room id=b at (4000,0) size 4000x5000`);
  const withKeep = (k: string) => base.replace("\n}\n", `\n  ${k}\n}\n`);

  it("each form's charge, pinned (expansion + index + measure)", () => {
    const delta = (k: string) => stepsOf(withKeep(k)) - stepsOf(base);
    const axes = (k: string) => withKeep(k).replace("  units mm\n", "  units mm\n  axes { x at 0, 4000 }\n");
    const deltaAxes = (k: string) => stepsOf(axes(k)) - stepsOf(axes(""));
    const storey = (dir: string) => `${SHELL}\n    stair id=st at (300,3800) size 2400x900 dir ${dir}`;
    const stacked = (k: string) =>
      plan(`  level 1 {\n  ${storey("up")}\n  }\n  level 2 {\n  ${storey("down")}\n  }${k}`);
    // Design §4: expansion charges the statement (1) and one step per target, plus its
    // expressions; the first keep of a storey builds the id index (elements + walls + 1) and the
    // authored-id set (entries + 1); the measure charges 1 + targets (`min clear`: its scan).
    expect({
      align: delta("keep align a.right b.left"),
      equal: delta("keep equal width a b"),
      offset: delta("keep offset b.left from a.left 4000"),
      minClear: delta("keep min clear a 3000"),
      onAxis: deltaAxes("keep on axis 1 shell segment 3"),
      stackedOf2: stepsOf(stacked("\n  keep stacked st on levels 1 2")) - stepsOf(stacked("")),
      fixed: delta("keep fixed a.left at 0"),
    }).toMatchInlineSnapshot(`
      {
        "align": 15,
        "equal": 15,
        "fixed": 23,
        "minClear": 138,
        "offset": 25,
        "onAxis": 15,
        "stackedOf2": 45,
      }
    `);
  });

  it("compile() is deterministic with keeps: two runs, the same bytes", () => {
    for (const [, src] of keepCorpus()) {
      const a = compile(src, { noCache: true });
      const b = compile(src, { noCache: true });
      expect(JSON.stringify(a.diagnostics)).toBe(JSON.stringify(b.diagnostics));
      expect(a.svg).toBe(b.svg);
    }
  });

  it("E_KEEP_LIMIT is raised once, and every keep past the cap is still charged", () => {
    const src = readFileSync(`${KEEP_CORPUS_DIR}/refused-limit.arch`, "utf8");
    expect(codes(src).filter((c) => c === "E_KEEP_LIMIT")).toHaveLength(1);
    const more = src.replace("0..1001", "0..1501");
    expect(stepsOf(more)).toBeGreaterThan(stepsOf(src));
  });

  it("a paper plan measures its keeps in the drawn pass only: one result and one warning per keep", () => {
    const src = readFileSync(`${KEEP_CORPUS_DIR}/paper.arch`, "utf8").replace(
      "keep min clear live 4500",
      "keep min clear live 9000",
    );
    expect(codes(src).filter((c) => c === "W_KEEP_VIOLATED")).toHaveLength(1);
    expect(keepsOf(src).filter((k) => k.keep === "min clear live 9000")).toHaveLength(1);
  });
});

// ---- the never-worse law of every source-rewriting transform (R7) ----------------------------

suite("keep · every source-rewriting transform counts a broken hard keep", () => {
  it("finish and furnish: the law's code multiset counts W_KEEP_VIOLATED", () => {
    const before = readFileSync(`${KEEP_CORPUS_DIR}/widen-before.arch`, "utf8");
    const after = readFileSync(`${KEEP_CORPUS_DIR}/widen-after.arch`, "utf8");
    const memo = new Map();
    const a = codesOf(before, {}, memo);
    const b = codesOf(after, {}, memo);
    expect(a.codes.get("W_KEEP_VIOLATED")).toBeUndefined();
    expect(b.codes.get("W_KEEP_VIOLATED")).toBe(1);
    expect(gainedCodes(a, b)).toContain("W_KEEP_VIOLATED");
  });

  it("repair pins a piece whose move would break a hard keep", () => {
    const src = (keep: string) =>
      plan(
        `  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  room id=a at (0,0) size 6000x4000 label "Studio" uses living\n  furniture id=sofa sofa at (1000,-100) size 2000x900 in a${keep}`,
      );
    expect(repair(src("")).changed).toBe(true);
    const held = repair(src("\n  keep offset sofa from a.top 350"));
    expect(held.changed).toBe(false);
    expect(JSON.stringify(held.unresolved)).toContain("W_KEEP_VIOLATED");
  });

  it("arch fix rolls back a pass that would break a hard keep", async () => {
    const src = (keep: string) =>
      plan(
        `  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  room id=a at (0,0) size 6000x4000\n  door id=d at (3000,600) width 900 wall shell${keep}`,
      );
    const dir = mkdtempSync(join(tmpdir(), "arch-keep-fix-"));
    const fixed = async (s: string) => {
      const file = join(dir, "plan.arch");
      writeFileSync(file, s);
      let stdout = "";
      const write = process.stdout.write.bind(process.stdout);
      const err = process.stderr.write.bind(process.stderr);
      process.stdout.write = ((c: string) => {
        stdout += c;
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      try {
        await cmdFix(parseArgs([file, "--dry-run", "--json"]));
      } finally {
        process.stdout.write = write;
        process.stderr.write = err;
      }
      return JSON.parse(stdout) as { applied: unknown[] };
    };
    try {
      expect((await fixed(src(""))).applied).toHaveLength(1);
      expect((await fixed(src("\n  keep offset d from a.top 600"))).applied).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reroll's proof compares compile().diagnostics and describe(), keeps included", () => {
    const src = plan(
      `  room id=a at (0,0) size 3000x3000\n  window at (0,500) width 400\n  window at (0,1000) width 400\n  window at (0,1500) width 400\n  keep fixed a.left at 0\n  keep fixed a.top at 0 soft`,
    );
    const baseline = (() => {
      const c = compile(src);
      const { diagnostics, ...describeFacts } = describe(src);
      const tri = (ds: readonly { code?: string; severity: string; message: string }[]) =>
        ds.map((d) => JSON.stringify([d.code, d.severity, d.message]));
      return {
        pipeline: { ok: true, diagnostics: c.diagnostics, pages: [c.svg] },
        describeFacts,
        describeDiagTriples: tri(diagnostics),
        lintPairs: lint(src).map((d) => JSON.stringify([d.code, d.message])),
      };
    })();
    const at = (s: string) => ({ start: src.indexOf(s), end: src.indexOf(s) + s.length });
    // A twin that breaks the hard keep, and one that breaks only the soft keep: both refused.
    expect(proves(src, at("keep fixed a.left at 0"), "keep fixed a.left at 1", {}, baseline as never)).toBe(false);
    expect(proves(src, at("keep fixed a.top at 0 soft"), "keep fixed a.top at 1 soft", {}, baseline as never)).toBe(
      false,
    );
  });
});

// ---- id-free messages (R17) ---------------------------------------------------------------

suite("keep · messages never quote an id", () => {
  it("every E_KEEP_* and W_KEEP_VIOLATED message over the corpus is free of the ids its keep names", () => {
    const bad: string[] = [];
    for (const [name, src] of keepCorpus()) {
      const texts = keepNodes(src).flatMap((k) => keepTexts(k));
      for (const d of compile(src, { noCache: true }).diagnostics) {
        if (!d.code?.includes("KEEP")) continue;
        const m = d.message.replace(/"[^"]*"/g, '""');
        for (const t of texts)
          if (new RegExp(`(^|[^\\w.])${escapeRegExp(t)}($|[^\\w.])`).test(m)) bad.push(`${name}: ${t} in ${d.message}`);
        expect(d.hints?.length, d.message).toBeGreaterThan(0);
      }
    }
    expect(bad).toEqual([]);
  });
});

/** The ids and datums a keep names, as written, that an id-free message must not quote (single
 *  letters are left out: they are words — "a polygon room"). */
function keepTexts(k: KeepNode): string[] {
  const refs: KeepRef[] =
    k.form === "align" || k.form === "equal"
      ? k.refs
      : k.form === "offset"
        ? [k.x, k.from]
        : k.form === "min-clear"
          ? [k.room]
          : k.form === "on-axis"
            ? [k.wall]
            : k.form === "stacked"
              ? [k.target]
              : [k.datum];
  return refs
    .flatMap((r) => (r.t === "room" ? [`${r.room}.${r.word}`, r.room] : r.t === "el" ? [r.id] : []))
    .filter((t) => t.length > 1);
}

// ---- D4 equivariance (R10) ------------------------------------------------------------------

suite("keep · D4 equivariance through the source-level transformer", () => {
  /** Corpus plans the law is stated over: single-storey, no axes, literal values, no half-grid centre. */
  const D4_PLANS = ["offset-fixed", "min-clear", "instance", "align-equal"];
  const FRAMES: [0 | 90 | 180 | 270, "x" | undefined][] = [
    [0, undefined],
    [90, undefined],
    [180, undefined],
    [270, undefined],
    [0, "x"],
    [90, "x"],
    [180, "x"],
    [270, "x"],
  ];
  const T = { x: 50000, y: 50000 };

  /** The plan's body as one placed instance `t`, its keeps (those naming no axis) at the root. */
  function placed(src: string, rotate: 0 | 90 | 180 | 270, mirror: "x" | undefined, keeps: KeepNode[]): string {
    const { plan: ast } = parse(src);
    const comps = [...ast!.components.values()].map((c) => src.slice(c.span!.start, c.span!.end));
    const body = ast!.body.filter((s) => s.kind !== "keep").map((s) => src.slice(s.span!.start, s.span!.end));
    const north = /\n {2}north up\n/.test(src) ? "  north up\n" : "";
    return `plan "D4" {\n  units mm\n${north}${comps.map((c) => `  ${c}\n`).join("")}  component body() {\n${body.map((b) => `    ${b}\n`).join("")}  }\n  place body() as t at (${T.x}, ${T.y})${rotate ? ` rotate ${rotate}` : ""}${mirror ? ` mirror ${mirror}` : ""}\n${keeps.map((k) => `  ${statementText(k)}\n`).join("")}}\n`;
  }

  for (const name of D4_PLANS) {
    it(name, () => {
      const src = readFileSync(`${KEEP_CORPUS_DIR}/${name}.arch`, "utf8");
      // Keeps naming no axis (a frame carries none) and holding literal values.
      const literal = (k: KeepNode): boolean => !("mm" in k) || k.mm.t === "num";
      const local = keepNodes(src).filter((k) => !keepFormText(k).includes("axis ") && literal(k));
      expect(local.length).toBeGreaterThan(2);
      // A wall's orientation, read once off the plan as written.
      const { plan: ast } = parse(src);
      const ir = resolveAll(link(ast!, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD).ir;
      const vertical = (r: KeepRef): boolean => {
        if (r.t !== "el") return false;
        const w = ir.walls.find((x) => x.id === r.id);
        const pts = w ? [...w.points, ...(w.closed ? [w.points[0]!] : [])] : [];
        const k = r.segment ?? 0;
        return pts.length > k + 1 && pts[k]!.x === pts[k + 1]!.x;
      };
      const opening = (r: KeepRef): boolean =>
        r.t === "el" &&
        ir.elements.some((e) => e.id === r.id && (e.kind === "door" || e.kind === "window" || e.kind === "opening"));
      const reference = placed(
        src,
        0,
        undefined,
        local.map((k) => transformKeep(k, fromSpelling(0), T, "t", vertical, opening)),
      );
      const ref = keepsOf(reference);
      expect(ref.map((r) => r.holds)).toEqual(
        local.map((k) => keepsOf(src).find((x) => x.keep === keepFormText(k))!.holds),
      );
      for (const [rotate, mirror] of FRAMES) {
        const g: D4 = fromSpelling(rotate, mirror);
        const turned = placed(
          src,
          rotate,
          mirror,
          local.map((k) => transformKeep(k, g, T, "t", vertical, opening)),
        );
        const rows = keepsOf(turned);
        expect(rows.length, `${rotate} ${mirror ?? ""}`).toBe(ref.length);
        rows.forEach((row, i) => {
          const s = residualSign(local[i]!, g, vertical);
          expect(row.holds, `${rotate} ${mirror ?? ""} ${row.keep}`).toBe(ref[i]!.holds);
          expect(row.residual_mm, `${rotate} ${mirror ?? ""} ${row.keep}`).toBe(s * ref[i]!.residual_mm || 0);
          // The residual sets, unordered, signs mapped by the frame.
          const set = (rs: typeof row.residuals, sign: number) =>
            (rs ?? []).map((x) => sign * x.residual_mm || 0).sort((p, q) => p - q);
          expect(set(row.residuals, 1)).toEqual(set(ref[i]!.residuals, s));
        });
      }
    });
  }
});

// ---- red-team round 1 ------------------------------------------------------------------------

suite("keep · round-1 probes", () => {
  it("a keep whose value raised a diagnostic is dropped, never measured against a substitute", () => {
    for (const [value, code] of [
      ["1 / 0", "E_DIV_ZERO"],
      ["b.left", "E_DATUM_BEFORE_ROOMS"],
      ["sqrt(-1)", "E_DOMAIN"],
    ] as const) {
      const src = plan(
        `  room id=a at (0,0) size 3000x3000\n  room id=b at (3000,0) size 3000x3000\n  keep fixed a.left at ${value}`,
      );
      expect(codes(src), value).toEqual([code]);
    }
  });

  it("min clear: the joined outline (R18) on the six join cases and a derived plan", () => {
    const joins = keepsOf(readFileSync(`${KEEP_CORPUS_DIR}/min-clear-joins.arch`, "utf8"));
    expect(joins.map((k) => [k.keep, k.measured_mm, k.skipped_walls])).toEqual([
      ["min clear r1 3850", 3850, 0], // stopped at the shell's inner face
      ["min clear r2 3851", 3850, 0], // a collinear vertex
      ["min clear r3 3850", 3850, 0], // two collinear partitions meeting mid-room
      ["min clear r4 3850", 3850, 0], // 1 mm short of the shell's centreline, inside its body
      ["min clear r5 4800", 4800, 1], // 1 mm short of the inner face: not joined, not read
      ["min clear r6 1400", 1500, 1], // an arc bulging into the room, met by its true extent
    ]);
    expect(joins[1]).toMatchObject({ holds: false, residual_mm: -1 });
    const derived = keepsOf(readFileSync(`${KEEP_CORPUS_DIR}/min-clear-derived.arch`, "utf8"));
    expect(derived.map((k) => [k.measured_mm, k.holds])).toEqual([
      [3850, true],
      [2350, true],
      [2350, false],
    ]);
  });

  it("min clear's scan is O(n log n): many runs on one line, many walls, a huge wall, each well under budget", () => {
    // Steps a plan spends for its keep: the same plan with the keep minus the plan without it.
    const cost = (body: string): number => stepsOf(plan(`${body}\n  keep min clear a 1000`)) - stepsOf(plan(body));
    const room = `  room id=a at (0,0) size 4000x3000 label "A"`;
    // 1,600 collinear runs on one line (the round-2 probe `collinear1`).
    const collinear = `${room}\n  for i in 0..1600 {\n    wall partition thickness 100 { (i*1000, 10000) (i*1000+500, 10000) }\n  }`;
    // 1,200 two-segment walls (`many1200_1`).
    const many = `${room}\n  for i in 0..1200 {\n    wall partition thickness 100 { (i*1000, 10000) (i*1000, 11000) (i*1000+500, 11000) }\n  }`;
    // One wall 3 km thick beside 1,600 vertical runs (`fatv1`).
    const fat = `${room}\n  wall partition thickness 3000000 { (3000000, 0) (3000000, 1) }\n  for i in 0..1600 {\n    wall partition thickness 100 { (i*1000, 10000) (i*1000, 10500) }\n  }`;
    const steps = { collinear: cost(collinear), many: cost(many), fat: cost(fat) };
    for (const [name, n] of Object.entries(steps)) expect(n, name).toBeLessThan(MAX_EVAL_STEPS / 20);
    for (const body of [collinear, many, fat]) {
      expect(keepsOf(plan(`${body}\n  keep min clear a 1000`))[0]).toMatchObject({ holds: true, measured_mm: 3000 });
    }
  }, 120_000);

  it("a crossing inside the stacked pass is E_STEP_LIMIT, with no level, and the plan is unresolved (R13)", () => {
    const storey = (dir: string, a: number, r: number) =>
      `${SHELL}\n    stair id=st at (300,3800) size 2400x900 dir ${dir}\n    for i in 0..${a} { for j in 0..1000 { let x = j } }\n    for k in 0..${r} { let y = k }`;
    const src = (a: number, r: number) =>
      plan(
        `  level 1 {\n  ${storey("up", a, r)}\n  }\n  level 2 {\n  ${storey("down", 0, 0)}\n  }\n  keep stacked st on levels 1 2`,
      );
    // The resolution spends s00 + perA·a + perR·r steps: fill the budget to within one inner step
    // of the end, so the first step past it is the last thing charged, the stacked pass.
    const s00 = stepsOf(src(0, 0));
    const perA = stepsOf(src(1, 0)) - s00;
    const perR = (stepsOf(src(0, 10)) - s00) / 10;
    expect(Number.isInteger(perR)).toBe(true);
    const a = Math.floor((MAX_EVAL_STEPS - s00) / perA) - 1;
    const r = Math.floor((MAX_EVAL_STEPS - stepsOf(src(a, 0))) / perR) + 1;
    const over = src(a, r);
    const crossing = compile(over, { noCache: true }).diagnostics.filter((d) => d.code === "E_STEP_LIMIT");
    expect(crossing).toHaveLength(1);
    expect(crossing[0]!.span).toEqual(keepNodes(over).at(-1)!.span);
    expect(crossing[0]!.level).toBeUndefined();
    // Both storeys resolved before it (one inner step fewer resolves, keep and all), and the
    // crossing left every storey unresolved: it was the stacked pass.
    expect(codes(src(a, r - 1))).not.toContain("E_STEP_LIMIT");
    const { plan: ast } = parse(over, BUILTIN_REGISTRY);
    const res = resolveAll(link(ast!, NULL_WORLD, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, NULL_WORLD);
    expect(res.levels.map((l) => l.ir.elements.length)).toEqual([0, 0]);
    expect(compile(over, { noCache: true }).svg).toBe("");
    expect(describe(over).ok).toBe(false);
  }, 120_000);

  it("a keep that fails to parse skips its own line: no `level` or `height` statement is parsed from it", () => {
    for (const bad of ["keep fixed a.left height 3000", "keep stacked a on level 2 {\n  }"]) {
      const src = plan(`  room id=a at (0,0) size 3000x3000\n  ${bad}\n  room id=b at (3000,0) size 3000x3000`);
      expect(
        parse(src).diagnostics.map((d) => d.code),
        bad,
      ).toEqual(["E_PARSE"]);
      expect(
        codes(src).filter((x) => x !== "E_PARSE"),
        bad,
      ).toEqual([]);
    }
  });

  it("a keep inside a component is refused where it is written, placed or not", () => {
    const src = plan(`  component bay() {\n    room id=r at (0,0) size 3000x3000\n    keep min clear r 2800\n  }`);
    expect(parse(src).diagnostics.map((d) => d.code)).toEqual(["E_KEEP_PLACEMENT"]);
  });

  it("a keep naming an authored element that was dropped says so", () => {
    const src = plan(
      `  room id=a at (0,0) size 3000x3000\n  room id=far at (40000000,0) size 3000x3000\n  keep fixed far.left at 0`,
    );
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_KEEP_TARGET")!;
    expect(d.message).toBe("This keep names an element that could not be placed");
  });

  it("the stacked message names the element through src/naming.ts", () => {
    const st = (dir: string, x: number) => `${SHELL}\n    stair id=st at (${x},3800) size 2400x900 dir ${dir}`;
    const src = plan(
      `  level 1 {\n  ${st("up", 300)}\n  }\n  level 2 {\n  ${st("down", 400)}\n  }\n  keep stacked st on levels 1 2`,
    );
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "W_KEEP_VIOLATED")!;
    expect(d.message).toMatch(/^This keep holds the stair (in|on|at) the [a-z ]+ of the plan on levels 1 and 2 /);
  });
});

suite("keep · round-2 probes (min clear's joined outline)", () => {
  const row = (name: string) => keepsOf(readFileSync(`${KEEP_CORPUS_DIR}/min-clear-${name}.arch`, "utf8"))[0]!;
  it("a run that changes thickness across the room is one body, however many thicknesses", () => {
    expect(row("thick2face")).toMatchObject({ measured_mm: 3750, holds: false, skipped_walls: 0 });
    expect(row("thick2full")).toMatchObject({ measured_mm: 3750, holds: false, skipped_walls: 0 });
    const four = row("thick4b");
    expect(four.measured_mm).toBeLessThanOrEqual(3875);
    expect(four).toMatchObject({ holds: false, skipped_walls: 0 });
  });
  it("a lining on the shell and a nib against it read their geometry alike", () => {
    expect(row("lining300")).toMatchObject({ measured_mm: 4700, holds: false });
    expect(row("nib100")).toMatchObject({ measured_mm: 4700, holds: false });
  });
  it("a run ending in an oblique wall is not carried, and the row says why", () => {
    expect(row("t45")).toMatchObject({
      measured_mm: 4800,
      skipped_walls: 2,
      skipped: { ends_in_curved_or_oblique: 1, oblique: 1 },
    });
  });
  it("an arc meets a room by the box around its extreme points ± t/2", () => {
    expect(row("arcbbox")).toMatchObject({ measured_mm: 400, skipped_walls: 1, skipped: { curved: 1 } });
  });
});
