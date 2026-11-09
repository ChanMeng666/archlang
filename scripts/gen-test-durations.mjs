#!/usr/bin/env node
// Rewrite test/.durations.json (seconds per test file, the table test/sequencer.ts balances
// `vitest --shard` by) from a vitest JSON report:
//   npx vitest run --reporter=json --outputFile=<report.json>
//   node scripts/gen-test-durations.mjs <report.json> [out.json]
// Not a drift artifact: a stale table costs balance, never correctness.
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const [report, out = "test/.durations.json"] = process.argv.slice(2);
if (!report) {
  console.error("usage: gen-test-durations.mjs <vitest-json-report> [out.json]");
  process.exit(2);
}
const root = process.cwd();
const table = {};
for (const f of JSON.parse(readFileSync(report, "utf8")).testResults ?? []) {
  const rel = relative(root, resolve(f.name)).replace(/\\/g, "/");
  const seconds = (f.endTime - f.startTime) / 1000;
  if (Number.isFinite(seconds)) table[rel] = Math.round(seconds * 10) / 10;
}
const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} files -> ${out}`);
