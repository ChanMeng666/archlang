/**
 * Print one version's section of CHANGELOG.md — the release notes for a `v*` tag.
 *
 * The GitHub Release body is EXTRACTED from the changelog, never written by hand and
 * never generated from commit subjects: `CHANGELOG.md` is already the canonical release
 * narrative (AGENTS.md: "Ongoing release narrative goes in CHANGELOG.md only"), so a
 * second, hand-kept copy on the Releases page is exactly the kind of duplicate that
 * drifted in the first place — 23 tags shipped with no Release at all because the step
 * was manual.
 *
 * Used by `.github/workflows/release.yml` (every v* tag push) and by the one-off
 * backfill, so both produce byte-identical bodies.
 *
 *   node scripts/changelog-section.mjs 1.15.0     # or v1.15.0
 *
 * Exits 1 if the version has no section — a release must not ship undocumented.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The body of `## [<version>] - <date>` up to (not including) the next `## ` heading. */
export function changelogSection(changelog, version) {
  const v = version.replace(/^v/, "");
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");

  // Match `## [1.15.0] - 2026-07-12` and the bare `## 1.15.0` form, but nothing else —
  // an unanchored search would match 1.1.0 inside 1.1.0-beta, so escape and bound it.
  const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp(`^## \\[?${esc}\\]?(\\s|$)`);

  const start = lines.findIndex((l) => head.test(l));
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  // Drop the heading itself (the Release already shows the tag) and trim blank edges.
  return lines
    .slice(start + 1, end)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

const version = process.argv[2];
if (!version) {
  process.stderr.write("usage: node scripts/changelog-section.mjs <version>\n");
  process.exit(2);
}

const body = changelogSection(readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf8"), version);
if (body === null || body === "") {
  process.stderr.write(`no CHANGELOG.md section for ${version} — refusing to publish an undocumented release\n`);
  process.exit(1);
}
process.stdout.write(`${body}\n`);
