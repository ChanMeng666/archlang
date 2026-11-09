#!/usr/bin/env node
/**
 * A pull request's CHANGELOG lines land under `## [Unreleased]`, and it deletes no released line.
 *
 * Why: a branch cut before a release merges `main` cleanly and leaves its entry inside the new
 * `## [x.y.z]` section, which the release has already shipped (B3b, #337; `docs/agents/gotchas.md`).
 * The diff shows it and the merge does not.
 *
 * Rules, read from the full-context diff of `CHANGELOG.md` (`git diff -U… <base>...HEAD`), tracking
 * the `## ` heading each line sits under in the new file (added lines) and the old file (deleted ones):
 *   - every ADDED line sits under `## [Unreleased]`, or under a `## [x.y.z]` heading the same diff
 *     ADDS (a release PR cutting its section). A line added under an older, already-released heading
 *     fails even in a release PR;
 *   - no DELETED line sat under a released heading (or above the first heading). Rewording or
 *     removing an `[Unreleased]` entry is an ordinary edit and passes.
 *
 * Escape: a deliberate edit of released history (scrubbing a released entry, a truth-sync of an old
 * section) carries the PR label `changelog-exempt`; CI then passes `--exempt`, and the script prints
 * what it would have refused and exits 0.
 *
 *   node scripts/check-changelog-unreleased.mjs [base] [--exempt]    (default base origin/main)
 *
 * CI runs it on every pull request with base `HEAD^1`: the checkout is the PR's merge commit, whose
 * first parent is the base branch's tip, so the diff is exactly what merging the PR adds.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UNRELEASED = /^## \[Unreleased\]/i;
const RELEASE_HEADING = /^## \[\d+\.\d+\.\d+\]/;

/**
 * Check a full-context unified diff of CHANGELOG.md. Returns `{ release, violations }`: `release`
 * says the diff adds a `## [x.y.z]` heading; each violation names the line (new-file number for an
 * added line, base-file number for a deleted one), its section and its text.
 */
export function checkChangelogDiff(diff) {
  const violations = [];
  let release = false;
  let newHeading = null;
  let newHeadingAdded = false;
  let oldHeading = null;
  let newLine = 0;
  let oldLine = 0;
  let inHunk = false;
  const where = (h) => (h === null ? "above the first heading" : `under "${h}"`);
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      // A full-context diff has one hunk from line 1. A partial hunk's lines before its first
      // heading read as "above the first heading", so a partial diff fails closed.
      oldLine = Number(hunk[1]) - 1;
      newLine = Number(hunk[2]) - 1;
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    const mark = line[0];
    const text = line.slice(1);
    if (mark === "+") {
      newLine++;
      if (text.startsWith("## ")) {
        newHeading = text;
        newHeadingAdded = true;
        if (RELEASE_HEADING.test(text)) release = true;
      }
      const unreleased = newHeading !== null && UNRELEASED.test(newHeading);
      const newRelease = newHeading !== null && newHeadingAdded && RELEASE_HEADING.test(newHeading);
      if (!unreleased && !newRelease) {
        violations.push(`CHANGELOG.md:${newLine}: added ${where(newHeading)}: ${text}`);
      }
    } else if (mark === "-") {
      oldLine++;
      if (text.startsWith("## ")) oldHeading = text;
      if (oldHeading === null || !UNRELEASED.test(oldHeading)) {
        violations.push(`CHANGELOG.md (base):${oldLine}: deleted ${where(oldHeading)}: ${text}`);
      }
    } else if (mark === " ") {
      newLine++;
      oldLine++;
      if (text.startsWith("## ")) {
        newHeading = text;
        newHeadingAdded = false;
        oldHeading = text;
      }
    }
  }
  return { release, violations };
}

/** The exit code and the lines to print for a diff; `exempt` (the PR label) turns a refusal into notices. */
export function changelogVerdict(diff, { exempt = false } = {}) {
  if (diff.trim() === "") return { code: 0, out: ["check-changelog-unreleased: CHANGELOG.md unchanged."] };
  const { release, violations } = checkChangelogDiff(diff);
  const kind = release ? "a release PR: lines under its new `## [x.y.z]` section pass" : "not a release PR";
  if (violations.length === 0) {
    return { code: 0, out: [`check-changelog-unreleased: every changed CHANGELOG line is in place (${kind}).`] };
  }
  if (exempt) {
    return {
      code: 0,
      out: [
        "check-changelog-unreleased: labelled `changelog-exempt`; these lines would otherwise be refused:",
        ...violations.map((v) => `  ${v}`),
      ],
    };
  }
  return {
    code: 1,
    out: [
      `CHANGELOG lines outside \`## [Unreleased]\` (${kind}; move them under it, or label a deliberate`,
      "edit of released history `changelog-exempt` and re-run the job):",
      ...violations.map((v) => `  ${v}`),
    ],
  };
}

function main() {
  const args = process.argv.slice(2);
  const exempt = args.includes("--exempt");
  const base = args.find((a) => !a.startsWith("--")) ?? "origin/main";
  let diff;
  try {
    diff = execFileSync(
      "git",
      ["diff", "--no-color", "--no-ext-diff", "--unified=1000000", `${base}...HEAD`, "--", "CHANGELOG.md"],
      { encoding: "utf8", maxBuffer: 1 << 28 },
    );
  } catch (e) {
    console.error(`check-changelog-unreleased: cannot diff against ${base}: ${e.message}`);
    process.exit(2);
  }
  const { code, out } = changelogVerdict(diff, { exempt });
  for (const line of out) (code === 0 ? console.log : console.error)(line);
  process.exit(code);
}

const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) main();
