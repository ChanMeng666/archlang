#!/usr/bin/env node
/**
 * ADVISORY report: which `src/` modules the suite reaches ZERO lines of.
 *
 * `vitest.config.ts` runs coverage with `all: true` and **deliberately no thresholds** —
 * nobody games a percentage, and `npm test` stays the single pass/fail signal (see
 * `docs/testing.md` §2 "Coverage — a map, not a gate"). The cost of that choice is that a
 * module can sit at 0% forever and nothing says so: the `text` reporter prints 111 rows and
 * the step summary prints four totals, so a zero is one line in a wall of lines.
 *
 * This makes the silence visible and NOTHING ELSE. It never fails: it always exits 0, even
 * if the coverage file is missing or malformed, because a reporting script must not be able
 * to turn a green CI run red. It adds no thresholds and reads no baseline.
 *
 * Read a name here as "the in-process suite never entered this file", which has two very
 * different causes, and the report says so rather than pretending they are the same:
 *   1. genuinely unexercised code, or
 *   2. code exercised only in a CHILD process — `src/cli.ts` and `src/cli/commands-*.ts` are
 *      driven by ~20 suites that `spawnSync` the real CLI, so v8's in-process counters never
 *      see them however thoroughly they are tested.
 * Neither is filtered out. An allowlist here would be the same "nobody notices the zero"
 * failure one level up.
 *
 * Usage: node scripts/coverage-zero-report.mjs [coverage/coverage-summary.json]
 * Writes GitHub-flavoured Markdown to stdout (CI appends it to $GITHUB_STEP_SUMMARY).
 */

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const HEADING = "## Zero-coverage `src/` modules (advisory — never gates)";

/** Repo-relative, forward-slashed, so Windows and Linux runs read the same. */
function shortPath(absOrRel) {
  const rel = relative(process.cwd(), resolve(absOrRel)).replaceAll("\\", "/");
  return rel.startsWith("..") ? absOrRel.replaceAll("\\", "/") : rel;
}

function main() {
  const file = process.argv[2] ?? "coverage/coverage-summary.json";

  let summary;
  try {
    summary = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.log(HEADING);
    console.log();
    console.log(`_No coverage summary at \`${file}\` (${err.message}) — nothing to report._`);
    return;
  }

  const files = Object.entries(summary)
    .filter(([key]) => key !== "total")
    .map(([key, value]) => ({ path: shortPath(key), ...value }));

  if (files.length === 0) {
    console.log(HEADING);
    console.log();
    console.log("_The coverage summary lists no files — check the `json-summary` reporter._");
    return;
  }

  const zero = files
    .filter((f) => f.lines.total > 0 && f.lines.covered === 0)
    .sort((a, b) => b.lines.total - a.lines.total || a.path.localeCompare(b.path));

  console.log(HEADING);
  console.log();

  if (zero.length === 0) {
    console.log(`Every one of the ${files.length} measured \`src/\` modules is entered by the suite.`);
    return;
  }

  const zeroLines = zero.reduce((n, f) => n + f.lines.total, 0);
  const allLines = files.reduce((n, f) => n + f.lines.total, 0);
  const share = ((zeroLines / allLines) * 100).toFixed(1);

  console.log(
    `**${zero.length} of ${files.length}** measured modules are never entered by the in-process ` +
      `suite — **${zeroLines}** of ${allLines} lines (${share}%).`,
  );
  console.log();
  // Lines only. v8 reports a never-loaded file's function count as a placeholder `1`
  // however many it declares, so printing it would put a visibly wrong number in the
  // report — and a report with one wrong column is a report nobody reads.
  console.log("| Module | Uncovered lines |");
  console.log("| --- | ---: |");
  for (const f of zero) console.log(`| \`${f.path}\` | ${f.lines.total} |`);
  console.log();
  console.log(
    "A module lands here for one of two reasons, and coverage cannot tell them apart: it is " +
      "genuinely unexercised, or it runs only in a CHILD process. The CLI modules are the second " +
      "case — `test/cli*.test.ts` `spawnSync`s the real `arch`, so v8's in-process counters never " +
      "see `src/cli.ts` or `src/cli/` however well they are tested. **This is a map, not a gate:** " +
      "there are no coverage thresholds and this step cannot fail the build.",
  );
}

try {
  main();
} catch (err) {
  // A reporting script must never be able to redden a run.
  console.log(HEADING);
  console.log();
  console.log(`_Report failed (${err?.message ?? err}) — this step is advisory and does not gate._`);
}
process.exitCode = 0;
