#!/usr/bin/env node
/**
 * inspect.mjs — open one cached tarball and print the evidence behind a Metric-1
 * classification, so every positive in results-<date>.json is checkable by hand.
 *
 * Usage:
 *   node inspect.mjs <package> [version] [--grep=<regex>] [--file=<path>] [--list]
 *
 * With no options it prints package.json's version, every handshake site the
 * detector found, and ~6 lines of surrounding source for each.
 */

import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { untar } from "./lib/tar.mjs";
import { findHandshakeSites } from "./lib/handshake.mjs";
import { readJson, safeKey } from "./lib/util.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "cache");

const positional = [];
const flags = new Map();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) flags.set(m[1], m[2] ?? "true");
  else positional.push(a);
}
const [pkg, versionArg] = positional;
if (!pkg) {
  console.error("usage: node inspect.mjs <package> [version] [--grep=re] [--file=path] [--list]");
  process.exit(2);
}

let version = versionArg;
if (!version) {
  const p = await readJson(join(CACHE, "npm", safeKey(pkg) + ".json"));
  version = p?.distTags?.latest;
  if (!version) {
    console.error("no cached packument; pass a version explicitly");
    process.exit(2);
  }
}

const tgz = await readFile(join(CACHE, "tar", `${safeKey(pkg)}-${safeKey(version)}.tgz`));
const files = untar(gunzipSync(tgz)).map((f) => ({
  ...f,
  rel: f.name.replace(/^\.?\/?package\//, ""),
}));

if (flags.has("list")) {
  for (const f of files) console.log(String(f.size).padStart(9), f.rel);
  process.exit(0);
}

const pj = files.find((f) => f.rel === "package.json");
if (pj) {
  const j = JSON.parse(pj.data.toString("utf8"));
  console.log(`# ${j.name}@${j.version}`);
  console.log(`  bin/main: ${JSON.stringify(j.bin ?? j.main ?? null)}`);
  console.log(`  deps:     ${JSON.stringify(j.dependencies ?? {})}`);
  console.log(`  repo:     ${JSON.stringify(j.repository ?? null)}`);
  console.log("");
}

function context(src, idx, before = 3, after = 3) {
  const lines = src.split("\n");
  let acc = 0;
  let ln = 0;
  for (; ln < lines.length; ln++) {
    if (acc + lines[ln].length + 1 > idx) break;
    acc += lines[ln].length + 1;
  }
  const lo = Math.max(0, ln - before);
  const hi = Math.min(lines.length, ln + after + 1);
  return lines
    .slice(lo, hi)
    .map((l, i) => `    ${String(lo + i + 1).padStart(5)}${lo + i === ln ? " >" : "  "} ${l.slice(0, 300)}`)
    .join("\n");
}

const only = flags.get("file");
const grep = flags.get("grep") ? new RegExp(flags.get("grep")) : null;
const CODE_EXT = /\.(?:m|c)?[jt]sx?$/;

for (const f of files) {
  if (f.rel.includes("node_modules/")) continue;
  if (only && f.rel !== only) continue;
  if (!only && (!CODE_EXT.test(f.rel) || /\.d\.[cm]?ts$/.test(f.rel))) continue;
  if (f.size > 6 * 1024 * 1024) continue;
  const src = f.data.toString("utf8");
  if (grep) {
    let m;
    const g = new RegExp(grep.source, grep.flags.includes("g") ? grep.flags : grep.flags + "g");
    while ((m = g.exec(src))) {
      console.log(`--- ${f.rel} @${m.index}`);
      console.log(context(src, m.index));
      console.log("");
    }
    continue;
  }
  const sites = findHandshakeSites(src, f.rel);
  for (const s of sites) {
    const idx = src.indexOf(s.excerpt.slice(0, 30).trim());
    console.log(`--- ${f.rel}  tier=${s.tier} ctor=${s.ctor} kind=${s.kind} version=${s.version} via=${s.via}`);
    console.log(context(src, idx >= 0 ? idx : 0, 4, 4));
    console.log("");
  }
}
