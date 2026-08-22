#!/usr/bin/env node
/**
 * Recompute every figure in FINDINGS.md from the committed dataset, and reproduce
 * the manual false-positive review's sample.
 *
 * FINDINGS.md was written by hand against `results-2026-08-22.json` after the
 * agent that produced the dataset stalled. A hand-written analysis of a 10 MB JSON
 * file is exactly the kind of claim this paper says you should not take on trust,
 * so this script exists to make it checkable: it recomputes the numbers, asserts
 * the internal identities that must hold, and prints the same deterministic sample
 * of 30 confirmed positives that was reviewed by eye.
 *
 *   node paper/experiments/ecosystem/verify-findings.mjs          # assert + summarise
 *   node paper/experiments/ecosystem/verify-findings.mjs --sample # also print the 30
 *
 * Exits non-zero if any identity fails.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "results-2026-08-22.json");
const SEED = 20260822;

const r = JSON.parse(readFileSync(DATA, "utf8"));
const t = r.tally;
const m1 = t.m1;
const pkgs = r.packages;

let failures = 0;
/** Assert an identity that must hold if the tally and the rows describe the same run. */
function must(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

console.log(`dataset: ${r.runDate}, registry fetched ${r.registryFetchedAt}, ${r.registryPages} pages\n`);

console.log("internal identities");
must("tierA + tierB = handshake sites found", m1.tierA + m1.tierB, m1.handshakeSiteFound);
must("derived + literal = applicable", m1.derived + m1.literal, m1.applicable);
must("handshake sites - unresolved = applicable", m1.handshakeSiteFound - m1.unresolved, m1.applicable);
must(
  "drift kinds sum to drift",
  Object.values(m1.byDriftKind).reduce((a, b) => a + b, 0),
  m1.drift,
);
must(
  "corroboration verdicts sum to stale-published",
  Object.values(m1.corroboration).reduce((a, b) => a + b, 0),
  m1.byDriftKind["stale-published"],
);
must("confirmed = corroboration.confirmed-left-behind", m1.driftConfirmed, m1.corroboration["confirmed-left-behind"]);

// The rows must agree with the tally, not merely be summarised by it.
const confirmed = pkgs.filter((p) => p.m1?.corroboration?.verdict === "confirmed-left-behind");
must("rows with confirmed verdict = tally.driftConfirmed", confirmed.length, m1.driftConfirmed);
must("rows with m1.drift = tally.drift", pkgs.filter((p) => p.m1?.drift).length, m1.drift);

console.log("\nheadline rates");
const pct = (x, n) => `${((100 * x) / n).toFixed(1)}%`;
console.log(`  applicable                 ${m1.applicable}`);
console.log(`  derive the version         ${m1.derived}  ${pct(m1.derived, m1.applicable)}`);
console.log(`  retype the version         ${m1.literal}  ${pct(m1.literal, m1.applicable)}`);
console.log(`  raw drift                  ${m1.drift}  ${pct(m1.drift, m1.applicable)}   <- upper bound`);
console.log(
  `  corroborated drift         ${m1.driftConfirmed}  ${pct(m1.driftConfirmed, m1.applicable)}   <- headline`,
);
console.log(`  never-published (excluded) ${m1.byDriftKind["never-published"]}`);

// Whole-population evidence check. No regex: the excerpt must literally contain the
// claimed version in quotes, or a `via` field must record the const it resolved from.
// (An earlier version of this check used a regex built from a string and silently
// matched nothing, reporting 1850 unsupported cases that were all in fact supported.
// Backslashes do not survive this environment reliably; hence the plain includes().)
const quoted = (e, v) => e.includes(`'${v}'`) || e.includes(`"${v}"`);
const unsupported = confirmed.filter(
  (p) => !p.m1.site.via && !quoted(String(p.m1.site.excerpt ?? ""), p.m1.handshakeVersion),
);
console.log("\nevidence check (whole confirmed population)");
must("every confirmed positive carries its own evidence", unsupported.length, 0);

console.log("\nrobustness of the confirmed population");
const share = (f) => `${confirmed.filter(f).length} (${pct(confirmed.filter(f).length, confirmed.length)})`;
console.log(`  tier A                     ${share((p) => p.m1.tier === "A")}`);
console.log(`  constructor identified     ${share((p) => Boolean(p.m1.site.ctor))}`);
console.log(`  direct literal             ${share((p) => !p.m1.site.via)}`);
console.log(`  resolved through a const   ${share((p) => Boolean(p.m1.site.via))}`);
console.log(`  minified-looking           ${share((p) => p.m1.minifiedLooking)}`);
console.log(`  corroborated in same file  ${share((p) => p.m1.corroboration.matchedSameFile)}`);

/** splitmix32 — the repo's house PRNG (see dataset/rng.ts). Math.random is banned. */
function splitmix32(a) {
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let x = a ^ (a >>> 16);
    x = Math.imul(x, 0x21f0aaad);
    x ^= x >>> 15;
    x = Math.imul(x, 0x735a2d97);
    return ((x ^= x >>> 15) >>> 0) / 4294967296;
  };
}

// --- ADDED: the never-published corroboration (FINDINGS.md section 3.3.1) ---
// These cases cannot be reached by the stale-published check, so they are
// corroborated by opening each package's FIRST release instead. Asserted here so
// that section is recomputable rather than taken on trust.
const neverPub = pkgs.filter((p) => p.m1?.driftKind === "never-published");
const nc = neverPub.filter((p) => p.m1.neverCheck?.verdict === "never-correct");
const sameLit = nc.filter((p) => p.m1.neverCheck.sameLiteralSinceFirstRelease);

console.log("\nnever-published, checked against the package's first release");
must("never-published rows = tally byDriftKind", neverPub.length, m1.byDriftKind["never-published"]);
must("never-correct rows = tally neverCheck", nc.length, m1.neverCheck["never-correct"]);
must("same-literal-since-first rows = tally", sameLit.length, m1.neverCorrectSinceFirstRelease);
must(
  "neverCheck verdicts sum to never-published",
  Object.values(m1.neverCheck).reduce((a, b) => a + b, 0),
  neverPub.length,
);
// The deduction in 3.3.1 rests on two facts holding together: the literal names no
// published version, and it was already present at the first release. If any such
// case ALSO matched its first release's version, the deduction would be unsound.
const contradiction = sameLit.filter((p) =>
  p.m1.neverCheck.firstLiterals?.includes(p.m1.neverCheck.firstVersion),
);
must("no same-literal case also matched its first release", contradiction.length, 0);

console.log(`  never-correct                  ${nc.length}  ${pct(nc.length, neverPub.length)} of never-published`);
console.log(`  same literal since release one ${sameLit.length}  ${pct(sameLit.length, neverPub.length)}`);
console.log(
  `  union with confirmed           ${confirmed.length + nc.length}  ` +
    `${pct(confirmed.length + nc.length, m1.applicable)} of applicable`,
);

const rnd = splitmix32(SEED);
const order = [...confirmed.keys()];
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
const sample = order.slice(0, 30).map((i) => confirmed[i]);

console.log(`\nhand-reviewed sample (splitmix32 seed ${SEED}, n = ${sample.length}) — 0 false positives found`);
if (process.argv.includes("--sample")) {
  for (const [i, p] of sample.entries()) {
    const s = p.m1;
    console.log(
      `\n[${i + 1}] ${p.pkg}  pkg=${s.packageVersion} handshake=${s.handshakeVersion} ` +
        `behind=${s.releasesBehind}rel/${s.daysBehind}d  tier=${s.tier}`,
    );
    console.log(`    ${s.site.file} :: ${s.site.ctor ?? "(minified)"}${s.site.via ? `  via ${s.site.via}` : ""}`);
    console.log(`    ${String(s.site.excerpt).replace(/\s+/g, " ").slice(0, 130)}`);
  }
}

console.log(failures === 0 ? "\n✓ all identities hold" : `\n✗ ${failures} identity check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
