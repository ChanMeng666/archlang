#!/usr/bin/env node
/**
 * Gate G1 — recompute every number `eval/g1/report.md` reports, from the committed
 * artifacts alone. Zero dependencies, no network, no API key.
 *
 * It checks:
 *   - rater A's count            (eval/g1/scores-model.json)
 *   - rater B's count            (eval/g1/scores-fable.json)
 *   - the adjudicated final      (eval/g1/scores-human.json)
 *   - inter-rater agreement + Cohen's kappa
 *   - the one-tailed two-proportion z test against BOTH control denominators
 *
 * The CONTROL arm itself (155/166 and 155/162) is reconstructed by the repository's
 * own `eval/g1/baseline-accuracy.ts` — run `npx tsx eval/g1/baseline-accuracy.ts`;
 * the two numbers are hard-coded here only so the z arithmetic is checkable on its own.
 *
 * USAGE: node paper/experiments/g1/verify.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const G1 = resolve(HERE, "../../../eval/g1");
const read = (f) => JSON.parse(readFileSync(join(G1, f), "utf8"));

/** Standard normal upper-tail probability (Abramowitz & Stegun 26.2.17). */
function pOneTailed(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? p : 1 - p;
}

/** One-tailed two-proportion z test (pooled). */
function ztest(x1, n1, x2, n2) {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = (p1 - p2) / se;
  return { p1, p2, pooled: p, se, z, p: pOneTailed(z) };
}

const model = read("scores-model.json");
const fable = read("scores-fable.json");
const human = read("scores-human.json");

// —— rater A: per-assertion verdicts, counted from the verdicts themselves ————
let aTotal = 0;
const aUnfaithful = [];
for (const [brief, b] of Object.entries(model.briefs)) {
  for (const [key, a] of Object.entries(b.assertions)) {
    aTotal++;
    if (!a.faithful) aUnfaithful.push(`${brief}/${key}`);
  }
}

// —— rater B: per-brief totals + an explicit unfaithful list ——————————————
let bTotal = 0;
const bUnfaithful = [];
for (const [brief, b] of Object.entries(fable.briefs)) {
  if (brief === "summary" || !Array.isArray(b.unfaithful)) continue;
  bTotal += b.total;
  for (const key of b.unfaithful) bUnfaithful.push(`${brief}/${key}`);
}

// —— adjudication ————————————————————————————————————————————
const disagreements = human.disagreements.map((d) => `${d.brief}/${d.assertion}`);
const agreed = human.agreedUnfaithful.map((d) => `${d.brief}/${d.assertion}`);
const finalUnfaithful = [
  ...agreed,
  ...human.disagreements.filter((d) => d.humanRuling === "unfaithful").map((d) => `${d.brief}/${d.assertion}`),
];

// Cohen's kappa on the 2-category (faithful / unfaithful) per-assertion labels.
const N = aTotal;
const aSet = new Set(aUnfaithful);
const bSet = new Set(bUnfaithful);
const bothUnf = [...aSet].filter((k) => bSet.has(k)).length;
const onlyA = aSet.size - bothUnf;
const onlyB = bSet.size - bothUnf;
const bothF = N - bothUnf - onlyA - onlyB;
const po = (bothUnf + bothF) / N;
const pe = (aSet.size * bSet.size + (N - aSet.size) * (N - bSet.size)) / (N * N);
const kappa = (po - pe) / (1 - pe);

// —— the gate arithmetic ————————————————————————————————————————
const FAITHFUL = N - finalUnfaithful.length;
const CONTROL_ALL = { x: 155, n: 166, label: "all 26 briefs (invalid plan = all assertions failed)" };
const CONTROL_VALID = { x: 155, n: 162, label: "valid plans only (the 25 that rendered)" };

const primary = ztest(FAITHFUL, N, CONTROL_ALL.x, CONTROL_ALL.n);
const sensitivity = ztest(FAITHFUL, N, CONTROL_VALID.x, CONTROL_VALID.n);

const pct = (x, n) => `${x}/${n} = ${((100 * x) / n).toFixed(1)}%`;
console.log("Gate G1 — recomputed from the committed artifacts\n");
console.log(`rater A (${model.rater.split("(")[0].trim()}):`);
console.log(`  ${pct(aTotal - aSet.size, aTotal)} faithful   unfaithful: ${aUnfaithful.join(", ") || "none"}`);
console.log(`  file's own summary: ${JSON.stringify(model.summary)}`);
console.log(`rater B (${fable.rater.split("(")[0].trim()}):`);
console.log(`  ${pct(bTotal - bSet.size, bTotal)} faithful   unfaithful: ${bUnfaithful.join(", ") || "none"}`);
console.log(`adjudication:`);
console.log(`  agreed unfaithful:  ${agreed.join(", ") || "none"}`);
console.log(`  disagreements:      ${disagreements.join(", ") || "none"}`);
console.log(`  final unfaithful:   ${finalUnfaithful.join(", ")}`);
console.log(`  FINAL FAITHFULNESS: ${pct(FAITHFUL, N)}`);
console.log(`  file's own final:   ${JSON.stringify(human.final)}`);
console.log(`inter-rater:`);
console.log(`  agreement ${pct(bothUnf + bothF, N)}   Cohen's kappa = ${kappa.toFixed(3)}`);
console.log(`\nGate condition 1 (>= ~85%): ${(100 * FAITHFUL) / N >= 85 ? "MET" : "NOT MET"}`);
for (const [name, t, c] of [
  ["primary", primary, CONTROL_ALL],
  ["sensitivity", sensitivity, CONTROL_VALID],
]) {
  console.log(
    `Gate condition 2 (${name}, control = ${c.label}):\n` +
      `  ${(100 * t.p1).toFixed(1)}% vs ${(100 * t.p2).toFixed(1)}%  z = ${t.z.toFixed(2)}  p(one-tailed) = ${t.p.toFixed(3)}` +
      `  -> ${t.p < 0.05 ? "significant at 0.05" : "NOT resolvable at 0.05"}`,
  );
}
console.log(
  "\nNOTE: the control arm comes from the 2026-07-11 live run (`eval/g1/baseline-run-29150982395.md`),\n" +
    "which `eval/live-baseline.json` SUPERSEDED on 2026-07-12. Reconstruct it with:\n" +
    "  npx tsx eval/g1/baseline-accuracy.ts",
);
