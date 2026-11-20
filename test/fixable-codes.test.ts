/**
 * `FIX_PRODUCERS` (`src/fixable-codes.ts`, card AF8), a table of the fix producers, held to their
 * source and to what they emit. The capabilities resource lists the codes `fix` can resolve from that
 * table, so a row that lies there lies to every agent that reads it.
 *
 * From the source (`sourceProblems`, `test/helpers/fixable-codes-check.ts`), over the fix sites
 * `scripts/fix-coverage.ts` sees:
 * - codes: exactly the catalogued codes those sites attach a fix to, so a new site with a code the
 *   table does not declare fails even when no plan reaches it; a site no code is read for fails, and
 *   so does a site whose code the catalogue lacks;
 * - producer: each code's sites call its row's producer (directly, or through a local constant or a
 *   same-file function) or lie in it, and a site calls no producer declared for another code;
 * - stage: read from the site's file (`src/lint/rules/` is lint, `src/cli/commands-author.ts` is
 *   `arch fix`'s own proof, anything else compile);
 * - applicability: every `applicability` property in the producer (its function, or its file when
 *   the row names no function), whatever its key's form, is written out as a string literal or a
 *   conditional of them, and their set is exactly the row's; no such literal in `src/` lies outside
 *   every producer but `cmdReroll`'s (`NOT_A_FIX_LITERAL`);
 * - `when`: given for each applicability of a two-tier row, and only there (its text is not read).
 * Not seen there, so left to the output check below: a fix attached through a helper's spread, a
 * helper in another file, `Object.assign`, a spread parameter, a producer that hands part of its work
 * to another function, a renamed `fixId`, and which branch of a conditional gives which tier.
 * Four plants show the source checks can fail: a producer that gains a second tier; a tier set
 * through a variable and through a spread object; a code that gains a fix through a local constant;
 * and a row with a wrong stage or producer.
 *
 * From the output: every fix that `compile()`, `lint()` and `arch fix`'s `while` proof emit over the
 * corpus, the catalogue's examples and fixed snippets, and the reach plans below matches a row in code,
 * `fixId`, applicability and stage, and every declared code and applicability is seen at least once.
 * A fix no plan reaches is checked by neither half.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO } from "../scripts/fix-coverage.js";
import { FIX_PRODUCERS, type FixStage, fixableCodes } from "../src/fixable-codes.js";
import { type Diagnostic, ERROR_CATALOG, compile, lint } from "../src/index.js";
import { proveWhileFixes } from "../src/while-fix.js";
import { corpusFiles } from "./helpers/corpus.js";
import { sourceProblems } from "./helpers/fixable-codes-check.js";
import { worldFor } from "./helpers/world.js";
import { AF9_PLANS } from "./helpers/opening-moves.js";

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
  // AF2's did-you-mean: a misspelt room use, the one word a position expected, a room id.
  "E_PARSE|machine-applicable": plan("  room id=a at (0,0) size 3000x3000 uses bedrom"),
  "E_PARSE|maybe-incorrect": plan(
    "  room id=a at (0,0) size 3000x3000",
    "  room id=b right-of a size 3000x3000",
    "  walls from rooms exterior 200 partition 100 { open betwen a and b }",
  ),
  "E_LAYOUT_REF|maybe-incorrect": plan(
    "  room id=hall at (0,0) size 3000x3000",
    "  room id=b right-of hal size 2000x3000",
  ),
  // AF9's moves and skeletons for refused openings (`test/opening-moves.test.ts` holds each one).
  "E_OPENING_HOST_AMBIGUOUS|maybe-incorrect": AF9_PLANS.extPart,
  "E_OPENING_NO_SHARED_WALL|maybe-incorrect": AF9_PLANS.extDoor,
  "E_OPENING_NO_SHARED_WALL|has-placeholders": AF9_PLANS.ext,
  "E_OPENING_DATUM|maybe-incorrect": AF9_PLANS.par,
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

/** A copy of `src/` with `edit` applied to one file, for a plant; removed by the caller. */
function plantedTree(file: string, edit: (text: string) => string): string {
  const root = mkdtempSync(join(tmpdir(), "fixable-codes-"));
  cpSync(join(REPO, "src"), join(root, "src"), { recursive: true });
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  const after = edit(before);
  expect(after, `the plant changed nothing in ${file}`).not.toBe(before);
  writeFileSync(path, after);
  return root;
}

describe("FIX_PRODUCERS agrees with the source in every field (AF8)", () => {
  it("codes, producer, stage and applicability: no disagreement", () => {
    expect(sourceProblems(REPO)).toEqual([]);
  });

  it("plant: a producer that gains a second tier fails (doorOpenRangeFix gains maybe-incorrect)", () => {
    const root = plantedTree("src/fix-producers.ts", (t) => {
      const at = t.indexOf("export function doorOpenRangeFix(");
      const lit = 'applicability: "machine-applicable",';
      const i = t.indexOf(lit, at);
      return `${t.slice(0, i)}applicability: clamped === 0 ? "maybe-incorrect" : "machine-applicable",${t.slice(i + lit.length)}`;
    });
    try {
      expect(sourceProblems(root)).toEqual([
        "src/fix-producers.ts#doorOpenRangeFix: its source writes applicability machine-applicable/maybe-incorrect, its row says machine-applicable",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("plant: a producer that sets a tier the source does not write out fails (a variable, a spread object)", () => {
    const root = plantedTree("src/fix-producers.ts", (t) => {
      // V2: doorOpenRangeFix returns a maybe-incorrect fix through a variable.
      const at = t.indexOf("export function doorOpenRangeFix(");
      const ret = t.indexOf("  return [", at);
      const v2 = `${t.slice(0, ret)}  const a = clamped === 0 ? "maybe-incorrect" : "machine-applicable";
  if (clamped === 0) return [{ title: "x", applicability: a, fixId: "door-open-range", edits: [] }];
${t.slice(ret)}`;
      // V4: offWallFix turns has-placeholders at 0% through a spread object and a constant.
      const tier = 'applicability: near.unique ? "machine-applicable" : "maybe-incorrect",';
      const i = v2.indexOf(tier) + tier.length;
      return `const PLACEHOLDER = "has-placeholders" as const;
${v2.slice(0, i)}
      ...(pct === 0 ? { applicability: PLACEHOLDER } : {}),${v2.slice(i)}`;
    });
    try {
      const problems = sourceProblems(root);
      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(
        /^src\/fix-producers\.ts:\d+: src\/fix-producers\.ts#offWallFix sets an applicability the source does not write out$/,
      );
      expect(problems[1]).toMatch(
        /^src\/fix-producers\.ts:\d+: src\/fix-producers\.ts#doorOpenRangeFix sets an applicability the source does not write out$/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("plant: a code that gains a fix through a local constant fails (E_DOOR_KIND_CURVED)", () => {
    const root = plantedTree("src/elements/door.ts", (t) => {
      const code = 'code: "E_DOOR_KIND_CURVED",';
      const i = t.lastIndexOf("ctx.diag({", t.indexOf(code));
      return `${t.slice(0, i)}const extra = fixesFrom(doorOpenRangeFix(n, 0));\n      ctx.diag({\n        ...extra,${t.slice(i + "ctx.diag({".length)}`;
    });
    try {
      const problems = sourceProblems(root);
      expect(problems).toContain("E_DOOR_KIND_CURVED: a fix site attaches a fix to it, and no row declares it");
      expect(
        problems.some((p) => /E_DOOR_KIND_CURVED calls doorOpenRangeFix, the producer of other codes/.test(p)),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("plant: an AF9 producer whose tier is set outside its function fails (openingMoveFix)", () => {
    const root = plantedTree("src/fix-producers.ts", (t) => {
      const lit = 'applicability: "maybe-incorrect",';
      const i = t.indexOf(lit, t.indexOf("export function openingMoveFix("));
      return `const MOVE_TIER = "maybe-incorrect" as const;\n${t.slice(0, i)}applicability: MOVE_TIER,${t.slice(i + lit.length)}`;
    });
    try {
      const problems = sourceProblems(root);
      expect(problems.some((p) => /#openingMoveFix sets an applicability the source does not write out$/.test(p))).toBe(
        true,
      );
      expect(problems).toContain(
        "src/fix-producers.ts#openingMoveFix: its source writes applicability (none), its row says maybe-incorrect",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("plant: an AF9 row that declares machine-applicable fails, for each of the four (RM-D70)", () => {
    const AF9 = ["#openingMoveFix", "#exteriorEdgeFix", "#openingDatumFix", "#doorwayMoveFix"];
    const rows = FIX_PRODUCERS.map((p) =>
      AF9.some((n) => p.producer.endsWith(n))
        ? { ...p, applicability: ["machine-applicable" as const, ...p.applicability] }
        : p,
    );
    const problems = sourceProblems(REPO, rows);
    for (const n of AF9)
      expect(
        problems.some((p) => p.includes(`${n}: its source writes applicability`)),
        n,
      ).toBe(true);
    // And as the table stands, no AF9 row declares it.
    for (const p of FIX_PRODUCERS.filter((r) => AF9.some((n) => r.producer.endsWith(n))))
      expect(p.applicability, p.producer).not.toContain("machine-applicable");
  });

  it("plant: a row whose stage or producer is wrong fails", () => {
    const rows = FIX_PRODUCERS.map((p) =>
      p.producer.endsWith("#pocketRunFix")
        ? { ...p, stage: "compile" as const }
        : p.producer.endsWith("#dimSwapFix")
          ? { ...p, producer: "src/fix-producers.ts#dimBumpFix" }
          : p,
    );
    const problems = sourceProblems(REPO, rows);
    expect(problems.some((p) => /W_POCKET_RUN's site gives stage lint, its row says compile/.test(p))).toBe(true);
    expect(problems.some((p) => /W_DIM_INSIDE's site neither calls nor lies in its producer/.test(p))).toBe(true);
  });

  it("a two-tier row says when each tier applies, and a one-tier row says nothing", () => {
    for (const p of FIX_PRODUCERS) {
      const when = Object.keys(p.when ?? {}).sort();
      expect(when, p.producer).toEqual(p.applicability.length > 1 ? [...p.applicability].sort() : []);
    }
  });
});

describe("FIX_PRODUCERS declares what the fix producers emit (AF8)", () => {
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
