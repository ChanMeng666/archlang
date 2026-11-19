/**
 * The fix producers' declaration (`FIX_PRODUCERS`, `src/fixable-codes.ts`, card AF8) against what
 * they emit. The capabilities resource lists the codes `fix` can resolve from that table, so a row
 * that lies there lies to every agent that reads it.
 *
 * From the source: its codes are exactly the ones `scripts/fix-coverage.ts` reads a fix site for, so
 * a new site with a code the table does not declare fails here even when no plan reaches it. From the
 * output: every fix that `compile()`, `lint()` and `arch fix`'s `while` proof emit over the corpus,
 * the catalogue's examples and fixed snippets, and the reach plans below matches a row in code,
 * `fixId`, applicability and stage, and every declared code and applicability is seen at least once.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { fixCoverage } from "../scripts/fix-coverage.js";
import { type Diagnostic, ERROR_CATALOG, compile, lint } from "../src/index.js";
import { FIX_PRODUCERS, type FixStage, fixableCodes } from "../src/fixable-codes.js";
import { proveWhileFixes } from "../src/while-fix.js";
import { corpusFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

const plan = (...body: string[]): string => ['plan "R" {', "  units mm", ...body, "}"].join("\n");
const BOX = "  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }";

/**
 * Plans for the fixes neither the corpus nor the catalogue reaches, each named by the
 * `code|applicability` it is there for.
 */
const REACH: Record<string, string> = {
  "E_ATTACH_POS_RANGE|machine-applicable": plan(
    "  wall id=w1 exterior thickness 200 { (0,0) (6000,0) }",
    "  door on w1 at 150% width 900",
  ),
  "E_ROOM_ALIGN|machine-applicable": plan(
    "  room id=a at (0,0) size 3000x3000",
    "  room id=b right-of a align botom size 2000x2000",
  ),
  "W_DIM_INSIDE|machine-applicable": plan(
    BOX,
    '  room id=r at (0,0) size 6000x4000 label "Hall"',
    "  dim (0,0)->(6000,0) offset 500",
  ),
  "W_SWING_OBSTRUCTED|machine-applicable": plan(
    BOX,
    '  room id=r at (0,0) size 6000x4000 label "Room"',
    "  door at (3000,4000) width 1000 wall exterior hinge left swing in",
    '  furniture box at (3400,2900) size 600x500 label "X"',
  ),
  // Two walls tie for nearest, for each of the three opening kinds.
  ...Object.fromEntries(
    ["door", "window", "opening"].map((kind) => [
      `W_${kind.toUpperCase()}_OFF_WALL|maybe-incorrect`,
      plan(
        "  wall id=a partition thickness 100 { (0,0) (1000,0) }",
        "  wall id=b partition thickness 100 { (1000,0) (1000,800) }",
        `  ${kind} id=d at (600,400) width 900`,
      ),
    ]),
  ),
  // The loop is inside a component body.
  "W_WHILE_DEPRECATED|maybe-incorrect": plan(
    "  component c() {\n    let i = 0\n    while i < 3 {\n      column at (i * 300, 0) size 100x100\n      i = i + 1\n    }\n  }\n  c()",
  ),
};

interface Emitted {
  where: string;
  stage: FixStage;
  code: string | undefined;
  applicability: string;
  fixId: string | undefined;
}

/** Every fix the three stages emit on `source`, as `arch fix` collects them. */
function emitted(where: string, source: string, world = worldFor(".")): Emitted[] {
  const out: Emitted[] = [];
  const note = (stage: FixStage, ds: readonly Diagnostic[]): void => {
    for (const d of ds)
      for (const f of d.fixes ?? [])
        out.push({ where, stage, code: d.code, applicability: f.applicability, fixId: f.fixId });
  };
  const compiled = compile(source, { noCache: true, world });
  const linted = lint(source, { world });
  note("compile", compiled.diagnostics);
  note("lint", linted);
  if (compiled.diagnostics.some((d) => d.code === "W_WHILE_DEPRECATED" && d.file === undefined)) {
    const proven = proveWhileFixes(source, { world }, { compile: compiled, lint: linted });
    note(
      "fix",
      proven.map((p): Diagnostic => ({ severity: "warning", message: "", code: "W_WHILE_DEPRECATED", fixes: [p.fix] })),
    );
  }
  return out;
}

const wrap = (body: string): string => `plan "E" {\n  units mm\n${body}\n}\n`;

function allEmitted(): Emitted[] {
  const out: Emitted[] = [];
  for (const file of corpusFiles()) out.push(...emitted(file, readFileSync(file, "utf8"), worldFor(dirname(file))));
  for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
    for (const [field, snippet] of [
      ["example", entry.example],
      ["fixed", entry.fixed],
    ] as const) {
      if (snippet === undefined) continue;
      out.push(...emitted(`${code}.${field}`, /^\s*plan\b/.test(snippet) ? snippet : wrap(snippet)));
    }
  }
  for (const [name, src] of Object.entries(REACH)) out.push(...emitted(`REACH ${name}`, src));
  return out;
}

/** How an emitted fix disagrees with the table, or nothing. */
function undeclared(e: Emitted): string | undefined {
  if (e.code === undefined) return "a fix on a diagnostic with no code";
  const rows = FIX_PRODUCERS.filter((p) => Object.hasOwn(p.codes, e.code!));
  if (rows.length === 0) return `${e.code} is not declared by any producer`;
  const fits = rows.filter(
    (p) =>
      p.stage === e.stage &&
      p.applicability.includes(e.applicability as never) &&
      p.codes[e.code!] === (e.fixId ?? null),
  );
  if (fits.length > 0) return undefined;
  return `${e.code} emitted at stage ${e.stage} as ${e.applicability} with fixId ${e.fixId ?? "none"}; declared: ${rows
    .map((p) => `${p.producer} (${p.stage}, ${p.applicability.join("/")}, fixId ${p.codes[e.code!] ?? "none"})`)
    .join("; ")}`;
}

describe("FIX_PRODUCERS declares what the fix producers emit (AF8)", () => {
  it("declares exactly the codes a fix site in src/ attaches a fix to", () => {
    const declared = [...new Set(FIX_PRODUCERS.flatMap((p) => Object.keys(p.codes)))].sort();
    const read = fixCoverage();
    expect(read.unattributed).toEqual([]);
    expect(
      read.withEdit.filter((c) => !declared.includes(c)),
      "a fix site attaches a fix to a code FIX_PRODUCERS does not declare: add it to its producer's row",
    ).toEqual([]);
    expect(
      declared.filter((c) => !read.withEdit.includes(c)),
      "a declared code has no fix site: drop it",
    ).toEqual([]);
  });

  it("names each producer where it is, with catalogued codes and no repeated code", () => {
    for (const p of FIX_PRODUCERS) {
      const [file, name] = p.producer.split("#") as [string, string | undefined];
      expect(existsSync(file), p.producer).toBe(true);
      if (name !== undefined) expect(readFileSync(file, "utf8"), p.producer).toMatch(new RegExp(`function ${name}\\b`));
      expect(p.applicability.length, p.producer).toBeGreaterThan(0);
      for (const code of Object.keys(p.codes)) expect(code in ERROR_CATALOG, `${p.producer}: ${code}`).toBe(true);
    }
    const codes = FIX_PRODUCERS.flatMap((p) => Object.keys(p.codes));
    expect(codes.filter((c, i) => codes.indexOf(c) !== i)).toEqual([]);
  });

  it("every fix emitted over the corpus, the catalogue and the reach plans is declared, and every declaration is seen", () => {
    const all = allEmitted();
    const wrong = [...new Set(all.flatMap((e) => (undeclared(e) ? [`${e.where}: ${undeclared(e)}`] : [])))];
    expect(wrong, "a producer emitted a fix its FIX_PRODUCERS row does not declare").toEqual([]);

    const seen = new Set(all.map((e) => `${e.code}|${e.applicability}`));
    const unseen = FIX_PRODUCERS.flatMap((p) =>
      Object.keys(p.codes).flatMap((code) => p.applicability.map((a) => `${code}|${a}`)),
    ).filter((k) => !seen.has(k));
    expect(unseen, "a declared code|applicability no plan reaches: add a REACH plan, or drop the declaration").toEqual(
      [],
    );

    // A reach plan that the corpus or the catalogue now reaches is no longer needed.
    const elsewhere = new Set(
      all.filter((e) => !e.where.startsWith("REACH ")).map((e) => `${e.code}|${e.applicability}`),
    );
    expect(
      Object.keys(REACH).filter((k) => elsewhere.has(k)),
      "the corpus reaches these now: delete the REACH plan",
    ).toEqual([]);
    for (const name of Object.keys(REACH))
      expect(
        all.some((e) => e.where === `REACH ${name}` && `${e.code}|${e.applicability}` === name),
        name,
      ).toBe(true);
  }, 120_000);

  it("groups by applicability, most confidently applicable first, a two-tier code in both groups", () => {
    const groups = fixableCodes();
    expect(groups.map((g) => g.applicability)).toEqual(["machine-applicable", "maybe-incorrect", "has-placeholders"]);
    const inGroup = (a: string) => groups.find((g) => g.applicability === a)!.codes.map((c) => c.code);
    expect(inGroup("machine-applicable")).toContain("W_DOOR_OFF_WALL");
    expect(inGroup("maybe-incorrect")).toContain("W_DOOR_OFF_WALL");
    expect(inGroup("has-placeholders")).toEqual(["E_DOOR_WIDTH", "E_OPENING_WIDTH", "E_WINDOW_WIDTH"]);
    for (const g of groups) expect(g.codes.map((c) => c.code)).toEqual(g.codes.map((c) => c.code).sort());
  });
});
