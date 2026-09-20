/**
 * A CONTENT guard for the files whose secret-scanner findings are excluded.
 *
 * **This is not an exclusion mechanism and it cannot suppress anything.** The exclusions
 * live in `.gitleaksignore`, one fingerprint per finding, and that file's header states the
 * rule they must take. This test runs in the opposite direction: it is a positive assertion
 * about what each of those files is ALLOWED to contain.
 *
 * ## Why both exist
 *
 * A gitleaks fingerprint is `<commit>:<path>:<ruleID>:<line>` — pinned to one line of one
 * blob in one commit. That is exactly the property that makes it safe: it cannot suppress a
 * future finding, not even a real secret on the next line of the same file. What it equally
 * cannot do is say anything about whether the line it excludes was benign in the first
 * place, or whether the file has since grown something that is not.
 *
 * So the scanner answers "is this string shaped like a credential", and this file answers
 * "is this string one of the few things this file is supposed to contain at all". The
 * second question is the one a scanner can never ask, because only the repository knows
 * that `test/byte-identity-baseline.ts` is a table of measured digests and nothing else.
 *
 * The IndexNow assertion earns its place twice over: no fingerprint could catch a key
 * rotated in the test but not in the published `docs-site/public/<key>.txt`, and that
 * mismatch would silently break submissions rather than fail anything.
 *
 * ## Why the file list is derived
 *
 * {@link GUARDED} is read out of `.gitleaksignore`'s fingerprints rather than retyped, so
 * excluding a finding in a new file fails HERE until someone says what that file may hold —
 * `docs/agents/iron-laws.md`: derive from the source of truth, never retype it. Paths whose
 * blob no longer exists in the working tree (the 2026-09-04 `paper/` entries, whose
 * directory moved to a private repository) are skipped, and the skip is asserted to be
 * because the file is gone rather than because nobody wrote a rule.
 *
 * Adding a fingerprint for a live file without adding its rule below is a gap with a
 * comment on it. Add the rule; do not delete the assertion.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(".");
const read = (p: string): string => readFileSync(resolve(ROOT, p), "utf8");

/** Every path named by a fingerprint in `.gitleaksignore`, deduplicated. */
function fingerprintedPaths(): string[] {
  return [
    ...new Set(
      read(".gitleaksignore")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.split(":")[1] ?? ""),
    ),
  ]
    .filter(Boolean)
    .sort();
}

const GUARDED = fingerprintedPaths();

/** The paths that still exist and therefore need a content rule. */
const LIVE = GUARDED.filter((p) => existsSync(resolve(ROOT, p)));

/** A run of 16+ characters with no whitespace inside a double-quoted literal — the shape a
 *  secret scanner reacts to. Prose strings (test names, descriptions) contain spaces and
 *  are not candidates, which is what keeps this guard about data rather than about English. */
const OPAQUE_LITERAL = /"([A-Za-z0-9_\-+/=]{16,})"/g;

const opaqueLiteralsIn = (path: string): string[] => [...read(path).matchAll(OPAQUE_LITERAL)].map((m) => m[1]!);

/** The files with a rule below. Kept beside the rules so the cross-check has something to
 *  compare against; the rules themselves are the individual `it`s. */
const HAVE_RULES = [
  "test/byte-identity-baseline.ts",
  "test/height-byte-identity.test.ts",
  "test/indexnow-script.test.ts",
].sort();

describe("every gitleaks-excluded file is guarded for what it may CONTAIN", () => {
  it("every live excluded path has a content rule, and every absent one is genuinely gone", () => {
    expect(GUARDED.length).toBeGreaterThan(0);
    expect(LIVE).toEqual(HAVE_RULES);
    // The remainder must be absent because the blob left the tree, not because a rule is
    // missing — `paper/` moved to the private archlang-paper repository on 2026-08-26.
    for (const p of GUARDED.filter((x) => !LIVE.includes(x))) {
      expect(existsSync(resolve(ROOT, p)), `${p} exists but has no content rule`).toBe(false);
    }
  });

  it("test/byte-identity-baseline.ts holds only digests and names of examples that ship", () => {
    // A pure data file: measured SHA-256 values keyed by example name. Tying the names to
    // real plans makes this a little stronger than a shape check. Any other long unbroken
    // string — a token, a key, a base64 blob — fails here.
    const opaque = opaqueLiteralsIn("test/byte-identity-baseline.ts");
    expect(opaque.length).toBeGreaterThan(0);
    const unexplained = opaque.filter((s) => {
      if (/^[0-9a-f]{64}$/.test(s)) return false;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return true;
      return !existsSync(resolve(ROOT, "examples", `${s}.arch`));
    });
    expect(unexplained, "an opaque string that is neither a digest nor a shipped example name").toEqual([]);
  });

  it("test/height-byte-identity.test.ts holds no opaque string at all", () => {
    // Its tables moved to `byte-identity-baseline.ts`; it is excluded only because the
    // FULL-HISTORY scan still meets the old blob. The live file should therefore hold
    // nothing opaque whatsoever, which is the tightest rule available.
    expect(opaqueLiteralsIn("test/height-byte-identity.test.ts")).toEqual([]);
  });

  it("test/indexnow-script.test.ts holds exactly one opaque string: the PUBLISHED key", () => {
    const opaque = [...new Set(opaqueLiteralsIn("test/indexnow-script.test.ts"))];
    expect(opaque).toHaveLength(1);
    const key = opaque[0]!;
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    // …and it is public, which is the entire reason its finding is excluded. The proof is
    // that the repository serves it: IndexNow accepts a submission only when `<key>.txt` is
    // fetchable at the domain root. No fingerprint could check this, and a rotation done in
    // one place only would break submissions silently rather than fail anything.
    const published = `docs-site/public/${key}.txt`;
    expect(
      existsSync(resolve(ROOT, published)),
      "the key in the test is not the one published at the domain root",
    ).toBe(true);
    expect(read(published).trim()).toBe(key);
  });
});
