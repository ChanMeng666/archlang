#!/usr/bin/env node
/**
 * scan.mjs — ecosystem-scale measurement of self-description drift in
 * LLM-facing npm packages listed on the official MCP registry.
 *
 * Three metrics (see FINDINGS.md for definitions and denominators):
 *   M1  hardcoded handshake version literal vs the package's own version
 *   M2  vendored documentation/schema/grammar file vs its upstream source
 *   M3  declared dependency range vs the version the vendored resources came from
 *
 * Zero dependencies: Node's built-in fetch + zlib, plus a hand-written tar
 * reader in lib/tar.mjs. Nothing is added to the repository's package.json.
 *
 * Every network response is cached under ./cache (gitignored), so a re-run
 * after the first is offline and free.
 */

import { gunzipSync } from "node:zlib";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { untar } from "./lib/tar.mjs";
import { collectVersionBindings, findHandshakeSites, lastSegment } from "./lib/handshake.mjs";
import { githubRepo } from "./lib/repo.mjs";
import {
  chooseTag,
  codeloadTag,
  compareVendored,
  remoteTags,
  repoFiles,
} from "./lib/metric2.mjs";
import {
  cmpSemver,
  ensureDir,
  fetchWithRetry,
  fileExists,
  parseSemver,
  pool,
  readJson,
  safeKey,
  sha256,
  writeJson,
} from "./lib/util.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, "cache");
const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";
const NPM = "https://registry.npmjs.org";

const HELP = `
scan.mjs — measure self-description drift across MCP-registry npm packages

Usage:
  node scan.mjs [--stage=<stage>] [--limit=N] [--concurrency=N] [--date=YYYY-MM-DD]

Stages (each consumes the previous one's cache; run them in this order, or use
\`--stage=all\`, the default):

  enumerate   page the MCP registry (version=latest) -> cache/registry-<date>.json
  npm         fetch the npm packument for every unique npm package
  tarballs    download the dist tarball of the registry-DECLARED version
  extract     read each tarball: package.json, handshake sites, vendored files
  metric1     classify handshake-version drift
  corroborate for each stale-published positive, re-download the version the
              literal names and check whether the handshake matched THERE —
              this separates a left-behind literal from an independently
              versioned embedded server
  corroborate-never  for each never-published positive, open the package FIRST
              release and ask whether its handshake was EVER correct
  metric2     for a SEEDED SAMPLE of packages with a GitHub repository, compare
              each vendored text resource in the tarball against the same path
              in the repo at the tag matching the published version
  report      write results-<date>.json and print the summary table

Options:
  --limit=N        analyse only the first N unique packages (pilot runs)
  --concurrency=N  parallel HTTP requests (default 6; be polite)
  --date=YYYY-MM-DD  label the run; defaults to today (UTC). Re-using an
                   earlier date re-uses that enumeration, so the run is
                   reproducible from cache with no clock dependence.
  --m2-sample=N    metric2 sample size (default 600)
  --m2-seed=N      metric2 sample seed (default 20260822)
  --force          ignore cached artifacts for the selected stage
  --help           this text

Output:
  results-<date>.json   the dataset (per-package records + aggregate counts)
  FINDINGS.md           written by hand from the dataset, not by this script
`;

const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? "true");
}
if (args.has("help") || args.has("h")) {
  console.log(HELP.trim());
  process.exit(0);
}

const DATE = args.get("date") || new Date().toISOString().slice(0, 10);
const LIMIT = args.has("limit") ? Number(args.get("limit")) : Infinity;
const CONC = args.has("concurrency") ? Number(args.get("concurrency")) : 6;
const FORCE = args.has("force");
const STAGE = args.get("stage") || "all";
const M2_SAMPLE = args.has("m2-sample") ? Number(args.get("m2-sample")) : 600;
const M2_SEED = args.has("m2-seed") ? Number(args.get("m2-seed")) : 20260822;
const STAGES = ["enumerate", "npm", "tarballs", "extract", "metric1", "corroborate", "corroborate-never", "metric2", "report"];
const wanted = STAGE === "all" ? STAGES : STAGE.split(",");

const log = (...a) => console.error("[scan]", ...a);

// ───────────────────────────────────────────────────────────── enumerate ────

const registryPath = join(CACHE, `registry-${DATE}.json`);

async function stageEnumerate() {
  if (!FORCE && fileExists(registryPath)) {
    const d = await readJson(registryPath);
    log(`enumerate: cached (${d.servers.length} servers, fetched ${d.fetchedAt})`);
    return d;
  }
  const servers = [];
  let cursor = null;
  let pages = 0;
  for (;;) {
    const u = new URL(REGISTRY);
    u.searchParams.set("limit", "100");
    u.searchParams.set("version", "latest");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetchWithRetry(u.toString());
    if (!r.ok) {
      log(`enumerate: page ${pages} failed (${r.status || r.error}); stopping`);
      break;
    }
    const d = await r.res.json();
    for (const s of d.servers) servers.push(s);
    pages++;
    if (pages % 25 === 0) log(`enumerate: page ${pages}, ${servers.length} servers`);
    cursor = d.metadata?.nextCursor;
    if (!cursor || d.servers.length === 0) break;
    if (pages > 500) break;
  }
  const out = { fetchedAt: new Date().toISOString(), pages, servers };
  await writeJson(registryPath, out);
  log(`enumerate: ${servers.length} servers over ${pages} pages -> ${registryPath}`);
  return out;
}

/** Unique npm package references, keeping the registry-declared version. */
function npmRefs(enumeration) {
  const byKey = new Map();
  for (const s of enumeration.servers) {
    const srv = s.server || {};
    for (const p of srv.packages || []) {
      if (p.registryType !== "npm") continue;
      const id = p.identifier;
      if (!id) continue;
      const key = id + "@" + (p.version || "");
      if (!byKey.has(key)) {
        byKey.set(key, {
          pkg: id,
          declaredVersion: p.version || null,
          servers: [],
        });
      }
      byKey.get(key).servers.push({ name: srv.name, version: srv.version });
    }
  }
  // Collapse to one row per package name: keep the newest declared version.
  const byPkg = new Map();
  for (const r of byKey.values()) {
    const prev = byPkg.get(r.pkg);
    if (!prev) {
      byPkg.set(r.pkg, r);
      continue;
    }
    const c = cmpSemver(r.declaredVersion, prev.declaredVersion);
    if (c === 1) {
      r.servers = prev.servers.concat(r.servers);
      byPkg.set(r.pkg, r);
    } else {
      prev.servers = prev.servers.concat(r.servers);
    }
  }
  return [...byPkg.values()].sort((a, b) => (a.pkg < b.pkg ? -1 : 1));
}

// ─────────────────────────────────────────────────────────────── npm meta ────

function packumentPath(pkg) {
  return join(CACHE, "npm", safeKey(pkg) + ".json");
}

/** Trim a packument down to what the metrics need, so the cache stays small. */
function trimPackument(d) {
  const versions = {};
  for (const [v, meta] of Object.entries(d.versions || {})) {
    versions[v] = {
      tarball: meta.dist?.tarball || null,
      shasum: meta.dist?.shasum || null,
      unpackedSize: meta.dist?.unpackedSize ?? null,
      dependencies: meta.dependencies || {},
      peerDependencies: meta.peerDependencies || {},
      repository: meta.repository || null,
      mcpName: meta.mcpName || null,
      deprecated: meta.deprecated ? true : false,
    };
  }
  return {
    name: d.name,
    distTags: d["dist-tags"] || {},
    time: d.time || {},
    repository: d.repository || null,
    versions,
  };
}

async function stageNpm(refs) {
  const todo = refs.filter((r) => FORCE || !fileExists(packumentPath(r.pkg)));
  log(`npm: ${refs.length} packages, ${todo.length} to fetch`);
  let ok = 0;
  let miss = 0;
  await pool(
    todo,
    CONC,
    async (r) => {
      const url = `${NPM}/${r.pkg.replace("/", "%2f")}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        await writeJson(packumentPath(r.pkg), { error: res.status || res.error });
        miss++;
        return;
      }
      const d = await res.res.json();
      await writeJson(packumentPath(r.pkg), trimPackument(d));
      ok++;
    },
    (done, total) => log(`npm: ${done}/${total}`),
  );
  log(`npm: fetched ${ok}, unavailable ${miss}`);
}

// ─────────────────────────────────────────────────────────────── tarballs ────

const MAX_TARBALL = 40 * 1024 * 1024;

function tarballPath(pkg, version) {
  return join(CACHE, "tar", `${safeKey(pkg)}-${safeKey(version)}.tgz`);
}

/** Which published version an MCP host would actually install. */
function chooseVersion(ref, packument) {
  if (!packument || packument.error || !packument.versions) return { version: null, how: "no-packument" };
  const declared = ref.declaredVersion;
  if (declared && packument.versions[declared]) return { version: declared, how: "declared" };
  const latest = packument.distTags?.latest;
  if (latest && packument.versions[latest]) {
    return { version: latest, how: declared ? "declared-missing-fallback-latest" : "latest" };
  }
  const all = Object.keys(packument.versions);
  return all.length ? { version: all[all.length - 1], how: "last-listed" } : { version: null, how: "empty" };
}

async function stageTarballs(rows) {
  const todo = rows.filter((r) => r.version && (FORCE || !fileExists(tarballPath(r.pkg, r.version))));
  log(`tarballs: ${todo.length} to download`);
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  await pool(
    todo,
    CONC,
    async (r) => {
      const meta = r.packument.versions[r.version];
      if (!meta?.tarball) {
        r.tarballError = "no tarball url";
        fail++;
        return;
      }
      if (meta.unpackedSize && meta.unpackedSize > 8 * MAX_TARBALL) {
        r.tarballError = "too large";
        skipped++;
        return;
      }
      const res = await fetchWithRetry(meta.tarball);
      if (!res.ok) {
        r.tarballError = "HTTP " + (res.status || res.error);
        fail++;
        return;
      }
      const buf = Buffer.from(await res.res.arrayBuffer());
      if (buf.length > MAX_TARBALL) {
        r.tarballError = "too large (" + buf.length + ")";
        skipped++;
        return;
      }
      const p = tarballPath(r.pkg, r.version);
      await ensureDir(p);
      await writeFile(p, buf);
      ok++;
    },
    (done, total) => log(`tarballs: ${done}/${total}`),
  );
  log(`tarballs: ok ${ok}, failed ${fail}, skipped ${skipped}`);
}

// ──────────────────────────────────────────────────────────────── extract ────

const CODE_EXT = /\.(?:m|c)?[jt]sx?$/;
const VENDORABLE_EXT = /\.(?:md|mdx|json|gbnf|txt|ya?ml|toml|graphql|proto|xsd|schema)$/i;
const MAX_FILE = 6 * 1024 * 1024;

function extractPath(pkg, version) {
  return join(CACHE, "extract", `${safeKey(pkg)}-${safeKey(version)}.json`);
}

function extractOne(tgz) {
  const files = untar(gunzipSync(tgz));
  let pkgJson = null;
  const sites = [];
  const vendored = [];
  let codeFiles = 0;
  let minifiedLooking = false;
  const bindings = new Map();

  for (const f of files) {
    const rel = f.name.replace(/^\.?\/?package\//, "");
    if (rel.includes("node_modules/")) continue;
    if (rel === "package.json" && !pkgJson) {
      try {
        pkgJson = JSON.parse(f.data.toString("utf8"));
      } catch {
        pkgJson = { parseError: true };
      }
      continue;
    }
    if (f.size > MAX_FILE) continue;
    if (CODE_EXT.test(rel) && !/\.d\.[cm]?ts$/.test(rel)) {
      codeFiles++;
      const src = f.data.toString("utf8");
      // crude minification signal: very long lines
      if (!minifiedLooking && /[^\n]{4000,}/.test(src)) minifiedLooking = true;
      for (const s of findHandshakeSites(src, rel)) sites.push(s);
      collectVersionBindings(src, rel, bindings);
      continue;
    }
    if (VENDORABLE_EXT.test(rel)) {
      vendored.push({ path: rel, size: f.size, sha256: sha256(f.data) });
    }
  }
  // Second pass: settle sites that read a cross-module binding (`version_1.VERSION`)
  // against the bindings actually declared anywhere in the package.
  for (const s of sites) {
    if (s.kind !== "unresolved" || !s.via) continue;
    const b = bindings.get(lastSegment(s.via));
    if (!b || b.kind === "ambiguous") continue;
    s.kind = b.kind;
    s.resolvedFrom = b.file;
    if (b.kind === "literal") s.version = b.value;
  }
  return { pkgJson, sites, vendored, codeFiles, minifiedLooking, fileCount: files.length };
}

async function stageExtract(rows) {
  const todo = rows.filter(
    (r) => r.version && fileExists(tarballPath(r.pkg, r.version)) && (FORCE || !fileExists(extractPath(r.pkg, r.version))),
  );
  log(`extract: ${todo.length} tarballs to read`);
  await pool(
    todo,
    Math.min(CONC, 4),
    async (r) => {
      try {
        const tgz = await readFile(tarballPath(r.pkg, r.version));
        const out = extractOne(tgz);
        // keep the cache small: cap the vendored list and drop huge excerpts
        out.vendored = out.vendored.slice(0, 400);
        await writeJson(extractPath(r.pkg, r.version), out);
      } catch (e) {
        await writeJson(extractPath(r.pkg, r.version), { error: String(e.message || e) });
      }
    },
    (done, total) => log(`extract: ${done}/${total}`),
  );
}

// ──────────────────────────────────────────────────────────────── metric1 ────

/**
 * Pick the site that represents the package's handshake.
 * Prefer a Tier-A site in the file the package actually runs (bin/main), then
 * any Tier-A site, then Tier B.
 */
const NOT_SHIPPED =
  /(^|\/)(test|tests|__tests__|examples?|fixtures?|scripts|benchmarks?|demos?)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

function pickSite(sites, pkgJson) {
  if (!sites.length) return null;
  const entryHints = new Set();
  const add = (v) => {
    if (typeof v === "string") entryHints.add(v.replace(/^\.\//, ""));
    else if (v && typeof v === "object") for (const x of Object.values(v)) add(x);
  };
  add(pkgJson?.bin);
  add(pkgJson?.main);
  add(pkgJson?.module);
  add(pkgJson?.exports);
  // A construction inside a test, example, benchmark or scaffolding script is
  // not the package's handshake. Drop those outright rather than falling back
  // to them: if nothing else remains, we report no site at all.
  const shipped = sites.filter((s) => !NOT_SHIPPED.test(s.file));
  if (!shipped.length) return null;
  const A = shipped.filter((s) => s.tier === "A");
  const pool0 = A.length ? A : shipped;
  const entry = pool0.find((s) => entryHints.has(s.file));
  if (entry) return entry;
  const lit = pool0.find((s) => s.kind === "literal");
  return lit || pool0[0];
}

function versionTimeline(packument) {
  const times = packument.time || {};
  const versions = Object.keys(packument.versions || {});
  return versions
    .map((v) => ({ v, t: times[v] ? Date.parse(times[v]) : null }))
    .filter((x) => x.t !== null)
    .sort((a, b) => a.t - b.t);
}

function classifyM1(row) {
  const ex = row.extract;
  const out = {
    applicable: false,
    reason: null,
    tier: null,
    handshakeKind: "none",
    handshakeVersion: null,
    packageVersion: null,
    drift: false,
    driftKind: null,
    releasesBehind: null,
    daysBehind: null,
    site: null,
    sitesFound: ex?.sites?.length ?? 0,
    minifiedLooking: ex?.minifiedLooking ?? null,
  };
  if (!ex || ex.error) {
    out.reason = "no-extract";
    return out;
  }
  const pkgVersion = ex.pkgJson?.version || row.version;
  out.packageVersion = pkgVersion;
  const site = pickSite(ex.sites || [], ex.pkgJson);
  if (!site) {
    out.reason = ex.codeFiles ? "no-handshake-site" : "no-code-files";
    return out;
  }
  out.tier = site.tier;
  out.handshakeKind = site.kind;
  out.site = { file: site.file, ctor: site.ctor, name: site.name, via: site.via, excerpt: site.excerpt };
  if (site.kind === "derived") {
    out.applicable = true; // applicable to the metric, and clean by construction
    out.reason = "derived";
    return out;
  }
  if (site.kind !== "literal") {
    out.reason = "unresolved-expression";
    return out;
  }
  out.applicable = true;
  out.handshakeVersion = site.version;

  // Robustness: `pickSite` chooses ONE site, but a package may construct several.
  // Record whether every literal in the package disagrees with the package
  // version, so a positive does not depend on the picker having chosen right.
  const literals = (ex.sites || []).filter(
    (s) => s.kind === "literal" && s.version && !NOT_SHIPPED.test(s.file),
  );
  out.literalSiteCount = literals.length;
  out.distinctLiteralVersions = [...new Set(literals.map((s) => s.version))];
  out.allLiteralsDrift = literals.length > 0 && literals.every((s) => s.version !== pkgVersion);
  out.internalDisagreement = out.distinctLiteralVersions.length > 1;

  const cmp = cmpSemver(site.version, pkgVersion);
  if (site.version === pkgVersion) {
    out.reason = "matches";
    return out;
  }
  // Conservative: if ANY literal in the package equals the package version, the
  // picked site may simply be the wrong one — do not count it.
  if (!out.allLiteralsDrift) {
    out.reason = "ambiguous-mixed-literals";
    return out;
  }
  out.drift = true;
  const tl = versionTimeline(row.packument || {});
  const idxLit = tl.findIndex((x) => x.v === site.version);
  const idxPkg = tl.findIndex((x) => x.v === pkgVersion);
  if (idxLit >= 0 && idxPkg >= 0) {
    out.releasesBehind = idxPkg - idxLit;
    out.daysBehind = Math.round((tl[idxPkg].t - tl[idxLit].t) / 86400000);
    out.driftKind = idxPkg > idxLit ? "stale-published" : "ahead-of-package";
  } else if (idxLit < 0) {
    out.driftKind = parseSemver(site.version) ? "never-published" : "not-a-version";
  } else {
    out.driftKind = "unknown";
  }
  if (cmp === 1) out.driftKind = out.driftKind === "stale-published" ? "ahead-of-package" : out.driftKind;
  return out;
}

// ────────────────────────────────────────────────────────── corroborate ────
//
// `stale-published` alone is contaminated by coincidence: in a package with
// hundreds of releases, ANY small literal ("0.3.0") is likely to appear in its
// history by accident, and some packages version an embedded MCP surface
// independently of the package (firebase-tools@14.27.0 ships SERVER_VERSION =
// "0.3.0" on purpose). So for every stale-published positive we fetch the
// tarball of the version the literal names and ask the decisive question:
//
//   at that version, did the handshake literal equal the package version?
//
// If yes, the literal once tracked the package version and has since been left
// behind — the drift is real, not an independent versioning scheme.

function corroboratePath(pkg, version) {
  return join(CACHE, "corrob", `${safeKey(pkg)}-${safeKey(version)}.json`);
}

async function stageCorroborate(rows) {
  const todo = rows.filter(
    (r) => r.m1?.drift && r.m1.driftKind === "stale-published" && r.m1.handshakeVersion,
  );
  log(`corroborate: ${todo.length} stale-published positives to check against their own history`);
  await pool(
    todo,
    Math.min(CONC, 10),
    async (r) => {
      const lit = r.m1.handshakeVersion;
      const p = corroboratePath(r.pkg, lit);
      if (!FORCE && fileExists(p)) return;
      const meta = r.packument?.versions?.[lit];
      if (!meta?.tarball) {
        await writeJson(p, { verdict: "unavailable", why: "no tarball url" });
        return;
      }
      const tp = tarballPath(r.pkg, lit);
      let buf;
      if (fileExists(tp)) {
        buf = await readFile(tp);
      } else {
        const res = await fetchWithRetry(meta.tarball);
        if (!res.ok) {
          await writeJson(p, { verdict: "unavailable", why: "HTTP " + (res.status || res.error) });
          return;
        }
        buf = Buffer.from(await res.res.arrayBuffer());
        if (buf.length > MAX_TARBALL) {
          await writeJson(p, { verdict: "unavailable", why: "too large" });
          return;
        }
        await ensureDir(tp);
        await writeFile(tp, buf);
      }
      let ex;
      try {
        ex = extractOne(buf);
      } catch (e) {
        await writeJson(p, { verdict: "unavailable", why: String(e.message || e) });
        return;
      }
      const literals = (ex.sites || []).filter((s) => s.kind === "literal" && s.version);
      const sameFile = literals.filter((s) => s.file === r.m1.site?.file);
      const set = sameFile.length ? sameFile : literals;
      if (!ex.sites?.length) {
        await writeJson(p, {
          verdict: "no-site-at-that-version",
          why: ex.codeFiles ? "handshake absent" : "no code files",
        });
        return;
      }
      if (!set.length) {
        await writeJson(p, { verdict: "no-literal-at-that-version", kinds: ex.sites.map((s) => s.kind) });
        return;
      }
      const matched = set.some((s) => s.version === lit);
      await writeJson(p, {
        verdict: matched ? "confirmed-left-behind" : "independent-versioning",
        atVersion: lit,
        found: [...new Set(set.map((s) => s.version))],
        file: set[0].file,
        matchedSameFile: sameFile.length > 0,
      });
    },
    (done, total) => log(`corroborate: ${done}/${total}`),
  );
}

// ──────────────────────────────────────────────── corroborate-never ────
//
// The `never-published` cases name a version that was never a release of this
// package, so the corroboration above cannot reach them: there is no tarball of
// "that version" to open. That is a limit of THAT check, not of the evidence.
//
// A different question is answerable, and it is the sharper one: did this
// package's handshake EVER state a correct version? Open the package's FIRST
// published release and compare its handshake to its own version.
//
//   never-correct       the handshake was already wrong at release one — and if it
//                       carried today's literal, that exact wrong string has been
//                       shipped to every host for the package's entire life
//   was-correct-once    it matched at the first release, so the literal tracked the
//                       version and was later replaced by one that never existed
//
// A single-release package is decided without a download: its only release is the
// one already measured, so a drifting literal was never correct by definition.

function neverPath(pkg, version) {
  return join(CACHE, "never", `${safeKey(pkg)}-${safeKey(version)}.json`);
}

async function stageCorroborateNever(rows) {
  const todo = rows.filter((r) => r.m1?.driftKind === "never-published");
  log(`corroborate-never: ${todo.length} never-published cases to check against their FIRST release`);
  await pool(
    todo,
    Math.min(CONC, 10),
    async (r) => {
      const out = neverPath(r.pkg, r.version);
      if (!FORCE && fileExists(out)) return;
      const tl = versionTimeline(r.packument || {});
      const rec = { pkg: r.pkg, current: r.version, literal: r.m1.handshakeVersion, releases: tl.length };

      if (tl.length <= 1) {
        // the only release IS the one measured; a drifting literal was never right
        rec.verdict = "never-correct";
        rec.why = "single-release package";
        rec.sameLiteralSinceFirstRelease = true;
        rec.firstVersion = r.version;
        await writeJson(out, rec);
        return;
      }
      const first = tl[0].v;
      rec.firstVersion = first;
      rec.firstPublishedAt = new Date(tl[0].t).toISOString().slice(0, 10);
      const meta = r.packument?.versions?.[first];
      if (!meta?.tarball) {
        rec.verdict = "unavailable";
        rec.why = "no tarball url for first release";
        await writeJson(out, rec);
        return;
      }
      const tp = tarballPath(r.pkg, first);
      let buf;
      if (fileExists(tp)) {
        buf = await readFile(tp);
      } else {
        const res = await fetchWithRetry(meta.tarball);
        if (!res.ok) {
          rec.verdict = "unavailable";
          rec.why = "HTTP " + (res.status || res.error);
          await writeJson(out, rec);
          return;
        }
        buf = Buffer.from(await res.res.arrayBuffer());
        if (buf.length > MAX_TARBALL) {
          rec.verdict = "unavailable";
          rec.why = "too large";
          await writeJson(out, rec);
          return;
        }
        await ensureDir(tp);
        await writeFile(tp, buf);
      }
      let ex;
      try {
        ex = extractOne(buf);
      } catch (e) {
        rec.verdict = "unavailable";
        rec.why = String(e.message || e).slice(0, 160);
        await writeJson(out, rec);
        return;
      }
      const literals = (ex.sites || [])
        .filter((s) => s.kind === "literal" && s.version && !NOT_SHIPPED.test(s.file))
        .map((s) => s.version);
      if (!ex.sites?.length) {
        rec.verdict = "no-site-at-first-release";
      } else if (!literals.length) {
        rec.verdict = "derived-at-first-release";
        rec.why = "the first release read its version dynamically";
      } else {
        rec.firstLiterals = [...new Set(literals)];
        rec.verdict = literals.includes(first) ? "was-correct-once" : "never-correct";
        rec.sameLiteralSinceFirstRelease = literals.includes(r.m1.handshakeVersion);
      }
      await writeJson(out, rec);
    },
    (done, total) => log(`corroborate-never: ${done}/${total}`),
  );
}

// ───────────────────────────────────────────────────────────────── metric2 ────

function m2Path(pkg, version) {
  return join(CACHE, "m2", `${safeKey(pkg)}-${safeKey(version)}.json`);
}
function repoTarPath(owner, repo, tag) {
  return join(CACHE, "repo", `${safeKey(owner)}__${safeKey(repo)}__${safeKey(tag)}.tgz`);
}
function tagsPath(owner, repo) {
  return join(CACHE, "tags", `${safeKey(owner)}__${safeKey(repo)}.json`);
}

/** Deterministic sample of the packages Metric 2 can be asked about. */
function m2Eligible(rows, sampleSize, seed) {
  const el = rows.filter(
    (r) => r.tarball && r.extract && !r.extract.error && r.version && githubRepo(r.extract.pkgJson?.repository),
  );
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = el
    .map((r) => ({ r, k: rand() }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.r);
  return { total: el.length, sample: shuffled.slice(0, sampleSize) };
}

async function stageMetric2(rows, sampleSize, seed) {
  const { total, sample } = m2Eligible(rows, sampleSize, seed);
  log(`metric2: ${total} packages have a GitHub repository; sampling ${sample.length} (seed ${seed})`);
  await pool(
    sample,
    Math.min(CONC, 4),
    async (r) => {
      const out = m2Path(r.pkg, r.version);
      if (!FORCE && fileExists(out)) return;
      const g = githubRepo(r.extract.pkgJson?.repository);
      const rec = { pkg: r.pkg, version: r.version, repo: `${g.owner}/${g.repo}`, dir: g.dir };

      let tagsRec = await readJson(tagsPath(g.owner, g.repo));
      if (!tagsRec) {
        tagsRec = await remoteTags(g.owner, g.repo);
        await writeJson(tagsPath(g.owner, g.repo), tagsRec);
      }
      if (!tagsRec.ok) {
        rec.stage = "repo-unreachable";
        rec.error = tagsRec.error;
        await writeJson(out, rec);
        return;
      }
      rec.tagCount = tagsRec.tags.length;
      const { tag, how } = chooseTag(tagsRec.tags, r.version, r.pkg);
      rec.tag = tag;
      rec.tagHow = how;
      if (!tag) {
        rec.stage = "no-matching-tag";
        await writeJson(out, rec);
        return;
      }

      const rp = repoTarPath(g.owner, g.repo, tag);
      let repoBuf;
      if (fileExists(rp)) {
        repoBuf = await readFile(rp);
      } else {
        const res = await fetchWithRetry(codeloadTag(g.owner, g.repo, tag));
        if (!res.ok) {
          rec.stage = "snapshot-unavailable";
          rec.error = "HTTP " + (res.status || res.error);
          await writeJson(out, rec);
          return;
        }
        repoBuf = Buffer.from(await res.res.arrayBuffer());
        if (repoBuf.length > MAX_TARBALL) {
          rec.stage = "snapshot-too-large";
          await writeJson(out, rec);
          return;
        }
        await ensureDir(rp);
        await writeFile(rp, repoBuf);
      }

      try {
        const pkgBufs = new Map();
        for (const f of untar(gunzipSync(await readFile(tarballPath(r.pkg, r.version))))) {
          pkgBufs.set(f.name.replace(/^\.?\/?package\//, ""), f.data);
        }
        const cmp = compareVendored(
          r.extract.vendored || [],
          pkgBufs,
          repoFiles(repoBuf, g.dir),
          60,
          r.extract.pkgJson?.version || r.version,
        );
        Object.assign(rec, cmp, { stage: "compared" });
      } catch (e) {
        rec.stage = "compare-failed";
        rec.error = String(e.message || e).slice(0, 200);
      }
      await writeJson(out, rec);
    },
    (done, t) => log(`metric2: ${done}/${t}`),
  );
  return { total, sampled: sample.length };
}

// ───────────────────────────────────────────────────────────────── metric3 ────
//
// Metric 3 asks whether a package's declared dependency range would resolve to
// something NEWER than the state its baked copies describe. Two computable
// facets, both from data already on disk:
//
//   3a REGISTRY staleness — the MCP registry hands hosts a specific version.
//      If npm has moved past it, the registry entry is itself a stale
//      self-description of the package.
//   3b SDK EXPOSURE — a server pinned at pack time against an SDK it declares
//      with an open range (`^`). Every SDK release published after the package
//      widens the gap between what was tested and what a host installs.

const SDK = "@modelcontextprotocol/sdk";

function isOpenRange(range) {
  if (typeof range !== "string") return false;
  return /^[\^~]|^\s*[><*]|^\s*$|\|\||\s-\s|^latest$|^\*$|\.x$/.test(range.trim());
}

async function computeMetric3(rows, asOf) {
  if (!fileExists(packumentPath(SDK))) {
    const res = await fetchWithRetry(NPM + "/" + SDK.replace("/", "%2f"));
    if (res.ok) await writeJson(packumentPath(SDK), trimPackument(await res.res.json()));
  }
  const sdkPack = await readJson(packumentPath(SDK));
  const sdkTimeline = sdkPack?.time
    ? Object.entries(sdkPack.time)
        .filter(([v]) => sdkPack.versions?.[v])
        .map(([v, t]) => ({ v, t: Date.parse(t) }))
        .sort((a, b) => a.t - b.t)
    : [];

  const m3a = { applicable: 0, behind: 0, releasesBehind: [], daysBehind: [] };
  const m3b = { declaresSdk: 0, openRange: 0, pinned: 0, sdkReleasesSince: [], daysSince: [] };

  for (const r of rows) {
    // 3a — registry-declared version vs npm latest
    const latest = r.packument?.distTags?.latest;
    if (r.declaredVersion && latest && r.packument?.versions?.[r.declaredVersion]) {
      m3a.applicable++;
      if (r.declaredVersion !== latest) {
        const tl = versionTimeline(r.packument);
        const i = tl.findIndex((x) => x.v === r.declaredVersion);
        const j = tl.findIndex((x) => x.v === latest);
        if (i >= 0 && j > i) {
          m3a.behind++;
          m3a.releasesBehind.push(j - i);
          m3a.daysBehind.push(Math.round((tl[j].t - tl[i].t) / 86400000));
        }
      }
    }
    // 3b — SDK range openness and how far the SDK has moved since publication
    const deps = r.extract?.pkgJson?.dependencies || {};
    const range = deps[SDK];
    if (!range) continue;
    m3b.declaresSdk++;
    if (isOpenRange(range)) m3b.openRange++;
    else m3b.pinned++;
    const publishedAt = r.packument?.time?.[r.version] ? Date.parse(r.packument.time[r.version]) : null;
    if (publishedAt && sdkTimeline.length && isOpenRange(range)) {
      const since = sdkTimeline.filter((x) => x.t > publishedAt);
      m3b.sdkReleasesSince.push(since.length);
      m3b.daysSince.push(Math.round((asOf - publishedAt) / 86400000));
    }
  }
  return { m3a, m3b, sdkVersionsKnown: sdkTimeline.length };
}

// ───────────────────────────────────────────────────────────────── report ────

function tally(rows) {
  const t = {
    serversEnumerated: 0,
    serversWithNpmPackage: 0,
    uniqueNpmPackages: rows.length,
    packumentAvailable: 0,
    versionResolved: 0,
    declaredVersionPublished: 0,
    tarballDownloaded: 0,
    extracted: 0,
    m1: {
      handshakeSiteFound: 0,
      tierA: 0,
      tierB: 0,
      derived: 0,
      literal: 0,
      unresolved: 0,
      applicable: 0,
      drift: 0,
      driftStalePublished: 0,
      driftAllLiteralsAgree: 0,
      corroboration: {},
      neverCheck: {},
      neverCorrectSinceFirstRelease: 0,
      driftConfirmed: 0,
      driftAtLeast2Releases: 0,
      driftAtLeast5Releases: 0,
      driftAtLeast10Releases: 0,
      confirmedReleasesBehind: [],
      confirmedDaysBehind: [],
      internalDisagreement: 0,
      byDriftKind: {},
      byReleasesBehind: {},
      releasesBehind: [],
      daysBehind: [],
    },
  };
  for (const r of rows) {
    if (r.packument && !r.packument.error) t.packumentAvailable++;
    if (r.version) t.versionResolved++;
    if (r.versionHow === "declared") t.declaredVersionPublished++;
    if (r.tarball) t.tarballDownloaded++;
    if (r.extract && !r.extract.error) t.extracted++;
    const m = r.m1;
    if (!m) continue;
    if (m.site) {
      t.m1.handshakeSiteFound++;
      if (m.tier === "A") t.m1.tierA++;
      else t.m1.tierB++;
    }
    if (m.handshakeKind === "derived") t.m1.derived++;
    else if (m.handshakeKind === "literal") t.m1.literal++;
    else if (m.handshakeKind === "unresolved") t.m1.unresolved++;
    if (m.applicable) t.m1.applicable++;
    if (m.neverCheck) {
      const v = m.neverCheck.verdict;
      t.m1.neverCheck[v] = (t.m1.neverCheck[v] || 0) + 1;
      if (v === "never-correct" && m.neverCheck.sameLiteralSinceFirstRelease)
        t.m1.neverCorrectSinceFirstRelease++;
    }
    if (m.internalDisagreement) t.m1.internalDisagreement++;
    if (m.drift) {
      t.m1.drift++;
      if (m.driftKind === "stale-published") t.m1.driftStalePublished++;
      if (m.allLiteralsDrift) t.m1.driftAllLiteralsAgree++;
      t.m1.byDriftKind[m.driftKind] = (t.m1.byDriftKind[m.driftKind] || 0) + 1;
      if (m.corroboration) {
        const v = m.corroboration.verdict;
        t.m1.corroboration[v] = (t.m1.corroboration[v] || 0) + 1;
        if (v === "confirmed-left-behind") {
          t.m1.driftConfirmed++;
          if (m.releasesBehind != null) t.m1.confirmedReleasesBehind.push(m.releasesBehind);
          if (m.daysBehind != null) t.m1.confirmedDaysBehind.push(m.daysBehind);
          if (m.releasesBehind >= 2) t.m1.driftAtLeast2Releases++;
          if (m.releasesBehind >= 5) t.m1.driftAtLeast5Releases++;
          if (m.releasesBehind >= 10) t.m1.driftAtLeast10Releases++;
        }
      }
      if (m.releasesBehind != null) {
        t.m1.releasesBehind.push(m.releasesBehind);
        const b = m.releasesBehind >= 10 ? "10+" : m.releasesBehind >= 5 ? "5-9" : String(m.releasesBehind);
        t.m1.byReleasesBehind[b] = (t.m1.byReleasesBehind[b] || 0) + 1;
      }
      if (m.daysBehind != null) t.m1.daysBehind.push(m.daysBehind);
    }
  }
  return t;
}

function tallyM2(rows, meta) {
  const t = {
    eligibleTotal: meta?.total ?? null,
    sampled: 0,
    byStage: {},
    comparedPackages: 0,
    filesCompared: 0,
    filesIdentical: 0,
    filesDiffer: 0,
    filesAbsentFromRepo: 0,
    packagesWithAnyDiffer: 0,
    packagesWithDuplicateDivergent: 0,
    packagesWithStaleVersionClaim: 0,
  };
  for (const r of rows) {
    const m = r.m2;
    if (!m) continue;
    t.sampled++;
    t.byStage[m.stage || "?"] = (t.byStage[m.stage || "?"] || 0) + 1;
    if (m.stage !== "compared") continue;
    t.comparedPackages++;
    t.filesIdentical += m.identical || 0;
    t.filesDiffer += m.differs || 0;
    t.filesAbsentFromRepo += m.absent || 0;
    t.filesCompared += (m.identical || 0) + (m.differs || 0);
    if (m.differs > 0) t.packagesWithAnyDiffer++;
    if (m.duplicateDivergent > 0) t.packagesWithDuplicateDivergent++;
    if (m.staleVersionClaim > 0) t.packagesWithStaleVersionClaim++;
  }
  return t;
}

function summariseM3(m3) {
  const { m3a, m3b } = m3;
  return {
    registry: {
      applicable: m3a.applicable,
      behindNpmLatest: m3a.behind,
      medianReleasesBehind: median(m3a.releasesBehind),
      medianDaysBehind: median(m3a.daysBehind),
      maxReleasesBehind: m3a.releasesBehind.length ? Math.max(...m3a.releasesBehind) : null,
    },
    sdk: {
      versionsKnown: m3.sdkVersionsKnown,
      declaresSdk: m3b.declaresSdk,
      openRange: m3b.openRange,
      pinned: m3b.pinned,
      medianSdkReleasesSincePublish: median(m3b.sdkReleasesSince),
      medianDaysSincePublish: median(m3b.daysSince),
      maxSdkReleasesSincePublish: m3b.sdkReleasesSince.length ? Math.max(...m3b.sdkReleasesSince) : null,
    },
  };
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ─────────────────────────────────────────────────────────────────── main ────

async function main() {
  const enumeration = wanted.includes("enumerate")
    ? await stageEnumerate()
    : await readJson(registryPath);
  if (!enumeration) {
    log("no enumeration available; run --stage=enumerate first");
    process.exit(1);
  }

  let refs = npmRefs(enumeration);
  const totalUnique = refs.length;
  if (Number.isFinite(LIMIT)) refs = refs.slice(0, LIMIT);
  const serversWithNpm = enumeration.servers.filter((s) =>
    (s.server?.packages || []).some((p) => p.registryType === "npm"),
  ).length;
  log(
    `servers=${enumeration.servers.length} withNpm=${serversWithNpm} uniqueNpm=${totalUnique} analysing=${refs.length}`,
  );

  if (wanted.includes("npm")) await stageNpm(refs);

  const rows = [];
  for (const r of refs) {
    const packument = await readJson(packumentPath(r.pkg));
    const ch = packument ? chooseVersion(r, packument) : { version: null, how: "no-packument" };
    rows.push({
      pkg: r.pkg,
      declaredVersion: r.declaredVersion,
      servers: r.servers.slice(0, 5),
      serverCount: r.servers.length,
      packument,
      version: ch.version,
      versionHow: ch.how,
    });
  }

  if (wanted.includes("tarballs")) await stageTarballs(rows);
  for (const r of rows) r.tarball = r.version ? fileExists(tarballPath(r.pkg, r.version)) : false;

  if (wanted.includes("extract")) await stageExtract(rows);
  for (const r of rows) {
    r.extract = r.version ? await readJson(extractPath(r.pkg, r.version)) : null;
  }

  if (wanted.includes("metric1") ||
    wanted.includes("corroborate") ||
    wanted.includes("corroborate-never") ||
    wanted.includes("report"))
    for (const r of rows) r.m1 = classifyM1(r);

  if (wanted.includes("corroborate")) await stageCorroborate(rows);
  if (wanted.includes("corroborate-never")) await stageCorroborateNever(rows);

  for (const r of rows) {
    if (r.m1?.driftKind === "stale-published" && r.m1.handshakeVersion) {
      const c = await readJson(corroboratePath(r.pkg, r.m1.handshakeVersion));
      if (c) r.m1.corroboration = c;
    }
    if (r.m1?.driftKind === "never-published" && r.version) {
      const c = await readJson(neverPath(r.pkg, r.version));
      if (c) r.m1.neverCheck = c;
    }
  }

  let m2meta = null;
  if (wanted.includes("metric2")) m2meta = await stageMetric2(rows, M2_SAMPLE, M2_SEED);
  for (const r of rows) {
    if (r.version) r.m2 = await readJson(m2Path(r.pkg, r.version));
  }

  if (wanted.includes("report")) {
    const t = tally(rows);
    const asOf = Date.parse(enumeration.fetchedAt);
    const m3 = await computeMetric3(rows, asOf);
    t.m2 = tallyM2(rows, m2meta);
    t.m3 = summariseM3(m3);
    t.serversEnumerated = enumeration.servers.length;
    t.serversWithNpmPackage = serversWithNpm;
    t.uniqueNpmPackagesTotal = totalUnique;
    t.m1.medianReleasesBehind = median(t.m1.releasesBehind);
    t.m1.medianDaysBehind = median(t.m1.daysBehind);
    t.m1.maxReleasesBehind = t.m1.releasesBehind.length ? Math.max(...t.m1.releasesBehind) : null;
    t.m1.confirmedMedianReleasesBehind = median(t.m1.confirmedReleasesBehind);
    t.m1.confirmedMedianDaysBehind = median(t.m1.confirmedDaysBehind);
    t.m1.confirmedMaxReleasesBehind = t.m1.confirmedReleasesBehind.length ? Math.max(...t.m1.confirmedReleasesBehind) : null;
    t.m1.confirmedMaxDaysBehind = t.m1.confirmedDaysBehind.length ? Math.max(...t.m1.confirmedDaysBehind) : null;
    delete t.m1.releasesBehind;
    delete t.m1.daysBehind;
    delete t.m1.confirmedReleasesBehind;
    delete t.m1.confirmedDaysBehind;

    const dataset = {
      generatedAt: new Date().toISOString(),
      runDate: DATE,
      registryFetchedAt: enumeration.fetchedAt,
      registryPages: enumeration.pages,
      tally: t,
      packages: rows.map((r) => ({
        pkg: r.pkg,
        declaredVersion: r.declaredVersion,
        analysedVersion: r.version,
        versionHow: r.versionHow,
        serverCount: r.serverCount,
        servers: r.servers,
        packumentError: r.packument?.error ?? null,
        publishedVersionCount: r.packument?.versions ? Object.keys(r.packument.versions).length : 0,
        repository:
          r.extract?.pkgJson?.repository ?? r.packument?.repository ?? null,
        dependencies: r.extract?.pkgJson?.dependencies ?? null,
        tarball: r.tarball,
        extractError: r.extract?.error ?? null,
        codeFiles: r.extract?.codeFiles ?? null,
        vendoredCount: r.extract?.vendored?.length ?? null,
        m1: r.m1 ?? null,
        m2: r.m2 ?? null,
      })),
    };
    const out = join(HERE, `results-${DATE}.json`);
    await writeFile(out, JSON.stringify(dataset, null, 1));
    log(`report -> ${out}`);
    printSummary(t);
  }
}

function printSummary(t) {
  const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + "%" : "—");
  const L = [];
  L.push("");
  L.push("  Denominators");
  L.push(`    servers enumerated (latest versions)     ${t.serversEnumerated}`);
  L.push(`    ... declaring an npm package             ${t.serversWithNpmPackage}`);
  L.push(`    unique npm packages                      ${t.uniqueNpmPackagesTotal}`);
  L.push(`    ... resolvable on npm                    ${t.packumentAvailable}`);
  L.push(`    ... registry-declared version published  ${t.declaredVersionPublished}`);
  L.push(`    ... tarball downloaded                   ${t.tarballDownloaded}`);
  L.push(`    ... tarball read                         ${t.extracted}`);
  L.push("");
  L.push("  Metric 1 — handshake version vs package version");
  L.push(`    handshake site found                     ${t.m1.handshakeSiteFound} (tier A ${t.m1.tierA}, tier B ${t.m1.tierB})`);
  L.push(`    version derived at runtime (cannot drift)${String(t.m1.derived).padStart(6)}`);
  L.push(`    version is a hardcoded literal           ${t.m1.literal}`);
  L.push(`    unresolved expression (excluded)         ${t.m1.unresolved}`);
  L.push(`    APPLICABLE (literal or derived)          ${t.m1.applicable}`);
  L.push(`    DRIFTED                                  ${t.m1.drift}  = ${pct(t.m1.drift, t.m1.applicable)} of applicable`);
  L.push(`                                                ${pct(t.m1.drift, t.m1.literal)} of hardcoded literals`);
  L.push(`      of which literal is a version THIS package once published`);
  L.push(`      ("stale-published", the conservative core)  ${t.m1.driftStalePublished}  = ${pct(t.m1.driftStalePublished, t.m1.applicable)} of applicable`);
  L.push(`      of which EVERY literal in the package drifts ${t.m1.driftAllLiteralsAgree}`);
  L.push(`    packages whose own literals disagree with each other  ${t.m1.internalDisagreement}`);
  L.push(`    by kind                                  ${JSON.stringify(t.m1.byDriftKind)}`);
  L.push(`    releases-behind histogram                ${JSON.stringify(t.m1.byReleasesBehind)}`);
  L.push("");
  L.push("  Metric 1 — CORROBORATED core (re-checked against the package's own history)");
  L.push(`    verdicts                                 ${JSON.stringify(t.m1.corroboration)}`);
  L.push(`    CONFIRMED left-behind literal            ${t.m1.driftConfirmed}  = ${pct(t.m1.driftConfirmed, t.m1.applicable)} of applicable, ${pct(t.m1.driftConfirmed, t.m1.literal)} of hardcoded`);
  L.push(`      >= 2 releases behind                   ${t.m1.driftAtLeast2Releases}`);
  L.push(`      >= 5 releases behind                   ${t.m1.driftAtLeast5Releases}`);
  L.push(`      >= 10 releases behind                  ${t.m1.driftAtLeast10Releases}`);
  L.push(`    median / max releases behind             ${t.m1.confirmedMedianReleasesBehind} / ${t.m1.confirmedMaxReleasesBehind}`);
  L.push(`    median / max days behind                 ${t.m1.confirmedMedianDaysBehind} / ${t.m1.confirmedMaxDaysBehind}`);
  L.push("");
  L.push("  Metric 1 — NEVER-PUBLISHED literals, checked against the package first release");
  L.push(`    verdicts                                 ${JSON.stringify(t.m1.neverCheck)}`);
  L.push(`    the SAME wrong literal since release one ${t.m1.neverCorrectSinceFirstRelease}  = ${pct(t.m1.neverCorrectSinceFirstRelease, t.m1.byDriftKind["never-published"] || 0)} of never-published`);
  L.push(`    median releases behind                   ${t.m1.medianReleasesBehind}`);
  L.push(`    max releases behind                      ${t.m1.maxReleasesBehind}`);
  L.push(`    median days behind                       ${t.m1.medianDaysBehind}`);
  if (t.m2) {
    const m = t.m2;
    L.push("  Metric 2 — vendored resource vs the project's own source at the matching tag");
    L.push(`    packages with a GitHub repository         ${m.eligibleTotal}`);
    L.push(`    sampled                                  ${m.sampled}`);
    L.push(`    outcome of resolving the source snapshot ${JSON.stringify(m.byStage)}`);
    L.push(`    PACKAGES COMPARABLE                      ${m.comparedPackages}`);
    L.push(`    files compared (present in both)         ${m.filesCompared}`);
    L.push(`      identical                              ${m.filesIdentical}`);
    L.push(`      DIFFER                                 ${m.filesDiffer}`);
    L.push(`    files absent from the repo (built/generated, not drift)  ${m.filesAbsentFromRepo}`);
    L.push(`    packages with >=1 differing file         ${m.packagesWithAnyDiffer}  = ${pct(m.packagesWithAnyDiffer, m.comparedPackages)} of comparable`);
    L.push(`    packages shipping a distinctively-named doc that`);
    L.push(`      also exists ELSEWHERE in the repo with different bytes ${m.packagesWithDuplicateDivergent}  = ${pct(m.packagesWithDuplicateDivergent, m.comparedPackages)}`);
    L.push(`    packages shipping a doc that names a version the package is NOT,`);
    L.push(`      while the source at that tag names the right one         ${m.packagesWithStaleVersionClaim}  = ${pct(m.packagesWithStaleVersionClaim, m.comparedPackages)}`);
    L.push("");
  }
  if (t.m3) {
    L.push("  Metric 3 — what the registry and the dependency graph resolve to");
    L.push(`    3a  registry-declared version resolvable  ${t.m3.registry.applicable}`);
    L.push(`        behind npm latest                    ${t.m3.registry.behindNpmLatest}  = ${pct(t.m3.registry.behindNpmLatest, t.m3.registry.applicable)}`);
    L.push(`        median releases / days behind        ${t.m3.registry.medianReleasesBehind} / ${t.m3.registry.medianDaysBehind}   (max ${t.m3.registry.maxReleasesBehind} releases)`);
    L.push(`    3b  declares @modelcontextprotocol/sdk    ${t.m3.sdk.declaresSdk}`);
    L.push(`        with an OPEN range (^ ~ * >=)        ${t.m3.sdk.openRange}  = ${pct(t.m3.sdk.openRange, t.m3.sdk.declaresSdk)}`);
    L.push(`        exact-pinned                         ${t.m3.sdk.pinned}`);
    L.push(`        median SDK releases since publish    ${t.m3.sdk.medianSdkReleasesSincePublish}   (max ${t.m3.sdk.maxSdkReleasesSincePublish}, of ${t.m3.sdk.versionsKnown} known)`);
    L.push(`        median days since publish            ${t.m3.sdk.medianDaysSincePublish}`);
    L.push("");
  }
  console.log(L.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
