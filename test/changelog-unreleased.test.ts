import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import { checkChangelogDiff } from "../scripts/check-changelog-unreleased.mjs";

/**
 * `scripts/check-changelog-unreleased.mjs` (CI, every pull request): a PR's CHANGELOG lines land
 * under `## [Unreleased]`, it deletes no released line, and a release PR is exempt. The diffs below
 * are synthetic full-context diffs (`git diff -U1000000`), one hunk from line 1.
 */

/** A full-context diff: each row is `[mark, text]` with mark `" "`, `"+"` or `"-"`. */
function diff(rows: [string, string][]): string {
  const old = rows.filter(([m]) => m !== "+").length;
  const now = rows.filter(([m]) => m !== "-").length;
  return [
    "diff --git a/CHANGELOG.md b/CHANGELOG.md",
    "--- a/CHANGELOG.md",
    "+++ b/CHANGELOG.md",
    `@@ -1,${old} +1,${now} @@`,
    ...rows.map(([m, t]) => `${m}${t}`),
    "",
  ].join("\n");
}

const HEAD: [string, string][] = [
  [" ", "# Changelog"],
  [" ", ""],
  [" ", "## [Unreleased]"],
  [" ", ""],
  [" ", "### Added"],
  [" ", ""],
];

describe("check-changelog-unreleased", () => {
  it("passes an entry added under [Unreleased]", () => {
    const d = diff([
      ...HEAD,
      ["+", "- `--import-root <dir>` on every command."],
      [" ", "- an older unreleased line"],
      [" ", ""],
      [" ", "## [1.57.0] - 2026-11-06"],
      [" ", ""],
      [" ", "- shipped"],
    ]);
    expect(checkChangelogDiff(d)).toEqual({ release: false, violations: [] });
  });

  it("is red on a line that landed under a released heading (the B3b merge)", () => {
    // `main` released 1.57.0 (its [Unreleased] became [1.57.0]); the branch's entry, merged
    // cleanly, now sits inside the released section.
    const d = diff([
      ...HEAD,
      [" ", "## [1.57.0] - 2026-11-06"],
      [" ", ""],
      [" ", "### Added"],
      [" ", ""],
      ["+", "- the branch's entry"],
      [" ", "- shipped"],
    ]);
    const { release, violations } = checkChangelogDiff(d);
    expect(release).toBe(false);
    expect(violations).toEqual([`CHANGELOG.md:11: added under "## [1.57.0] - 2026-11-06": - the branch's entry`]);
  });

  it("is red on an added line above the first heading", () => {
    const d = diff([["+", "stray"], ...HEAD]);
    expect(checkChangelogDiff(d).violations).toEqual(["CHANGELOG.md:1: added above the first heading: stray"]);
  });

  it("is red on a deleted released line, and passes a reworded [Unreleased] entry", () => {
    const deleted = diff([...HEAD, [" ", "## [1.57.0] - 2026-11-06"], [" ", ""], ["-", "- shipped"]]);
    expect(checkChangelogDiff(deleted).violations).toEqual([
      `CHANGELOG.md (base):9: deleted under "## [1.57.0] - 2026-11-06": - shipped`,
    ]);
    const reworded = diff([...HEAD, ["-", "- old wording"], ["+", "- new wording"], [" ", "## [1.57.0] - x"]]);
    expect(checkChangelogDiff(reworded).violations).toEqual([]);
  });

  it("reads a section moved by a code PR as deleted released lines plus added ones", () => {
    const d = diff([...HEAD, ["+", "- moved up"], [" ", "## [1.57.0] - 2026-11-06"], ["-", "- moved up"]]);
    expect(checkChangelogDiff(d).violations).toHaveLength(1);
    expect(checkChangelogDiff(d).violations[0]).toContain("deleted under");
  });

  it("exempts a release PR, which adds a `## [x.y.z]` heading", () => {
    const d = diff([
      [" ", "# Changelog"],
      [" ", ""],
      [" ", "## [Unreleased]"],
      [" ", ""],
      ["+", "## [1.58.0] - 2026-11-10"],
      ["+", ""],
      [" ", "### Added"],
      [" ", "- an entry"],
    ]);
    expect(checkChangelogDiff(d)).toEqual({ release: true, violations: [] });
  });

  it("reads CRLF and a missing final newline", () => {
    const d = `${diff([...HEAD, ["+", "- ok"], [" ", "## [1.0.0]"], ["+", "- bad"]]).replace(/\n/g, "\r\n")}\\ No newline at end of file\r\n`;
    expect(checkChangelogDiff(d).violations).toEqual([`CHANGELOG.md:9: added under "## [1.0.0]": - bad`]);
  });
});
