#!/usr/bin/env node
// MERGE one or more {file: seconds} maps into test/.durations.json, the table test/sequencer.ts
// balances `vitest --shard` by:
//   node scripts/gen-test-durations.mjs [-o out.json] <test-durations.json>...
// A map comes from test/durations-reporter.ts: nightly's `test-durations` artifact (the whole suite),
// or a PR run's `test-durations-<n>` artifacts (one per Node 22 shard; pass them all at once).
// The maps' rows replace the table's; the other existing rows are kept while their file is still in
// the tree, and rows for deleted files are dropped. A file in the tree with no row gets none (the
// sequencer counts it as the table's median, after every recorded file).
// A vitest JSON report (`--reporter=json`) is refused: its per-file span is first test start to last
// test end, without the file's import and collect time, so its rows would not be comparable.
// Not a drift artifact: a stale table costs balance, never correctness.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
let out = "test/.durations.json";
const maps = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" || args[i] === "--out") out = args[++i];
  else maps.push(args[i]);
}
if (maps.length === 0 || !out) {
  console.error("usage: gen-test-durations.mjs [-o out.json] <{file: seconds} map>...");
  process.exit(2);
}
const root = process.cwd();
const input = {};
for (const file of maps) {
  const map = JSON.parse(readFileSync(file, "utf8"));
  if (Array.isArray(map.testResults)) {
    console.error(
      `${file} is a vitest JSON report, whose per-file span leaves out import and collect time; ` +
        "write a map with test/durations-reporter.ts instead (test/.durations.README.md)",
    );
    process.exit(2);
  }
  for (const [f, seconds] of Object.entries(map))
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) input[f] = seconds;
}
let old = {};
try {
  old = JSON.parse(readFileSync(out, "utf8"));
} catch {}
const table = {};
let kept = 0;
let dropped = 0;
for (const [file, seconds] of Object.entries(old)) {
  if (file in input) continue;
  if (existsSync(resolve(root, file))) {
    table[file] = seconds;
    kept++;
  } else dropped++;
}
Object.assign(table, input);
console.log(`${maps.length} map(s): ${Object.keys(input).length} rows, ${kept} kept, ${dropped} dropped`);
const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} files -> ${out}`);
