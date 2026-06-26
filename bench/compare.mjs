/**
 * Bench regression reporter for CI (informational only — never fails the build).
 *
 * Usage:  node bench/compare.mjs <current.json> [out.md]
 *   <current.json>  results from `npx tsx bench/run.ts --json`
 *   [out.md]        optional file to also write the Markdown table to
 *
 * Compares the current median timings against the committed `bench/baseline.json`
 * and writes a Markdown table to stdout for posting as a PR comment. Timings are
 * noisy across runners, so this is a signal, not a gate: a stage that regresses
 * past WARN_PCT is flagged with ⚠️, but the script always exits 0. Refresh the
 * baseline intentionally with `npx tsx bench/run.ts --json > bench/baseline.json`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WARN_PCT = 25; // flag a stage that is >25% slower than baseline

const currentPath = process.argv[2];
if (!currentPath) {
  console.error("usage: node bench/compare.mjs <current.json> [out.md]");
  process.exit(0); // informational tool — never fail CI
}
const current = JSON.parse(readFileSync(currentPath, "utf8"));
const baselinePath = join(here, "baseline.json");
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

const lines = [];
lines.push("### ⏱️ Benchmark (median ms, informational — not a gate)");
lines.push("");
lines.push("| Plan | Stage | Current | Baseline | Δ |");
lines.push("|------|-------|--------:|---------:|--:|");
let regressed = false;
for (const [plan, stages] of Object.entries(current)) {
  for (const [stage, cur] of Object.entries(stages)) {
    const base = baseline?.[plan]?.[stage];
    let delta = "—";
    if (typeof base === "number" && base > 0.05) {
      const pct = ((cur - base) / base) * 100;
      const flag = pct > WARN_PCT ? " ⚠️" : "";
      if (pct > WARN_PCT) regressed = true;
      delta = `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%${flag}`;
    }
    lines.push(`| ${plan} | ${stage} | ${cur.toFixed(2)} | ${base?.toFixed?.(2) ?? "—"} | ${delta} |`);
  }
}
lines.push("");
lines.push(regressed
  ? "> ⚠️ One or more stages regressed past the warning threshold. Timings are runner-dependent — confirm locally before acting."
  : "> No stage regressed past the warning threshold.");

const md = lines.join("\n") + "\n";
process.stdout.write(md);
const outFile = process.argv[3];
if (outFile) writeFileSync(outFile, md);
// Always succeed — this is a signal, not a gate.
