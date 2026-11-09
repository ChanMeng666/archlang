/**
 * Bench comparison for CI (informational only: never fails the build).
 *
 *   node bench/compare.mjs --base b1.json b2.json --head h1.json h2.json [--out report.md]
 *
 * Each file is the output of `tsx bench/run.ts --json` (`{ plan: { stage: medianMs } }`). The base
 * runs come from the PR's merge base and the head runs from its tip, measured in the same job on
 * the same machine, alternating, so a row's ratio head/base cancels most of the runner's speed.
 * Per row the median over the runs of each side is taken. A row is flagged only when its base time
 * is above MIN_BASE_MS and it moved by more than THRESHOLD_PCT; the "noise floor" is the largest
 * spread between the base runs themselves (over the same rows), so a reader sees how far a row
 * moves with no code change at all. The script always exits 0; the deterministic gate for work
 * done is `test/work-counts.test.ts`.
 */
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MIN_BASE_MS = 5; // below this a row is mostly timer and scheduler noise
export const THRESHOLD_PCT = 50; // flag |delta| beyond this

/** @param {number[]} xs */
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return Number.NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** @param {Record<string, Record<string, number>>[]} runs */
function collect(runs) {
  /** @type {Map<string, number[]>} */
  const out = new Map();
  for (const run of runs) {
    for (const [plan, stages] of Object.entries(run)) {
      for (const [stage, v] of Object.entries(stages)) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const k = `${plan}|${stage}`;
        if (!out.has(k)) out.set(k, []);
        out.get(k).push(v);
      }
    }
  }
  return out;
}

/**
 * @param {Record<string, Record<string, number>>[]} baseRuns
 * @param {Record<string, Record<string, number>>[]} headRuns
 */
export function compareRuns(baseRuns, headRuns) {
  const base = collect(baseRuns);
  const head = collect(headRuns);
  const rows = [];
  let noiseFloor = 0;
  for (const [k, hv] of head) {
    const [plan, stage] = k.split("|");
    const bv = base.get(k);
    const h = median(hv);
    if (!bv) {
      rows.push({ plan, stage, base: null, head: h, ratio: null, deltaPct: null, flagged: false });
      continue;
    }
    const b = median(bv);
    const ratio = b > 0 ? h / b : null;
    const deltaPct = ratio === null ? null : (ratio - 1) * 100;
    const measurable = b > MIN_BASE_MS;
    const flagged = measurable && deltaPct !== null && Math.abs(deltaPct) > THRESHOLD_PCT;
    if (measurable && bv.length >= 2) {
      const lo = Math.min(...bv);
      const hi = Math.max(...bv);
      if (lo > 0) noiseFloor = Math.max(noiseFloor, ((hi - lo) / lo) * 100);
    }
    rows.push({ plan, stage, base: b, head: h, ratio, deltaPct, flagged });
  }
  return { rows, noiseFloor, flagged: rows.filter((r) => r.flagged) };
}

const fmtPct = (p) => (p === null ? "-" : `${p >= 0 ? "+" : ""}${p.toFixed(0)}%`);

/** @param {ReturnType<typeof compareRuns>} result */
export function render(result) {
  const { rows, noiseFloor, flagged } = result;
  const lines = [];
  lines.push("<!-- archlang-bench -->");
  lines.push("### Benchmark: PR head vs its merge base (median ms)");
  lines.push("");
  lines.push(
    "Informational, not a gate. Both sides were built and timed in this one job, two runs each, alternating; " +
      "a row shows the median of the runs and the ratio head/base. " +
      `Flagged only when the base is above ${MIN_BASE_MS} ms and the change exceeds ${THRESHOLD_PCT} %. ` +
      "The deterministic gate for work done is `test/work-counts.test.ts`.",
  );
  lines.push("");
  lines.push(
    `Noise floor (largest spread between the two base runs, rows above ${MIN_BASE_MS} ms): **${noiseFloor.toFixed(0)}%**.`,
  );
  lines.push("");
  lines.push("| Plan | Stage | Base | Head | Ratio | Delta |");
  lines.push("|------|-------|-----:|-----:|------:|------:|");
  for (const r of rows) {
    const ratio = r.ratio === null ? "-" : `${r.ratio.toFixed(2)}x`;
    const flag = r.flagged ? " ⚠️" : "";
    lines.push(
      `| ${r.plan} | ${r.stage} | ${r.base === null ? "-" : r.base.toFixed(2)} | ${r.head.toFixed(2)} | ${ratio} | ${fmtPct(r.deltaPct)}${flag} |`,
    );
  }
  lines.push("");
  lines.push(
    flagged.length
      ? `> ⚠️ ${flagged.length} row(s) moved beyond ${THRESHOLD_PCT} % on a base above ${MIN_BASE_MS} ms: ${flagged
          .map((r) => `${r.plan}/${r.stage}`)
          .join(", ")}. Compare with the noise floor above before acting.`
      : `> No row above ${MIN_BASE_MS} ms moved by more than ${THRESHOLD_PCT} %.`,
  );
  return `${lines.join("\n")}\n`;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {{ base: string[], head: string[], out?: string }} */
  const a = { base: [], head: [] };
  let cur = null;
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--base") cur = "base";
    else if (t === "--head") cur = "head";
    else if (t === "--out") a.out = argv[++i];
    else if (cur) a[cur].push(t);
  }
  return a;
}

/** @param {string[]} argv */
export function main(argv) {
  const a = parseArgs(argv);
  if (!a.base.length || !a.head.length) {
    console.error("usage: node bench/compare.mjs --base b1.json [b2.json] --head h1.json [h2.json] [--out report.md]");
    return 0; // informational tool: never fail CI
  }
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const md = render(compareRuns(a.base.map(read), a.head.map(read)));
  process.stdout.write(md);
  if (a.out) writeFileSync(a.out, md);
  return 0;
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) process.exit(main(process.argv.slice(2)));
