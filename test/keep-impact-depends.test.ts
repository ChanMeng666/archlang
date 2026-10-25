/**
 * PS4.3b (ADR 0033; design `docs/plans/plan-soundness/research/2026-10-26-ps43-keep-design.md`
 * §5, §6, §9, R15, R16; card PS4.11): `arch impact`'s `keeps` section, `describe --facts
 * depends`' `depends.keeps[]`, and Plan JSON's note on the keeps it drops.
 *
 * - The widening drill's `impact --set AW=4500` reproduces design §9 exactly, human and JSON, and
 *   reports the broken hard keep once (under `keeps`, never also under `diagnostics`).
 * - Matching by (storey, text, occurrence index): a `for`-generated keep, a keep an `if` adds or
 *   removes, and a level-2 keep held and broken (targets read on their own storey).
 * - `depends.keeps` for the drill, the implied/conflict/redundant cases of §5, and R5's snapping
 *   rule; then a soundness law: a keep the source alone implies always holds, and one the
 *   source alone contradicts never does.
 * - PS4.11: `compile -f json` says how many keeps it left out.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { cmdImpact } from "../src/cli/commands-analyze.js";
import { cmdCompile } from "../src/cli/commands-render.js";
import { parseArgs } from "../src/cli/io.js";
import { applyLetOverride, describe, impact, planToJson } from "../src/index.js";
import type { ImpactReport, KeepFact } from "../src/index.js";
import { KEEP_CORPUS_DIR, keepCorpus } from "./keep-harness.js";

const read = (p: string): string => readFileSync(p, "utf8");
const plan = (body: string, grid = 50): string => `plan "t" {\n  units mm\n  grid ${grid}\n${body}\n}\n`;

/** Run a CLI command in-process: exit code, stdout and stderr. */
async function run(
  cmd: (a: ReturnType<typeof parseArgs>) => number | Promise<number>,
  argv: string[],
): Promise<{ exit: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const write = process.stdout.write.bind(process.stdout);
  const writeErr = process.stderr.write.bind(process.stderr);
  const sink =
    (to: "out" | "err") =>
    (chunk: string | Uint8Array): boolean => {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      if (to === "out") stdout += s;
      else stderr += s;
      return true;
    };
  process.stdout.write = sink("out") as typeof process.stdout.write;
  process.stderr.write = sink("err") as typeof process.stderr.write;
  try {
    const exit = await cmd(parseArgs(argv));
    return { exit, stdout, stderr };
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
  }
}

function setImpact(src: string, name: string, value: string): ImpactReport {
  const o = applyLetOverride(src, name, value);
  if (!o.ok) throw new Error(JSON.stringify(o.diagnostics));
  return impact(src, o.source);
}

// ---- the widening drill (design §9) ------------------------------------------------------

suite("keep · impact: the widening drill (design §9), through the CLI", () => {
  const file = `${KEEP_CORPUS_DIR}/widen-before.arch`;

  it("the human report: today's sections, then the keeps, exactly as §9 prints them", async () => {
    const r = await run(cmdImpact, [file, "--set", "AW=4500"]);
    expect(r.exit).toBe(0);
    const lines = r.stdout.trimEnd().split("\n");
    // Today's sections, unchanged but for the keep code, which is not among them.
    expect(lines.slice(0, 11)).toEqual([
      "AW: 4000 → 4500",
      "Lets (1):",
      "  AW: 4000 → 4500",
      "Changed (3):",
      "  room a resized (20 m² → 22.5 m²; right edge +500 mm)",
      "    why: reads AW (4000 → 4500)",
      "  room b moved 500 mm right",
      "    why: on a (resized) ← reads AW (4000 → 4500)",
      "  door door_2 re-hosted: joins a and b → nothing",
      "    why: joins a (resized) ← reads AW (4000 → 4500)",
      "Held (0): none",
    ]);
    const broke = lines.slice(lines.indexOf("Broke (3):") + 1, lines.indexOf("Healed (0): none"));
    expect(broke.map((l) => l.split(":")[0])).toEqual([
      "  W_BOUNDARY_NO_WALL on b (level 1)",
      "  W_ROOM_DISCONNECTED on b (level 1)",
      "  W_ROOM_OUTSIDE_SHELL on b (level 1)",
    ]);
    expect(lines.slice(lines.indexOf("Healed (0): none"))).toEqual([
      "Healed (0): none",
      "Unchanged diagnostics: 1",
      "Keeps broke (3):",
      "  keep align a.right b.left p (hard, level 1): residual 0 → -500 mm at p",
      "    changed: a, b",
      "  keep min clear b 3800 (soft, level 1): residual 50 → -400 mm",
      "    changed: b",
      "  keep stacked b on levels 1 2 (advisory): residual 0 → -500 mm at b, level 2, left edge",
      "    changed: b",
      "Keeps held (0): none",
      "Keeps healed (0): none",
    ]);
    expect(r.stdout).not.toContain("W_KEEP_VIOLATED");
  });

  it("the JSON: `keeps` after `diagnostics`, as §9 prints it; nothing double-reported", async () => {
    const r = await run(cmdImpact, [file, "--set", "AW=4500", "--json"]);
    const j = JSON.parse(r.stdout) as ImpactReport & { set: unknown };
    expect(Object.keys(j)).toEqual(["ok", "set", "lets", "changed", "held", "diagnostics", "keeps", "summary"]);
    expect(j.keeps).toEqual({
      broke: [
        {
          keep: "align a.right b.left p",
          grade: "hard",
          level: 1,
          residual_mm: { before: 0, after: -500 },
          at: { target: "p" },
          changed: ["a", "b"],
        },
        {
          keep: "min clear b 3800",
          grade: "soft",
          level: 1,
          residual_mm: { before: 50, after: -400 },
          changed: ["b"],
        },
        {
          keep: "stacked b on levels 1 2",
          grade: "advisory",
          residual_mm: { before: 0, after: -500 },
          at: { target: "b", level: 2, edge: "left" },
          changed: ["b"],
        },
      ],
      held: [],
      healed: [],
      added: [],
      removed: [],
      unchanged_count: 0,
    });
    const codes = [...j.diagnostics.broke, ...j.diagnostics.healed].map((d) => d.code);
    expect(codes).toEqual(["W_BOUNDARY_NO_WALL", "W_ROOM_DISCONNECTED", "W_ROOM_OUTSIDE_SHELL"]);
    // The after side does raise it: the keep row is the one report of it.
    const after = applyLetOverride(read(file), "AW", "4500");
    expect(after.ok).toBe(true);
  });

  it("read backwards (`--against` the wider plan), the three keeps heal", () => {
    const r = impact(read(`${KEEP_CORPUS_DIR}/widen-after.arch`), read(file));
    expect(r.keeps!.healed.map((k) => [k.keep, k.residual_mm])).toEqual([
      ["align a.right b.left p", { before: -500, after: 0 }],
      ["min clear b 3800", { before: -400, after: 50 }],
      ["stacked b on levels 1 2", { before: -500, after: 0 }],
    ]);
    expect(r.diagnostics.healed.map((d) => d.code)).not.toContain("W_KEEP_VIOLATED");
  });

  it("a fourth keep `align a.right b.left` is held: both targets moved, residual 0 → 0", () => {
    const src = read(file).replace(
      "    keep min clear b 3800 soft\n",
      "    keep min clear b 3800 soft\n    keep align a.right b.left\n",
    );
    const r = setImpact(src, "AW", "4500");
    expect(r.keeps!.held).toEqual([
      {
        keep: "align a.right b.left",
        grade: "hard",
        level: 1,
        residual_mm: { before: 0, after: 0 },
        changed: ["a", "b"],
      },
    ]);
  });

  it("a keep-free plan has no `keeps` key, and a plan whose keeps never move counts them unchanged", () => {
    expect("keeps" in impact(read("examples/studio.arch"), read("examples/studio.arch"))).toBe(false);
    const same = impact(read(file), read(file));
    expect(same.keeps).toEqual({ broke: [], held: [], healed: [], added: [], removed: [], unchanged_count: 3 });
  });

  it("a side that does not resolve: nothing compared, no `keeps`, the keep code stays a diagnostic", () => {
    const broken = read(`${KEEP_CORPUS_DIR}/widen-after.arch`).replace("room id=b ", "room id=b at ");
    const r = impact(broken, read(`${KEEP_CORPUS_DIR}/widen-after.arch`));
    expect(r.ok).toBe(false);
    expect("keeps" in r).toBe(false);
    expect(r.diagnostics.broke.map((d) => d.code)).toContain("W_KEEP_VIOLATED");
  });
});

// ---- matching (R15) -----------------------------------------------------------------------

suite("keep · impact matches by (storey, text, occurrence index)", () => {
  it("a `for`-generated keep: each pass is its own keep, told apart by order", () => {
    const src = plan(
      [
        "  let X = 0",
        "  room id=a at (X,0) size 4000x5000",
        "  for i in 0..2 {",
        "    keep fixed a.left at i * 1000 soft",
        "  }",
      ].join("\n"),
    );
    const r = setImpact(src, "X", "1000");
    // Pass 0 held a.left at 0 and now reads +1000; pass 1 read -1000 and now holds.
    expect(r.keeps!.broke).toEqual([
      { keep: "fixed a.left at i * 1000", grade: "soft", residual_mm: { before: 0, after: 1000 }, changed: ["a"] },
    ]);
    expect(r.keeps!.healed).toEqual([
      { keep: "fixed a.left at i * 1000", grade: "soft", residual_mm: { before: -1000, after: 0 }, changed: ["a"] },
    ]);
    // One more pass: the third occurrence is added; the first two still pair by order.
    const more = src.replace("for i in 0..2", "for i in 0..N").replace("  let X = 0", "  let X = 0\n  let N = 2");
    const r3 = setImpact(more, "N", "3");
    expect(r3.keeps!.added).toEqual([
      { keep: "fixed a.left at i * 1000", grade: "soft", residual_mm: { after: -2000 }, changed: [] },
    ]);
    expect(r3.keeps!.unchanged_count).toBe(2);
  });

  it("a keep an `if` adds is `added`; read backwards it is `removed`, with the one residual it has", () => {
    const src = plan(
      [
        "  let WIDE = 0",
        "  room id=a at (0,0) size 4000x5000",
        "  if WIDE > 0 {",
        "    keep min clear a 4500",
        "  }",
      ].join("\n"),
    );
    const o = applyLetOverride(src, "WIDE", "1");
    if (!o.ok) throw new Error("override");
    const added = impact(src, o.source);
    expect(added.keeps).toEqual({
      broke: [],
      held: [],
      healed: [],
      added: [{ keep: "min clear a 4500", grade: "hard", residual_mm: { after: -500 }, changed: [] }],
      removed: [],
      unchanged_count: 0,
    });
    // The broken hard keep's warning is not a broke diagnostic: it is the added keep.
    expect(added.diagnostics.broke.map((d) => d.code)).not.toContain("W_KEEP_VIOLATED");
    expect(added.summary).toContain("Keeps added (1):");
    expect(added.summary).toContain("  keep min clear a 4500 (hard): added, residual -500 mm");
    const removed = impact(o.source, src);
    expect(removed.keeps!.removed).toEqual([
      { keep: "min clear a 4500", grade: "hard", residual_mm: { before: -500 }, changed: [] },
    ]);
    expect(removed.summary).toContain("  keep min clear a 4500 (hard): removed, residual was -500 mm");
  });

  it("a level-2 keep is held when its targets move together, and broke when one stays (per-storey targets)", () => {
    const src = plan(
      [
        "  let W2 = 4000",
        "  level 1 {",
        "    room id=g at (0,0) size 8000x5000",
        "  }",
        "  level 2 {",
        "    wall id=p partition thickness 100 { (4000,0) (4000,5000) }",
        "    room id=c at (0,0) size W2 x 5000",
        "    room id=d right-of c align top gap 0 size 4000x5000",
        "    keep align c.right d.left",
        "    keep align c.right p soft",
        "  }",
      ].join("\n"),
    );
    const r = setImpact(src, "W2", "4500");
    // `changed[]` compares the lowest storey's elements (PS4.6), so it lists nothing here; the
    // keeps read their own storey.
    expect(r.changed).toEqual([]);
    expect(r.keeps!.held).toEqual([
      {
        keep: "align c.right d.left",
        grade: "hard",
        level: 2,
        residual_mm: { before: 0, after: 0 },
        changed: ["c", "d"],
      },
    ]);
    expect(r.keeps!.broke).toEqual([
      {
        keep: "align c.right p",
        grade: "soft",
        level: 2,
        residual_mm: { before: 0, after: -500 },
        at: { target: "p" },
        changed: ["c"],
      },
    ]);
  });
});

// ---- depends.keeps (design §5, R5, R16) ---------------------------------------------------

const keepsOf = (src: string): KeepFact[] => describe(src, { facts: ["depends"] }).depends?.keeps ?? [];

suite("keep · describe --facts depends: depends.keeps[]", () => {
  it("the drill, as design §9 lists it (`by` a list: the statements on the path)", () => {
    const src = read(`${KEEP_CORPUS_DIR}/widen-before.arch`);
    const d = describe(src, { facts: ["depends"] });
    const rows = [
      {
        keep: "align a.right b.left p",
        level: 1,
        targets: ["a.right", "b.left", "p"],
        constrains: ["AW"],
        equations: 2,
        implied: [{ equation: ["a.right", "b.left"], by: ["room b right-of a"] }],
      },
      { keep: "min clear b 3800", level: 1, targets: ["b"], constrains: ["AW"], bounds: 1 },
      { keep: "stacked b on levels 1 2", targets: ["b"], constrains: ["AW"], equations: 4 },
    ];
    expect(d.depends!.keeps).toEqual(rows);
    // Per storey (R16): level 1 lists its own two; level 2 has none, so no key; `stacked` spans
    // storeys and sits on the plan-wide list only.
    expect(d.levels![0]!.depends!.keeps).toEqual(rows.slice(0, 2));
    expect("keeps" in d.levels![1]!.depends!).toBe(false);
    // Plain describe() and a keep-free plan's depends are what they were.
    expect("depends" in describe(src)).toBe(false);
    expect("keeps" in (describe(read("examples/studio.arch"), { facts: ["depends"] }).depends ?? {})).toBe(false);
  });

  it("§5's conflict: `keep offset b.left from a.right 100` against `right-of a … gap 0`", () => {
    const src = read(`${KEEP_CORPUS_DIR}/widen-before.arch`).replace(
      "    keep min clear b 3800 soft\n",
      "    keep min clear b 3800 soft\n    keep offset b.left from a.right 100 soft\n",
    );
    const row = keepsOf(src).find((k) => k.keep.startsWith("offset"))!;
    expect(row.conflicts).toEqual([
      { equation: ["b.left", "a.right"], with: ["room b right-of a"], axis: "x", gap_mm: 100 },
    ]);
  });

  it("implied through a chain of statements; a wall written on a datum; redundant and conflicting keeps", () => {
    const src = plan(
      [
        "  let W = 4000",
        "  room id=a at (0,0) size W x 5000",
        "  room id=b left-of a gap 100 size 3000x5000",
        "  room id=c below a align right size 2000x3000",
        "  wall id=p partition thickness 100 { (a.right, 0) (a.right, 5000) }",
        "  wall id=q partition thickness 100 { (a.right + 100, 0) (a.right + 100, 5000) }",
        "  keep align a.right p",
        "  keep offset q from p 100",
        "  keep offset q from p 150",
        "  keep align b.right a.left",
        "  keep align c.right a.right",
        "  keep fixed a.left at 0",
        "  keep fixed a.left at 0",
        "  keep min clear a 3000",
        "  keep min clear a 3500",
      ].join("\n"),
    );
    const rows = keepsOf(src);
    const by = (k: string) => rows.filter((r) => r.keep === k);
    expect(by("align a.right p")[0]!.redundant).toEqual({ by: ["wall p at a.right"] });
    expect(by("offset q from p 100")[0]!.redundant).toEqual({ by: ["wall p at a.right", "wall q at a.right + 100"] });
    expect(by("offset q from p 150")[0]!.conflicts).toEqual([
      {
        equation: ["q", "p"],
        with: ["wall p at a.right", "wall q at a.right + 100"],
        axis: "x",
        gap_mm: 50,
      },
    ]);
    // `left-of a gap 100` with a literal width: a.left − b.right = 100, so aligning them conflicts.
    expect(by("align b.right a.left")[0]!.conflicts).toEqual([
      { equation: ["b.right", "a.left"], with: ["room b left-of a"], axis: "x", gap_mm: -100 },
    ]);
    expect(by("align c.right a.right")[0]!.redundant).toEqual({ by: ["room c below a align right"] });
    // The first `fixed` is new information; the second restates it.
    const fixed = by("fixed a.left at 0");
    expect(fixed[0]!.redundant).toBeUndefined();
    expect(fixed[1]!.redundant).toEqual({ by: ["keep fixed a.left at 0"] });
    // `min clear`: the weaker demand is redundant, whichever comes first.
    expect(by("min clear a 3000")[0]!.redundant).toEqual({ by: ["keep min clear a 3500"] });
    expect(by("min clear a 3500")[0]!.redundant).toBeUndefined();
    // constrains reads per element: a's row reads W (its size), so every keep on a reads W.
    expect(by("fixed a.left at 0")[0]!.constrains).toEqual(["W"]);
  });

  it("R5: a relation is implied only when it survives snapping (edges, grid-multiple literals)", () => {
    const rel = (clause: string, grid = 50) =>
      plan(
        [
          "  let G = 0",
          "  room id=a at (0,0) size 4000x5000",
          `  room id=b ${clause} size 3000x5000`,
          "  keep align a.right b.left",
          "  keep align a.cy b.cy",
        ].join("\n"),
        grid,
      );
    const implied = (src: string) => keepsOf(src).map((r) => r.redundant !== undefined);
    expect(implied(rel("right-of a gap 0"))).toEqual([true, false]);
    // A gap off the grid: the relation is measured, not excused.
    const off = rel("right-of a gap 25");
    expect(implied(off)).toEqual([false, false]);
    expect(keepsOf(off)[0]!.conflicts).toBeUndefined();
    // A centre is never implied, even when it is aligned by construction.
    expect(implied(rel("right-of a align middle gap 0"))).toEqual([true, false]);
    // A gap that reads a name is not a literal.
    expect(implied(rel("right-of a gap G"))).toEqual([false, false]);
    // No grid: integer literals.
    expect(implied(rel("right-of a gap 0", 0))).toEqual([true, false]);
  });

  it("locked: a keep whose targets read no name; its own value's names count in constrains", () => {
    const src = plan(
      [
        "  let G = 100",
        "  room id=a at (0,0) size 4000x5000",
        "  room id=b at (4000,0) size 4000x5000",
        "  keep align a.right b.left",
        "  keep offset b.left from a.left G * 40",
      ].join("\n"),
    );
    const [lock, valued] = keepsOf(src);
    expect(lock).toMatchObject({ constrains: [], locked: true });
    expect(valued).toMatchObject({ constrains: ["G"], equations: 1 });
    // A value that reads a name is not entered: no implied or conflict claim rides on it.
    expect(valued!.implied).toBeUndefined();
    expect(valued!.conflicts).toBeUndefined();
  });

  it("soundness: a keep the source alone implies always holds; one the source alone contradicts never does", () => {
    const extra = [
      plan(
        [
          "  let W = 4000",
          "  let H = 5000",
          "  room id=a at (100,0) size W x H",
          "  room id=b right-of a gap 200 size 3000x5000",
          "  room id=c below b align right size 2000x3000",
          "  room id=d above a gap 50 size 1000x1000",
          "  room id=e left-of a align bottom size 1000x2000",
          "  wall id=p partition thickness 100 { (b.left - 100, 0) (b.left - 100, 5000) }",
          "  keep align a.right p",
          "  keep offset p from a.right 100",
          "  keep offset b.left from a.right 200",
          "  keep align c.right b.right",
          "  keep offset a.top from d.bottom 50",
          "  keep align e.bottom a.bottom",
          "  keep align e.right a.left",
          "  keep align b.top a.top",
        ].join("\n"),
      ),
    ];
    const sources = [...keepCorpus().map(([, s]) => s), ...extra];
    const values = ["0", "1", "37", "4025", "-75"];
    let checked = 0;
    for (const base of sources) {
      const lets = [...base.matchAll(/^ {2}let ([A-Za-z_]\w*) = (\d+)\s*$/gm)].map((m) => m[1]!);
      const variants = [
        base,
        ...lets.flatMap((n) =>
          values.map((v) => {
            const o = applyLetOverride(base, n, v);
            return o.ok ? o.source : base;
          }),
        ),
      ];
      for (const src of variants) {
        const d = describe(src, { facts: ["depends"] });
        if (!d.ok || !d.keeps) continue;
        const facts = d.depends?.keeps ?? [];
        facts.forEach((f, i) => {
          const fromSource = (xs: readonly string[]) => xs.length > 0 && xs.every((x) => !x.startsWith("keep "));
          if (f.redundant && fromSource(f.redundant.by) && f.keep !== undefined) {
            expect(d.keeps![i]!.holds, `${f.keep} in\n${src}`).toBe(true);
            checked++;
          }
          for (const c of f.conflicts ?? [])
            if (fromSource(c.with)) {
              expect(d.keeps![i]!.holds, `${f.keep} in\n${src}`).toBe(false);
              checked++;
            }
        });
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

// ---- PS4.11: Plan JSON says it dropped keeps -----------------------------------------------

suite("keep · Plan JSON names the keeps it drops (PS4.11)", () => {
  it("planToJson counts them; a keep-free plan has no count", () => {
    expect(planToJson(read(`${KEEP_CORPUS_DIR}/widen-before.arch`)).droppedKeeps).toBe(3);
    expect(planToJson(read(`${KEEP_CORPUS_DIR}/loops.arch`)).droppedKeeps).toBe(5);
    expect("droppedKeeps" in planToJson(read("examples/studio.arch"))).toBe(false);
  });

  it("`compile -f json` prints one note on stderr; --quiet and a keep-free plan print none", async () => {
    const withKeeps = await run(cmdCompile, [`${KEEP_CORPUS_DIR}/offset-fixed.arch`, "-f", "json", "-o", "-"]);
    expect(withKeeps.exit).toBe(0);
    expect(withKeeps.stderr).toContain(
      "note: Plan JSON carries no keeps; this export leaves out the plan's 10 keeps (the .arch source still holds them)\n",
    );
    expect(JSON.parse(withKeeps.stdout)).toEqual(planToJson(read(`${KEEP_CORPUS_DIR}/offset-fixed.arch`)).json);
    const quiet = await run(cmdCompile, [`${KEEP_CORPUS_DIR}/offset-fixed.arch`, "-f", "json", "-o", "-", "--quiet"]);
    expect(quiet.stderr).not.toContain("keeps");
    const plain = await run(cmdCompile, ["examples/studio.arch", "-f", "json", "-o", "-"]);
    expect(plain.stderr).not.toContain("keeps");
  });
});
