#!/usr/bin/env node
// Rewrite test/.durations.json (seconds per test file, the table test/sequencer.ts balances
// `vitest --shard` by) from a vitest JSON report:
//   npx vitest run --reporter=json --outputFile=<report.json>
//   node scripts/gen-test-durations.mjs <report.json> [out.json]
// or MERGE an already-generated {file: seconds} map (nightly's `test-durations` artifact) into the table:
//   node scripts/gen-test-durations.mjs <test-durations.json> [out.json]
// A map input replaces the rows the map has, keeps the other existing rows whose file is still in
// the tree, and drops rows for deleted files. A file in the tree with no row gets none (the
// sequencer counts it as the table's median).
// Not a drift artifact: a stale table costs balance, never correctness.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const [report, out = "test/.durations.json"] = process.argv.slice(2);
if (!report) {
  console.error("usage: gen-test-durations.mjs <vitest-json-report | {file: seconds} map> [out.json]");
  process.exit(2);
}
const root = process.cwd();
const input = JSON.parse(readFileSync(report, "utf8"));
const table = {};
if (Array.isArray(input.testResults)) {
  for (const f of input.testResults) {
    const rel = relative(root, resolve(f.name)).replace(/\\/g, "/");
    const seconds = (f.endTime - f.startTime) / 1000;
    if (Number.isFinite(seconds)) table[rel] = Math.round(seconds * 10) / 10;
  }
} else {
  let old = {};
  try {
    old = JSON.parse(readFileSync(out, "utf8"));
  } catch {}
  let kept = 0;
  let dropped = 0;
  for (const [file, seconds] of Object.entries(old)) {
    if (file in input) continue;
    if (existsSync(resolve(root, file))) {
      table[file] = seconds;
      kept++;
    } else dropped++;
  }
  for (const [file, seconds] of Object.entries(input)) if (Number.isFinite(seconds)) table[file] = seconds;
  console.log(`map: ${Object.keys(input).length} rows, ${kept} kept, ${dropped} dropped`);
}
const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} files -> ${out}`);
