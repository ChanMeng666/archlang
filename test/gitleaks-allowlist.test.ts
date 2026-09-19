/**
 * The half of the secret-scanning gate that gitleaks cannot express.
 *
 * ## Why this file exists
 *
 * `.gitleaks.toml` exempts the rule `generic-api-key` in three files whose findings are
 * verified false positives — measured SHA-256 byte-identity baselines, and the IndexNow key
 * that is public by protocol. The exemption is scoped to those paths and that one rule, so
 * a GitHub PAT or a Stripe live key in the same files is still reported.
 *
 * What it CANNOT do is scope the exemption to the SHAPE of the string as well. The intended
 * condition was "this path AND a secret that looks like a 64-hex digest", and gitleaks
 * 8.30.1 ignores `matchCondition` on a top-level `[[allowlists]]` block and ORs the
 * conditions instead — so adding the shape regex made the allowlist exempt every 64-hex
 * `generic-api-key` finding *anywhere in the repository*. That is the opposite of narrow,
 * and it went unnoticed until a baseline-shaped secret was deliberately planted in an
 * unlisted file and the scan came back green. `.gitleaks.toml`'s header records the
 * measurement.
 *
 * So the path condition lives there, and the SHAPE condition lives here. Between them the
 * exemption is as narrow as it was meant to be, and this half runs in `npm run check` —
 * seconds on a PR rather than overnight on the nightly.
 *
 * ## The rule for a future author
 *
 * Adding a path to `.gitleaks.toml` without adding its shape rule below is a hole with a
 * comment on it. {@link ALLOWLISTED} is DERIVED from that file rather than retyped, and the
 * first test asserts the two lists agree, so the omission fails here rather than passing
 * quietly — `docs/agents/iron-laws.md`: derive from the source of truth, never retype it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(".");
const read = (p: string): string => readFileSync(resolve(ROOT, p), "utf8");

/**
 * The paths `.gitleaks.toml` exempts, read out of the config itself.
 *
 * The entries there are anchored TOML regexes (`'''^test/foo\.ts$'''`); this unescapes them
 * back to plain paths. A malformed entry yields a path that does not exist, and the
 * existence check below turns that into a failure rather than a silent skip.
 */
function allowlistedPaths(): string[] {
  const toml = read(".gitleaks.toml");
  // Only the regex literals inside `paths = [...]` blocks, not the prose in the header.
  const blocks = [...toml.matchAll(/^paths\s*=\s*(\[[\s\S]*?\]|'''.*?''')/gm)].map((m) => m[1]!);
  return blocks
    .flatMap((b) => [...b.matchAll(/'''\^(.*?)\$'''/g)].map((m) => m[1]!))
    .map((r) => r.replace(/\\\./g, "."))
    .sort();
}

const ALLOWLISTED = allowlistedPaths();

/** A run of 16+ characters with no whitespace, inside a double-quoted literal — the shape
 *  a secret scanner reacts to, and the only shape worth constraining here. Prose strings
 *  (test names, descriptions) contain spaces and are not candidates. */
const OPAQUE_LITERAL = /"([A-Za-z0-9_\-+/=]{16,})"/g;

const opaqueLiteralsIn = (path: string): string[] => [...read(path).matchAll(OPAQUE_LITERAL)].map((m) => m[1]!);

describe("the gitleaks allowlist is scoped by SHAPE as well as by path", () => {
  it("every exempted path exists, and every one of them has a shape rule below", () => {
    // If this fails, someone widened `.gitleaks.toml` without saying what the new file is
    // allowed to contain. Add the rule; do not delete this assertion.
    expect(ALLOWLISTED.length).toBeGreaterThan(0);
    for (const p of ALLOWLISTED) expect(() => read(p), `${p} is allowlisted but does not exist`).not.toThrow();
    expect(ALLOWLISTED).toEqual(
      ["test/byte-identity-baseline.ts", "test/height-byte-identity.test.ts", "test/indexnow-script.test.ts"].sort(),
    );
  });

  it("test/byte-identity-baseline.ts carries nothing but digests and real example names", () => {
    // A pure data file: measured SHA-256 values, keyed by example name. Every opaque string
    // in it must be one or the other, and an example name must name a plan that actually
    // ships — which makes this a little stronger than a shape check. Any other long
    // unbroken string — a token, a key, a base64 blob — fails here, and that is exactly the
    // class gitleaks has been told to stop reporting for this path.
    const opaque = opaqueLiteralsIn("test/byte-identity-baseline.ts");
    expect(opaque.length).toBeGreaterThan(0);
    const unexplained = opaque.filter((s) => {
      if (/^[0-9a-f]{64}$/.test(s)) return false;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return true;
      try {
        readFileSync(resolve(ROOT, "examples", `${s}.arch`));
        return false;
      } catch {
        return true;
      }
    });
    expect(unexplained, "an opaque string that is neither a digest nor a shipped example name").toEqual([]);
  });

  it("test/height-byte-identity.test.ts carries no opaque string at all", () => {
    // Its tables moved to `byte-identity-baseline.ts`; it is allowlisted only because the
    // FULL-HISTORY scan still meets the old blob. The live file should therefore hold
    // nothing opaque whatsoever, which is the tightest rule available.
    expect(opaqueLiteralsIn("test/height-byte-identity.test.ts")).toEqual([]);
  });

  it("test/indexnow-script.test.ts carries exactly one opaque string: the PUBLISHED key", () => {
    const opaque = [...new Set(opaqueLiteralsIn("test/indexnow-script.test.ts"))];
    expect(opaque).toHaveLength(1);
    const key = opaque[0]!;
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    // …and it is public, which is the entire reason it is exempt. The proof is that the
    // repository serves it: IndexNow accepts a submission only when `<key>.txt` is
    // fetchable at the domain root. This also catches a rotation done in one place only.
    expect(
      () => read(`docs-site/public/${key}.txt`),
      `the key in the test is not the one published at the domain root`,
    ).not.toThrow();
    expect(read(`docs-site/public/${key}.txt`).trim()).toBe(key);
  });
});
