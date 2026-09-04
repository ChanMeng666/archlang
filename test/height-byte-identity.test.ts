/**
 * The byte-identity law for the **vertical datum layer** (v1.35).
 *
 * **Every new language form ships with a byte-identity law, pinned by test: a plan that
 * does not use it renders, describes and lints exactly as before.** `site`, the door
 * kinds, `zone`, `paper`, `polygon`, `arc`, `roof` and `void` each have one; this is the
 * heights' — and it is the widest of them, because heights touch more of the compiler than
 * any of those did.
 *
 * ## Why it covers all THIRTY examples, and every storey of each
 *
 * The earlier laws pin four hand-picked plans. That was right for `roof`/`void`, which are
 * new elements nothing else could reach. It is not right here. This change adds a required
 * field to `RWall`, appends four to `Opening`, puts a number on every resolved door,
 * window and cased opening, threads a new value through `ResolveExtras` (and therefore
 * through the resolve MEMO's key), and adds a gated block to `describe()` and to Plan JSON.
 * There is no shipped plan it does not touch, so the corpus is every shipped plan.
 *
 * And every STOREY of each, which the other laws do not do: `compile().svg` is the GROUND
 * floor alone — an upper storey reaches a caller through `pages[]` — so a digest taken over
 * `svg` would leave `townhouse`'s levels 2 and 3 unmeasured, on exactly the feature whose
 * elevation rule is per-storey. {@link allStoreysDigestWith} joins every page.
 *
 * ## Where the numbers came from
 *
 * They were measured **before a single line of `src/` changed**, on `f4548db` (the tree
 * `v1.34.0` shipped), by a script that imported these very digest bodies from
 * `test/byte-identity-digest.ts` — never a lookalike. That is the lesson
 * `test/roof-void-byte-identity.test.ts` records: its first attempt measured its baseline
 * with a scratch script whose payload separator differed by one character, and reported
 * four "failures" over artifacts that were in fact byte-identical.
 *
 * The measurement is cross-checked against a law that already existed: `studio`,
 * `gallery-l`, `laneway-house` and `aquarium`'s SEMANTIC digests below are, character for
 * character, the four in `roof-void-byte-identity.test.ts`'s `SEMANTIC_BASELINE`. Two
 * independently-written callers of one shared body agreeing on four values is what says
 * the body is the sanctioned one.
 *
 * ## If one of these moves
 *
 * It is a finding to explain, never a value to re-bless. The claim this file makes is not
 * "the drawings did not change" — it is **"a plan that writes no `height`, `sill` or `head`
 * is untouched in all three of its agent-facing surfaces"**, and every one of these thirty
 * plans writes none. A moved digest means the datum leaked into a plan that never asked
 * for it: the most likely culprits, in order, are `describe()`'s gate
 * (`ResolvedPlan._heightsAuthored`), the `Opening` fields reaching a serialized surface,
 * and the resolve memo's `extrasKey` colliding two storeys.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import type { World } from "../src/world.js";
import { type CompilerApi, allStoreysDigestWith, semanticDigestWith } from "./byte-identity-digest.js";
// The two tables moved to a module of their own when `iso-byte-identity.test.ts` began
// making the same corpus-wide claim: one measurement, two laws, no retyped hash.
import { BASELINE, SEMANTIC_BASELINE } from "./byte-identity-baseline.js";

const API: CompilerApi = { compile, describe: describePlan, lint };
const EXAMPLES = resolvePath("examples");

/** A World that reads the examples directory, so the two plans that `import` are covered
 *  by the law rather than quietly skipped — a gate is only as strong as its corpus. */
function worldFor(dir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}

const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");
const worldOfExamples = worldFor(EXAMPLES);

suite("height byte-identity — a plan that writes no height is unchanged everywhere", () => {
  for (const [name, sha] of BASELINE) {
    it(`${name}.arch renders, describes and lints exactly as on v1.34.0 — every storey`, () => {
      expect(allStoreysDigestWith(API, srcOf(name), { world: worldOfExamples })).toBe(sha);
    });
  }

  for (const [name, sha] of SEMANTIC_BASELINE) {
    it(`${name}.arch's SUMMARY (describe + lint, no drawing) is unchanged`, () => {
      expect(semanticDigestWith(API, srcOf(name), { world: worldOfExamples })).toBe(sha);
    });
  }

  it("covers every shipped example — the corpus cannot silently shrink", () => {
    const shipped = readdirSync(EXAMPLES)
      .filter((f) => f.endsWith(".arch"))
      .map((f) => f.replace(/\.arch$/, ""))
      .sort();
    expect(BASELINE.map(([n]) => n).sort()).toEqual(shipped);
    expect(SEMANTIC_BASELINE.map(([n]) => n).sort()).toEqual(shipped);
  });

  it("and every one of them really does write no height clause", () => {
    // The law is vacuous for any plan that DOES use the new syntax, so the premise is
    // asserted rather than assumed. A word-boundary scan, not a substring one: `height`
    // appears inside `strip … height <mm>` (a plan extent, not a vertical) in several of
    // these, so the check is that no plan uses the three VERTICAL spellings — the plan
    // setting, the `level`/`wall` clause and the two opening clauses.
    const offenders = BASELINE.map(([n]) => n).filter((n) => {
      const src = srcOf(n);
      return (
        /^\s*height\s/m.test(src) || // the plan-level setting
        /\bthickness\s+\S+\s+height\b/.test(src) || // a wall clause
        /\blevel\s+-?\d+(\s+"[^"]*")?\s+height\b/.test(src) || // a level clause
        /\b(sill|head)\s+\d/.test(src)
      );
    });
    expect(offenders, "these shipped examples use the height syntax, so the law is vacuous for them").toEqual([]);
  });
});

/** The other half of the claim: the datum is really THERE, it just is not reported. */
suite("height byte-identity — the datum exists even when the summary hides it", () => {
  it("every wall of a silent plan resolved to the 3000 default", async () => {
    const { resolve: resolvePlan } = await import("../src/ir.js");
    const { parse } = await import("../src/parser.js");
    const { ir } = resolvePlan(parse(srcOf("studio")).plan!);
    expect(ir.storeyHeight).toBe(3000);
    expect(ir.elevation).toBe(0);
    expect(ir._heightsAuthored).toBe(false);
    expect(ir.walls.map((w) => w.height)).toEqual(ir.walls.map(() => 3000));
    // …and none of it reaches the summary, which is the whole point.
    expect(describePlan(srcOf("studio")).heights).toBeUndefined();
  });
});
