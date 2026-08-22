// Metric 2: does a resource VENDORED into the published tarball still match the
// project's own source?
//
// The failure this measures: an LLM-facing package bakes documentation, a
// schema or a grammar into its artifact at pack time. The registry then serves
// that copy to every host that installs it, and nothing compares it to the
// source it was copied from. `npm test` and CI stay green either way.
//
// Method: for a sampled package, find the tag in its own git repository that
// corresponds to the published version, download that snapshot, and compare
// every comparable text resource byte-for-byte (line endings normalised).
//
//   identical  — the tarball copy still matches the source at that tag
//   differs    — DRIFT: the registry serves a copy the project's source does not have
//   absent     — the file is not in the repo at all (generated or built at pack
//                time); reported separately, NEVER counted as drift

import { execFile } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { promisify } from "node:util";

import { untar } from "./tar.mjs";
import { candidateTags, codeloadTag, diffExcerpt, isComparable, textEqual } from "./repo.mjs";

const exec = promisify(execFile);

/** All tag names in a remote, via the git protocol (no API rate limit). */
export async function remoteTags(owner, repo) {
  const url = `https://github.com/${owner}/${repo}.git`;
  try {
    const { stdout } = await exec("git", ["ls-remote", "--tags", url], {
      timeout: 45000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
    });
    const tags = new Set();
    for (const line of stdout.split("\n")) {
      const m = /refs\/tags\/(.+?)(\^\{\})?$/.exec(line.trim());
      if (m) tags.add(m[1]);
    }
    return { ok: true, tags: [...tags] };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

/** Pick the tag that denotes `version`, preferring conventional spellings. */
export function chooseTag(tags, version, pkgName) {
  const set = new Set(tags);
  for (const c of candidateTags(version, pkgName)) if (set.has(c)) return { tag: c, how: "conventional" };
  // last resort: any tag ending in the version behind a separator
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(^|[/@_v-])" + esc + "$");
  const loose = tags.filter((t) => re.test(t));
  if (loose.length === 1) return { tag: loose[0], how: "loose" };
  return { tag: null, how: "none" };
}

/** rel -> Buffer for a codeload snapshot, stripping the top-level dir. */
export function repoFiles(tgz, directory) {
  const map = new Map();
  for (const f of untar(gunzipSync(tgz))) {
    const i = f.name.indexOf("/");
    if (i < 0) continue;
    let rel = f.name.slice(i + 1);
    if (directory) {
      const pre = directory.replace(/\/$/, "") + "/";
      if (!rel.startsWith(pre)) continue;
      rel = rel.slice(pre.length);
    }
    map.set(rel, f.data);
  }
  return map;
}

/**
 * Compare one package's vendored resources against a repo snapshot.
 * @param {Array<{path:string}>} vendored entries recorded at extract time
 * @param {Map<string,Buffer>} pkgBufs  rel -> bytes, from the npm tarball
 * @param {Map<string,Buffer>} repoBufs rel -> bytes, from the repo snapshot
 */
/**
 * Does a shipped document make a VERSION CLAIM its own source contradicts?
 *
 * This separates the sharp case from the merely-divergent one. A README that
 * says `npx pkg@2.7.7` inside `pkg@2.7.9`, or a badge pinned to an older
 * release, is a self-description that is checkably false — and it is exactly
 * what a model reads when it is asked how to install the server.
 */
export function versionClaim(tarballBuf, repoBuf, pkgVersion) {
  // the lookarounds keep `127.0.0.1` and other dotted quads out
  const grab = (b) =>
    new Set((b.toString("utf8").match(/(?<![\d.])\d+\.\d+\.\d+(?![\d.])/g) || []).slice(0, 400));
  const A = grab(tarballBuf);
  const B = grab(repoBuf);
  if (!pkgVersion) return null;
  const shippedHas = A.has(pkgVersion);
  const repoHas = B.has(pkgVersion);
  if (shippedHas || !repoHas) return null;
  // the shipped copy names some version, but never the one it actually is,
  // while the source at this very tag does name it
  const named = [...A].filter((v) => !B.has(v) || v !== pkgVersion);
  if (!named.length) return null;
  return { pkgVersion, shippedNames: named.slice(0, 6), sourceNamesPkgVersion: true };
}

export function compareVendored(vendored, pkgBufs, repoBufs, maxFiles = 60, pkgVersion = null) {
  const files = [];
  let identical = 0;
  let differs = 0;
  let absent = 0;
  let duplicateDivergent = 0;
  let staleVersionClaim = 0;

  // Index the repo by basename once, for the duplicate-copy test below.
  const byBase = new Map();
  for (const [rel, buf] of repoBufs) {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push({ rel, buf });
  }

  for (const v of vendored) {
    if (!isComparable(v.path)) continue;
    if (files.length >= maxFiles) break;
    const a = pkgBufs.get(v.path);
    if (!a) continue;
    const rec = { path: v.path };
    const b = repoBufs.get(v.path);
    if (!b) {
      absent++;
      rec.verdict = "absent";
    } else if (textEqual(a, b)) {
      identical++;
      rec.verdict = "identical";
    } else {
      differs++;
      rec.verdict = "differs";
      rec.diff = diffExcerpt(a, b);
      const vc = versionClaim(a, b, pkgVersion);
      if (vc) {
        rec.staleVersionClaim = vc;
        staleVersionClaim++;
      }
    }

    // The vendoring shape this study is really about: the project holds the
    // SAME distinctively-named document in two places, they disagree, and the
    // tarball ships one of them. A same-path comparison cannot see this,
    // because the baked copy lives at a different path from its source.
    const base = v.path.slice(v.path.lastIndexOf("/") + 1);
    if (DISTINCTIVE.test(base)) {
      const copies = (byBase.get(base) || []).filter((c) => c.rel !== v.path);
      if (copies.length && copies.some((c) => !textEqual(a, c.buf))) {
        duplicateDivergent++;
        rec.duplicateDivergent = copies
          .filter((c) => !textEqual(a, c.buf))
          .slice(0, 3)
          .map((c) => ({ rel: c.rel, diff: diffExcerpt(a, c.buf, 4) }));
      }
    }
    files.push(rec);
  }
  return { files, identical, differs, absent, duplicateDivergent, staleVersionClaim };
}

// Basenames that name ONE document wherever they appear. README/CHANGELOG/
// index are excluded: a monorepo legitimately has a different one per package.
// `SKILL.md` and `manifest.json` were tried here and REMOVED: a package
// legitimately ships one per skill / per app, so same-basename-different-bytes
// is the normal case for them and produced only false positives.
const DISTINCTIVE =
  /\.(gbnf|proto|graphql|xsd)$|\.schema\.json$|^(llms(-full)?\.txt|spec[.-].*\.md|.*\.spec\.md|openapi\.(json|ya?ml)|server\.json|server-card\.json)$/i;

export { codeloadTag };
