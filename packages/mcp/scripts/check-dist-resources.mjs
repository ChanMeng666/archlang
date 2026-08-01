#!/usr/bin/env node
/**
 * Staleness gate for the MCP shim's BAKED resources.
 *
 * `packages/mcp` ships the agent-context artifacts (spec, llms-full, both JSON
 * schemas, the GBNF grammar) as flat files inside `dist/`, copied at build time by
 * `copy-resources.mjs`. That copy is the shim's one silent failure mode: nothing a
 * host does can reveal that `dist/plan.schema.json` is three releases behind the
 * repo's, because a stale-but-well-formed resource looks exactly like a fresh one.
 * 0.2.2 shipped a v1.19 spec and a v1.19 GBNF grammar — which could not decode
 * `paper`/`level`/`place`/`zone`/`polygon`/`arc` — beside a dep range that resolved
 * to a current core.
 *
 * So: after `npm run mcp:build`, byte-compare every copied resource against its
 * repo source. Exit 0 when they all match, exit 1 with a per-file summary otherwise.
 * Zero dependencies, plain node — meant to be a CI step right after the build.
 *
 * Usage: node packages/mcp/scripts/check-dist-resources.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mcp = join(here, "..");
const repo = join(mcp, "..", ".."); // packages/mcp → repo root
const dist = join(mcp, "dist");

/**
 * The resource list, EXTRACTED from copy-resources.mjs rather than retyped — a second
 * hand-written copy of the list is precisely the drift this script exists to catch.
 */
function resourceList() {
  const script = readFileSync(join(here, "copy-resources.mjs"), "utf8");
  const body = script.slice(script.indexOf("const RESOURCES"));
  const pairs = [...body.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)].map((m) => ({ src: m[1], dest: m[2] }));
  if (pairs.length === 0) {
    console.error("check-dist-resources: could not extract a RESOURCES list from copy-resources.mjs");
    process.exit(1);
  }
  return pairs;
}

/** First differing byte offset of two buffers, or -1 when identical. */
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

/** A short, greppable label for where two files diverge. */
function describeDiff(source, built) {
  const at = firstDiff(source, built);
  if (at === -1) return null;
  const line = source.subarray(0, at).toString("utf8").split("\n").length;
  return `differs at byte ${at} (line ${line}); repo ${source.length} bytes vs dist ${built.length} bytes`;
}

const failures = [];
const checked = [];

for (const { src, dest } of resourceList()) {
  const sourcePath = join(repo, src);
  const builtPath = join(dist, dest);
  if (!existsSync(sourcePath)) {
    failures.push(`${dest}: repo source ${src} is MISSING`);
    continue;
  }
  if (!existsSync(builtPath)) {
    failures.push(`${dest}: not present in dist/ — run \`npm run mcp:build\``);
    continue;
  }
  const diff = describeDiff(readFileSync(sourcePath), readFileSync(builtPath));
  if (diff) failures.push(`${dest}: STALE vs ${src} — ${diff}`);
  else checked.push(`${dest} == ${src}`);
}

if (failures.length > 0) {
  console.error(`check-dist-resources: ${failures.length} resource(s) do not match the repo tree\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  for (const c of checked) console.error(`  ✓ ${c}`);
  console.error("\nRebuild with `npm run mcp:build`. If the repo artifact itself is stale, regenerate");
  console.error("it first (`npm run gen:all`) — and remember a refreshed resource only reaches a host");
  console.error("with a packages/mcp version bump.");
  process.exit(1);
}

console.log(`check-dist-resources: ${checked.length} baked resource(s) byte-match the repo tree`);
for (const c of checked) console.log(`  ✓ ${c}`);
process.exit(0);
