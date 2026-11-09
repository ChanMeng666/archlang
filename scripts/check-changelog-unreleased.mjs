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
 *   - every ADDED line sits under `## [Unreleased]`;
 *   - no DELETED line sat under a released heading (or above the first heading). Rewording or
 *     removing an `[Unreleased]` entry is an ordinary edit and passes.
 * A release PR (it adds a `## [x.y.z]` heading) moves the whole section and is exempt.
 *
 *   node scripts/check-changelog-unreleased.mjs [base]    (default origin/main)
 *
 * CI runs it on every pull request with base `HEAD^1`: the checkout is the PR's merge commit, whose
 * first parent is the base branch's tip, so the diff is exactly what merging the PR adds.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UNRELEASED = /^## \[Unreleased\]/i;
const RELEASE_HEADING = /^## \[?\d+\.\d+\.\d+/;

/**
 * Check a full-context unified diff of CHANGELOG.md. Returns `{ release, violations }`; each
 * violation names the line (new-file number for an added line, base-file number for a deleted one),
 * its section and its text.
 */
export function checkChangelogDiff(diff) {
  const violations = [];
  let release = false;
  let newHeading = null;
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
      if (text.startsWith("## ")) newHeading = text;
      if (RELEASE_HEADING.test(text)) release = true;
      if (newHeading === null || !UNRELEASED.test(newHeading)) {
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
        oldHeading = text;
      }
    }
  }
  return { release, violations: release ? [] : violations };
}

function main() {
  const base = process.argv[2] ?? "origin/main";
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
  if (diff.trim() === "") {
    console.log("check-changelog-unreleased: CHANGELOG.md unchanged.");
    return;
  }
  const { release, violations } = checkChangelogDiff(diff);
  if (release) {
    console.log("check-changelog-unreleased: a release PR (adds a `## [x.y.z]` heading); exempt.");
    return;
  }
  if (violations.length > 0) {
    console.error("CHANGELOG lines outside `## [Unreleased]` (move them under it; a released section is history):");
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
  console.log("check-changelog-unreleased: every changed CHANGELOG line sits under `## [Unreleased]`.");
}

const isEntry = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();
if (isEntry) main();
