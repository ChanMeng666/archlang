/**
 * Write `paper/scale-snapshot.json` — the SCALE facts the papers cite (lines of
 * code by area, file and test counts, commit and tag counts, the date range of
 * development).
 *
 * Deliberately NOT a `gen:*` generator and deliberately NOT in `check:drift`.
 * Every number here moves on every commit, so gating it would fail the drift
 * check on unrelated work and train people to regenerate without looking — the
 * exact reflex the papers argue against. Instead this is run on purpose, before a
 * submission, with the measurement date passed in explicitly:
 *
 *     npx tsx scripts/snapshot-paper-scale.ts --date 2026-08-22
 *
 * The date is an argument rather than a clock read so the script stays pure by
 * the same rule `src/` follows, and so a re-run for an old snapshot reproduces it.
 * Structural facts (keyword counts, error codes, lint rules, CLI commands) are
 * NOT here — they belong in `paper/facts.json`, where they are drift-gated.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

/** Tracked files matching a pathspec, as repo-relative POSIX paths. */
function tracked(...pathspec: string[]): string[] {
  const out = git("ls-files", "--", ...pathspec);
  return out === "" ? [] : out.split("\n");
}

/** Total newline count across a set of tracked files — `wc -l` semantics. */
function lines(files: readonly string[]): number {
  let total = 0;
  for (const f of files) {
    const text = readFileSync(resolve(ROOT, f), "utf8");
    if (text.length === 0) continue;
    total += text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  }
  return total;
}

/** `{files, lines}` for a pathspec — the shape every area row uses. */
function area(...pathspec: string[]): { files: number; lines: number } {
  const files = tracked(...pathspec);
  return { files: files.length, lines: lines(files) };
}

/** Count occurrences of a regex across a set of files (test call sites, etc.). */
function occurrences(files: readonly string[], re: RegExp): number {
  let n = 0;
  for (const f of files) {
    const matches = readFileSync(resolve(ROOT, f), "utf8").match(re);
    n += matches ? matches.length : 0;
  }
  return n;
}

function main(): void {
  const dateFlag = process.argv.indexOf("--date");
  const measuredAt = dateFlag >= 0 ? process.argv[dateFlag + 1] : undefined;
  if (!measuredAt || !/^\d{4}-\d{2}-\d{2}$/.test(measuredAt)) {
    process.stderr.write("usage: tsx scripts/snapshot-paper-scale.ts --date YYYY-MM-DD\n");
    process.exit(3);
  }

  const testFiles = tracked("*.test.ts");
  const allTracked = tracked();

  const snapshot = {
    // Provenance first: a scale number without its commit is not reproducible.
    measuredAt,
    commit: git("rev-parse", "HEAD"),
    version: (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version,

    history: {
      commits: Number(git("rev-list", "--count", "HEAD")),
      tags: git("tag").split("\n").filter(Boolean).length,
      firstCommitDate: git("log", "--reverse", "--format=%ad", "--date=short").split("\n")[0] ?? "",
      lastCommitDate: git("log", "-1", "--format=%ad", "--date=short"),
    },

    // `wc -l` over tracked files only — vendored and generated-but-ignored trees
    // are excluded by construction, which is why this goes through `git ls-files`.
    code: {
      repoTotal: { files: allTracked.length, lines: lines(allTracked) },
      src: area("src/*.ts", "src/**/*.ts"),
      test: area("test/*.ts", "test/**/*.ts"),
      eval: area("eval/*.ts", "eval/**/*.ts"),
      dataset: area("dataset/*.ts"),
      scripts: area("scripts/*"),
      playground: area("playground/src/*", "playground/src/**/*"),
      docsSite: area("docs-site/*", "docs-site/**/*"),
      mcp: area("packages/mcp/src/*", "packages/mcp/test/*"),
      vscode: area("editors/vscode/src/*", "editors/vscode/test/*"),
    },

    tests: {
      files: testFiles.length,
      // `it(` / `test(` call sites — an upper bound on cases, since table-driven
      // suites expand one call site into many. Reported as call sites, never as
      // "tests", precisely because the two are not the same number.
      callSites: occurrences(testFiles, /\b(?:it|test)(?:\.\w+)*\s*\(/g),
      suites: occurrences(testFiles, /\b(?:describe|suite)(?:\.\w+)*\s*\(/g),
    },

    corpus: {
      // NOTE: a git pathspec `*` crosses `/` (unlike a shell glob), so `examples/*.arch`
      // silently swept in `examples/lib/` too. Subtract rather than re-glob.
      examples: tracked("examples/*.arch").length - tracked("examples/lib/*.arch").length,
      exampleLibs: tracked("examples/lib/*.arch").length,
      committedExampleSvgs: tracked("examples/*.svg").length,
      adrs: tracked("docs/adr/*.md").length,
      researchDocs: tracked("docs/research/*.md").length,
    },
  };

  writeFileSync(resolve(ROOT, "paper/scale-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(
    `✓ wrote paper/scale-snapshot.json (measured ${measuredAt}, commit ${snapshot.commit.slice(0, 8)})\n`,
  );
}

main();
