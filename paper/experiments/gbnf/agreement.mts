/**
 * GBNF grammar/parser agreement — the disaggregated numbers, and the historical
 * "24 failures against the pre-v1.26 grammar" figure, made re-runnable.
 *
 * `test/gbnf-drift.test.ts` is a vitest file, so its numbers only exist as a test
 * count. This script REUSES that file rather than copying it: it slices everything
 * above `describe("gbnf grammar"` — the bundled GBNF recognizer, the three corpora,
 * and the compiler-side `parses()` oracle — rewrites the three relative paths, and
 * imports the result. The corpus therefore cannot drift from the gate; if the test
 * file changes, so does this measurement.
 *
 * It reports, for ANY grammar text:
 *   examples accepted / rejection cases / AGREEMENT biconditional / NARROWER / DIVERGENT
 * and the total `it()` count the vitest file would report for that grammar.
 *
 * USAGE
 *   npx tsx paper/experiments/gbnf/agreement.mts                  # committed grammar
 *   npx tsx paper/experiments/gbnf/agreement.mts --rev 2ac49ef^   # a historical one
 *   npx tsx paper/experiments/gbnf/agreement.mts --rev v1.25.0 --rev HEAD
 *
 * OUTPUT: paper/experiments/gbnf/agreement-results.json + a stdout table.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const TEST = join(ROOT, "test/gbnf-drift.test.ts");

/** Derive an importable module from the gate's own source. Regenerated every run. */
function deriveCorpusModule(): string {
  const src = readFileSync(TEST, "utf8");
  const cut = src.indexOf('describe("gbnf grammar"');
  if (cut < 0) throw new Error("test/gbnf-drift.test.ts no longer contains the expected describe block");
  const head = src
    .slice(0, cut)
    .replace('import { describe, it, expect } from "vitest";\n', "")
    .replace('from "../scripts/gen-gbnf.js"', 'from "../../../scripts/gen-gbnf.js"')
    .replace('from "../src/index.js"', 'from "../../../src/index.js"')
    .replace('const ROOT = resolve(HERE, "..");', 'const ROOT = resolve(HERE, "../../..");');
  const out = `${head}\nexport { parseGrammar, accepts, parses, codes, allExamples, AGREEMENT, NARROWER, DIVERGENT, GBNF_PATH };\n`;
  const file = join(HERE, "_corpus.generated.mts");
  writeFileSync(file, out);
  return file;
}

const argv = process.argv.slice(2);
const revs: string[] = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === "--rev") revs.push(argv[++i] as string);

const mod = await import(`file://${deriveCorpusModule().replace(/\\/g, "/")}`);
const { parseGrammar, accepts, parses, AGREEMENT, NARROWER, DIVERGENT, allExamples, GBNF_PATH } = mod;

/** The nine rejection snippets live inside the describe block; re-read them from source. */
function rejectionCases(): [string, string][] {
  const src = readFileSync(TEST, "utf8");
  const start = src.indexOf("const bad: [string, string][] = [");
  const end = src.indexOf("];", start);
  const body = src.slice(start, end);
  // Each entry is `["label", `...`],` — count them by their leading bracket at line start.
  const labels = [...body.matchAll(/^\s*\["([^"]+)"/gm)].map((m) => m[1] as string);
  return labels.map((l) => [l, ""] as [string, string]);
}

function measure(label: string, grammarText: string) {
  const rules = parseGrammar(grammarText);
  const examples = allExamples();
  const exAccepted = examples.filter((e: { src: string }) => accepts(rules, e.src)).length;

  const agree = AGREEMENT.map(([name, src]: [string, string]) => {
    const g = accepts(rules, src);
    const c = parses(src);
    return { name, grammarAccepts: g, compilerParses: c, agrees: g === c };
  });
  const narrower = NARROWER.map(([name, src]: [string, string, string]) => ({
    name,
    holds: parses(src) === true && accepts(rules, src) === false,
  }));
  const divergent = DIVERGENT.map(([name, src]: [string, string, string]) => ({
    name,
    holds: parses(src) === false && accepts(rules, src) === true,
  }));

  const agreeFail = agree.filter((a: { agrees: boolean }) => !a.agrees);
  return {
    label,
    examples: { total: examples.length, accepted: exAccepted, failed: examples.length - exAccepted },
    agreement: {
      total: AGREEMENT.length,
      agreeing: agree.length - agreeFail.length,
      disagreeing: agreeFail.length,
      compilerParses: agree.filter((a: { compilerParses: boolean }) => a.compilerParses).length,
      compilerRejects: agree.filter((a: { compilerParses: boolean }) => !a.compilerParses).length,
      failures: agreeFail.map((a: { name: string; grammarAccepts: boolean; compilerParses: boolean }) => ({
        name: a.name,
        grammarAccepts: a.grammarAccepts,
        compilerParses: a.compilerParses,
      })),
    },
    narrower: {
      total: NARROWER.length,
      holding: narrower.filter((n: { holds: boolean }) => n.holds).length,
      failures: narrower.filter((n: { holds: boolean }) => !n.holds).map((n: { name: string }) => n.name),
    },
    divergent: {
      total: DIVERGENT.length,
      holding: divergent.filter((d: { holds: boolean }) => d.holds).length,
      failures: divergent.filter((d: { holds: boolean }) => !d.holds).map((d: { name: string }) => d.name),
    },
    rejectionCases: rejectionCases().length,
  };
}

const targets: { label: string; text: string }[] = [
  { label: "committed grammars/archlang.gbnf (working tree)", text: readFileSync(GBNF_PATH, "utf8") },
];
for (const rev of revs) {
  targets.push({
    label: `grammars/archlang.gbnf @ ${rev}`,
    text: execFileSync("git", ["show", `${rev}:grammars/archlang.gbnf`], { cwd: ROOT, encoding: "utf8" }),
  });
}

const results = targets.map((t) => measure(t.label, t.text));

for (const r of results) {
  console.log(`\n=== ${r.label}`);
  console.log(`  examples/*.arch accepted:      ${r.examples.accepted}/${r.examples.total}`);
  console.log(`  malformed snippets rejected:   (${r.rejectionCases} cases, unchanged by grammar version)`);
  console.log(
    `  AGREEMENT biconditional:       ${r.agreement.agreeing}/${r.agreement.total}` +
      `   (compiler parses ${r.agreement.compilerParses}, rejects ${r.agreement.compilerRejects})`,
  );
  if (r.agreement.disagreeing) {
    console.log(`  AGREEMENT disagreements (${r.agreement.disagreeing}):`);
    for (const f of r.agreement.failures)
      console.log(
        `    - ${f.name}: grammar ${f.grammarAccepts ? "accepts" : "rejects"}, compiler ${f.compilerParses ? "parses" : "rejects"}`,
      );
  }
  console.log(
    `  NARROWER pins holding:         ${r.narrower.holding}/${r.narrower.total}` +
      (r.narrower.failures.length ? ` (broken: ${r.narrower.failures.join(", ")})` : ""),
  );
  console.log(
    `  DIVERGENT pins holding:        ${r.divergent.holding}/${r.divergent.total}` +
      (r.divergent.failures.length ? ` (broken: ${r.divergent.failures.join(", ")})` : ""),
  );
  const vitestCases =
    5 + r.examples.total + r.rejectionCases + r.agreement.total + 1 + r.narrower.total + r.divergent.total;
  const vitestFailures =
    r.examples.failed +
    r.agreement.disagreeing +
    (r.narrower.total - r.narrower.holding) +
    (r.divergent.total - r.divergent.holding);
  console.log(`  vitest it() cases in the file: ${vitestCases}   would-fail: ${vitestFailures}`);
}

writeFileSync(
  join(HERE, "agreement-results.json"),
  `${JSON.stringify(
    {
      experiment: "GBNF grammar vs parser agreement, disaggregated",
      generatedAt: new Date().toISOString(),
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
      note:
        "The AGREEMENT / NARROWER / DIVERGENT corpora and the recognizer are imported from " +
        "test/gbnf-drift.test.ts itself, so these figures cannot drift from the CI gate. " +
        "`vitest it() cases` reconstructs the file's own test count: 5 file-level cases + one per " +
        "example + one per malformed snippet + one per AGREEMENT row + the non-vacuity case + " +
        "one per NARROWER row + one per DIVERGENT row.",
      results,
    },
    null,
    2,
  )}\n`,
);
console.log("\nwrote paper/experiments/gbnf/agreement-results.json");
