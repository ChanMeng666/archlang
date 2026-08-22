#!/usr/bin/env node
/**
 * Build every paper in `paper/` and ENFORCE its venue's page limit mechanically.
 *
 * The limits below are strictly enforced by the venues with no exceptions and no
 * option to buy pages, and a submission that overruns is desk-rejected before a
 * reviewer sees it. Eyeballing a PDF is exactly the kind of guard that passes
 * without asserting anything — which is the thing these papers are about — so the
 * check is a program, and it fails the build.
 *
 *   node paper/build.mjs            # build + check all targets
 *   node paper/build.mjs demo       # one target
 *   node paper/build.mjs --no-check # build only (drafting loop)
 *
 * Requires `tectonic` on PATH (a single self-contained LaTeX engine; it fetches
 * IEEEtran and friends on first run and caches them).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Named with its extension on Windows so spawnSync resolves it without a shell. */
const TECTONIC = process.platform === "win32" ? "tectonic.exe" : "tectonic";

/**
 * `mainTextPages` is the venue's limit on body pages; `refPages` is what it
 * additionally allows for references ONLY. A venue that counts references inside
 * the total (ICSE Demo) gets `refPages: 0`.
 */
const TARGETS = {
  flagship: {
    dir: "flagship",
    tex: "main.tex",
    label: "arXiv full-length",
    // No venue limit. `null` means "report the count, never fail".
    mainTextPages: null,
    refPages: 0,
  },
  nier: {
    dir: "nier",
    tex: "main.tex",
    label: "ICSE 2027 NIER (double-anonymous)",
    mainTextPages: 4,
    refPages: 1,
  },
  demo: {
    dir: "demo",
    tex: "main.tex",
    label: "ICSE 2027 Tool Demonstrations (single-anonymous)",
    // "four pages for the main text, inclusive of all references, figures, tables,
    // appendices" — references are NOT extra here.
    mainTextPages: 4,
    refPages: 0,
  },
};

/**
 * Page count, taken from the engine's own log line ("Output written on … (N
 * page[s], …)").
 *
 * Scraping the PDF itself was tried first and is a trap worth recording: tectonic
 * emits compressed object streams, so `/Type /Page` does not appear in the byte
 * stream at all. The regex matched zero, fell through to a `/N` fallback that hit
 * an unrelated number, and cheerfully reported a one-page paper as 47 pages. A
 * checker that returns a confident wrong answer is worse than one that returns
 * none — so this reads the number the typesetter itself printed, and returns null
 * (not a guess) when it cannot find it.
 */
function pageCount(dir) {
  const log = join(dir, "main.log");
  if (!existsSync(log)) return null;
  const m = readFileSync(log, "latin1").match(/Output written on [^(]*\((\d+) pages?,/);
  return m ? Number(m[1]) : null;
}

/**
 * The page the bibliography starts on, resolved from a `\label{refsstart}` the
 * paper places immediately before its bibliography. Without it we cannot tell
 * body pages from reference pages, so a venue with a separate reference allowance
 * is checked conservatively against the combined total instead — and reported as
 * UNVERIFIED rather than silently passing, because a check that cannot see what it
 * claims to check is the defect this whole project is about.
 */
function refsStartPage(dir) {
  const aux = join(dir, "main.aux");
  if (!existsSync(aux)) return null;
  const text = readFileSync(aux, "utf8");
  const at = text.indexOf("\\newlabel{refsstart}{");
  if (at < 0) return null;

  // \newlabel{refsstart}{{<counter>}{<page>}...}. The counter group can itself
  // contain braces — IEEEtran's conference class emits {\mbox {IV-B}} when the
  // label follows a subsection — so this walks brace depth instead of using a
  // character class. A `[^}]*` regex handled `{11}` and `{V}` and silently failed
  // on the nested form, which is why this reads groups rather than matching a shape.
  const groups = [];
  let i = text.indexOf("{", at + "\\newlabel{refsstart}".length);
  i += 1; // step inside the outer argument
  let depth = 0;
  let start = -1;
  for (; i < text.length && groups.length < 2; i++) {
    const c = text[i];
    if (c === "{") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) groups.push(text.slice(start, i));
      if (depth < 0) break; // end of the outer argument
    }
  }
  const page = Number(groups[1]);
  return Number.isFinite(page) && page > 0 ? page : null;
}

/**
 * Every `\cite`d key must exist in the bibliography.
 *
 * This check exists because tectonic SWALLOWS BibTeX's "I didn't find a database
 * entry for X" warning: an undefined citation renders as a bare `[?]` and the build
 * still exits 0. That is precisely a green-and-vacuous guard — the third one this
 * project's own tooling produced in a day — so it is closed rather than noted.
 *
 * Reads the keys BibTeX actually resolved out of `main.bbl` and compares them
 * against the `\cite` keys in the source. `\nocite{*}` short-circuits the check,
 * because it defines every key by construction.
 */
function undefinedCiteKeys(dir, tex) {
  const src = readFileSync(tex, "utf8");

  // LaTeX's own verdict, checked FIRST and always. tectonic swallows BibTeX's
  // "didn't find a database entry" but LaTeX still logs "Citation `x' undefined",
  // and that line is authoritative regardless of how the bibliography is built.
  //
  // This exists because the key-comparison below short-circuits on `\nocite{*}`,
  // which is correct in principle — that macro defines every key — and wrong in
  // practice: a MISSPELLED key is undefined even under `\nocite{*}`, and one got
  // through this check while the build reported success. That is the seventh
  // green-and-vacuous guard this project's own tooling produced, and it was the
  // guard written to catch the fourth.
  const log = join(dir, "main.log");
  const logged = existsSync(log)
    ? [
        ...new Set(
          [...readFileSync(log, "latin1").matchAll(/Citation `([^']+)' (?:on page \d+ )?undefined/g)].map((m) => m[1]),
        ),
      ]
    : [];
  if (logged.length > 0) return logged.map((k) => `${k} (LaTeX: undefined)`);

  if (/\\nocite\{\*\}/.test(src)) return [];
  const cited = new Set();
  for (const m of src.matchAll(/\\cite[a-zA-Z]*\s*(?:\[[^\]]*\])*\{([^}]*)\}/g)) {
    for (const k of m[1].split(",")) if (k.trim()) cited.add(k.trim());
  }
  if (cited.size === 0) return [];
  const bbl = join(dir, "main.bbl");
  if (!existsSync(bbl)) return [...cited].map((k) => `${k} (no main.bbl)`);
  const defined = new Set(
    [...readFileSync(bbl, "utf8").matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]*)\}/g)].map((m) => m[1]),
  );
  // BOTH directions. A missing-key check alone is one-directional and therefore
  // blind to the case that actually occurred while this paper was being written: a
  // stale `.tex` was recompiled against a newer bibliography, so the document cited
  // FEWER keys than the `.bbl` defined. Nothing was missing, so a cited-vs-defined
  // check saw nothing, while the document silently referenced an older corpus.
  // BibTeX emits only cited entries, so a surplus here means the `.bbl` is stale.
  //
  // HONESTY NOTE, because this file is the paper's own worked example: only the
  // cited-but-undefined direction is PROVEN non-vacuous (planted key, reported,
  // exit 1). The surplus direction is defensive and UNPROVEN here — tectonic
  // regenerates the `.bbl` on every build, so this harness cannot produce the stale
  // `.bbl` that direction exists to catch. It is kept because the failure it guards
  // against did occur during this project, in a workflow that recompiled a `.tex`
  // without regenerating alongside it. Claiming it is verified would be the exact
  // move the paper argues against.
  const missing = [...cited].filter((k) => !defined.has(k)).map((k) => `${k} (cited, undefined)`);
  const surplus = [...defined].filter((k) => !cited.has(k)).map((k) => `${k} (defined, uncited)`);
  return [...missing, ...surplus];
}

function build(name, target, check) {
  const dir = resolve(HERE, target.dir);
  const tex = join(dir, target.tex);
  if (!existsSync(tex)) {
    console.log(`- ${name.padEnd(9)} skipped (no ${target.dir}/${target.tex} yet)`);
    return { name, skipped: true };
  }

  // --keep-intermediates leaves main.aux, which is where the refsstart page lives.
  const r = spawnSync(TECTONIC, ["-X", "compile", "--keep-intermediates", "--keep-logs", tex], {
    cwd: dir,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(`✗ ${name}: tectonic failed\n${r.stderr || r.stdout}`);
    return { name, ok: false };
  }

  const total = pageCount(dir);
  const refsAt = refsStartPage(dir);

  const limit = target.mainTextPages;
  let verdict = "ok";
  if (total === null) {
    verdict = "UNVERIFIED: could not read a page count from main.log";
  } else if (check && limit !== null) {
    // Two independent conditions, both required:
    //   (1) the main text must END on or before page `limit` — i.e. the page the
    //       bibliography starts on is itself within the allowance;
    //   (2) the whole document must fit in `limit + refPages`.
    // Stating it this way avoids the off-by-one that treating "body pages" as
    // `refsAt - 1` introduces when the references begin partway down a body page.
    if (refsAt === null) {
      verdict = `UNVERIFIED (no \\label{refsstart}); total ${total} vs ${limit + target.refPages} combined`;
      if (total > limit + target.refPages) verdict = `OVER by ${total - limit - target.refPages} (combined)`;
    } else if (refsAt > limit) {
      verdict = `OVER: main text runs onto page ${refsAt}, limit is ${limit}`;
    } else if (total > limit + target.refPages) {
      verdict = `OVER: ${total} pages total, limit is ${limit}+${target.refPages}`;
    }
  }

  const undef = undefinedCiteKeys(dir, tex);
  if (undef.length > 0 && verdict === "ok") {
    verdict = `UNDEFINED CITATION${undef.length > 1 ? "S" : ""}: ${undef.join(", ")}`;
  }

  const shape = refsAt ? `${total}pp, refs from p${refsAt}` : `${total}pp`;
  const flag = verdict === "ok" ? "✓" : "✗";
  console.log(`${flag} ${name.padEnd(9)} ${shape.padEnd(26)} ${target.label}`);
  if (verdict !== "ok") console.error(`    ${verdict}`);
  return { name, ok: verdict === "ok" };
}

function main() {
  const args = process.argv.slice(2);
  const check = !args.includes("--no-check");
  const picked = args.filter((a) => !a.startsWith("-"));
  const names = picked.length > 0 ? picked : Object.keys(TARGETS);

  try {
    execFileSync(TECTONIC, ["--version"], { stdio: "ignore" });
  } catch {
    console.error("tectonic not found on PATH. See paper/README.md for the one-line install.");
    process.exit(1);
  }

  const results = names.map((n) => {
    const t = TARGETS[n];
    if (!t) {
      console.error(`unknown target "${n}" — known: ${Object.keys(TARGETS).join(", ")}`);
      process.exit(3);
    }
    return build(n, t, check);
  });

  if (results.some((r) => r.ok === false)) process.exit(1);
}

main();
