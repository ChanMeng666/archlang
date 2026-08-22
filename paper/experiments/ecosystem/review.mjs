#!/usr/bin/env node
/**
 * review.mjs — draw a deterministic sample of Metric-1 positives (and, with
 * --negatives, of the packages classified clean) and print the evidence needed
 * to check each one by hand. The sample is seeded, so the reviewed set named in
 * FINDINGS.md is reproducible.
 *
 * Usage:
 *   node review.mjs [--date=YYYY-MM-DD] [--n=30] [--seed=1] [--negatives]
 *                   [--kind=stale-published|never-published|...] [--json]
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const flags = new Map();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) flags.set(m[1], m[2] ?? "true");
}
const DATE = flags.get("date") || new Date().toISOString().slice(0, 10);
const N = Number(flags.get("n") || 30);
const SEED = Number(flags.get("seed") || 1);

const data = JSON.parse(await readFile(join(HERE, `results-${DATE}.json`), "utf8"));

let pop;
if (flags.has("negatives")) {
  pop = data.packages.filter((p) => p.m1 && p.m1.applicable && !p.m1.drift);
} else {
  pop = data.packages.filter((p) => p.m1 && p.m1.drift);
}
if (flags.has("kind")) pop = pop.filter((p) => p.m1.driftKind === flags.get("kind"));
if (flags.has("corroboration"))
  pop = pop.filter((p) => p.m1.corroboration?.verdict === flags.get("corroboration"));

// mulberry32: deterministic, dependency-free
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const shuffled = pop
  .map((p) => ({ p, k: rand() }))
  .sort((a, b) => a.k - b.k)
  .map((x) => x.p);
const sample = shuffled.slice(0, N);

if (flags.has("json")) {
  console.log(JSON.stringify(sample, null, 1));
} else {
  console.log(`# sample of ${sample.length} / ${pop.length} (seed ${SEED}, date ${DATE})`);
  console.log("");
  for (const p of sample) {
    const m = p.m1;
    console.log(`## ${p.pkg}@${p.analysedVersion}`);
    console.log(`   handshake reports : ${m.handshakeVersion}   (${m.driftKind}, ${m.releasesBehind ?? "?"} releases / ${m.daysBehind ?? "?"} days behind)`);
    console.log(`   site              : ${m.site?.file} tier ${m.tier} ctor ${m.site?.ctor} name ${JSON.stringify(m.site?.name)}`);
    console.log(`   literals in pkg   : ${JSON.stringify(m.distinctLiteralVersions)} (all drift: ${m.allLiteralsDrift})`);
    console.log(`   excerpt           : ${m.site?.excerpt?.slice(0, 160)}`);
    console.log(`   verify            : node inspect.mjs ${p.pkg} ${p.analysedVersion}`);
    console.log("");
  }
}
