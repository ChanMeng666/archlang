#!/usr/bin/env node
// Write test/.durations.json, the table test/sequencer.ts balances `vitest --shard` by and check:quick's
// test budgets read (scripts/gate-select.mjs), from {file: seconds} maps written by test/durations-reporter.ts:
//   node scripts/gen-test-durations.mjs -o test/.durations.json [--median] [--drop <file>]... <run>...
// A <run> is a map file, or a directory holding one run's maps (a `gh run download -D <dir>` of a PR run's
// `test-durations-<n>` shard artifacts, or of nightly's `test-durations`), read recursively and joined.
// Without --median the runs' rows replace the table's, a later run winning. With --median each file gets the
// median of the runs that have it, so one slow or fast runner does not set a row. Either way the table's
// other rows are kept while their file is still in the tree, and rows for deleted files are dropped; a file
// with no row gets none (the sequencer counts it as the table's median, after every recorded file).
// `--drop <file>` forgets a file's row: for a change that moved its cost before any run measured it.
// `-o` is required, and naming it as an input is refused: the old `<report> <out>` form would otherwise let
// the old table override the new rows. A vitest JSON report (`--reporter=json`) is refused: its per-file span
// is first test start to last test end, without import and collect time, so its rows would not compare.
// Not a drift artifact: a stale table costs balance, never correctness.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usable = (s) => typeof s === "number" && Number.isFinite(s) && s >= 0;

/** The median of `values` (the mean of the two middles for an even count), to 0.1. */
export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  const mid = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return Math.round(mid * 10) / 10;
}

/** Why `json` is not a {file: seconds} map, or undefined when it is one. */
export function refusal(json) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return "is not a {file: seconds} map";
  if (Array.isArray(json.testResults))
    return "is a vitest JSON report, whose per-file span leaves out import and collect time; write a map with test/durations-reporter.ts";
  return undefined;
}

/**
 * The new table from the old one and the runs (each a {file: seconds} map). `exists(file)` says whether a
 * file the runs do not cover is still in the tree. Returns `{ table, rows, kept, dropped }`, the table sorted by path.
 */
export function mergeTables({ old = {}, runs, useMedian = false, exists, drop = [] }) {
  const seen = new Map();
  for (const run of runs)
    for (const [file, s] of Object.entries(run))
      if (usable(s) && !drop.includes(file)) seen.set(file, [...(seen.get(file) ?? []), s]);
  const table = {};
  let kept = 0;
  let dropped = 0;
  for (const [file, s] of Object.entries(old)) {
    if (seen.has(file)) continue;
    if (exists(file) && !drop.includes(file)) {
      table[file] = s;
      kept++;
    } else dropped++;
  }
  for (const [file, values] of seen) table[file] = useMedian ? median(values) : values[values.length - 1];
  const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { table: sorted, rows: seen.size, kept, dropped };
}

/** One run's map: a map file, or every `.json` map under a directory, joined. Throws on a refused input. */
export function readRun(path) {
  const files = statSync(path).isDirectory()
    ? (function walk(d) {
        return readdirSync(d)
          .sort()
          .flatMap((f) =>
            statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".json") ? [join(d, f)] : [],
          );
      })(path)
    : [path];
  if (files.length === 0) throw new Error(`${path}: no .json map in it`);
  const run = {};
  for (const f of files) {
    const json = JSON.parse(readFileSync(f, "utf8"));
    const why = refusal(json);
    if (why) throw new Error(`${f} ${why} (test/.durations.README.md)`);
    Object.assign(run, json);
  }
  return run;
}

function main(argv) {
  let out;
  let useMedian = false;
  const inputs = [];
  const drop = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-o" || argv[i] === "--out") out = argv[++i];
    else if (argv[i] === "--median") useMedian = true;
    else if (argv[i] === "--drop") drop.push(argv[++i]);
    else inputs.push(argv[i]);
  }
  if (!out || inputs.length === 0 || drop.some((d) => !d)) {
    console.error(
      "usage: gen-test-durations.mjs -o <table.json> [--median] [--drop <file>]... <map.json | run dir>...",
    );
    return 2;
  }
  if (inputs.some((p) => resolve(p) === resolve(out))) {
    console.error(`${out} is both an input and the output; pass the table only as -o`);
    return 2;
  }
  let runs;
  try {
    runs = inputs.map(readRun);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  let old = {};
  try {
    old = JSON.parse(readFileSync(out, "utf8"));
  } catch {}
  const root = process.cwd();
  const exists = (f) => existsSync(resolve(root, f));
  const { table, rows, kept, dropped } = mergeTables({ old, runs, useMedian, exists, drop });
  writeFileSync(out, `${JSON.stringify(table, null, 2)}\n`);
  console.log(`${runs.length} run(s)${useMedian ? ", median" : ""}: ${rows} rows, ${kept} kept, ${dropped} dropped`);
  console.log(`${Object.keys(table).length} files -> ${out}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
