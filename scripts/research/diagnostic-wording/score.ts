/**
 * The scorer of the diagnostic-wording study (card PS1.4; shared code in `lib.ts`).
 *
 * Run: `npx tsx scripts/research/diagnostic-wording/score.ts --out <dir> [--models sonnet,haiku] [--lenient]`
 * after `build.ts` and the dispatch. Reads `<dir>/cases.json` and `<dir>/run-<model>/replies/`,
 * writes `<dir>/scores.json` (one row per reply) and prints the tables as Markdown.
 *
 * Each reply is re-linted with the same compiler and scored against its case's baseline
 * (`lint()` codes plus the compile channel's warnings, counted per code):
 *  - `broke`: the reply has a compile error, or raises a code the baseline did not;
 *  - `fixed`: otherwise, when the expected code is gone (the card's definition);
 *  - `unchanged`: otherwise (the expected code still fires).
 * `outcomeLenient` also counts as fixed a reply that raises the expected code fewer times than
 * before but still raises it (`partial`; only the three cases that raise it more than once can).
 * `outcomeTwin` is the strict reading with one change: a new code that the case's own clean twin
 * also raises does not count as broken, because the corpus's fix unmasks it too (a defect the case
 * plan already held, hidden behind the one it is about). Every table reads `outcome`, or
 * `outcomeLenient` under `--lenient`; the first table shows all three fixed counts.
 *
 * Recorded beside it: changed lines (LCS line diff), whether the reply came fenced, whether any
 * statement kind (`room`, `door`, `furniture`, …) lost a statement (`deleted`), whether the reply
 * changed any `label "…"` text, `uses` word or title-block value (`renamed`: the cheapest way to
 * silence a rule that reads a name, a use or a value's length), and whether a code the baseline
 * already raised is raised more often (`rose`). A missing reply is `missing`.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { changedLines, codesOf, REPO, type StudyCase, splitHeader, VARIANTS, type Variant } from "./lib.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const outArg = arg("--out");
if (!outArg) {
  console.error("usage: score.ts --out <dir> [--models sonnet,haiku] [--lenient]");
  process.exit(3);
}
const OUT = resolve(outArg);
const MODELS = (arg("--models") ?? "sonnet,haiku").split(",").filter(Boolean);
const LENIENT = process.argv.includes("--lenient");
const { cases } = JSON.parse(readFileSync(join(OUT, "cases.json"), "utf8")) as { cases: StudyCase[] };

type Outcome = "fixed" | "unchanged" | "broke" | "missing";
interface Row {
  model: string;
  case: string;
  code: string;
  cls: string;
  variant: Variant;
  outcome: Outcome;
  outcomeLenient: Outcome;
  outcomeTwin: Outcome;
  partial: boolean;
  compileErrors: string[];
  newCodes: string[];
  rose: string[];
  deleted: string[];
  renamed: boolean;
  fenced: boolean;
  identical: boolean;
  changedLines: number;
}

/** The reply's source: the first fenced block if it has one, else the whole reply. */
function extract(reply: string): { source: string; fenced: boolean } {
  const m = /```[a-z]*\n([\s\S]*?)```/.exec(reply);
  return m ? { source: m[1]!, fenced: true } : { source: reply, fenced: false };
}

/** Statement counts by leading keyword, to see a fix that deletes what it was asked about. */
function statementKinds(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of src.split("\n")) {
    const m = /^\s*([a-z_]+)\b/.exec(line);
    if (m) out.set(m[1]!, (out.get(m[1]!) ?? 0) + 1);
  }
  return out;
}

/** Every `label "…"` text, `uses` word and title-block value, sorted: equal lists mean nothing was renamed. */
const namesOf = (src: string): string =>
  [...src.matchAll(/\b(label\s+"[^"]*"|uses\s+[a-z_]+|(?:project|drawn_by|date|number|revision)\s+"[^"]*")/g)]
    .map((m) => m[1]!)
    .sort()
    .join("|");

/** The codes the case's clean twin raises. */
const twinCodes = new Map(
  cases.map((c) => {
    const twin = readFileSync(join(REPO, c.path.replace(/\.arch$/, ".clean.arch")), "utf8").replace(/\r\n/g, "\n");
    return [c.id, new Set(codesOf(splitHeader(twin).body).counts.keys())] as const;
  }),
);

const rows: Row[] = [];
for (const model of MODELS)
  for (const c of cases)
    for (const variant of VARIANTS) {
      const file = join(OUT, `run-${model}`, "replies", `${c.id}__${variant}.arch`);
      const base = { model, case: c.id, code: c.code, cls: c.cls, variant };
      if (!existsSync(file)) {
        rows.push({
          ...base,
          outcome: "missing",
          outcomeLenient: "missing",
          outcomeTwin: "missing",
          partial: false,
          compileErrors: [],
          newCodes: [],
          rose: [],
          deleted: [],
          renamed: false,
          fenced: false,
          identical: false,
          changedLines: 0,
        });
        continue;
      }
      const { source, fenced } = extract(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
      const got = codesOf(source);
      const before = new Map(Object.entries(c.baselineCodes));
      const newCodes = [...got.counts.keys()].filter((k) => !before.has(k)).sort();
      const rose = [...got.counts].filter(([k, n]) => before.has(k) && n > before.get(k)!).map(([k]) => k);
      const after = got.counts.get(c.code) ?? 0;
      const was = before.get(c.code) ?? 0;
      /** Strict: fixed only when the expected code is gone. Lenient: when it fires less often. */
      const read = (fresh: string[], lenient = false): Outcome => {
        if (got.errors.length || fresh.length) return "broke";
        return (lenient ? after < was : after === 0) ? "fixed" : "unchanged";
      };
      const kindsBefore = statementKinds(c.source);
      const kindsAfter = statementKinds(source);
      const deleted = [...kindsBefore].filter(([k, n]) => (kindsAfter.get(k) ?? 0) < n).map(([k]) => k);
      const outcome = read(newCodes);
      const outcomeLenient = read(newCodes, true);
      rows.push({
        ...base,
        outcome,
        outcomeLenient,
        outcomeTwin: read(newCodes.filter((k) => !twinCodes.get(c.id)!.has(k))),
        partial: outcomeLenient === "fixed" && after > 0,
        compileErrors: got.errors,
        newCodes,
        rose,
        deleted,
        renamed: namesOf(source) !== namesOf(c.source),
        fenced,
        identical: source.replace(/\n+$/, "") === c.source.replace(/\n+$/, ""),
        changedLines: changedLines(c.source, source),
      });
    }

writeFileSync(join(OUT, "scores.json"), `${JSON.stringify(rows, null, 2)}\n`);

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)} %` : "–");
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pick = (m: string, v: Variant) => rows.filter((r) => r.model === m && r.variant === v);
/** The outcome every table reads: strict by default, lenient under `--lenient`. */
const primary = (r: Row): Outcome => (LENIENT ? r.outcomeLenient : r.outcome);
const cell = (m: string, id: string, v: Variant) =>
  primary(rows.find((r) => r.model === m && r.case === id && r.variant === v)!);

console.log(
  `## By variant and model (${LENIENT ? "lenient: fewer instances counts as fixed" : "strict: the expected code is gone"})\n`,
);
console.log(
  "| Model | Variant | Fixed | Unchanged | Broke | Missing | Fixed % | Fixed, strict | Fixed, lenient | Fixed, twin-adjusted (strict) | Median changed lines (fixed) | Fixed by deleting a statement | Fixed by renaming |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const model of MODELS)
  for (const v of VARIANTS) {
    const rs = pick(model, v);
    const n = (o: Outcome) => rs.filter((r) => primary(r) === o).length;
    const fixed = rs.filter((r) => primary(r) === "fixed");
    const strict = rs.filter((r) => r.outcome === "fixed").length;
    const lenient = rs.filter((r) => r.outcomeLenient === "fixed").length;
    const twin = rs.filter((r) => r.outcomeTwin === "fixed").length;
    console.log(
      `| ${model} | ${v} | ${n("fixed")} | ${n("unchanged")} | ${n("broke")} | ${n("missing")} | ${pct(n("fixed"), rs.length)} | ${strict} | ${lenient} | ${twin} | ${median(fixed.map((r) => r.changedLines))} | ${fixed.filter((r) => r.deleted.length).length} | ${fixed.filter((r) => r.renamed).length} |`,
    );
  }

/** Exact two-sided sign test on the discordant pairs (the exact McNemar test): `b` against `c`. */
function signTest(b: number, c: number): number {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let p = 0;
  let term = 0.5 ** n;
  for (let i = 0; i <= k; i++) {
    p += term;
    term = (term * (n - i)) / (i + 1);
  }
  return Math.min(1, 2 * p);
}

console.log(
  "\n## Paired: each pair of variants on the same cases (fixed in A only / fixed in B only, exact McNemar p, uncorrected)\n",
);
console.log(`| A vs B | ${MODELS.join(" | ")} | both models pooled |`);
console.log(`|---|${MODELS.map(() => "---").join("|")}|---|`);
for (let i = 0; i < VARIANTS.length; i++)
  for (let j = i + 1; j < VARIANTS.length; j++) {
    const [a, b] = [VARIANTS[i]!, VARIANTS[j]!];
    const pair = (ms: string[]) => {
      let onlyA = 0;
      let onlyB = 0;
      for (const m of ms)
        for (const c of cases) {
          const fa = cell(m, c.id, a) === "fixed";
          const fb = cell(m, c.id, b) === "fixed";
          if (fa && !fb) onlyA++;
          if (fb && !fa) onlyB++;
        }
      return `${onlyA} / ${onlyB}, p ${signTest(onlyA, onlyB).toFixed(2)}`;
    };
    console.log(`| ${a} vs ${b} | ${MODELS.map((m) => pair([m])).join(" | ")} | ${pair(MODELS)} |`);
  }

console.log("\n## Fixed per code family (fixed / cases)\n");
const families = [...new Set(cases.map((c) => c.cls))].sort();
console.log(`| Class | Cases | ${MODELS.flatMap((m) => VARIANTS.map((v) => `${m} ${v}`)).join(" | ")} |`);
console.log(`|---|---|${MODELS.flatMap(() => VARIANTS.map(() => "---")).join("|")}|`);
for (const cls of families) {
  const n = cases.filter((c) => c.cls === cls).length;
  const cells = MODELS.flatMap((m) =>
    VARIANTS.map((v) => pick(m, v).filter((r) => r.cls === cls && primary(r) === "fixed").length),
  );
  console.log(`| ${cls} | ${n} | ${cells.join(" | ")} |`);
}

console.log("\n## Per case (F fixed, U unchanged, B broke, - missing; variants in order facts rule fix current)\n");
console.log(`| Case | Code | ${MODELS.join(" | ")} |`);
console.log(`|---|---|${MODELS.map(() => "---").join("|")}|`);
const letter: Record<Outcome, string> = { fixed: "F", unchanged: "U", broke: "B", missing: "-" };
for (const c of cases) {
  const cells = MODELS.map((m) => VARIANTS.map((v) => letter[cell(m, c.id, v)]).join(""));
  console.log(`| ${c.id} | ${c.code} | ${cells.join(" | ")} |`);
}
